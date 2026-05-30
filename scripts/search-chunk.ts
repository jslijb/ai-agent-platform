import "dotenv/config";
import { db } from "../src/server/db/client";
import { embeddings } from "../src/server/db/schema";
import { like, sql as sqlOp } from "drizzle-orm";

async function main() {
  const result = await db
    .select({ chunkText: embeddings.chunkText, chunkIndex: embeddings.chunkIndex })
    .from(embeddings)
    .where(like(embeddings.chunkText, "%毛利%"))
    .limit(5);

  console.log(`包含"毛利"的 chunk 数: ${result.length}`);
  for (const r of result) {
    const idx = r.chunkText.indexOf("毛利");
    const context = r.chunkText.substring(Math.max(0, idx - 30), idx + 50);
    console.log(`  Chunk ${r.chunkIndex}: ...${context}...`);
  }

  const result2 = await db
    .select({ chunkText: embeddings.chunkText, chunkIndex: embeddings.chunkIndex })
    .from(embeddings)
    .where(like(embeddings.chunkText, "%毛利率%"))
    .limit(5);

  console.log(`\n包含"毛利率"的 chunk 数: ${result2.length}`);
  for (const r of result2) {
    const idx = r.chunkText.indexOf("毛利率");
    const context = r.chunkText.substring(Math.max(0, idx - 30), idx + 50);
    console.log(`  Chunk ${r.chunkIndex}: ...${context}...`);
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
