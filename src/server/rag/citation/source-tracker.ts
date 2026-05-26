import { db, sql } from "@/server/db/client";

export interface SourceMetadata {
  fileName?: string;
  pageNum?: number;
  paragraphIndex?: number;
  documentId?: string;
  elementType?: string;
}

export function buildCitation(result: {
  text: string;
  metadata: SourceMetadata;
}): string {
  const { metadata } = result;

  console.log(
    `[source-tracker] 构建引用, metadata: ${JSON.stringify(metadata)}`
  );

  const fileName = metadata.fileName || "未知文档";
  const pageNum = metadata.pageNum;

  if (pageNum !== undefined && pageNum !== null) {
    const citation = `[来源: 《${fileName}》第${pageNum}页]`;
    console.log(`[source-tracker] 引用构建完成: ${citation}`);
    return citation;
  }

  const citation = `[来源: 《${fileName}》]`;
  console.log(`[source-tracker] 引用构建完成（无页码）: ${citation}`);
  return citation;
}

export function buildCitations(
  results: Array<{ text: string; metadata: SourceMetadata }>
): string[] {
  console.log(`[source-tracker] 批量构建引用, 数量: ${results.length}`);

  const citations = results.map((result, index) => {
    const citation = buildCitation(result);
    console.log(`[source-tracker] 第 ${index + 1} 条引用: ${citation}`);
    return citation;
  });

  console.log(`[source-tracker] 批量引用构建完成, 共 ${citations.length} 条`);
  return citations;
}

export async function enrichMetadata(
  documentId: string,
  metadata: Record<string, any>
): Promise<SourceMetadata> {
  console.log(
    `[source-tracker] 丰富元数据, documentId: ${documentId}`
  );

  try {
    const result = await db.execute(sql`
      SELECT "fileName" FROM "Document"
      WHERE id = ${documentId}
      LIMIT 1
    `);

    const documentRows = result as unknown as Array<{ fileName: string }>;

    if (!documentRows || documentRows.length === 0) {
      console.error(
        `[source-tracker] 文档不存在: ${documentId}`
      );
      return { ...metadata, documentId };
    }

    const fileName = documentRows[0].fileName;

    const enriched: SourceMetadata = {
      ...metadata,
      fileName,
      documentId,
    };

    console.log(
      `[source-tracker] 元数据丰富完成, fileName: ${fileName}`
    );

    return enriched;
  } catch (error) {
    console.error(
      `[source-tracker] 丰富元数据失败, documentId: ${documentId}:`,
      error
    );
    return { ...metadata, documentId };
  }
}

export async function buildCitationFromDocumentId(
  documentId: string,
  metadata: Record<string, any>
): Promise<string> {
  console.log(
    `[source-tracker] 从 documentId 构建引用, documentId: ${documentId}`
  );

  try {
    const enrichedMetadata = await enrichMetadata(documentId, metadata);
    const citation = buildCitation({ text: "", metadata: enrichedMetadata });
    console.log(`[source-tracker] 引用构建完成: ${citation}`);
    return citation;
  } catch (error) {
    console.error(
      `[source-tracker] 从 documentId 构建引用失败:`,
      error
    );
    return `[来源: 文档ID ${documentId}]`;
  }
}
