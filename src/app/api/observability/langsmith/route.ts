import { getLangSmithConfig } from "@/server/observability/langsmith";

export async function GET() {
  const config = getLangSmithConfig();
  return Response.json({
    langsmith: config,
    timestamp: new Date().toISOString(),
  });
}