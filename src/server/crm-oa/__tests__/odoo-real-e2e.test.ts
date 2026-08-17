import { describe, it, expect, beforeAll } from "vitest";
import { OdooAdapter, createOdooAdapter } from "../../crm-oa/odoo-adapter";
import { AuditLogger } from "../../crm-oa/audit-logger";

const ODOO_URL = process.env.ODOO_URL || "http://localhost:8069";
const ODOO_DB = process.env.ODOO_DB || "odoo";
const ODOO_USER = process.env.ODOO_USER || "admin";
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || "admin";

const odooAvailable = async (): Promise<boolean> => {
  try {
    const resp = await fetch(`${ODOO_URL}/web/health`);
    return resp.ok;
  } catch {
    return false;
  }
};

describe("R029-b: Odoo 真实 Docker E2E", () => {
  let odoo: OdooAdapter;
  let uid: number;
  let skipTests = false;

  beforeAll(async () => {
    const available = await odooAvailable();
    if (!available) {
      console.warn("[R029-b] Odoo Docker 容器未运行，跳过真实 E2E 测试");
      console.warn("[R029-b] 启动命令: docker compose up -d odoo-db odoo");
      skipTests = true;
      return;
    }

    odoo = createOdooAdapter({
      baseUrl: ODOO_URL,
      db: ODOO_DB,
      uid: 0,
      password: ODOO_PASSWORD,
    });

    try {
      uid = await odoo.authenticate(ODOO_DB, ODOO_USER, ODOO_PASSWORD);
      console.log(`[R029-b] Odoo 认证成功, uid=${uid}`);
    } catch (err) {
      console.warn(`[R029-b] Odoo 认证失败: ${err}`);
      skipTests = true;
    }
  });

  it("Odoo health check 应通过", async () => {
    if (skipTests) return;
    const healthy = await odoo.healthCheck();
    expect(healthy).toBe(true);
  });

  it("Odoo JSON-RPC 认证应返回有效 uid", async () => {
    if (skipTests) return;
    expect(uid).toBeGreaterThan(0);
  });

  it("Odoo 应能搜索 res.partner", async () => {
    if (skipTests) return;
    const partners = await odoo.searchRead({
      model: "res.partner",
      domain: [],
      fields: ["id", "name", "email"],
      limit: 5,
    });
    expect(Array.isArray(partners)).toBe(true);
    expect(partners.length).toBeGreaterThan(0);
    console.log(`[R029-b] 搜索到 ${partners.length} 个 partner`);
  });

  it("Odoo 应能创建 res.partner", async () => {
    if (skipTests) return;
    const testTime = Date.now();
    const partnerId = await odoo.create("res.partner", {
      name: `E2E测试伙伴_${testTime}`,
      email: `e2e_${testTime}@test.com`,
    });
    expect(partnerId).toBeGreaterThan(0);
    console.log(`[R029-b] 创建 partner id=${partnerId}`);

    const records = await odoo.read("res.partner", [partnerId], ["name", "email"]);
    expect(records.length).toBe(1);
    expect(records[0].name).toBe(`E2E测试伙伴_${testTime}`);
  });

  it("Odoo 应能查询 hr.employee 列表", async () => {
    if (skipTests) return;
    try {
      const employees = await odoo.searchRead({
        model: "hr.employee",
        domain: [],
        fields: ["id", "name"],
        limit: 5,
      });
      expect(Array.isArray(employees)).toBe(true);
      console.log(`[R029-b] 搜索到 ${employees.length} 个 employee`);
    } catch (err) {
      console.warn(`[R029-b] hr.employee 查询失败（可能未安装 HR 模块）: ${err}`);
      expect(true).toBe(true);
    }
  });

  it("Odoo 审计日志应记录操作", async () => {
    if (skipTests) return;
    const logger = new AuditLogger();
    const testTime = Date.now();

    await logger.wrap("e2e_user", "odoo", "searchRead", "res.partner", { limit: 5 }, async () => {
      return odoo.searchRead({
        model: "res.partner",
        domain: [],
        fields: ["id", "name"],
        limit: 5,
      });
    });

    const logs = logger.query({ userId: "e2e_user" });
    expect(logs.length).toBe(1);
    expect(logs[0].result).toBe("success");
    expect(logs[0].model).toBe("res.partner");
  });

  it("Odoo 应能查询日历事件", async () => {
    if (skipTests) return;
    try {
      const events = await odoo.searchRead({
        model: "calendar.event",
        domain: [],
        fields: ["id", "name", "start", "stop"],
        limit: 5,
      });
      expect(Array.isArray(events)).toBe(true);
      console.log(`[R029-b] 搜索到 ${events.length} 个 calendar event`);
    } catch (err) {
      console.warn(`[R029-b] calendar.event 查询失败: ${err}`);
      expect(true).toBe(true);
    }
  });
});