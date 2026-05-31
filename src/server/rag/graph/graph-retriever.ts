import { callWithFallback } from "@/server/llm/router";
import { getNeo4jDriver } from "./graph-builder";

export interface GraphSearchResult {
  text: string;
  score: number;
  entities: string[];
  paths: string[];
}

const DEFAULT_HOPS = 2;

const ENTITY_EXTRACT_PROMPT = `从以下查询中提取关键实体名称，返回 JSON 数组。只返回实体名称，不要返回其他内容。如果没有实体，返回空数组 []。

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

export async function extractQueryEntities(query: string): Promise<string[]> {
  console.log(`[graph-retriever] 提取查询实体, query: ${query}`);

  try {
    const prompt = ENTITY_EXTRACT_PROMPT.replace("{query}", query);

    const response = await callWithFallback([
      { role: "user", content: prompt },
    ]);

    const entities = parseEntitiesFromResponse(response.content ?? "");
    console.log(
      `[graph-retriever] 提取到实体: ${entities.join(", ") || "无"} (模型: ${response.model})`
    );

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
}

function serializePath(path: any): PathDescription | null {
  try {
    const segments: string[] = [];
    const entitySet = new Set<string>();

    const nodes = path.segments || [];

    for (const segment of nodes) {
      const startNode = segment.start;
      const endNode = segment.end;
      const relationship = segment.relationship;

      const startName = startNode?.properties?.name || startNode?.identity?.toString() || "未知";
      const endName = endNode?.properties?.name || endNode?.identity?.toString() || "未知";
      const relType = relationship?.properties?.type || relationship?.type || "关联";

      entitySet.add(startName);
      entitySet.add(endName);

      segments.push(`${startName} -[${relType}]-> ${endName}`);
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
    };
  } catch (error) {
    console.error("[graph-retriever] 序列化路径失败:", error);
    return null;
  }
}

export async function graphSearch(
  query: string,
  hops: number = DEFAULT_HOPS
): Promise<GraphSearchResult[]> {
  console.log(
    `[graph-retriever] 图谱检索, query: ${query}, hops: ${hops}`
  );

  const entities = await extractQueryEntities(query);

  if (entities.length === 0) {
    console.log("[graph-retriever] 未提取到查询实体, 返回空结果");
    return [];
  }

  const driver = getNeo4jDriver();
  const session = driver.session();
  const allResults: Map<string, GraphSearchResult> = new Map();

  try {
    for (const entity of entities) {
      console.log(`[graph-retriever] 查询实体: ${entity}, 跳数: ${hops}`);

      try {
        const cypher = `MATCH path = (e:Entity {name: $entity})-[:RELATION*1..${hops}]-(related) RETURN path`;
        const result = await session.run(cypher, { entity });

        console.log(
          `[graph-retriever] 实体 ${entity} 查询到 ${result.records.length} 条路径`
        );

        for (const record of result.records) {
          const pathObj = record.get("path");
          const description = serializePath(pathObj);

          if (!description) continue;

          const score = 1 / description.pathLength;

          const existing = allResults.get(description.pathStr);
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
            allResults.set(description.pathStr, {
              text: description.text,
              score,
              entities: description.entities,
              paths: [description.pathStr],
            });
          }
        }
      } catch (error) {
        console.error(
          `[graph-retriever] 查询实体 ${entity} 失败:`,
          error
        );
      }
    }
  } finally {
    await session.close();
  }

  const results = Array.from(allResults.values());
  results.sort((a, b) => b.score - a.score);

  console.log(
    `[graph-retriever] 图谱检索完成, 返回 ${results.length} 条结果`
  );

  return results;
}
