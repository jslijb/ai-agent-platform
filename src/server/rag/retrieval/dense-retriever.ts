import { db, sql } from "@/server/db/client";

const EMBEDDING_DIMENSIONS = 1024;
const MAX_RETRIES = 3;
const RETRY_INTERVAL = 1000;

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
  return _callEmbeddingApi(text);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  console.log(`[dense-retriever] 批量生成 embedding, 数量: ${texts.length}`);

  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    try {
      const embedding = await generateEmbedding(texts[i]);
      embeddings.push(embedding);
    } catch (error) {
      console.error(`[dense-retriever] 批量生成第 ${i} 个 embedding 失败:`, error);
      throw error;
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

    const result = await db.execute(sql`
      SELECT e.id, e."chunkText", e."documentId", 1 - (e.embedding <=> ${sql.raw(vectorStr)}::vector) as score
      FROM "Embedding" e
      JOIN "Document" d ON e."documentId" = d.id
      WHERE d."validUntil" IS NULL OR d."validUntil" > NOW()
      ORDER BY e.embedding <=> ${sql.raw(vectorStr)}::vector
      LIMIT ${topK}
    `);

    const results = result as unknown as Array<{
      id: string;
      chunkText: string;
      documentId: string;
      score: number;
    }>;

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
      VALUES (${documentId}, ${chunkIndex}, ${chunkText}, ${sql.raw(vectorStr)}::vector, ${tokenCount ?? null}, NOW())
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

  for (const item of items) {
    await storeEmbedding(
      item.documentId,
      item.chunkIndex,
      item.chunkText,
      item.embedding,
      item.tokenCount
    );
  }

  console.log(`[dense-retriever] 批量存储完成, 共 ${items.length} 条`);
}
