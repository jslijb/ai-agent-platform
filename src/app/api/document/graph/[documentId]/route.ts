import { NextResponse } from "next/server";
import { isNeo4jAvailable, getNeo4jDriver } from "@/server/rag/graph/graph-builder";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;

  console.log(`[graph-api] 获取文档知识图谱, documentId: ${documentId}`);

  try {
    const available = await isNeo4jAvailable();

    if (!available) {
      console.warn("[graph-api] Neo4j 不可用");
      return NextResponse.json({
        success: true,
        documentId,
        neo4jAvailable: false,
        nodes: [],
        edges: [],
        stats: { nodeCount: 0, edgeCount: 0, topEntities: [] },
        message: "Neo4j 服务未启动，知识图谱数据不可用。请启动 Neo4j 后重新上传文档。",
      });
    }

    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      const edgesResult = await session.run(
        `MATCH (h:Entity)-[r:RELATION {sourceDocId: $docId}]->(t:Entity)
         RETURN h.name AS head, t.name AS tail, r.type AS relation`,
        { docId: documentId }
      );

      const degreeResult = await session.run(
        `MATCH (e:Entity)-[r:RELATION {sourceDocId: $docId}]-()
         RETURN e.name AS name, count(r) AS degree
         ORDER BY degree DESC LIMIT 20`,
        { docId: documentId }
      );

      const nodeSet = new Set<string>();
      const edges: Array<{ source: string; target: string; relation: string }> = [];

      for (const record of edgesResult.records) {
        const head = String(record.get("head"));
        const tail = String(record.get("tail"));
        const relation = String(record.get("relation") || "关联");

        if (!head || !tail) continue;

        nodeSet.add(head);
        nodeSet.add(tail);
        edges.push({ source: head, target: tail, relation });
      }

      const nodes = Array.from(nodeSet).map((name) => ({
        id: name,
        label: name,
        type: "Entity",
      }));

      const topEntities = degreeResult.records.map((record) => ({
        name: String(record.get("name")),
        degree: typeof record.get("degree")?.toNumber === "function" ? record.get("degree").toNumber() : Number(record.get("degree")),
      }));

      const stats = {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        topEntities,
      };

      console.log(
        `[graph-api] 图谱数据获取完成, 节点: ${nodes.length}, 关系: ${edges.length}`
      );

      return NextResponse.json({
        success: true,
        documentId,
        neo4jAvailable: true,
        nodes,
        edges,
        stats,
      });
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error("[graph-api] 获取知识图谱失败:", error);
    return NextResponse.json(
      {
        success: false,
        documentId,
        neo4jAvailable: false,
        nodes: [],
        edges: [],
        stats: { nodeCount: 0, edgeCount: 0, topEntities: [] },
        message: `获取知识图谱失败: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
