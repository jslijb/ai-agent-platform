import { describe, it, expect, vi, beforeEach } from "vitest";
import { OdooAdapter, createOdooAdapter } from "../odoo-adapter";
import { TwentyAdapter, createTwentyAdapter } from "../twenty-adapter";
import { AuditLogger, globalAuditLogger } from "../audit-logger";

function mockFetch(response: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  }));
}

describe("OdooAdapter", () => {
  let adapter: OdooAdapter;

  beforeEach(() => {
    adapter = new OdooAdapter({
      baseUrl: "http://localhost:8069",
      db: "odoo",
      uid: 1,
      password: "admin",
    });
    vi.restoreAllMocks();
  });

  it("should authenticate and store uid", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: 2 });
    const uid = await adapter.authenticate("odoo", "admin", "admin");
    expect(uid).toBe(2);
  });

  it("should throw on auth failure", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: false });
    await expect(adapter.authenticate("odoo", "bad", "bad")).rejects.toThrow("authentication failed");
  });

  it("should throw on JSON-RPC error", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, error: { message: "db not found" } });
    await expect(adapter.authenticate("bad_db", "admin", "admin")).rejects.toThrow("Odoo JSON-RPC error");
  });

  it("should search and read records", async () => {
    const records = [{ id: 1, name: "Test" }];
    mockFetch({ jsonrpc: "2.0", id: 1, result: records });
    const result = await adapter.searchRead({ model: "hr.employee", fields: ["name"] });
    expect(result).toEqual(records);
  });

  it("should create a record", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: 42 });
    const id = await adapter.create("hr.leave", { name: "Test Leave" });
    expect(id).toBe(42);
  });

  it("should write records", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: true });
    const ok = await adapter.write("hr.leave", [1], { name: "Updated" });
    expect(ok).toBe(true);
  });

  it("should unlink records", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: true });
    const ok = await adapter.unlink("hr.leave", [1]);
    expect(ok).toBe(true);
  });

  it("should submit leave", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: 10 });
    const id = await adapter.submitLeave({
      employeeId: 1,
      holidayStatusId: 1,
      dateFrom: "2026-08-14 09:00:00",
      dateTo: "2026-08-15 18:00:00",
    });
    expect(id).toBe(10);
  });

  it("should submit expense", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: 20 });
    const id = await adapter.submitExpense({
      employeeId: 1,
      productId: 1,
      name: "交通费",
      totalAmount: 100,
    });
    expect(id).toBe(20);
  });

  it("should approve request", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: true });
    const ok = await adapter.approveRequest(1, "approve");
    expect(ok).toBe(true);
  });

  it("should refuse request with reason", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: true });
    const ok = await adapter.approveRequest(1, "refuse", "不合规");
    expect(ok).toBe(true);
  });

  it("should throw on invalid approval action", async () => {
    await expect(adapter.approveRequest(1, "invalid" as any)).rejects.toThrow("Invalid approval action");
  });

  it("should query process status", async () => {
    const record = { id: 1, name: "Test", state: "approved" };
    mockFetch({ jsonrpc: "2.0", id: 1, result: [record] });
    const status = await adapter.queryProcessStatus(1);
    expect(status).toEqual(record);
  });

  it("should send notification", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: true });
    const ok = await adapter.sendNotification({ partnerIds: [1, 2], message: "Hello" });
    expect(ok).toBe(true);
  });

  it("should query schedule", async () => {
    const events = [{ id: 1, name: "Meeting", start: "2026-08-14 10:00:00" }];
    mockFetch({ jsonrpc: "2.0", id: 1, result: events });
    const result = await adapter.querySchedule(1, "2026-08-14", "2026-08-14");
    expect(result).toEqual(events);
  });

  it("should check health", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const ok = await adapter.healthCheck();
    expect(ok).toBe(true);
  });

  it("should return false on health check failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));
    const ok = await adapter.healthCheck();
    expect(ok).toBe(false);
  });

  it("createOdooAdapter should use env defaults", () => {
    const a = createOdooAdapter();
    expect(a).toBeInstanceOf(OdooAdapter);
  });
});

describe("TwentyAdapter", () => {
  let adapter: TwentyAdapter;

  beforeEach(() => {
    adapter = new TwentyAdapter({
      baseUrl: "http://localhost:3003",
      apiKey: "test_key",
    });
    vi.restoreAllMocks();
  });

  it("should create customer", async () => {
    mockFetch({
      data: {
        createCompany: { id: "c1", name: "Test Corp", domainName: "test.com", createdAt: "2026-08-14" },
      },
    });
    const result = await adapter.createCustomer({ name: "Test Corp", domainName: "test.com" });
    expect(result.name).toBe("Test Corp");
  });

  it("should search customers", async () => {
    mockFetch({
      data: {
        companies: {
          edges: [
            { node: { id: "c1", name: "Test Corp", domainName: "test.com" } },
          ],
        },
      },
    });
    const result = await adapter.searchCustomer({ query: "Test" });
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Test Corp");
  });

  it("should update opportunity", async () => {
    mockFetch({
      data: {
        updateOpportunity: { id: "o1", name: "Deal", stage: "Closed Won", amount: 50000 },
      },
    });
    const result = await adapter.updateOpportunity("o1", "Closed Won");
    expect(result.stage).toBe("Closed Won");
  });

  it("should create opportunity", async () => {
    mockFetch({
      data: {
        createOpportunity: { id: "o2", name: "New Deal", stage: "Prospecting" },
      },
    });
    const result = await adapter.createOpportunity({ name: "New Deal", companyId: "c1" });
    expect(result.name).toBe("New Deal");
  });

  it("should generate report", async () => {
    mockFetch({
      data: {
        reportData: { data: [], summary: "No data" },
      },
    });
    const result = await adapter.generateReport("pipeline");
    expect(result.summary).toBe("No data");
  });

  it("should throw on GraphQL errors", async () => {
    mockFetch({
      errors: [{ message: "Unauthorized" }],
    });
    await expect(adapter.createCustomer({ name: "Test" })).rejects.toThrow("Twenty GraphQL error");
  });

  it("should check health", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const ok = await adapter.healthCheck();
    expect(ok).toBe(true);
  });

  it("createTwentyAdapter should use env defaults", () => {
    const a = createTwentyAdapter();
    expect(a).toBeInstanceOf(TwentyAdapter);
  });
});

describe("AuditLogger", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger(100);
    globalAuditLogger.clear();
  });

  it("should log entries with auto-generated id and timestamp", () => {
    const entry = logger.log({
      userId: "user1",
      platform: "odoo",
      action: "submitLeave",
      model: "hr.leave",
      params: { employeeId: 1 },
      result: "success",
      durationMs: 50,
    });
    expect(entry.id).toMatch(/^audit_/);
    expect(entry.timestamp).toBeTruthy();
    expect(entry.userId).toBe("user1");
  });

  it("should wrap successful operations", async () => {
    const result = await logger.wrap("user1", "odoo", "create", "hr.leave", {}, async () => 42);
    expect(result).toBe(42);
    expect(logger.size).toBe(1);
    const entries = logger.query({});
    expect(entries[0].result).toBe("success");
  });

  it("should wrap failed operations", async () => {
    await expect(
      logger.wrap("user1", "odoo", "create", "hr.leave", {}, async () => {
        throw new Error("DB error");
      })
    ).rejects.toThrow("DB error");
    expect(logger.size).toBe(1);
    const entries = logger.query({});
    expect(entries[0].result).toBe("failure");
    expect(entries[0].errorMessage).toBe("DB error");
  });

  it("should query with filters", async () => {
    await logger.wrap("user1", "odoo", "create", "hr.leave", {}, async () => 1);
    await logger.wrap("user2", "twenty", "search", "company", {}, async () => []);
    const odooLogs = logger.query({ platform: "odoo" });
    expect(odooLogs.length).toBe(1);
    const user2Logs = logger.query({ userId: "user2" });
    expect(user2Logs.length).toBe(1);
  });

  it("should respect maxLogs limit", () => {
    const small = new AuditLogger(3);
    for (let i = 0; i < 5; i++) {
      small.log({
        userId: `user${i}`,
        platform: "odoo",
        action: "test",
        model: "test",
        params: {},
        result: "success",
        durationMs: 0,
      });
    }
    expect(small.size).toBe(3);
  });

  it("should clear logs", () => {
    logger.log({
      userId: "user1",
      platform: "odoo",
      action: "test",
      model: "test",
      params: {},
      result: "success",
      durationMs: 0,
    });
    expect(logger.size).toBe(1);
    logger.clear();
    expect(logger.size).toBe(0);
  });
});