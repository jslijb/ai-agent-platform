/**
 * 审计日志模块
 * 记录关键操作（API 调用、配置变更、数据访问等）到数据库
 */

import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

/** 审计日志条目 */
export interface AuditLogEntry {
  action: string;        // 操作类型：api_call / config_change / data_access / auth_event / error
  actor: string;         // 操作者：用户 ID 或系统标识
  resource: string;      // 操作对象：API 路径、配置项、数据表等
  result: "success" | "failure" | "denied";  // 操作结果
  detail?: string;       // 详细信息（JSON 字符串）
  traceId?: string;      // 分布式追踪 ID
  ipAddress?: string;    // 客户端 IP
}

/** 操作类型常量 */
export const AUDIT_ACTIONS = {
  API_CALL: "api_call",
  CONFIG_CHANGE: "config_change",
  DATA_ACCESS: "data_access",
  DATA_MODIFY: "data_modify",
  AUTH_EVENT: "auth_event",
  ERROR: "error",
  EVALUATION: "evaluation",
  DOCUMENT_UPLOAD: "document_upload",
  DOCUMENT_DELETE: "document_delete",
} as const;

/** 确保审计日志表存在 */
let tableEnsured = false;
async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action VARCHAR(64) NOT NULL,
        actor VARCHAR(256) NOT NULL DEFAULT 'system',
        resource VARCHAR(512) NOT NULL,
        result VARCHAR(16) NOT NULL DEFAULT 'success',
        detail TEXT,
        trace_id VARCHAR(64),
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // 创建索引加速查询
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
    tableEnsured = true;
  } catch (err) {
    console.error("[audit-log] 创建审计日志表失败:", err);
  }
}

/**
 * 写入审计日志
 * 异步执行，不阻塞主流程
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  // 异步确保表存在
  await ensureTable();

  try {
    await db.execute(sql`
      INSERT INTO audit_logs (action, actor, resource, result, detail, trace_id, ip_address)
      VALUES (${entry.action}, ${entry.actor}, ${entry.resource}, ${entry.result},
              ${entry.detail || null}, ${entry.traceId || null}, ${entry.ipAddress || null})
    `);
  } catch (err) {
    // 审计日志写入失败不应影响主流程
    console.error("[audit-log] 写入审计日志失败:", err);
  }
}

/**
 * 查询审计日志
 */
export async function queryAuditLogs(options: {
  action?: string;
  actor?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}): Promise<Array<AuditLogEntry & { id: number; createdAt: Date }>> {
  await ensureTable();

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (options.action) {
    conditions.push(`action = $${paramIdx++}`);
    params.push(options.action);
  }
  if (options.actor) {
    conditions.push(`actor = $${paramIdx++}`);
    params.push(options.actor);
  }
  if (options.startTime) {
    conditions.push(`created_at >= $${paramIdx++}`);
    params.push(options.startTime);
  }
  if (options.endTime) {
    conditions.push(`created_at <= $${paramIdx++}`);
    params.push(options.endTime);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const result = await db.execute(sql.raw(
    `SELECT id, action, actor, resource, result, detail, trace_id, ip_address, created_at as "createdAt"
     FROM audit_logs ${whereClause}
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${offset}`
  ));

  return (result as any).rows as Array<AuditLogEntry & { id: number; createdAt: Date }>;
}

/**
 * 清理过期审计日志（保留 N 天）
 */
export async function cleanOldAuditLogs(retentionDays: number = 90): Promise<number> {
  await ensureTable();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const result = await db.execute(sql`
    DELETE FROM audit_logs WHERE created_at < ${cutoff}
  `);

  return (result as any).rowCount || 0;
}
