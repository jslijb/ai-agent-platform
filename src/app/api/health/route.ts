import { NextResponse } from "next/server";
import { db, sql } from "@/server/db/client";
import { redisGet, redisSet, redisDel } from "@/server/lib/redis";

export async function GET() {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
  let overallStatus = "healthy";

  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    checks.database = { status: "up", latency: Date.now() - start };
  } catch (error) {
    checks.database = { status: "down", error: error instanceof Error ? error.message : String(error) };
    overallStatus = "degraded";
  }

  try {
    const start = Date.now();
    const testKey = "__health_check__";
    await redisSet(testKey, "ok", 10);
    const val = await redisGet(testKey);
    await redisDel(testKey);
    if (val === "ok") {
      checks.redis = { status: "up", latency: Date.now() - start };
    } else {
      checks.redis = { status: "down", error: "读写验证失败" };
      overallStatus = "degraded";
    }
  } catch (error) {
    checks.redis = { status: "down", error: error instanceof Error ? error.message : String(error) };
    overallStatus = "degraded";
  }

  try {
    const start = Date.now();
    const neo4jUrl = process.env.NEO4J_URI || "bolt://localhost:7687";
    const neo4jUser = process.env.NEO4J_USER || "neo4j";
    const neo4jPass = process.env.NEO4J_PASSWORD || "test1234";
    const { default: neo4j } = await import("neo4j-driver");
    const driver = neo4j.driver(neo4jUrl, neo4j.auth.basic(neo4jUser, neo4jPass));
    const session = driver.session();
    try {
      await session.run("RETURN 1");
      checks.neo4j = { status: "up", latency: Date.now() - start };
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (error) {
    checks.neo4j = { status: "down", error: error instanceof Error ? error.message : String(error) };
    overallStatus = "degraded";
  }

  try {
    const start = Date.now();
    const response = await fetch("http://localhost:8011/v1/models", {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      checks.embedding = { status: "up", latency: Date.now() - start };
    } else {
      checks.embedding = { status: "down", error: `HTTP ${response.status}` };
      overallStatus = "degraded";
    }
  } catch (error) {
    checks.embedding = { status: "down", error: error instanceof Error ? error.message : String(error) };
    overallStatus = "degraded";
  }

  try {
    const start = Date.now();
    const rerankerUrl = process.env.RERANKER_URL || "http://localhost:8010";
    const response = await fetch(`${rerankerUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      checks.reranker = { status: "up", latency: Date.now() - start };
    } else {
      checks.reranker = { status: "down", error: `HTTP ${response.status}` };
      overallStatus = "degraded";
    }
  } catch (error) {
    checks.reranker = { status: "down", error: error instanceof Error ? error.message : String(error) };
    overallStatus = "degraded";
  }

  try {
    const start = Date.now();
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      checks.llm = { status: "down", error: "DASHSCOPE_API_KEY 未配置" };
      overallStatus = "degraded";
    } else {
      const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        checks.llm = { status: "up", latency: Date.now() - start };
      } else {
        checks.llm = { status: "down", error: `HTTP ${response.status}` };
        overallStatus = "degraded";
      }
    }
  } catch (error) {
    checks.llm = { status: "down", error: error instanceof Error ? error.message : String(error) };
    overallStatus = "degraded";
  }

  const statusCode = overallStatus === "healthy" ? 200 : 503;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: statusCode }
  );
}
