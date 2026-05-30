import postgres from "postgres";
const sql = postgres("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb");
async function main() {
  const docs = await sql`SELECT id, "fileName", status FROM "Document" WHERE status != 'completed'`;
  console.log(`找到 ${docs.length} 个未完成文档`);
  for (const doc of docs) {
    await sql`DELETE FROM "Embedding" WHERE "documentId" = ${doc.id}`;
    await sql`DELETE FROM "Document" WHERE id = ${doc.id}`;
    console.log(`已删除: ${doc.fileName} (${doc.id}) status=${doc.status}`);
  }
  const remaining = await sql`SELECT id, "fileName", status FROM "Document"`;
  console.log(`剩余文档: ${remaining.length}`);
  for (const doc of remaining) {
    const chunks = await sql`SELECT COUNT(*) as cnt FROM "Embedding" WHERE "documentId" = ${doc.id}`;
    console.log(`  - ${doc.fileName}: ${doc.status}, ${chunks[0].cnt} chunks`);
  }
  await sql.end();
}
main().catch(console.error);
