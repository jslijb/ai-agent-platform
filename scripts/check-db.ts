import postgres from "postgres";
const sql = postgres("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb");
async function main() {
  const allEmb = await sql`SELECT COUNT(*) as cnt FROM "Embedding"`;
  console.log(`Total embeddings in DB: ${allEmb[0].cnt}`);
  
  const byDoc = await sql`SELECT "documentId", COUNT(*) as cnt FROM "Embedding" GROUP BY "documentId"`;
  console.log("By document:", JSON.stringify(byDoc, null, 2));
  
  const docs = await sql`SELECT id, "fileName", status FROM "Document"`;
  console.log("Documents:", JSON.stringify(docs, null, 2));
  
  await sql.end();
}
main().catch(console.error);
