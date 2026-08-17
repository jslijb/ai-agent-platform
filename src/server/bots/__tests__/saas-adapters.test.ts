import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeishuSaaSAdapter, DingTalkSaaSAdapter, createSaaSChannelAdapter } from "../saas-adapters";

function mockFetch(response: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  }));
}

function mockFetchSequence(responses: unknown[]) {
  const queue = [...responses];
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
    const resp = queue.shift() || { ok: true, json: () => Promise.resolve({}) };
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(resp),
    });
  }));
}

describe("FeishuSaaSAdapter", () => {
  let adapter: FeishuSaaSAdapter;

  beforeEach(() => {
    adapter = new FeishuSaaSAdapter({ appId: "test", appSecret: "test" });
    vi.restoreAllMocks();
  });

  it("should have feishu platform", () => {
    expect(adapter.platform).toBe("feishu");
  });

  it("should submit approval successfully", async () => {
    mockFetchSequence([
      { code: 0, tenant_access_token: "t_token", expire: 7200 },
      { code: 0, data: { instance_code: "inst_001" } },
    ]);
    const result = await adapter.submitApproval({
      approvalCode: "leave",
      userId: "ou_test",
      formData: [],
    });
    expect(result.success).toBe(true);
    expect(result.instanceId).toBe("inst_001");
  });

  it("should handle approval failure", async () => {
    mockFetchSequence([
      { code: 0, tenant_access_token: "t_token", expire: 7200 },
      { code: 9999, msg: "invalid approval code" },
    ]);
    const result = await adapter.submitApproval({
      approvalCode: "invalid",
      userId: "ou_test",
      formData: [],
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("invalid approval code");
  });

  it("should send notification", async () => {
    mockFetchSequence([
      { code: 0, tenant_access_token: "t_token", expire: 7200 },
      { code: 0, data: { message_id: "msg_001" } },
    ]);
    const result = await adapter.sendNotification({
      userIds: ["ou_test"],
      title: "测试通知",
      content: "通知内容",
    });
    expect(result.success).toBe(true);
  });

  it("should create calendar event", async () => {
    mockFetchSequence([
      { code: 0, tenant_access_token: "t_token", expire: 7200 },
      { code: 0, data: { event: { event_id: "evt_001" } } },
    ]);
    const result = await adapter.createCalendarEvent({
      userId: "ou_test",
      summary: "会议",
      startTime: "2026-08-14T10:00:00Z",
      endTime: "2026-08-14T11:00:00Z",
    });
    expect(result.success).toBe(true);
    expect(result.eventId).toBe("evt_001");
  });

  it("should handle calendar failure", async () => {
    mockFetchSequence([
      { code: 0, tenant_access_token: "t_token", expire: 7200 },
      { code: 9999, msg: "permission denied" },
    ]);
    const result = await adapter.createCalendarEvent({
      userId: "ou_test",
      summary: "会议",
      startTime: "2026-08-14T10:00:00Z",
      endTime: "2026-08-14T11:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("should pass health check with valid token", async () => {
    mockFetch({ code: 0, tenant_access_token: "t_token", expire: 7200 });
    const ok = await adapter.healthCheck();
    expect(ok).toBe(true);
  });

  it("should fail health check on auth error", async () => {
    mockFetch({ code: 9999, msg: "invalid app" });
    const ok = await adapter.healthCheck();
    expect(ok).toBe(false);
  });
});

describe("DingTalkSaaSAdapter", () => {
  let adapter: DingTalkSaaSAdapter;

  beforeEach(() => {
    adapter = new DingTalkSaaSAdapter({ appId: "test", appSecret: "test" });
    vi.restoreAllMocks();
  });

  it("should have dingtalk platform", () => {
    expect(adapter.platform).toBe("dingtalk");
  });

  it("should submit approval successfully", async () => {
    mockFetchSequence([
      { errcode: 0, access_token: "a_token", expires_in: 7200 },
      { errcode: 0, result: { process_instance_id: "proc_001" } },
    ]);
    const result = await adapter.submitApproval({
      approvalCode: "leave",
      userId: "user_test",
      formData: [],
    });
    expect(result.success).toBe(true);
    expect(result.instanceId).toBe("proc_001");
  });

  it("should handle approval failure", async () => {
    mockFetchSequence([
      { errcode: 0, access_token: "a_token", expires_in: 7200 },
      { errcode: 400, errmsg: "invalid process" },
    ]);
    const result = await adapter.submitApproval({
      approvalCode: "invalid",
      userId: "user_test",
      formData: [],
    });
    expect(result.success).toBe(false);
  });

  it("should send notification", async () => {
    mockFetchSequence([
      { errcode: 0, access_token: "a_token", expires_in: 7200 },
      { errcode: 0, result: { task_id: 123 } },
    ]);
    const result = await adapter.sendNotification({
      userIds: ["user_test"],
      title: "测试",
      content: "内容",
    });
    expect(result.success).toBe(true);
  });

  it("should create calendar event", async () => {
    mockFetchSequence([
      { errcode: 0, access_token: "a_token", expires_in: 7200 },
      { errcode: 0, result: { event_id: "evt_002" } },
    ]);
    const result = await adapter.createCalendarEvent({
      userId: "user_test",
      summary: "会议",
      startTime: "2026-08-14T10:00:00Z",
      endTime: "2026-08-14T11:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("should pass health check", async () => {
    mockFetch({ errcode: 0, access_token: "a_token", expires_in: 7200 });
    const ok = await adapter.healthCheck();
    expect(ok).toBe(true);
  });

  it("should fail health check on auth error", async () => {
    mockFetch({ errcode: 400, errmsg: "invalid key" });
    const ok = await adapter.healthCheck();
    expect(ok).toBe(false);
  });
});

describe("createSaaSChannelAdapter", () => {
  it("should create feishu adapter", () => {
    const a = createSaaSChannelAdapter("feishu", { appId: "x", appSecret: "y" });
    expect(a).toBeInstanceOf(FeishuSaaSAdapter);
  });

  it("should create dingtalk adapter", () => {
    const a = createSaaSChannelAdapter("dingtalk", { appId: "x", appSecret: "y" });
    expect(a).toBeInstanceOf(DingTalkSaaSAdapter);
  });

  it("should throw for unsupported platform", () => {
    expect(() => createSaaSChannelAdapter("wecom" as any, { appId: "x", appSecret: "y" })).toThrow("Unsupported");
  });
});