import "dotenv/config";
import { db } from "../src/server/db/client";
import { documents } from "../src/server/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const result = await db
    .delete(documents)
    .where(eq(documents.status, "processing"))
    .returning({ id: documents.id, fileName: documents.fileName });

  console.log(`已删除 ${result.length} 个卡在 processing 的文档:`);
  for (const r of result) {
    console.log(`  - ${r.fileName} (${r.id})`);
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
