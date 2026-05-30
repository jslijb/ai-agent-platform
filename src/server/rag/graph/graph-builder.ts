import neo4j from "neo4j-driver";
import type { Triple } from "./entity-extractor";

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

    console.log(`[graph-builder] 检查 Neo4j 连接: ${uri}`);

    const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      connectionTimeout: 5000,
    });
    await driver.verifyConnectivity();

    driverInstance = driver;
    neo4jAvailable = true;
    neo4jChecked = true;

    console.log("[graph-builder] Neo4j 连接验证成功");
    return true;
  } catch (error) {
    console.warn(`[graph-builder] Neo4j 不可用: ${error instanceof Error ? error.message : String(error)}`);
    console.warn("[graph-builder] 知识图谱功能将被跳过。如需启用，请确保 Neo4j 服务已启动。");
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

  console.log(`[graph-builder] 初始化 Neo4j 连接: ${uri}`);

  driverInstance = neo4j.driver(uri, neo4j.auth.basic(user, password));

  driverInstance.verifyConnectivity().then(() => {
    console.log("[graph-builder] Neo4j 连接验证成功");
    neo4jAvailable = true;
    neo4jChecked = true;
  }).catch((error) => {
    console.error("[graph-builder] Neo4j 连接验证失败:", error);
    neo4jAvailable = false;
    neo4jChecked = true;
  });

  return driverInstance;
}

export async function createGraph(
  docId: string,
  triples: Triple[]
): Promise<void> {
  if (triples.length === 0) {
    console.log(`[graph-builder] 文档 ${docId} 无三元组, 跳过图谱创建`);
    return;
  }

  const available = await isNeo4jAvailable();
  if (!available) {
    console.warn(`[graph-builder] Neo4j 不可用，跳过图谱创建。文档 ${docId} 的 ${triples.length} 个三元组未写入图谱。`);
    console.warn("[graph-builder] 解决方案：启动 Neo4j 服务后重新上传文档，或设置 NEO4J_URI 环境变量。");
    return;
  }

  console.log(
    `[graph-builder] 开始创建图谱, docId: ${docId}, 三元组数: ${triples.length}`
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
        await tx.run(
          `MERGE (h:Entity {name: $head})
           MERGE (t:Entity {name: $tail})
           MERGE (h)-[r:RELATION {type: $relation, sourceDocId: $docId}]->(t)`,
          {
            head: triple.head,
            tail: triple.tail,
            relation: triple.relation,
            docId,
          }
        );

        if (!entitySet.has(triple.head)) {
          entitySet.add(triple.head);
          nodeCount++;
        }
        if (!entitySet.has(triple.tail)) {
          entitySet.add(triple.tail);
          nodeCount++;
        }
        relCount++;
      } catch (error) {
        console.error(
          `[graph-builder] 写入三元组失败: (${triple.head}, ${triple.relation}, ${triple.tail})`,
          error
        );
      }
    }

    await tx.commit();
    console.log(
      `[graph-builder] 图谱创建完成, docId: ${docId}, 节点数: ${nodeCount}, 关系数: ${relCount}`
    );
  } catch (error) {
    console.error(`[graph-builder] 图谱创建失败, docId: ${docId}:`, error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function deleteGraph(docId: string): Promise<void> {
  console.log(`[graph-builder] 开始删除文档图谱, docId: ${docId}`);

  const available = await isNeo4jAvailable();
  if (!available) {
    console.warn(`[graph-builder] Neo4j 不可用，跳过图谱删除: ${docId}`);
    return;
  }

  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const deleteRelResult = await session.run(
      `MATCH ()-[r:RELATION {sourceDocId: $docId}]->() DELETE r RETURN count(r) AS deleted`,
      { docId }
    );
    const deletedRels = deleteRelResult.records[0]?.get("deleted")?.toNumber() ?? 0;
    console.log(
      `[graph-builder] 删除关系: ${deletedRels} 条, docId: ${docId}`
    );

    const deleteOrphanResult = await session.run(
      `MATCH (n:Entity) WHERE NOT (n)--() DELETE n RETURN count(n) AS deleted`
    );
    const deletedNodes = deleteOrphanResult.records[0]?.get("deleted")?.toNumber() ?? 0;
    console.log(
      `[graph-builder] 删除孤立节点: ${deletedNodes} 个, docId: ${docId}`
    );

    console.log(`[graph-builder] 文档图谱删除完成, docId: ${docId}`);
  } catch (error) {
    console.error(`[graph-builder] 删除文档图谱失败, docId: ${docId}:`, error);
    throw error;
  } finally {
    await session.close();
  }
}
