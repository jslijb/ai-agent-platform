export type CanaryStage = "1pct" | "5pct" | "20pct" | "50pct" | "100pct";

export interface CanaryConfig {
  currentStage: CanaryStage;
  stages: Record<CanaryStage, number>;
  metricsThreshold: {
    errorRate: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  };
  rollbackOnErrorRate: number;
  minDurationMinutes: number;
}

export interface CanaryMetrics {
  stage: CanaryStage;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  startTime: string;
  durationMinutes: number;
}

export interface CanaryDecision {
  action: "promote" | "hold" | "rollback";
  reason: string;
  currentStage: CanaryStage;
  nextStage?: CanaryStage;
  metrics: CanaryMetrics;
}

const DEFAULT_CONFIG: CanaryConfig = {
  currentStage: "1pct",
  stages: {
    "1pct": 0.01,
    "5pct": 0.05,
    "20pct": 0.20,
    "50pct": 0.50,
    "100pct": 1.00,
  },
  metricsThreshold: {
    errorRate: 0.01,
    p95LatencyMs: 5000,
    p99LatencyMs: 10000,
  },
  rollbackOnErrorRate: 0.05,
  minDurationMinutes: 30,
};

const STAGE_ORDER: CanaryStage[] = ["1pct", "5pct", "20pct", "50pct", "100pct"];

export class CanaryManager {
  private config: CanaryConfig;
  private metrics: CanaryMetrics | null = null;

  constructor(config?: Partial<CanaryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getConfig(): CanaryConfig {
    return { ...this.config };
  }

  getCurrentStage(): CanaryStage {
    return this.config.currentStage;
  }

  getTrafficPercentage(): number {
    return this.config.stages[this.config.currentStage];
  }

  shouldRouteToV3(userId: string): boolean {
    const hash = simpleHash(userId);
    const threshold = this.getTrafficPercentage();
    return (hash % 100) / 100 < threshold;
  }

  updateMetrics(metrics: Partial<CanaryMetrics>): void {
    this.metrics = {
      stage: this.config.currentStage,
      requestCount: metrics.requestCount || 0,
      errorCount: metrics.errorCount || 0,
      errorRate: metrics.requestCount ? (metrics.errorCount || 0) / metrics.requestCount : 0,
      p50LatencyMs: metrics.p50LatencyMs || 0,
      p95LatencyMs: metrics.p95LatencyMs || 0,
      p99LatencyMs: metrics.p99LatencyMs || 0,
      startTime: metrics.startTime || new Date().toISOString(),
      durationMinutes: metrics.durationMinutes || 0,
    };
  }

  evaluate(): CanaryDecision {
    if (!this.metrics) {
      return {
        action: "hold",
        reason: "无监控数据",
        currentStage: this.config.currentStage,
        metrics: this.createEmptyMetrics(),
      };
    }

    if (this.metrics.errorRate > this.config.rollbackOnErrorRate) {
      return {
        action: "rollback",
        reason: `错误率 ${(this.metrics.errorRate * 100).toFixed(2)}% 超过回滚阈值 ${(this.config.rollbackOnErrorRate * 100).toFixed(2)}%`,
        currentStage: this.config.currentStage,
        metrics: this.metrics,
      };
    }

    if (this.metrics.durationMinutes < this.config.minDurationMinutes) {
      return {
        action: "hold",
        reason: `观察时间 ${this.metrics.durationMinutes}分钟 未达最低 ${this.config.minDurationMinutes}分钟`,
        currentStage: this.config.currentStage,
        metrics: this.metrics,
      };
    }

    if (
      this.metrics.errorRate > this.config.metricsThreshold.errorRate ||
      this.metrics.p95LatencyMs > this.config.metricsThreshold.p95LatencyMs
    ) {
      return {
        action: "hold",
        reason: `指标未达标: 错误率=${(this.metrics.errorRate * 100).toFixed(2)}% P95=${this.metrics.p95LatencyMs}ms`,
        currentStage: this.config.currentStage,
        metrics: this.metrics,
      };
    }

    const currentIndex = STAGE_ORDER.indexOf(this.config.currentStage);
    if (currentIndex >= STAGE_ORDER.length - 1) {
      return {
        action: "promote",
        reason: "已达到100%全量发布",
        currentStage: "100pct",
        metrics: this.metrics,
      };
    }

    const nextStage = STAGE_ORDER[currentIndex + 1];
    return {
      action: "promote",
      reason: `指标达标，从 ${this.config.currentStage} 升级到 ${nextStage}`,
      currentStage: this.config.currentStage,
      nextStage,
      metrics: this.metrics,
    };
  }

  promote(stage: CanaryStage): boolean {
    if (STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(this.config.currentStage)) {
      this.config.currentStage = stage;
      return true;
    }
    return false;
  }

  rollback(): CanaryStage {
    const currentIndex = STAGE_ORDER.indexOf(this.config.currentStage);
    if (currentIndex > 0) {
      this.config.currentStage = STAGE_ORDER[currentIndex - 1];
    }
    return this.config.currentStage;
  }

  private createEmptyMetrics(): CanaryMetrics {
    return {
      stage: this.config.currentStage,
      requestCount: 0,
      errorCount: 0,
      errorRate: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      startTime: new Date().toISOString(),
      durationMinutes: 0,
    };
  }
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function createCanaryManager(config?: Partial<CanaryConfig>): CanaryManager {
  return new CanaryManager(config);
}