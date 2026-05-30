import postgres from "postgres";
const sql = postgres("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb");
async function main() {
  const docs = await sql`SELECT id, "fileName", status, "documentType" FROM "Document" LIMIT 20`;
  console.log("Documents:");
  console.log(JSON.stringify(docs, null, 2));
  const chunks = await sql`SELECT "documentId", COUNT(*) as chunk_count FROM "Embedding" GROUP BY "documentId" LIMIT 20`;
  console.log("\nChunk counts:");
  console.log(JSON.stringify(chunks, null, 2));
  const sampleChunks = await sql`SELECT "documentId", "chunkIndex", LEFT("chunkText", 300) as preview FROM "Embedding" ORDER BY RANDOM() LIMIT 10`;
  console.log("\nSample chunks:");
  console.log(JSON.stringify(sampleChunks, null, 2));
  await sql.end();
}
main().catch(console.error);
