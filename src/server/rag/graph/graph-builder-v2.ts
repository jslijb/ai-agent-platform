import neo4j from "neo4j-driver";
import type { EnhancedTriple } from "./entity-extractor-v2";
import { redisGet, redisSet, redisDel, isRedisConnected } from "@/server/lib/redis";

const DEFAULT_NEO4J_URI = "bolt://localhost:7687";
const DEFAULT_NEO4J_USER = "neo4j";
const DEFAULT_NEO4J_PASSWORD = "test1234";

let driverInstance: neo4j.Driver | null = null;
let neo4jAvailable = false;
let neo4jChecked = false;

export async function isNeo4jAvailable(): Promise<boolean> {
  if (neo4jChecked) {
    return neo4jAvailable;
  }

  try {
    const uri = process.env.NEO4J_URI || DEFAULT_NEO4J_URI;
    const user = process.env.NEO4J_USER || DEFAULT_NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD || DEFAULT_NEO4J_PASSWORD;

    console.log(`[graph-builder-v2] 检查 Neo4j 连接: ${uri}`);

    const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      connectionTimeout: 5000,
    });
    await driver.verifyConnectivity();

    driverInstance = driver;
    neo4jAvailable = true;
    neo4jChecked = true;

    console.log("[graph-builder-v2] Neo4j 连接验证成功");
    return true;
  } catch (error) {
    console.warn(`[graph-builder-v2] Neo4j 不可用: ${error instanceof Error ? error.message : String(error)}`);
    neo4jAvailable = false;
    neo4jChecked = true;
    return false;
  }
}

export function getNeo4jDriver(): neo4j.Driver {
  if (driverInstance) {
    return driverInstance;
  }

  const uri = process.env.NEO4J_URI || DEFAULT_NEO4J_URI;
  const user = process.env.NEO4J_USER || DEFAULT_NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD || DEFAULT_NEO4J_PASSWORD;

  console.log(`[graph-builder-v2] 初始化 Neo4j 连接: ${uri}`);

  driverInstance = neo4j.driver(uri, neo4j.auth.basic(user, password));

  driverInstance.verifyConnectivity().then(() => {
    console.log("[graph-builder-v2] Neo4j 连接验证成功");
    neo4jAvailable = true;
    neo4jChecked = true;
  }).catch((error) => {
    console.error("[graph-builder-v2] Neo4j 连接验证失败:", error);
    neo4jAvailable = false;
    neo4jChecked = true;
  });

  return driverInstance;
}

export interface GraphProgress {
  docId: string;
  processedChunks: number;
  totalChunks: number;
  status: "processing" | "completed" | "failed";
  error?: string;
  startedAt: string;
  updatedAt: string;
}

const PROGRESS_TTL = 86400;

export async function saveProgress(progress: GraphProgress): Promise<void> {
  if (!isRedisConnected()) return;
  const key = `graph:progress:${progress.docId}`;
  await redisSet(key, JSON.stringify(progress), PROGRESS_TTL);
}

export async function loadProgress(docId: string): Promise<GraphProgress | null> {
  if (!isRedisConnected()) return null;
  const key = `graph:progress:${docId}`;
  const data = await redisGet(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as GraphProgress;
  } catch {
    return null;
  }
}

export async function clearProgress(docId: string): Promise<void> {
  if (!isRedisConnected()) return;
  const key = `graph:progress:${docId}`;
  await redisDel(key);
}

export async function createEnhancedGraph(
  docId: string,
  triples: EnhancedTriple[]
): Promise<{ nodeCount: number; relCount: number }> {
  if (triples.length === 0) {
    console.log(`[graph-builder-v2] 文档 ${docId} 无三元组, 跳过图谱创建`);
    return { nodeCount: 0, relCount: 0 };
  }

  const available = await isNeo4jAvailable();
  if (!available) {
    console.warn(`[graph-builder-v2] Neo4j 不可用，跳过图谱创建。文档 ${docId} 的 ${triples.length} 个三元组未写入图谱。`);
    return { nodeCount: 0, relCount: 0 };
  }

  console.log(
    `[graph-builder-v2] 开始创建增强图谱, docId: ${docId}, 三元组数: ${triples.length}`
  );

  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const tx = session.beginTransaction();

    let nodeCount = 0;
    let relCount = 0;
    const entitySet = new Set<string>();

    for (const triple of triples) {
      try {
        const headLabels = ["Entity", triple.headType].filter(Boolean).join(":");
        const tailLabels = ["Entity", triple.tailType].filter(Boolean).join(":");

        const props: Record<string, unknown> = {
          head: triple.head,
          tail: triple.tail,
          docId,
          relationType: triple.relationType,
          originalRelation: triple.relation,
        };
        if (triple.value) {
          props.value = triple.value;
        }

        await tx.run(
          `MERGE (h:${headLabels} {name: $head})
           MERGE (t:${tailLabels} {name: $tail})
           MERGE (h)-[r:${triple.relationType} {sourceDocId: $docId}]->(t)
           SET r.originalRelation = $originalRelation
           ${triple.value ? "SET r.value = $value" : ""}`,
          props
        );

        if (!entitySet.has(triple.head)) {
          entitySet.add(triple.head);
          nodeCount++;
        }
        if (!entitySet.has(triple.tail) && triple.tailType !== "Amount") {
          entitySet.add(triple.tail);
          nodeCount++;
        }
        relCount++;
      } catch (error) {
        console.error(
          `[graph-builder-v2] 写入三元组失败: (${triple.head}, ${triple.relationType}, ${triple.tail})`,
          error
        );
      }
    }

    await tx.commit();
    console.log(
      `[graph-builder-v2] 增强图谱创建完成, docId: ${docId}, 节点数: ${nodeCount}, 关系数: ${relCount}`
    );

    return { nodeCount, relCount };
  } catch (error) {
    console.error(`[graph-builder-v2] 增强图谱创建失败, docId: ${docId}:`, error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function deleteEnhancedGraph(docId: string): Promise<void> {
  console.log(`[graph-builder-v2] 开始删除文档增强图谱, docId: ${docId}`);

  const available = await isNeo4jAvailable();
  if (!available) {
    console.warn(`[graph-builder-v2] Neo4j 不可用，跳过图谱删除: ${docId}`);
    return;
  }

  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const allRelTypes = [
      "HAS_REVENUE", "HAS_PROFIT", "HAS_INDICATOR", "OWNS_SHARE",
      "LOCATED_IN", "PRODUCES", "COOPERATES_WITH", "COMPETES_WITH",
      "INVESTS_IN", "SUPPLIES", "DEVELOPS", "RELEASES", "RELATED_TO",
    ];

    let totalDeletedRels = 0;
    for (const relType of allRelTypes) {
      try {
        const result = await session.run(
          `MATCH ()-[r:${relType} {sourceDocId: $docId}]->() DELETE r RETURN count(r) AS deleted`,
          { docId }
        );
        const deleted = result.records[0]?.get("deleted")?.toNumber() ?? 0;
        totalDeletedRels += deleted;
      } catch {
        // relation type may not exist
      }
    }

    // Also delete old RELATION type
    try {
      const deleteRelResult = await session.run(
        `MATCH ()-[r:RELATION {sourceDocId: $docId}]->() DELETE r RETURN count(r) AS deleted`,
        { docId }
      );
      const deletedRels = deleteRelResult.records[0]?.get("deleted")?.toNumber() ?? 0;
      totalDeletedRels += deletedRels;
    } catch {
      // RELATION type may not exist
    }

    console.log(`[graph-builder-v2] 删除关系: ${totalDeletedRels} 条, docId: ${docId}`);

    const deleteOrphanResult = await session.run(
      `MATCH (n:Entity) WHERE NOT (n)--() DELETE n RETURN count(n) AS deleted`
    );
    const deletedNodes = deleteOrphanResult.records[0]?.get("deleted")?.toNumber() ?? 0;
    console.log(`[graph-builder-v2] 删除孤立节点: ${deletedNodes} 个, docId: ${docId}`);

    console.log(`[graph-builder-v2] 文档增强图谱删除完成, docId: ${docId}`);
  } catch (error) {
    console.error(`[graph-builder-v2] 删除文档增强图谱失败, docId: ${docId}:`, error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function getGraphStats(): Promise<{
  nodeCount: number;
  relCount: number;
  labelCounts: Record<string, number>;
  relTypeCounts: Record<string, number>;
}> {
  const available = await isNeo4jAvailable();
  if (!available) {
    return { nodeCount: 0, relCount: 0, labelCounts: {}, relTypeCounts: {} };
  }

  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const nodeResult = await session.run("MATCH (n:Entity) RETURN count(n) AS count");
    const nodeCount = nodeResult.records[0]?.get("count")?.toNumber() ?? 0;

    const labelResult = await session.run(
      "MATCH (n:Entity) RETURN labels(n) AS labels, count(*) AS count ORDER BY count DESC"
    );
    const labelCounts: Record<string, number> = {};
    for (const record of labelResult.records) {
      const labels = record.get("labels") as unknown as string[];
      const count = record.get("count")?.toNumber() ?? 0;
      const labelStr = labels.sort().join("+");
      labelCounts[labelStr] = count;
    }

    const relResult = await session.run(
      "MATCH ()-[r]->() RETURN type(r) AS relType, count(*) AS count ORDER BY count DESC"
    );
    const relTypeCounts: Record<string, number> = {};
    let relCount = 0;
    for (const record of relResult.records) {
      const relType = record.get("relType") as unknown as string;
      const count = record.get("count")?.toNumber() ?? 0;
      relTypeCounts[relType] = count;
      relCount += count;
    }

    return { nodeCount, relCount, labelCounts, relTypeCounts };
  } finally {
    await session.close();
  }
}