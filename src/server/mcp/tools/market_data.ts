const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:8001";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function postRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
  try {
    console.log(`[market_data] POST 请求: ${DATA_SERVICE_URL}${endpoint}`);
    const response = await fetch(`${DATA_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[market_data] HTTP错误: ${response.status} - ${errorText}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    if (data.success === false) {
      console.error(`[market_data] 业务错误: ${data.error}`);
      return { success: false, error: data.error };
    }

    console.log(`[market_data] 请求成功: ${endpoint}`);
    return { success: true, data: data.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[market_data] 请求异常: ${endpoint} - ${message}`);
    return { success: false, error: message };
  }
}

interface StockHistoryParams {
  source: string;
  code: string;
  startDate: string;
  endDate: string;
  frequency?: string;
}

export async function getStockHistory(params: StockHistoryParams): Promise<ApiResponse<unknown>> {
  return postRequest("/api/market/history", {
    source: params.source,
    code: params.code,
    start_date: params.startDate,
    end_date: params.endDate,
    frequency: params.frequency || "d",
  });
}

interface StockRealtimeParams {
  source: string;
  code: string;
}

export async function getStockRealtime(params: StockRealtimeParams): Promise<ApiResponse<unknown>> {
  return postRequest("/api/market/realtime", {
    source: params.source,
    code: params.code,
  });
}

interface FinancialDataParams {
  source: string;
  code: string;
  year?: number;
  quarter?: number;
  period?: string;
  count?: number;
}

export async function getFinancialData(params: FinancialDataParams): Promise<ApiResponse<unknown>> {
  return postRequest("/api/market/financial", {
    source: params.source,
    code: params.code,
    year: params.year,
    quarter: params.quarter,
    period: params.period,
    count: params.count,
  });
}

interface IndexDataParams {
  source: string;
  code: string;
  startDate: string;
  endDate: string;
}

export async function getIndexData(params: IndexDataParams): Promise<ApiResponse<unknown>> {
  return postRequest("/api/market/index", {
    source: params.source,
    code: params.code,
    start_date: params.startDate,
    end_date: params.endDate,
  });
}

interface StockListParams {
  source: string;
}

export async function getStockList(params: StockListParams): Promise<ApiResponse<unknown>> {
  return postRequest("/api/market/basic", {
    source: params.source,
  });
}

interface TradeCalendarParams {
  source: string;
  exchange?: string;
  startDate?: string;
  endDate?: string;
}

export async function getTradeCalendar(params: TradeCalendarParams): Promise<ApiResponse<unknown>> {
  return postRequest("/api/market/trade_cal", {
    source: params.source,
    exchange: params.exchange || "SSE",
    start_date: params.startDate,
    end_date: params.endDate,
  });
}

interface IndustryParams {
  source: string;
  code: string;
}

export async function getIndustry(params: IndustryParams): Promise<ApiResponse<unknown>> {
  return postRequest("/api/market/industry", {
    source: params.source,
    code: params.code,
  });
}

interface ConceptParams {
  source: string;
  code: string;
}

export async function getConcept(params: ConceptParams): Promise<ApiResponse<unknown>> {
  return postRequest("/api/market/concept", {
    source: params.source,
    code: params.code,
  });
}

interface TickDataParams {
  source: string;
  code: string;
  date: string;
}

export async function getTickData(params: TickDataParams): Promise<ApiResponse<unknown>> {
  return postRequest("/api/market/tick", {
    source: params.source,
    code: params.code,
    date: params.date,
  });
}

interface MinuteDataParams {
  source: string;
  code: string;
  frequency?: string;
}

export async function getMinuteData(params: MinuteDataParams): Promise<ApiResponse<unknown>> {
  return postRequest("/api/market/minute", {
    source: params.source,
    code: params.code,
    frequency: params.frequency || "5",
  });
}

export async function fetchMarketData(endpoint: string, body: Record<string, unknown>): Promise<ApiResponse<unknown>> {
  console.log(`[market_data] 通用行情数据请求, endpoint: ${endpoint}`);
  return postRequest(endpoint, body);
}
