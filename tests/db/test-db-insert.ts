import { config } from "dotenv";
config({ path: ".env.local" });
config();
import "dotenv/config";
import { db } from "../../src/server/db/client";
import { documents, users } from "../../src/server/db/schema";

async function test() {
  const allUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  console.log("User 表中的所有用户:");
  allUsers.forEach(u => console.log("  ", u.id, u.name || "(无名)", u.email || "(无邮箱)"));

  const allDocs = await db.select({ id: documents.id, fileName: documents.fileName, userId: documents.userId }).from(documents);
  console.log("\nDocument 表中的所有文档:");
  allDocs.forEach(d => console.log("  ", d.id.slice(0, 12), d.userId?.slice(0, 20), d.fileName));

  process.exit(0);
}

test().catch((e) => { console.error(e); process.exit(1); });
