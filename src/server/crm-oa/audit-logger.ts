export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  platform: "odoo" | "twenty";
  action: string;
  model: string;
  recordId?: string | number;
  params: Record<string, unknown>;
  result: "success" | "failure";
  errorMessage?: string;
  durationMs: number;
}

export class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private maxLogs: number;

  constructor(maxLogs = 10000) {
    this.maxLogs = maxLogs;
  }

  log(entry: Omit<AuditLogEntry, "id" | "timestamp">): AuditLogEntry {
    const full: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.logs.push(full);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    return full;
  }

  async wrap<T>(
    userId: string,
    platform: "odoo" | "twenty",
    action: string,
    model: string,
    params: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.log({
        userId,
        platform,
        action,
        model,
        params,
        result: "success",
        durationMs: Date.now() - start,
      });
      return result;
    } catch (err) {
      this.log({
        userId,
        platform,
        action,
        model,
        params,
        result: "failure",
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
      throw err;
    }
  }

  query(filter: {
    userId?: string;
    platform?: "odoo" | "twenty";
    action?: string;
    result?: "success" | "failure";
    since?: string;
    limit?: number;
  }): AuditLogEntry[] {
    let entries = [...this.logs];
    if (filter.userId) entries = entries.filter((e) => e.userId === filter.userId);
    if (filter.platform) entries = entries.filter((e) => e.platform === filter.platform);
    if (filter.action) entries = entries.filter((e) => e.action === filter.action);
    if (filter.result) entries = entries.filter((e) => e.result === filter.result);
    if (filter.since) entries = entries.filter((e) => e.timestamp >= filter.since!);
    const limit = filter.limit || 100;
    return entries.slice(-limit);
  }

  get size(): number {
    return this.logs.length;
  }

  clear(): void {
    this.logs = [];
  }
}

export const globalAuditLogger = new AuditLogger();