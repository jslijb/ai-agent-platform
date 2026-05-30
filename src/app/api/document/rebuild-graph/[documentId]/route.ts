import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { documents, embeddings } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { extractTriples } from "@/server/rag/graph/entity-extractor";
import { createGraph, isNeo4jAvailable } from "@/server/rag/graph/graph-builder";

const GRAPH_MAX_CHUNKS = 50;
const GRAPH_MAX_TEXT_LENGTH = 50000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await auth();
    const testUserId = request.headers.get("x-test-user-id");
    const userId = session?.user?.id || testUserId;
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      );
    }

    const { documentId } = await params;
    console.log(`[重建图谱] 用户 ${userId} 请求重建文档 ${documentId} 的知识图谱`);

    const docRows = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (docRows.length === 0) {
      return NextResponse.json(
        { success: false, message: "文档不存在" },
        { status: 404 }
      );
    }

    const doc = docRows[0]!;

    const neo4jAvailable = await isNeo4jAvailable();
    if (!neo4jAvailable) {
      return NextResponse.json({
        success: false,
        message: "Neo4j 服务未启动，无法构建知识图谱。请先启动 Neo4j 服务。",
      });
    }

    let textToExtract = "";

    if (doc.rawContent) {
      textToExtract = doc.rawContent.slice(0, GRAPH_MAX_TEXT_LENGTH);
      console.log(`[重建图谱] 使用原文内容, 长度: ${textToExtract.length}`);
    } else {
      const chunkRows = await db
        .select({ chunkIndex: embeddings.chunkIndex, chunkText: embeddings.chunkText })
        .from(embeddings)
        .where(eq(embeddings.documentId, documentId))
        .orderBy(embeddings.chunkIndex);

      if (chunkRows.length === 0) {
        return NextResponse.json(
          { success: false, message: "文档没有切片数据，无法提取三元组" },
          { status: 400 }
        );
      }

      const selectedChunks = chunkRows.slice(0, GRAPH_MAX_CHUNKS);
      textToExtract = selectedChunks.map((c) => c.chunkText).join("\n");
      textToExtract = textToExtract.slice(0, GRAPH_MAX_TEXT_LENGTH);
      console.log(`[重建图谱] 使用切片内容, 切片数: ${selectedChunks.length}/${chunkRows.length}, 长度: ${textToExtract.length}`);
    }

    console.log("[重建图谱] 开始提取三元组...");
    const triples = await extractTriples(textToExtract);
    console.log(`[重建图谱] 提取到 ${triples.length} 个三元组`);

    if (triples.length > 0) {
      await createGraph(documentId, triples);
      console.log("[重建图谱] 知识图谱构建完成");
    } else {
      console.log("[重建图谱] 未提取到三元组");
    }

    const graphStatus = triples.length > 0 ? "completed" : "no_triples";
    const graphMessage = triples.length > 0 ? `成功提取 ${triples.length} 个三元组` : "未提取到三元组";

    const existingMeta = (doc.metadata as Record<string, unknown>) || {};
    await db
      .update(documents)
      .set({
        metadata: { ...existingMeta, graphStatus, graphMessage },
        status: doc.status === "partial" ? "completed" : doc.status,
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json({
      success: true,
      documentId,
      tripleCount: triples.length,
      graphStatus,
      graphMessage,
    });
  } catch (error) {
    console.error("[重建图谱] 重建失败:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        success: false,
        message: `知识图谱重建失败: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
