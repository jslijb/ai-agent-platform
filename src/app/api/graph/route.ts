import { NextResponse } from "next/server";
import { isNeo4jAvailable, getNeo4jDriver } from "@/server/rag/graph/graph-builder-v2";

// 全局图谱默认采样规模（全量 3237 节点渲染太重，取度数最高的子图）
const DEFAULT_NODE_LIMIT = 80;
const MAX_NODE_LIMIT = 200;
const DEFAULT_EDGE_LIMIT = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");
  const nodeLimit = Math.min(
    Number(searchParams.get("nodeLimit")) || DEFAULT_NODE_LIMIT,
    MAX_NODE_LIMIT
  );
  const edgeLimit = Math.min(Number(searchParams.get("edgeLimit")) || DEFAULT_EDGE_LIMIT, 1000);

  console.log(`[graph-api] 获取知识图谱, documentId: ${documentId || "(全局)"}, nodeLimit: ${nodeLimit}`);

  try {
    const available = await isNeo4jAvailable();

    if (!available) {
      return NextResponse.json({
        success: true,
        neo4jAvailable: false,
        nodes: [],
        edges: [],
        stats: { nodeCount: 0, edgeCount: 0, topEntities: [], labelStats: {} },
        message: "Neo4j 服务未启动，知识图谱数据不可用。",
      });
    }

    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      let edgesResult;
      let degreeResult;
      let labelStats: Record<string, number> = {};

      if (documentId) {
        // 单文档视图：该文档的全部三元组（含 RELATION 与语义化关系 HAS_INDICATOR 等），
        // 按 (头, 尾, 关系) 去重聚合——多文档重复抽取会产生同组合的多条平行边
        edgesResult = await session.run(
          `MATCH (h:Entity)-[r]->(t:Entity)
           WHERE r.sourceDocId = $docId
           WITH h, t,
                CASE WHEN type(r) = 'RELATION' THEN coalesce(r.originalRelation, r.type) ELSE type(r) END AS relation,
                count(r) AS weight
           RETURN h.name AS head, labels(h) AS headLabels, t.name AS tail, labels(t) AS tailLabels, relation, weight
           LIMIT $edgeLimit`,
          { docId: documentId, edgeLimit }
        );
        degreeResult = await session.run(
          `MATCH (e:Entity)-[r]-(t:Entity)
           WHERE r.sourceDocId = $docId
           RETURN e.name AS name, count(DISTINCT t) AS degree
           ORDER BY degree DESC LIMIT 20`,
          { docId: documentId }
        );
      } else {
        // 全局视图：度数最高的 N 个节点 + 它们之间的边（全部关系类型，去重聚合）
        // 注意: Neo4j 5 禁止 size() 包 pattern, 必须用 COUNT {}
        edgesResult = await session.run(
          `MATCH (h:Entity)-[r]->(t:Entity)
           WITH h, t,
                CASE WHEN type(r) = 'RELATION' THEN coalesce(r.originalRelation, r.type) ELSE type(r) END AS relation,
                count(r) AS weight
           WITH h, t, relation, weight, COUNT { (h)--() } + COUNT { (t)--() } AS degreeSum
           ORDER BY degreeSum DESC
           LIMIT $edgeLimit
           RETURN h.name AS head, labels(h) AS headLabels, t.name AS tail, labels(t) AS tailLabels, relation, weight`,
          { edgeLimit }
        );
        degreeResult = await session.run(
          `MATCH (e:Entity)-[r]->(t:Entity)
           RETURN e.name AS name, count(DISTINCT t) AS degree
           ORDER BY degree DESC LIMIT 20`
        );
        const labelResult = await session.run(
          "MATCH (n:Entity) RETURN labels(n) AS labels, count(*) AS count ORDER BY count DESC"
        );
        for (const record of labelResult.records) {
          const labels = (record.get("labels") as unknown as string[])
            .filter((l) => l !== "Entity")
            .sort()
            .join("+");
          const key = labels || "Entity";
          labelStats[key] = (labelStats[key] || 0) + record.get("count").toNumber();
        }
      }

      const nodeMap = new Map<string, { id: string; label: string; type: string }>();

      const primaryLabel = (labels: unknown): string => {
        const arr = (labels as string[] | null)?.filter((l) => l !== "Entity") || [];
        return arr[0] || "Entity";
      };

      const edges: Array<{ source: string; target: string; relation: string; weight: number }> = [];

      for (const record of edgesResult.records) {
        const head = String(record.get("head"));
        const tail = String(record.get("tail"));
        const relation = String(record.get("relation") || "关联");
        const weightRaw = record.get("weight");
        const weight =
          typeof weightRaw?.toNumber === "function" ? weightRaw.toNumber() : Number(weightRaw) || 1;
        if (!head || !tail) continue;

        if (!nodeMap.has(head)) {
          nodeMap.set(head, { id: head, label: head, type: primaryLabel(record.get("headLabels")) });
        }
        if (!nodeMap.has(tail)) {
          nodeMap.set(tail, { id: tail, label: tail, type: primaryLabel(record.get("tailLabels")) });
        }
        edges.push({ source: head, target: tail, relation, weight });
      }

      // 清理孤立的悬空端点（边被 LIMIT 截断时可能出现）
      const edgeNodeIds = new Set(edges.flatMap((e) => [e.source, e.target]));
      Array.from(nodeMap.keys()).forEach((id) => {
        if (!edgeNodeIds.has(id)) nodeMap.delete(id);
      });

      const nodes = Array.from(nodeMap.values());

      const topEntities = degreeResult.records.map((record) => ({
        name: String(record.get("name")),
        degree:
          typeof record.get("degree")?.toNumber === "function"
            ? record.get("degree").toNumber()
            : Number(record.get("degree")),
      }));

      const stats = {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        topEntities,
        labelStats,
      };

      console.log(`[graph-api] 图谱数据获取完成, 节点: ${nodes.length}, 关系: ${edges.length}`);

      return NextResponse.json({
        success: true,
        documentId: documentId || null,
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
        neo4jAvailable: false,
        nodes: [],
        edges: [],
        stats: { nodeCount: 0, edgeCount: 0, topEntities: [], labelStats: {} },
        message: `获取知识图谱失败: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
