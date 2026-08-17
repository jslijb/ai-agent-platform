export async function queryGraph(query: string, entityName?: string): Promise<string> {
  try {
    const { isNeo4jAvailable, getNeo4jDriver } = await import("@/server/rag/graph/graph-builder-v2");
    if (!isNeo4jAvailable()) {
      return "知识图谱未配置（Neo4j 未连接）";
    }

    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const searchName = entityName || query;
      const result = await session.run(
        "MATCH (n) WHERE n.name CONTAINS $name OR n.code CONTAINS $name RETURN n LIMIT 10",
        { name: searchName }
      );
      if (result.records.length === 0) {
        return `未找到实体: ${searchName}`;
      }
      const nodes = result.records.map((r) => {
        const node = r.get("n") as Record<string, unknown>;
        return node;
      });
      return JSON.stringify(nodes, null, 2);
    } finally {
      await session.close();
    }
  } catch (err) {
    return `图谱查询错误: ${err instanceof Error ? err.message : String(err)}`;
  }
}
