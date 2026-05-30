import { db, sql } from "@/server/db/client";

const EMBEDDING_DIMENSIONS = 1024;
const MAX_RETRIES = 3;
const RETRY_INTERVAL = 1000;
const MAX_INPUT_CHARS = 2000;

interface DenseSearchResult {
  id: string;
  text: string;
  documentId: string;
  score: number;
}

function getEmbeddingBaseUrl(): string {
  return process.env.EMBEDDING_SERVICE_URL || "http://localhost:8011";
}

function getEmbeddingModel(): string {
  return process.env.EMBEDDING_MODEL || "bge-m3";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function _callEmbeddingApi(text: string): Promise<number[]> {
  const baseUrl = getEmbeddingBaseUrl();
  const model = getEmbeddingModel();

  console.log(`[dense-retriever] 生成 embedding, 服务: ${baseUrl}, 模型: ${model}, 文本长度: ${text.length}`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[dense-retriever] Embedding API 请求失败 (第${attempt}次): ${response.status} ${errorText}`
        );
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_INTERVAL);
          continue;
        }
        throw new Error(`Embedding API 请求失败: ${response.status}`);
      }

      const result = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
        usage?: { total_tokens: number };
      };

      if (!result.data || result.data.length === 0 || !result.data[0].embedding) {
        console.error(`[dense-retriever] Embedding API 返回数据为空 (第${attempt}次)`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_INTERVAL);
          continue;
        }
        throw new Error("Embedding API 返回数据为空");
      }

      const embedding = result.data[0].embedding;
      console.log(
        `[dense-retriever] Embedding 生成成功, 维度: ${embedding.length}, tokens: ${result.usage?.total_tokens ?? "unknown"}`
      );
      return embedding;
    } catch (error) {
      console.error(`[dense-retriever] 生成 embedding 异常 (第${attempt}次):`, error);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_INTERVAL);
        continue;
      }
      throw error;
    }
  }

  throw new Error("生成 embedding 失败: 超过最大重试次数");
}

export async function generateEmbedding(text: string): Promise<number[]> {
  let truncated = text;
  if (text.length > MAX_INPUT_CHARS) {
    const sub = text.slice(0, MAX_INPUT_CHARS);
    const sentenceEnd = Math.max(
      sub.lastIndexOf("。"),
      sub.lastIndexOf("？"),
      sub.lastIndexOf("！"),
      sub.lastIndexOf("."),
      sub.lastIndexOf("?"),
      sub.lastIndexOf("!")
    );
    if (sentenceEnd > MAX_INPUT_CHARS * 0.5) {
      truncated = sub.slice(0, sentenceEnd + 1);
    } else {
      const commaEnd = Math.max(
        sub.lastIndexOf("，"),
        sub.lastIndexOf("；"),
        sub.lastIndexOf(","),
        sub.lastIndexOf(";")
      );
      if (commaEnd > MAX_INPUT_CHARS * 0.5) {
        truncated = sub.slice(0, commaEnd + 1);
      } else {
        truncated = sub;
      }
    }
    console.log(`[embedding] 文本截断: ${text.length} → ${truncated.length} 字符`);
  }
  return _callEmbeddingApi(truncated);
}

export async function generateEmbeddings(texts: string[], concurrency: number = 5): Promise<number[][]> {
  console.log(`[dense-retriever] 批量生成 embedding, 数量: ${texts.length}, 并发数: ${concurrency}`);

  const embeddings: number[][] = new Array(texts.length);
  let completed = 0;

  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((text, batchIdx) =>
        generateEmbedding(text).catch((error) => {
          console.error(`[dense-retriever] 批量生成第 ${i + batchIdx} 个 embedding 失败:`, error);
          throw error;
        })
      )
    );
    for (let j = 0; j < batchResults.length; j++) {
      embeddings[i + j] = batchResults[j];
    }
    completed += batchResults.length;
    if (completed % 50 === 0 || completed === texts.length) {
      console.log(`[dense-retriever] embedding 生成进度: ${completed}/${texts.length}`);
    }
  }

  console.log(`[dense-retriever] 批量 embedding 生成完成, 成功: ${embeddings.length}`);
  return embeddings;
}

export async function denseSearch(
  query: string,
  topK: number = 10
): Promise<DenseSearchResult[]> {
  console.log(`[dense-retriever] 向量检索, query 长度: ${query.length}, topK: ${topK}`);

  try {
    const queryEmbedding = await generateEmbedding(query);
    const vectorStr = `[${queryEmbedding.join(",")}]`;
    const vectorLiteral = sql.raw(`'${vectorStr}'::vector`);

    const result = await db.execute(sql`
      SELECT e.id, e."chunkText", e."documentId", 1 - (e.embedding <=> ${vectorLiteral}) as score
      FROM "Embedding" e
      JOIN "Document" d ON e."documentId" = d.id
      WHERE d."validUntil" IS NULL OR d."validUntil" > NOW()
      ORDER BY e.embedding <=> ${vectorLiteral}
      LIMIT ${topK}
    `);

    const results = result as unknown as Array<{
      id: string;
      chunkText: string;
      documentId: string;
      score: number;
    }>;

    if (results.length === 0) {
      console.warn("[dense-retriever] 索引扫描返回0条结果，尝试顺序扫描降级...");
      const fallbackResult = await db.execute(sql`
        SELECT e.id, e."chunkText", e."documentId", 1 - (e.embedding <=> ${vectorLiteral}) as score
        FROM "Embedding" e
        JOIN "Document" d ON e."documentId" = d.id
        WHERE d."validUntil" IS NULL OR d."validUntil" > NOW()
        ORDER BY score DESC
        LIMIT ${topK}
      `);
      const fallbackRows = fallbackResult as unknown as Array<{
        id: string;
        chunkText: string;
        documentId: string;
        score: number;
      }>;
      console.log(`[dense-retriever] 顺序扫描降级返回 ${fallbackRows.length} 条结果`);
      return fallbackRows.map((row) => ({
        id: row.id,
        text: row.chunkText,
        documentId: row.documentId,
        score: Number(row.score),
      }));
    }

    console.log(`[dense-retriever] 向量检索完成, 返回 ${results.length} 条结果`);

    return results.map((row) => ({
      id: row.id,
      text: row.chunkText,
      documentId: row.documentId,
      score: Number(row.score),
    }));
  } catch (error) {
    console.error("[dense-retriever] 向量检索失败:", error);
    throw error;
  }
}

export async function storeEmbedding(
  documentId: string,
  chunkIndex: number,
  chunkText: string,
  embedding: number[],
  tokenCount?: number
): Promise<void> {
  console.log(
    `[dense-retriever] 存储 embedding, documentId: ${documentId}, chunkIndex: ${chunkIndex}`
  );

  try {
    const vectorStr = `[${embedding.join(",")}]`;

    await db.execute(sql`
      INSERT INTO "Embedding" ("documentId", "chunkIndex", "chunkText", embedding, "tokenCount", "createdAt")
      VALUES (${documentId}, ${chunkIndex}, ${chunkText}, ${sql.raw(`'${vectorStr}'::vector`)}, ${tokenCount ?? null}, NOW())
    `);

    console.log(`[dense-retriever] Embedding 存储成功, documentId: ${documentId}, chunkIndex: ${chunkIndex}`);
  } catch (error) {
    console.error(
      `[dense-retriever] 存储 embedding 失败, documentId: ${documentId}, chunkIndex: ${chunkIndex}:`,
      error
    );
    throw error;
  }
}

export async function storeEmbeddings(
  items: Array<{
    documentId: string;
    chunkIndex: number;
    chunkText: string;
    embedding: number[];
    tokenCount?: number;
  }>
): Promise<void> {
  console.log(`[dense-retriever] 批量存储 embedding, 数量: ${items.length}`);

  const batchSize = 20;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const valuesParts: string[] = [];
    for (const item of batch) {
      const vectorStr = `[${item.embedding.join(",")}]`;
      const escapedText = item.chunkText.replace(/'/g, "''");
      const tc = item.tokenCount != null ? item.tokenCount : "NULL";
      valuesParts.push(`('${item.documentId}', ${item.chunkIndex}, '${escapedText}', '${vectorStr}'::vector, ${tc}, NOW())`);
    }
    const valuesStr = valuesParts.join(",\n");

    try {
      await db.execute(sql.raw(`
        INSERT INTO "Embedding" ("documentId", "chunkIndex", "chunkText", embedding, "tokenCount", "createdAt")
        VALUES ${valuesStr}
      `));
    } catch (error) {
      console.error(`[dense-retriever] 批量存储第 ${i}-${i + batch.length} 条失败，回退逐条存储:`, error);
      for (const item of batch) {
        await storeEmbedding(item.documentId, item.chunkIndex, item.chunkText, item.embedding, item.tokenCount);
      }
    }

    if ((i + batchSize) % 100 === 0 || i + batchSize >= items.length) {
      console.log(`[dense-retriever] 存储进度: ${Math.min(i + batchSize, items.length)}/${items.length}`);
    }
  }

  console.log(`[dense-retriever] 批量存储完成, 共 ${items.length} 条`);
}
