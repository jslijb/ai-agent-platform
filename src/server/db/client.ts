import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { sql } from "drizzle-orm";

declare global {
  var db: PostgresJsDatabase<typeof schema> | undefined;
  var pgClient: ReturnType<typeof postgres> | undefined;
}

const connectionString = process.env.DATABASE_URL!;

const pgClient = globalThis.pgClient || postgres(connectionString);
const db: PostgresJsDatabase<typeof schema> = globalThis.db ?? drizzle(pgClient, { schema });

if (process.env.NODE_ENV !== "production") {
  globalThis.pgClient = pgClient;
  globalThis.db = db;
}

export { db, sql };
