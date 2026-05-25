import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";

export async function GET() {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
  let overallStatus = "healthy";

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "up", latency: Date.now() - start };
  } catch (error) {
    checks.database = { status: "down", error: error instanceof Error ? error.message : String(error) };
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
