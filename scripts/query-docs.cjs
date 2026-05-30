const { Pool } = require("pg");
const pool = new Pool({
  connectionString:
    "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb",
});
pool
  .query(
    'SELECT id, "fileName", status, "documentType" FROM "Document" LIMIT 20'
  )
  .then((r) => {
    console.log(JSON.stringify(r.rows, null, 2));
    return pool.query(
      'SELECT "documentId", COUNT(*) as chunk_count FROM "Embedding" GROUP BY "documentId" LIMIT 20'
    );
  })
  .then((r) => {
    console.log("\nChunk counts:");
    console.log(JSON.stringify(r.rows, null, 2));
    pool.end();
  })
  .catch((e) => {
    console.error(e);
    pool.end();
  });
