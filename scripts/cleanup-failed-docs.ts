import postgres from "postgres";
const sql = postgres("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb");
async function main() {
  const failed = await sql`SELECT id, "fileName", status FROM "Document" WHERE status = 'failed'`;
  console.log(`找到 ${failed.length} 个失败文档`);
  for (const doc of failed) {
    await sql`DELETE FROM "Embedding" WHERE "documentId" = ${doc.id}`;
    await sql`DELETE FROM "Document" WHERE id = ${doc.id}`;
    console.log(`已删除: ${doc.fileName} (${doc.id})`);
  }
  await sql.end();
}
main().catch(console.error);
