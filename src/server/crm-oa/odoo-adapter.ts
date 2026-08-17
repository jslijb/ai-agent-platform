export interface OdooConfig {
  baseUrl: string;
  db: string;
  uid: number;
  password: string;
}

export interface OdooSearchParams {
  model: string;
  domain?: Array<Array<unknown>>;
  fields?: string[];
  limit?: number;
  offset?: number;
  order?: string;
}

export interface OdooCallParams {
  model: string;
  method: string;
  args?: unknown[];
  kwargs?: Record<string, unknown>;
}

export interface OdooApprovalRequest {
  name: string;
  category: string;
  requestOwnerId?: number;
  ruleId?: number;
}

export interface OdooLeaveParams {
  employeeId: number;
  holidayStatusId: number;
  dateFrom: string;
  dateTo: string;
  name?: string;
}

export interface OdooExpenseParams {
  employeeId: number;
  productId: number;
  name: string;
  totalAmount: number;
  date?: string;
}

export interface OdooNotificationParams {
  partnerIds: number[];
  message: string;
  subject?: string;
}

export interface OdooScheduleParams {
  partnerId: number;
  startDate: string;
  stopDate: string;
  name: string;
  description?: string;
}

export class OdooAdapter {
  private config: OdooConfig;

  constructor(config: OdooConfig) {
    this.config = config;
  }

  private get jsonRpcUrl(): string {
    return `${this.config.baseUrl}/jsonrpc`;
  }

  private async jsonRpc(service: string, method: string, args: unknown[]): Promise<unknown> {
    const body = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service,
        method,
        args,
      },
      id: Math.floor(Math.random() * 1000000),
    };

    const resp = await fetch(this.jsonRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    if (data.error) {
      throw new Error(`Odoo JSON-RPC error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    return data.result;
  }

  async authenticate(db: string, login: string, password: string): Promise<number> {
    const uid = await this.jsonRpc("common", "authenticate", [db, login, password, {}]);
    if (typeof uid !== "number" || uid === 0) {
      throw new Error("Odoo authentication failed");
    }
    this.config.uid = uid;
    this.config.db = db;
    this.config.password = password;
    return uid;
  }

  async executeKw(model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>): Promise<unknown> {
    return this.jsonRpc("object", "execute_kw", [
      this.config.db,
      this.config.uid,
      this.config.password,
      model,
      method,
      args,
      kwargs || {},
    ]);
  }

  async searchRead(params: OdooSearchParams): Promise<Record<string, unknown>[]> {
    return this.executeKw(params.model, "search_read", [params.domain || []], {
      fields: params.fields,
      limit: params.limit,
      offset: params.offset,
      order: params.order,
    }) as Promise<Record<string, unknown>[]>;
  }

  async search(model: string, domain?: Array<Array<unknown>>, limit?: number): Promise<number[]> {
    return this.executeKw(model, "search", [domain || []], { limit }) as Promise<number[]>;
  }

  async read(model: string, ids: number[], fields?: string[]): Promise<Record<string, unknown>[]> {
    return this.executeKw(model, "read", [ids], { fields }) as Promise<Record<string, unknown>[]>;
  }

  async create(model: string, values: Record<string, unknown>): Promise<number> {
    return this.executeKw(model, "create", [values]) as Promise<number>;
  }

  async write(model: string, ids: number[], values: Record<string, unknown>): Promise<boolean> {
    return this.executeKw(model, "write", [ids, values]) as Promise<boolean>;
  }

  async unlink(model: string, ids: number[]): Promise<boolean> {
    return this.executeKw(model, "unlink", [ids]) as Promise<boolean>;
  }

  async callMethod(params: OdooCallParams): Promise<unknown> {
    return this.executeKw(params.model, params.method, params.args || [], params.kwargs);
  }

  async submitLeave(params: OdooLeaveParams): Promise<number> {
    return this.create("hr.leave", {
      employee_id: params.employeeId,
      holiday_status_id: params.holidayStatusId,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      name: params.name || "AI Agent 提交请假",
    });
  }

  async submitExpense(params: OdooExpenseParams): Promise<number> {
    const expenseId = await this.create("hr.expense", {
      employee_id: params.employeeId,
      product_id: params.productId,
      name: params.name,
      total_amount: params.totalAmount,
      date: params.date || new Date().toISOString().split("T")[0],
    });
    return expenseId;
  }

  async approveRequest(requestId: number, action: "approve" | "refuse" | "reset", reason?: string): Promise<boolean> {
    const methodMap = {
      approve: "action_approve",
      refuse: "action_refuse",
      reset: "action_draft",
    };
    const method = methodMap[action];
    if (!method) throw new Error(`Invalid approval action: ${action}`);

    if (action === "refuse" && reason) {
      return this.callMethod({
        model: "approval.request",
        method: "action_refuse",
        args: [[requestId]],
        kwargs: { reason },
      }) as Promise<boolean>;
    }
    return this.callMethod({
      model: "approval.request",
      method,
      args: [[requestId]],
    }) as Promise<boolean>;
  }

  async queryProcessStatus(requestId: number): Promise<Record<string, unknown>> {
    const records = await this.read("approval.request", [requestId], [
      "id", "name", "state", "request_owner_id", "category_id", "create_date",
    ]);
    return records[0] || {};
  }

  async sendNotification(params: OdooNotificationParams): Promise<boolean> {
    return this.callMethod({
      model: "mail.thread",
      method: "message_post",
      args: [],
      kwargs: {
        body: params.message,
        subject: params.subject || "AI Agent 通知",
        partner_ids: params.partnerIds,
        message_type: "notification",
      },
    }) as Promise<boolean>;
  }

  async querySchedule(partnerId: number, startDate: string, stopDate: string): Promise<Record<string, unknown>[]> {
    return this.searchRead({
      model: "calendar.event",
      domain: [
        ["partner_ids", "in", [partnerId]],
        ["start", ">=", startDate],
        ["stop", "<=", stopDate],
      ],
      fields: ["id", "name", "start", "stop", "description", "location"],
      order: "start asc",
    });
  }

  async createSchedule(params: OdooScheduleParams): Promise<number> {
    return this.create("calendar.event", {
      name: params.name,
      start: params.startDate,
      stop: params.stopDate,
      description: params.description || "",
      partner_ids: [[6, 0, [params.partnerId]]],
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/web/health`);
      return resp.ok;
    } catch {
      return false;
    }
  }
}

export function createOdooAdapter(config?: Partial<OdooConfig>): OdooAdapter {
  return new OdooAdapter({
    baseUrl: config?.baseUrl || process.env.ODOO_URL || "http://odoo:8069",
    db: config?.db || process.env.ODOO_DB || "odoo",
    uid: config?.uid || 0,
    password: config?.password || process.env.ODOO_PASSWORD || "",
  });
}