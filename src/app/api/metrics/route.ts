import { NextResponse } from "next/server";
import { metrics } from "@/server/lib/metrics";
import { semanticCacheStats } from "@/server/llm/semantic-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format");

  if (format === "json") {
    const cacheStats = await semanticCacheStats().catch(() => ({
      totalEntries: 0,
      byTemplate: {},
    }));

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...metrics.toJSON(),
      semanticCache: cacheStats,
    });
  }

  const prometheusText = metrics.toPrometheusFormat();
  return new Response(prometheusText, {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
