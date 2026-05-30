import postgres from "postgres";
const sql = postgres("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb");
async function main() {
  const users = await sql`SELECT id, email, name, role FROM "User" LIMIT 10`;
  console.log("Users:");
  console.log(JSON.stringify(users, null, 2));
  await sql.end();
}
main().catch(console.error);
