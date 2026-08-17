import { callWithFallback } from "@/server/llm/router";
import { classifyEntity, normalizeEntity, isAmount, type EntityType } from "./entity-classifier";
import { semanticCacheGet, semanticCacheSet } from "@/server/llm/semantic-cache";

export interface EnhancedTriple {
  head: string;
  headType: EntityType;
  relation: string;
  relationType: string;
  tail: string;
  tailType: EntityType;
  value?: string;
}

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

function isNonRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (
      error.message.includes("不可重试") ||
      error.message.includes("AllocationQuota") ||
      error.message.includes("403") ||
      error.message.includes("401") ||
      error.message.includes("422")
    ) {
      return true;
    }
  }
  return false;
}

const MAX_SEGMENT_LENGTH = 1500;

const EXTRACT_PROMPT_V2 = `你是一个专业的金融领域知识图谱构建助手。请从以下文本中提取实体关系三元组。

要求：
1. 每个三元组格式为 (头实体, 关系, 尾实体)
2. 关系类型限定为以下语义关系：
   - HAS_REVENUE: 公司→指标（营收相关，如"营业收入"、"营收"）
   - HAS_PROFIT: 公司→指标（利润相关，如"净利润"、"毛利"）
   - HAS_INDICATOR: 公司→指标（其他财务指标，如"ROE"、"毛利率"、"资产负债率"，需在type属性中指定增长/下降）
   - OWNS_SHARE: 公司→公司（持股关系，ratio属性存比例）
   - LOCATED_IN: 公司→地点（公司所在地区）
   - PRODUCES: 公司→产品（公司生产的产品）
   - COOPERATES_WITH: 公司→公司（合作关系）
   - COMPETES_WITH: 公司→公司（竞争关系）
   - INVESTS_IN: 公司→公司/项目（投资关系）
   - SUPPLIES: 公司→公司（供应关系）
   - DEVELOPS: 公司→技术/项目（研发关系）
   - RELEASES: 公司→产品/报告（发布关系）
3. 关键规则：
   - 头实体必须是公司名或组织名，不能是数值
   - 数值（如"12.67%"、"1,711.18亿元"）不能作为独立实体，应作为关系的value属性
   - 例如：(五粮液, HAS_INDICATOR, 营业收入) value="增长12.67%"，而不是(营业收入, 增长, 12.67%)
   - 实体应尽量具体，如公司名、产品名、地点等
   - 只提取文本中明确提到的关系，不要推断
4. 返回 JSON 数组格式：[{"head": "实体1", "relation": "关系类型", "tail": "实体2", "value": "数值(可选)"}]
5. 如果文本中没有明确的关系，返回空数组 []

文本：
{text}`;

function parseEnhancedTriplesFromResponse(content: string): EnhancedTriple[] {
  let jsonStr = content.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    console.warn("[entity-extractor-v2] LLM 返回内容中未找到 JSON 数组");
    return [];
  }

  jsonStr = arrayMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      console.warn("[entity-extractor-v2] LLM 返回内容不是数组");
      return [];
    }

    const triples: EnhancedTriple[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.head === "string" &&
        typeof item.relation === "string" &&
        typeof item.tail === "string"
      ) {
        const head = item.head.trim();
        const tail = item.tail.trim();
        const relation = item.relation.trim();
        const value = typeof item.value === "string" ? item.value.trim() : undefined;

        const headType = classifyEntity(head);
        const tailType = classifyEntity(tail);

        if (isAmount(head)) {
          console.log(`[entity-extractor-v2] 跳过数值头实体: ${head}`);
          continue;
        }

        const relationType = mapRelationType(relation);

        triples.push({
          head: normalizeEntity(head),
          headType,
          relation,
          relationType,
          tail: isAmount(tail) ? tail : normalizeEntity(tail),
          tailType,
          value: value || (isAmount(tail) ? tail : undefined),
        });
      }
    }

    return triples;
  } catch (error) {
    console.error("[entity-extractor-v2] JSON 解析失败:", error);
    console.error("[entity-extractor-v2] 原始内容:", jsonStr);
    return [];
  }
}

function mapRelationType(relation: string): string {
  const mapping: Record<string, string> = {
    "营收": "HAS_REVENUE",
    "营业收入": "HAS_REVENUE",
    "主营收入": "HAS_REVENUE",
    "营业总收入": "HAS_REVENUE",
    "总收入": "HAS_REVENUE",
    "利润": "HAS_PROFIT",
    "净利润": "HAS_PROFIT",
    "归母净利润": "HAS_PROFIT",
    "归属于上市公司股东的净利润": "HAS_PROFIT",
    "扣非净利润": "HAS_PROFIT",
    "毛利": "HAS_PROFIT",
    "营业利润": "HAS_PROFIT",
    "持股": "OWNS_SHARE",
    "控股": "OWNS_SHARE",
    "参股": "OWNS_SHARE",
    "位于": "LOCATED_IN",
    "属于": "LOCATED_IN",
    "地处": "LOCATED_IN",
    "生产": "PRODUCES",
    "制造": "PRODUCES",
    "产出": "PRODUCES",
    "合作": "COOPERATES_WITH",
    "竞争": "COMPETES_WITH",
    "投资": "INVESTS_IN",
    "收购": "INVESTS_IN",
    "供应": "SUPPLIES",
    "研发": "DEVELOPS",
    "开发": "DEVELOPS",
    "发布": "RELEASES",
    "增长": "HAS_INDICATOR",
    "下降": "HAS_INDICATOR",
    "负债": "HAS_INDICATOR",
    "关联": "HAS_INDICATOR",
    "指标": "HAS_INDICATOR",
    "毛利率": "HAS_INDICATOR",
    "净利率": "HAS_INDICATOR",
    "ROE": "HAS_INDICATOR",
    "资产负债率": "HAS_INDICATOR",
    "HAS_REVENUE": "HAS_REVENUE",
    "HAS_PROFIT": "HAS_PROFIT",
    "HAS_INDICATOR": "HAS_INDICATOR",
    "OWNS_SHARE": "OWNS_SHARE",
    "LOCATED_IN": "LOCATED_IN",
    "PRODUCES": "PRODUCES",
    "COOPERATES_WITH": "COOPERATES_WITH",
    "COMPETES_WITH": "COMPETES_WITH",
    "INVESTS_IN": "INVESTS_IN",
    "SUPPLIES": "SUPPLIES",
    "DEVELOPS": "DEVELOPS",
    "RELEASES": "RELEASES",
  };

  if (mapping[relation]) return mapping[relation];

  for (const [key, value] of Object.entries(mapping)) {
    if (relation.includes(key)) return value;
  }

  return "RELATED_TO";
}

function deduplicateTriples(triples: EnhancedTriple[]): EnhancedTriple[] {
  const seen = new Set<string>();
  const result: EnhancedTriple[] = [];

  for (const triple of triples) {
    const key = `${triple.head}|||${triple.relationType}|||${triple.tail}|||${triple.value || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(triple);
    }
  }

  return result;
}

function splitTextIntoSegments(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const segments: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxLength, text.length);

    if (end < text.length) {
      const lastSentenceEnd = text.lastIndexOf("。", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastSentenceEnd, lastNewline);

      if (breakPoint > start) {
        end = breakPoint + 1;
      }
    }

    segments.push(text.slice(start, end).trim());
    start = end;

    if (start >= text.length) break;
  }

  return segments.filter((s) => s.length > 0);
}

export async function extractEnhancedTriples(text: string): Promise<EnhancedTriple[]> {
  console.log(
    `[entity-extractor-v2] 开始提取增强三元组, 文本长度: ${text.length}`
  );

  const segments = splitTextIntoSegments(text, MAX_SEGMENT_LENGTH);

  if (segments.length > 1) {
    console.log(
      `[entity-extractor-v2] 文本过长, 分为 ${segments.length} 段进行抽取`
    );
  }

  const allTriples: EnhancedTriple[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    console.log(
      `[entity-extractor-v2] 处理第 ${i + 1}/${segments.length} 段, 长度: ${segment.length}`
    );

    try {
      const prompt = EXTRACT_PROMPT_V2.replace("{text}", segment);

      const cached = await semanticCacheGet("entity-extract", segment);
      let responseContent: string | null;
      let responseModel: string | undefined;
      let responseProvider: string | undefined;

      if (cached.content) {
        console.log(`[entity-extractor-v2] 第 ${i + 1} 段语义缓存命中 (${cached.hitType})`);
        responseContent = cached.content;
        responseModel = cached.model;
        responseProvider = cached.provider;
      } else {
        let response = await callWithFallback([
          { role: "user", content: prompt },
        ]);

        if (!response.content || response.content.trim().length === 0) {
          console.warn(`[entity-extractor-v2] 第 ${i + 1} 段 LLM 返回空内容，重试一次`);
          response = await callWithFallback([
            { role: "user", content: prompt },
          ]);
        }

        responseContent = response.content;
        responseModel = response.model;
        responseProvider = response.provider;

        if (responseContent && responseContent.trim().length > 0) {
          await semanticCacheSet(
            "entity-extract",
            segment,
            responseContent,
            responseModel,
            responseProvider
          );
        }
      }

      const triples = parseEnhancedTriplesFromResponse(responseContent ?? "");
      console.log(
        `[entity-extractor-v2] 第 ${i + 1} 段提取到 ${triples.length} 个增强三元组 (模型: ${responseModel})`
      );

      allTriples.push(...triples);
    } catch (error) {
      console.error(
        `[entity-extractor-v2] 第 ${i + 1} 段提取失败:`,
        error
      );

      if (isNonRetryableError(error)) {
        console.error(
          `[entity-extractor-v2] 检测到不可重试错误，立即终止后续段提取`
        );
        throw new NonRetryableError(
          `知识图谱提取终止: ${error instanceof Error ? error.message : String(error)}。请检查API额度或配置备用模型。`
        );
      }
    }
  }

  const deduplicated = deduplicateTriples(allTriples);
  console.log(
    `[entity-extractor-v2] 增强三元组提取完成, 去重前: ${allTriples.length}, 去重后: ${deduplicated.length}`
  );

  const stats = {
    total: deduplicated.length,
    byType: {} as Record<string, number>,
    withValue: deduplicated.filter((t) => t.value).length,
    byHeadType: {} as Record<string, number>,
  };
  for (const t of deduplicated) {
    stats.byType[t.relationType] = (stats.byType[t.relationType] || 0) + 1;
    stats.byHeadType[t.headType] = (stats.byHeadType[t.headType] || 0) + 1;
  }
  console.log(`[entity-extractor-v2] 统计: ${JSON.stringify(stats)}`);

  return deduplicated;
}

export { splitTextIntoSegments, parseEnhancedTriplesFromResponse, mapRelationType };