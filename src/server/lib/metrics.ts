/**
 * 轻量级 Metrics 采集模块
 * 采集请求计数、响应时间、错误率等指标
 * 输出 Prometheus 兼容格式
 */

interface MetricEntry {
  name: string;
  help: string;
  type: "counter" | "gauge" | "histogram";
  labels: Record<string, string>;
  value: number;
  timestamp?: number;
}

class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private descriptions: Map<string, string> = new Map();

  /** 递增计数器 */
  inc(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
    if (!this.descriptions.has(name)) {
      this.descriptions.set(name, `Counter: ${name}`);
    }
  }

  /** 设置仪表值 */
  set(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    this.gauges.set(key, value);
    if (!this.descriptions.has(name)) {
      this.descriptions.set(name, `Gauge: ${name}`);
    }
  }

  /** 记录直方图观测值 */
  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
    if (!this.descriptions.has(name)) {
      this.descriptions.set(name, `Histogram: ${name}`);
    }
  }

  /** 计时器辅助函数 */
  timer(name: string, labels: Record<string, string> = {}): () => number {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.observe(name, duration, labels);
      return duration;
    };
  }

  /** 输出 Prometheus 文本格式 */
  toPrometheusFormat(): string {
    const lines: string[] = [];
    const seenNames = new Set<string>();

    // 计数器
    for (const [key, value] of Array.from(this.counters.entries())) {
      const { name, labels } = this.parseKey(key);
      if (!seenNames.has(name)) {
        lines.push(`# HELP ${name} ${this.descriptions.get(name) || ""}`);
        lines.push(`# TYPE ${name} counter`);
        seenNames.add(name);
      }
      lines.push(`${name}${this.formatLabels(labels)} ${value}`);
    }

    // 仪表
    for (const [key, value] of Array.from(this.gauges.entries())) {
      const { name, labels } = this.parseKey(key);
      if (!seenNames.has(name)) {
        lines.push(`# HELP ${name} ${this.descriptions.get(name) || ""}`);
        lines.push(`# TYPE ${name} gauge`);
        seenNames.add(name);
      }
      lines.push(`${name}${this.formatLabels(labels)} ${value}`);
    }

    // 直方图（输出 sum, count, bucket）
    for (const [key, values] of Array.from(this.histograms.entries())) {
      const { name, labels } = this.parseKey(key);
      const sum = values.reduce((a: number, b: number) => a + b, 0);
      const count = values.length;
      const labelStr = this.formatLabels(labels);

      lines.push(`# HELP ${name} ${this.descriptions.get(name) || ""}`);
      lines.push(`# TYPE ${name} histogram`);

      // 预定义桶：50ms, 100ms, 250ms, 500ms, 1000ms, 2500ms, 5000ms, +Inf
      const buckets = [50, 100, 250, 500, 1000, 2500, 5000, Infinity];
      for (const bucket of buckets) {
        const bucketCount = values.filter((v: number) => v <= bucket).length;
        const le = bucket === Infinity ? "+Inf" : bucket.toString();
        lines.push(`${name}_bucket{le="${le}"${labels ? "," + this.stripBraces(labelStr) : ""}} ${bucketCount}`);
      }
      lines.push(`${name}_sum${labelStr} ${sum}`);
      lines.push(`${name}_count${labelStr} ${count}`);
    }

    return lines.join("\n");
  }

  /** 获取 JSON 格式的指标摘要 */
  toJSON(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { sum: number; count: number; avg: number; p50: number; p95: number; p99: number }>;
  } {
    const histogramsJson: Record<string, { sum: number; count: number; avg: number; p50: number; p95: number; p99: number }> = {};
    for (const [key, values] of Array.from(this.histograms.entries())) {
      const sorted = [...values].sort((a: number, b: number) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      histogramsJson[key] = {
        sum: Math.round(sum * 100) / 100,
        count: values.length,
        avg: Math.round((sum / values.length) * 100) / 100,
        p50: Math.round(sorted[Math.floor(sorted.length * 0.5)] * 100) / 100,
        p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
        p99: Math.round(sorted[Math.floor(sorted.length * 0.99)] * 100) / 100,
      };
    }

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: histogramsJson,
    };
  }

  /** 重置所有指标（测试用） */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private key(name: string, labels: Record<string, string>): string {
    const labelParts = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return labelParts ? `${name}{${labelParts}}` : name;
  }

  private parseKey(key: string): { name: string; labels: Record<string, string> } {
    const braceIdx = key.indexOf("{");
    if (braceIdx === -1) return { name: key, labels: {} };
    const name = key.slice(0, braceIdx);
    const labelsStr = key.slice(braceIdx + 1, -1);
    const labels: Record<string, string> = {};
    for (const part of labelsStr.split(",")) {
      const [k, v] = part.split("=");
      if (k && v) labels[k] = v.replace(/"/g, "");
    }
    return { name, labels };
  }

  private formatLabels(labels: Record<string, string>): string {
    const parts = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return parts ? `{${parts}}` : "";
  }

  private stripBraces(labelStr: string): string {
    if (labelStr.startsWith("{") && labelStr.endsWith("}")) {
      return labelStr.slice(1, -1);
    }
    return labelStr;
  }
}

/** 全局 metrics 实例 */
export const metrics = new MetricsCollector();

/** 预定义指标名称 */
export const METRIC_NAMES = {
  // HTTP 请求
  HTTP_REQUEST_TOTAL: "http_requests_total",
  HTTP_REQUEST_DURATION: "http_request_duration_ms",
  HTTP_REQUEST_ERRORS: "http_request_errors_total",

  // RAG
  RAG_SEARCH_TOTAL: "rag_search_total",
  RAG_SEARCH_DURATION: "rag_search_duration_ms",
  RAG_SEARCH_ERRORS: "rag_search_errors_total",

  // LLM
  LLM_CALL_TOTAL: "llm_call_total",
  LLM_CALL_DURATION: "llm_call_duration_ms",
  LLM_CALL_ERRORS: "llm_call_errors_total",
  LLM_TOKEN_USAGE: "llm_token_usage_total",

  // Agent
  AGENT_RUN_TOTAL: "agent_run_total",
  AGENT_RUN_DURATION: "agent_run_duration_ms",
  AGENT_ITERATIONS: "agent_iterations_total",

  // 系统
  ACTIVE_CONNECTIONS: "active_connections",
  CIRCUIT_BREAKER_STATE: "circuit_breaker_state",
} as const;
