import { NextResponse } from "next/server";
import { metrics } from "@/server/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics
 * Prometheus 兼容格式的指标端点
 * 也可通过 ?format=json 获取 JSON 格式
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format");

  if (format === "json") {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...metrics.toJSON(),
    });
  }

  // Prometheus 文本格式
  const prometheusText = metrics.toPrometheusFormat();
  return new Response(prometheusText, {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
