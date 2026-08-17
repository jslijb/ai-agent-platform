import { callWithFallback } from "@/server/llm/router";
import { getNeo4jDriver, isNeo4jAvailable } from "./graph-builder-v2";
import { classifyEntity, normalizeEntity, loadCompanyAliases } from "./entity-classifier";
import { db } from "@/server/db/client";
import { stockMapping } from "@/server/db/schema";
import { semanticCacheGet, semanticCacheSet } from "@/server/llm/semantic-cache";

export interface GraphSearchResult {
  text: string;
  score: number;
  entities: string[];
  paths: string[];
}

const DEFAULT_HOPS = 2;

const ENTITY_EXTRACT_PROMPT = `从以下查询中提取关键实体名称，返回 JSON 数组。只返回实体名称，不要返回其他内容。如果没有实体，返回空数组 []。

注意：
- 公司名尽量用简称（如"五粮液"而非"宜宾五粮液股份有限公司"）
- 指标名用标准名（如"营业收入"而非"营收"）

查询：{query}`;

function parseEntitiesFromResponse(content: string): string[] {
  let jsonStr = content.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    console.warn("[graph-retriever] LLM 返回内容中未找到 JSON 数组");
    return [];
  }

  jsonStr = arrayMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      console.warn("[graph-retriever] LLM 返回内容不是数组");
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch (error) {
    console.error("[graph-retriever] JSON 解析失败:", error);
    return [];
  }
}

let companyAliasesLoaded = false;

async function ensureCompanyAliasesLoaded(): Promise<void> {
  if (companyAliasesLoaded) return;
  try {
    const companies = await db
      .select({
        stockNameShort: stockMapping.stockNameShort,
        stockNameFull: stockMapping.stockNameFull,
        stockNameAlias: stockMapping.stockNameAlias,
      })
      .from(stockMapping);

    loadCompanyAliases(
      companies.map((c) => ({
        shortName: c.stockNameShort,
        fullName: c.stockNameFull,
        aliases: (c.stockNameAlias as string[]) || [],
      }))
    );
    companyAliasesLoaded = true;
  } catch (error) {
    console.warn("[graph-retriever] 加载公司别名失败:", error);
  }
}

export async function extractQueryEntities(query: string): Promise<string[]> {
  console.log(`[graph-retriever] 提取查询实体, query: ${query}`);

  try {
    const cached = await semanticCacheGet("graph-entity-extract", query);
    if (cached.content) {
      console.log(`[graph-retriever] 语义缓存命中 (${cached.hitType})`);
      const entities = parseEntitiesFromResponse(cached.content);
      console.log(
        `[graph-retriever] 提取到实体: ${entities.join(", ") || "无"}`
      );
      return entities;
    }

    const prompt = ENTITY_EXTRACT_PROMPT.replace("{query}", query);

    const response = await callWithFallback([
      { role: "user", content: prompt },
    ]);

    const entities = parseEntitiesFromResponse(response.content ?? "");
    console.log(
      `[graph-retriever] 提取到实体: ${entities.join(", ") || "无"} (模型: ${response.model})`
    );

    if (response.content && response.content.trim().length > 0) {
      await semanticCacheSet(
        "graph-entity-extract",
        query,
        response.content,
        response.model,
        response.provider
      );
    }

    return entities;
  } catch (error) {
    console.error("[graph-retriever] 提取查询实体失败:", error);
    return [];
  }
}

interface PathDescription {
  text: string;
  entities: string[];
  pathStr: string;
  pathLength: number;
  value?: string;
}

function serializePath(path: any): PathDescription | null {
  try {
    const segments: string[] = [];
    const entitySet = new Set<string>();
    let pathValue: string | undefined;

    const nodes = path.segments || [];

    for (const segment of nodes) {
      const startNode = segment.start;
      const endNode = segment.end;
      const relationship = segment.relationship;

      const startName = startNode?.properties?.name || startNode?.identity?.toString() || "未知";
      const endName = endNode?.properties?.name || endNode?.identity?.toString() || "未知";
      const relType = relationship?.type || "关联";
      const originalRelation = relationship?.properties?.originalRelation;
      const relValue = relationship?.properties?.value;

      const relDisplay = originalRelation || relType;
      const valueDisplay = relValue ? `=${relValue}` : "";

      entitySet.add(startName);
      entitySet.add(endName);

      segments.push(`${startName} -[${relDisplay}${valueDisplay}]-> ${endName}`);

      if (relValue && !pathValue) {
        pathValue = relValue;
      }
    }

    if (segments.length === 0) {
      return null;
    }

    const pathStr = segments.join(" -> ");
    const pathLength = segments.length;

    return {
      text: pathStr,
      entities: Array.from(entitySet),
      pathStr,
      pathLength,
      value: pathValue,
    };
  } catch (error) {
    console.error("[graph-retriever] 序列化路径失败:", error);
    return null;
  }
}

const V2_REL_TYPES = [
  "HAS_REVENUE", "HAS_PROFIT", "HAS_INDICATOR", "OWNS_SHARE",
  "LOCATED_IN", "PRODUCES", "COOPERATES_WITH", "COMPETES_WITH",
  "INVESTS_IN", "SUPPLIES", "DEVELOPS", "RELEASES", "RELATED_TO",
];

function buildV2RelCypher(hops: number): string {
  const relPatterns = V2_REL_TYPES.map((t) => `:${t}`).join("|");
  return `MATCH path = (e:Entity)-[${relPatterns}*1..${hops}]-(related) WHERE e.name CONTAINS $entity OR e.name = $entity RETURN path`;
}

function buildOldRelCypher(hops: number): string {
  return `MATCH path = (e:Entity)-[:RELATION*1..${hops}]-(related) WHERE e.name CONTAINS $entity OR e.name = $entity RETURN path`;
}

export async function graphSearch(
  query: string,
  hops: number = DEFAULT_HOPS
): Promise<GraphSearchResult[]> {
  console.log(
    `[graph-retriever] 图谱检索, query: ${query}, hops: ${hops}`
  );

  const available = await isNeo4jAvailable();
  if (!available) {
    console.log("[graph-retriever] Neo4j 不可用, 返回空结果");
    return [];
  }

  await ensureCompanyAliasesLoaded();

  const rawEntities = await extractQueryEntities(query);

  if (rawEntities.length === 0) {
    console.log("[graph-retriever] 未提取到查询实体, 返回空结果");
    return [];
  }

  const entities = rawEntities.map((e) => normalizeEntity(e));
  console.log(`[graph-retriever] 归一化实体: ${entities.join(", ")}`);

  const driver = getNeo4jDriver();
  const session = driver.session();
  const allResults: Map<string, GraphSearchResult> = new Map();

  try {
    for (const entity of entities) {
      console.log(`[graph-retriever] 查询实体: ${entity}, 跳数: ${hops}`);

      const cypherQueries = [
        { name: "V2语义关系", cypher: buildV2RelCypher(hops) },
        { name: "旧版RELATION", cypher: buildOldRelCypher(hops) },
      ];

      for (const { name, cypher } of cypherQueries) {
        try {
          const result = await session.run(cypher, { entity });

          if (result.records.length > 0) {
            console.log(
              `[graph-retriever] ${name} 实体 ${entity} 查询到 ${result.records.length} 条路径`
            );
          }

          for (const record of result.records) {
            const pathObj = record.get("path");
            const description = serializePath(pathObj);

            if (!description) continue;

            const score = 1 / description.pathLength;
            const resultKey = description.pathStr;

            const existing = allResults.get(resultKey);
            if (existing) {
              if (score > existing.score) {
                existing.score = score;
              }
              for (const ent of description.entities) {
                if (!existing.entities.includes(ent)) {
                  existing.entities.push(ent);
                }
              }
            } else {
              allResults.set(resultKey, {
                text: description.text,
                score,
                entities: description.entities,
                paths: [description.pathStr],
              });
            }
          }
        } catch (error) {
          console.error(
            `[graph-retriever] ${name} 查询实体 ${entity} 失败:`,
            error
          );
        }
      }
    }
  } finally {
    await session.close();
  }

  const results = Array.from(allResults.values());
  results.sort((a, b) => b.score - a.score);

  const maxResults = 10;
  const limitedResults = results.slice(0, maxResults);

  console.log(
    `[graph-retriever] 图谱检索完成, 返回 ${limitedResults.length}/${results.length} 条结果`
  );

  return limitedResults;
}
