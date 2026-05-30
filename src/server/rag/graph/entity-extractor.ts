import { callWithFallback } from "@/server/llm/router";

export interface Triple {
  head: string;
  relation: string;
  tail: string;
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

const EXTRACT_PROMPT = `你是一个专业的金融领域知识图谱构建助手。请从以下文本中提取实体关系三元组。

要求：
1. 每个三元组格式为 (头实体, 关系, 尾实体)
2. 关系类型限定为：生产、竞争、合作、收购、位于、属于、投资、持股、供应、研发、发布、营收、利润、负债、增长、下降、关联
3. 实体应尽量具体，如公司名、产品名、地点等
4. 只提取文本中明确提到的关系，不要推断
5. 返回 JSON 数组格式：[{"head": "实体1", "relation": "关系", "tail": "实体2"}]
6. 如果文本中没有明确的关系，返回空数组 []

文本：
{text}`;

function parseTriplesFromResponse(content: string): Triple[] {
  let jsonStr = content.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    console.warn("[entity-extractor] LLM 返回内容中未找到 JSON 数组");
    return [];
  }

  jsonStr = arrayMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      console.warn("[entity-extractor] LLM 返回内容不是数组");
      return [];
    }

    const triples: Triple[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.head === "string" &&
        typeof item.relation === "string" &&
        typeof item.tail === "string"
      ) {
        triples.push({
          head: item.head.trim(),
          relation: item.relation.trim(),
          tail: item.tail.trim(),
        });
      }
    }

    return triples;
  } catch (error) {
    console.error("[entity-extractor] JSON 解析失败:", error);
    console.error("[entity-extractor] 原始内容:", jsonStr);
    return [];
  }
}

function deduplicateTriples(triples: Triple[]): Triple[] {
  const seen = new Set<string>();
  const result: Triple[] = [];

  for (const triple of triples) {
    const key = `${triple.head}|||${triple.relation}|||${triple.tail}`;
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

export async function extractTriples(text: string): Promise<Triple[]> {
  console.log(
    `[entity-extractor] 开始提取三元组, 文本长度: ${text.length}`
  );

  const segments = splitTextIntoSegments(text, MAX_SEGMENT_LENGTH);

  if (segments.length > 1) {
    console.log(
      `[entity-extractor] 文本过长, 分为 ${segments.length} 段进行抽取`
    );
  }

  const allTriples: Triple[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    console.log(
      `[entity-extractor] 处理第 ${i + 1}/${segments.length} 段, 长度: ${segment.length}`
    );

    try {
      const prompt = EXTRACT_PROMPT.replace("{text}", segment);

      const response = await callWithFallback([
        { role: "user", content: prompt },
      ]);

      const triples = parseTriplesFromResponse(response.content);
      console.log(
        `[entity-extractor] 第 ${i + 1} 段提取到 ${triples.length} 个三元组 (模型: ${response.model})`
      );

      allTriples.push(...triples);
    } catch (error) {
      console.error(
        `[entity-extractor] 第 ${i + 1} 段提取失败:`,
        error
      );

      if (isNonRetryableError(error)) {
        console.error(
          `[entity-extractor] 检测到不可重试错误(如额度耗尽/认证失败)，立即终止后续段提取`
        );
        throw new NonRetryableError(
          `知识图谱提取终止: ${error instanceof Error ? error.message : String(error)}。请检查百炼API额度或配置 BAILIAN_FALLBACK_MODELS 环境变量添加备用模型。`
        );
      }
    }
  }

  const deduplicated = deduplicateTriples(allTriples);
  console.log(
    `[entity-extractor] 三元组提取完成, 去重前: ${allTriples.length}, 去重后: ${deduplicated.length}`
  );

  return deduplicated;
}
