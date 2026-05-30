import { config } from "dotenv";
config({ path: ".env.local" });
config();
import "dotenv/config";
import { db } from "../src/server/db/client";
import { documents, embeddings } from "../src/server/db/schema";
import { eq, sql, desc } from "drizzle-orm";

async function main() {
  const docs = await db.select({
    id: documents.id,
    fileName: documents.fileName,
    status: documents.status,
    metadata: documents.metadata,
  }).from(documents).orderBy(desc(documents.createdAt));

  console.log(`\n共 ${docs.length} 个文档:\n`);

  for (const doc of docs) {
    const embCount = await db.select({ count: sql`count(*)` }).from(embeddings).where(eq(embeddings.documentId, doc.id));
    const meta = doc.metadata as any || {};
    console.log(`📄 ${doc.fileName}`);
    console.log(`   id: ${doc.id}`);
    console.log(`   status: ${doc.status}`);
    console.log(`   embeddings: ${embCount[0]?.count}`);
    console.log(`   metadata: chunkCount=${meta.chunkCount}, graphStatus=${meta.graphStatus}, graphMessage=${meta.graphMessage || "(无)"}`);
    console.log("");
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
