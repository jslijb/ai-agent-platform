import { db } from "@/server/db/client";
import { documents, embeddings } from "@/server/db/schema";
import { eq, lt, inArray } from "drizzle-orm";

const EXPIRY_DAYS: Record<string, number | null> = {
  research_report: 90,
  financial_report: 365,
  regulation: null,
  general: 180,
};

export async function cleanExpiredDocuments(): Promise<number> {
  console.log("[knowledge-cleanup] 开始清理过期文档");

  try {
    const expiredDocs = await db.query.documents.findMany({
      where: lt(documents.validUntil, new Date()),
      columns: {
        id: true,
      },
    });

    if (expiredDocs.length === 0) {
      console.log("[knowledge-cleanup] 没有发现过期文档");
      return 0;
    }

    const expiredIds = expiredDocs.map((doc) => doc.id);
    console.log(`[knowledge-cleanup] 发现 ${expiredIds.length} 个过期文档，开始删除`);

    const deleteEmbeddingsResult = await db.delete(embeddings).where(inArray(embeddings.documentId, expiredIds)).returning();
    console.log(`[knowledge-cleanup] 删除了 ${deleteEmbeddingsResult.length} 条 embedding 记录`);

    const deleteDocsResult = await db.delete(documents).where(inArray(documents.id, expiredIds)).returning();
    console.log(`[knowledge-cleanup] 删除了 ${deleteDocsResult.length} 个过期文档`);

    return deleteDocsResult.length;
  } catch (error) {
    console.error("[knowledge-cleanup] 清理过期文档失败:", error);
    throw error;
  }
}

export async function setDefaultExpiry(
  docId: string,
  documentType: string
): Promise<void> {
  console.log(`[knowledge-cleanup] 设置文档过期时间, docId: ${docId}, documentType: ${documentType}`);

  try {
    const days = EXPIRY_DAYS[documentType] ?? EXPIRY_DAYS["general"]!;

    let validUntil: Date | null = null;
    if (days !== null) {
      validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + days);
    }

    await db.update(documents).set({
      validUntil,
      documentType,
    }).where(eq(documents.id, docId));

    if (validUntil) {
      console.log(`[knowledge-cleanup] 文档 ${docId} 过期时间设置为 ${validUntil.toISOString()}`);
    } else {
      console.log(`[knowledge-cleanup] 文档 ${docId} 设置为永不过期`);
    }
  } catch (error) {
    console.error(`[knowledge-cleanup] 设置文档过期时间失败, docId: ${docId}:`, error);
    throw error;
  }
}
