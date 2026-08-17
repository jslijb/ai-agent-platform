import { describe, it, expect, beforeEach } from "vitest";
import { CanaryManager, createCanaryManager } from "../canary";
import type { CanaryMetrics } from "../canary";

describe("CanaryManager", () => {
  let manager: CanaryManager;

  beforeEach(() => {
    manager = createCanaryManager();
  });

  it("should start at 1pct stage", () => {
    expect(manager.getCurrentStage()).toBe("1pct");
    expect(manager.getTrafficPercentage()).toBe(0.01);
  });

  it("should route ~1% of users to V3 at 1pct stage", () => {
    let v3Count = 0;
    for (let i = 0; i < 10000; i++) {
      if (manager.shouldRouteToV3(`user-${i}`)) {
        v3Count++;
      }
    }
    expect(v3Count).toBeGreaterThan(0);
    expect(v3Count).toBeLessThan(300);
  });

  it("should route 100% at 100pct stage", () => {
    manager.promote("100pct");
    let v3Count = 0;
    for (let i = 0; i < 100; i++) {
      if (manager.shouldRouteToV3(`user-${i}`)) {
        v3Count++;
      }
    }
    expect(v3Count).toBe(100);
  });

  it("should hold when no metrics", () => {
    const decision = manager.evaluate();
    expect(decision.action).toBe("hold");
    expect(decision.reason).toContain("无监控数据");
  });

  it("should hold when duration too short", () => {
    manager.updateMetrics({
      requestCount: 1000,
      errorCount: 0,
      p95LatencyMs: 1000,
      p99LatencyMs: 2000,
      durationMinutes: 10,
    });
    const decision = manager.evaluate();
    expect(decision.action).toBe("hold");
    expect(decision.reason).toContain("观察时间");
  });

  it("should promote when metrics are good", () => {
    manager.updateMetrics({
      requestCount: 10000,
      errorCount: 5,
      p95LatencyMs: 2000,
      p99LatencyMs: 4000,
      durationMinutes: 60,
    });
    const decision = manager.evaluate();
    expect(decision.action).toBe("promote");
    expect(decision.nextStage).toBe("5pct");
  });

  it("should hold when error rate is elevated", () => {
    manager.updateMetrics({
      requestCount: 1000,
      errorCount: 15,
      p95LatencyMs: 2000,
      p99LatencyMs: 4000,
      durationMinutes: 60,
    });
    const decision = manager.evaluate();
    expect(decision.action).toBe("hold");
    expect(decision.reason).toContain("错误率");
  });

  it("should rollback when error rate exceeds threshold", () => {
    manager.updateMetrics({
      requestCount: 1000,
      errorCount: 100,
      p95LatencyMs: 2000,
      p99LatencyMs: 4000,
      durationMinutes: 60,
    });
    const decision = manager.evaluate();
    expect(decision.action).toBe("rollback");
  });

  it("should hold when P95 latency too high", () => {
    manager.updateMetrics({
      requestCount: 1000,
      errorCount: 0,
      p95LatencyMs: 8000,
      p99LatencyMs: 12000,
      durationMinutes: 60,
    });
    const decision = manager.evaluate();
    expect(decision.action).toBe("hold");
  });

  it("should promote through all stages", () => {
    expect(manager.promote("5pct")).toBe(true);
    expect(manager.getCurrentStage()).toBe("5pct");
    expect(manager.promote("20pct")).toBe(true);
    expect(manager.getCurrentStage()).toBe("20pct");
    expect(manager.promote("50pct")).toBe(true);
    expect(manager.getCurrentStage()).toBe("50pct");
    expect(manager.promote("100pct")).toBe(true);
    expect(manager.getCurrentStage()).toBe("100pct");
  });

  it("should not allow backward promotion", () => {
    manager.promote("50pct");
    expect(manager.promote("20pct")).toBe(false);
    expect(manager.getCurrentStage()).toBe("50pct");
  });

  it("should rollback to previous stage", () => {
    manager.promote("50pct");
    const prev = manager.rollback();
    expect(prev).toBe("20pct");
    expect(manager.getCurrentStage()).toBe("20pct");
  });

  it("should not rollback below 1pct", () => {
    const prev = manager.rollback();
    expect(prev).toBe("1pct");
  });

  it("should report 100pct when fully promoted", () => {
    manager.promote("100pct");
    manager.updateMetrics({
      requestCount: 10000,
      errorCount: 0,
      p95LatencyMs: 1000,
      p99LatencyMs: 2000,
      durationMinutes: 60,
    });
    const decision = manager.evaluate();
    expect(decision.action).toBe("promote");
    expect(decision.nextStage).toBeUndefined();
  });

  it("should use custom config thresholds", () => {
    const custom = createCanaryManager({
      metricsThreshold: { errorRate: 0.001, p95LatencyMs: 3000, p99LatencyMs: 5000 },
      rollbackOnErrorRate: 0.02,
    });
    custom.updateMetrics({
      requestCount: 1000,
      errorCount: 3,
      p95LatencyMs: 2000,
      p99LatencyMs: 4000,
      durationMinutes: 60,
    });
    const decision = custom.evaluate();
    expect(decision.action).toBe("hold");
  });

  it("should provide consistent routing for same user", () => {
    const results = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      results.add(manager.shouldRouteToV3("consistent-user"));
    }
    expect(results.size).toBe(1);
  });
});