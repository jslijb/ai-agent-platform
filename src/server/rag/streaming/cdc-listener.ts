import pgEars from "pg-ears";
import { processDocumentChange } from "@/server/rag/streaming/incremental-embedder";

const CHANNEL_NAME = "document_changes";

let listener: ReturnType<typeof pgEars> | null = null;
let pgClient: InstanceType<typeof import("pg").Client> | null = null;
let isListening = false;

interface CDCPayload {
  action: "insert" | "update" | "delete";
  docId: string;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[cdc-listener] DATABASE_URL 环境变量未设置");
    throw new Error("DATABASE_URL 环境变量未设置");
  }
  return url;
}

function parseConnectionString(url: string): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 5432,
      database: parsed.pathname.slice(1),
      user: parsed.username,
      password: parsed.password,
    };
  } catch (error) {
    console.error("[cdc-listener] 解析数据库连接字符串失败:", error);
    throw new Error("无效的 DATABASE_URL 格式");
  }
}

async function ensureTrigger(): Promise<void> {
  console.log("[cdc-listener] 开始确保 CDC 触发器和通知函数存在...");

  const url = getDatabaseUrl();
  const config = parseConnectionString(url);

  const { Client } = await import("pg");
  const client = new Client(config);

  try {
    await client.connect();
    console.log("[cdc-listener] 临时数据库连接已建立，开始创建触发器...");

    await client.query(`
      CREATE OR REPLACE FUNCTION notify_document_changes() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          PERFORM pg_notify('${CHANNEL_NAME}', json_build_object('action', 'insert', 'docId', NEW.id)::text);
          RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
          PERFORM pg_notify('${CHANNEL_NAME}', json_build_object('action', 'update', 'docId', NEW.id)::text);
          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          PERFORM pg_notify('${CHANNEL_NAME}', json_build_object('action', 'delete', 'docId', OLD.id)::text);
          RETURN OLD;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log("[cdc-listener] 通知函数 notify_document_changes() 创建/更新成功");

    const triggerCheck = await client.query(`
      SELECT 1 FROM pg_trigger WHERE tgname = 'document_changes_trigger'
    `);

    if (triggerCheck.rowCount === 0) {
      await client.query(`
        CREATE TRIGGER document_changes_trigger
        AFTER INSERT OR UPDATE OR DELETE ON "Document"
        FOR EACH ROW EXECUTE FUNCTION notify_document_changes();
      `);
      console.log("[cdc-listener] 触发器 document_changes_trigger 创建成功");
    } else {
      console.log("[cdc-listener] 触发器 document_changes_trigger 已存在，跳过创建");
    }
  } catch (error) {
    console.error("[cdc-listener] 创建 CDC 触发器失败:", error);
    throw error;
  } finally {
    await client.end();
    console.log("[cdc-listener] 临时数据库连接已关闭");
  }
}

export function startCDCListener(): void {
  if (isListening) {
    console.log("[cdc-listener] CDC 监听已在运行中，跳过启动");
    return;
  }

  console.log("[cdc-listener] 正在启动 CDC 监听...");

  const url = getDatabaseUrl();
  const config = parseConnectionString(url);

  ensureTrigger()
    .then(() => {
      listener = pgEars({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
      });

      listener.listen(CHANNEL_NAME, async (err, payload) => {
        if (err) {
          console.error("[cdc-listener] 监听错误:", err);
          return;
        }

        if (!payload) {
          console.log("[cdc-listener] 收到空通知，忽略");
          return;
        }

        console.log(`[cdc-listener] 收到变更通知: ${payload}`);

        try {
          const data: CDCPayload = JSON.parse(payload);
          const { action, docId } = data;

          if (!action || !docId) {
            console.error(`[cdc-listener] 通知数据缺少 action 或 docId: ${payload}`);
            return;
          }

          if (!["insert", "update", "delete"].includes(action)) {
            console.error(`[cdc-listener] 未知的 action 类型: ${action}`);
            return;
          }

          console.log(`[cdc-listener] 处理文档变更: action=${action}, docId=${docId}`);
          await processDocumentChange(docId, action);
          console.log(`[cdc-listener] 文档变更处理完成: action=${action}, docId=${docId}`);
        } catch (parseError) {
          console.error("[cdc-listener] 解析通知数据失败:", parseError);
        }
      });

      const listenFn = listener.listen as unknown as { client?: InstanceType<typeof import("pg").Client> };
      if (listenFn.client) {
        pgClient = listenFn.client;
      }

      isListening = true;
      console.log(`[cdc-listener] CDC 监听已启动，监听频道: ${CHANNEL_NAME}`);
    })
    .catch((error) => {
      console.error("[cdc-listener] 启动 CDC 监听失败:", error);
    });
}

export function stopCDCListener(): void {
  if (!isListening) {
    console.log("[cdc-listener] CDC 监听未在运行，无需停止");
    return;
  }

  console.log("[cdc-listener] 正在停止 CDC 监听...");

  try {
    if (pgClient && pgClient.end) {
      pgClient.end();
    }
    isListening = false;
    listener = null;
    pgClient = null;
    console.log("[cdc-listener] CDC 监听已停止");
  } catch (error) {
    console.error("[cdc-listener] 停止 CDC 监听时出错:", error);
    isListening = false;
    listener = null;
    pgClient = null;
  }
}
