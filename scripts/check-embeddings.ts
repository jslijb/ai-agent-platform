import postgres from "postgres";
const sql = postgres("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb");
async function main() {
  const r = await sql`SELECT "documentId", COUNT(*) as cnt FROM "Embedding" GROUP BY "documentId"`;
  console.log("Embedding counts by document:");
  for (const row of r) {
    console.log(`  documentId: ${row.documentId}, count: ${row.cnt}`);
  }
  const total = await sql`SELECT COUNT(*) as cnt FROM "Embedding"`;
  console.log(`Total embeddings: ${total[0].cnt}`);
  await sql.end();
}
main().catch(console.error);
