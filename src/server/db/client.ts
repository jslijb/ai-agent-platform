import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { sql } from "drizzle-orm";

declare global {
  var db: PostgresJsDatabase<typeof schema> | undefined;
  var pgClient: ReturnType<typeof postgres> | undefined;
}

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL 环境变量未设置。请在 .env.local 中配置，例如：DATABASE_URL=postgres://aiagent:aiagent_secret@localhost:5432/agentdb"
    );
  }
  return url;
}

function createPgClient(): ReturnType<typeof postgres> {
  const connectionString = getConnectionString();
  console.log(`[db-client] 连接数据库: ${connectionString.replace(/:[^:@]+@/, ":****@")}`);
  return postgres(connectionString, {
    connection: {
      application_name: "ai-agent-platform",
      client_encoding: "UTF8",
    },
  });
}

function createDb(): PostgresJsDatabase<typeof schema> {
  const client = createPgClient();
  return drizzle(client, { schema });
}

let _db: PostgresJsDatabase<typeof schema> | undefined;
let _pgClient: ReturnType<typeof postgres> | undefined;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (globalThis.db) return globalThis.db;
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL 环境变量未设置。请在 .env.local 中配置，例如：DATABASE_URL=postgres://aiagent:aiagent_secret@localhost:5432/agentdb"
    );
  }

  _pgClient = createPgClient();
  _db = drizzle(_pgClient, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalThis.pgClient = _pgClient;
    globalThis.db = _db;
  }

  return _db;
}

const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const actualDb = getDb();
    const value = Reflect.get(actualDb, prop, receiver);
    if (typeof value === "function") {
      return value.bind(actualDb);
    }
    return value;
  },
});

async function closeDb(): Promise<void> {
  const client = globalThis.pgClient ?? _pgClient;
  if (client) {
    console.log("[db-client] 关闭数据库连接");
    await client.end();
    globalThis.pgClient = undefined;
    globalThis.db = undefined;
    _pgClient = undefined;
    _db = undefined;
  }
}

export { db, sql, getDb, closeDb };
