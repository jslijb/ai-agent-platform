"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface VersionItem {
  id: number;
  version: number;
  timestamp: string;
  evaluationType: string;
  evaluationLevel: string;
  dataSource: string;
  overallScore: string;
  financialOverallScore: string | null;
  milestone: string | null;
}

interface MetricComparisonValue {
  versionId: number;
  version: number;
  value: number | null;
  delta: number | null;
  trend: "↑" | "↓" | "→" | null;
}

interface MetricComparison {
  metricName: string;
  metricLabel: string;
  values: MetricComparisonValue[];
}

/* ─── Metric Thresholds for Color Coding ─── */

const METRIC_THRESHOLDS: Record<string, { excellent: number; passing: number; invert?: boolean }> = {
  overallScore: { excellent: 0.80, passing: 0.60 },
  avgHitsAtK: { excellent: 0.80, passing: 0.60 },
  avgContextRelevance: { excellent: 0.75, passing: 0.55 },
  avgContextRecall: { excellent: 0.80, passing: 0.60 },
  avgFaithfulness: { excellent: 0.85, passing: 0.65 },
  avgAnswerRelevance: { excellent: 0.80, passing: 0.60 },
  avgNumericalAccuracy: { excellent: 0.85, passing: 0.70 },
  avgComplianceScore: { excellent: 0.90, passing: 0.80 },
  avgHallucinationRate: { excellent: 0.10, passing: 0.20, invert: true },
  avgRiskDisclosureScore: { excellent: 0.80, passing: 0.60 },
  avgTimelinessScore: { excellent: 0.70, passing: 0.50 },
  avgToolSelectionScore: { excellent: 0.80, passing: 0.60 },
  avgPlanningScore: { excellent: 0.75, passing: 0.55 },
  avgAgentComplianceScore: { excellent: 0.90, passing: 0.80 },
  avgConsistencyScore: { excellent: 0.80, passing: 0.60 },
  avgEfficiencyScore: { excellent: 0.70, passing: 0.50 },
};

function getCellColor(metricName: string, value: number | null): string {
  if (value === null) return "bg-gray-50 text-gray-400";
  const threshold = METRIC_THRESHOLDS[metricName];
  if (!threshold) return "";
  const { excellent, passing, invert } = threshold;
  if (invert) {
    if (value <= excellent) return "bg-green-50 text-green-700";
    if (value <= passing) return "bg-yellow-50 text-yellow-700";
    return "bg-red-50 text-red-700";
  }
  if (value >= excellent) return "bg-green-50 text-green-700";
  if (value >= passing) return "bg-yellow-50 text-yellow-700";
  return "bg-red-50 text-red-700";
}

/* ─── SVG Line Chart ─── */

function SvgLineChart({
  data,
  metrics,
}: {
  data: Array<Record<string, number | string | null>>;
  metrics: Array<{ key: string; label: string; color: string }>;
}) {
  const width = 700;
  const height = 320;
  const padding = { top: 20, right: 30, bottom: 40, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return <div className="text-center py-8 text-gray-400">暂无数据</div>;
  }

  const xLabels = data.map((d) => d.name as string);
  const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW;

  const toX = (i: number) => padding.left + (data.length > 1 ? i * xStep : chartW / 2);
  const toY = (v: number) => padding.top + chartH - (v / 100) * chartH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {/* Grid lines */}
      {[0, 20, 40, 60, 80, 100].map((v) => (
        <g key={`grid-${v}`}>
          <line
            x1={padding.left}
            y1={toY(v)}
            x2={width - padding.right}
            y2={toY(v)}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
          <text
            x={padding.left - 8}
            y={toY(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="10"
            fill="#9ca3af"
          >
            {v}%
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {xLabels.map((label, i) => (
        <text
          key={`x-${i}`}
          x={toX(i)}
          y={height - padding.bottom + 20}
          textAnchor="middle"
          fontSize="11"
          fill="#6b7280"
        >
          {label}
        </text>
      ))}

      {/* Lines */}
      {metrics.map((metric) => {
        const points = data
          .map((d, i) => {
            const val = d[metric.key];
            if (val === null || val === undefined) return null;
            return { x: toX(i), y: toY(val as number) };
          })
          .filter(Boolean) as Array<{ x: number; y: number }>;

        if (points.length === 0) return null;

        const pathD = points
          .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
          .join(" ");

        return (
          <g key={metric.key}>
            <path d={pathD} fill="none" stroke={metric.color} strokeWidth="2" />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="4" fill={metric.color} />
            ))}
          </g>
        );
      })}

      {/* Legend */}
      {metrics.map((metric, i) => (
        <g key={`legend-${metric.key}`}>
          <rect
            x={padding.left + i * 120}
            y={height - 14}
            width="12"
            height="12"
            fill={metric.color}
            rx="2"
          />
          <text
            x={padding.left + i * 120 + 16}
            y={height - 4}
            fontSize="10"
            fill="#374151"
          >
            {metric.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ─── Optimization Timeline ─── */

function OptimizationTimeline({
  versions,
  comparisons,
}: {
  versions: VersionItem[];
  comparisons: MetricComparison[];
}) {
  const sortedVersions = [...versions].sort((a, b) => a.version - b.version);

  if (sortedVersions.length === 0) {
    return <div className="text-center py-8 text-gray-400">暂无版本数据</div>;
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

      {sortedVersions.map((v, idx) => {
        const compValues: Array<{ label: string; value: number | null; delta: number | null; trend: string | null }> = [];
        comparisons.forEach((comp) => {
          const val = comp.values.find((cv) => cv.versionId === v.id);
          if (val) {
            compValues.push({
              label: comp.metricLabel,
              value: val.value,
              delta: val.delta,
              trend: val.trend,
            });
          }
        });

        const keyChanges = compValues
          .filter((c) => c.delta !== null && Math.abs(c.delta!) >= 0.03)
          .slice(0, 3);

        return (
          <div key={v.id} className="relative pl-16 pb-8 last:pb-0">
            {/* Dot on timeline */}
            <div className={`absolute left-4 top-1 w-5 h-5 rounded-full border-2 ${
              idx === sortedVersions.length - 1
                ? "bg-blue-500 border-blue-500"
                : "bg-white border-gray-300"
            }`} />

            {/* Content */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-bold text-gray-800">v{v.version}</span>
                <span className="text-xs text-gray-400">
                  {new Date(v.timestamp).toLocaleString("zh-CN")}
                </span>
                {v.milestone && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    {v.milestone}
                  </span>
                )}
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  {v.evaluationLevel}
                </span>
              </div>

              {v.milestone ? (
                <p className="text-sm text-gray-600 mb-2">{v.milestone}</p>
              ) : (
                <p className="text-sm text-gray-400 mb-2">常规评估</p>
              )}

              {keyChanges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {keyChanges.map((c) => (
                    <span
                      key={c.label}
                      className={`inline-flex items-center text-xs px-2 py-0.5 rounded ${
                        c.trend === "↑"
                          ? "bg-green-50 text-green-700"
                          : c.trend === "↓"
                            ? "bg-red-50 text-red-700"
                            : "bg-gray-50 text-gray-600"
                      }`}
                    >
                      {c.label} {c.trend} {c.delta !== null ? `${c.delta > 0 ? "+" : ""}${(c.delta * 100).toFixed(1)}%` : ""}
                    </span>
                  ))}
                </div>
              )}

              {compValues.length > 0 && (
                <div className="mt-2 text-xs text-gray-400">
                  综合评分: {v.overallScore ? `${(parseFloat(v.overallScore) * 100).toFixed(1)}%` : "-"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Component ─── */

export default function EvaluationComparePage() {
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [comparisons, setComparisons] = useState<MetricComparison[]>([]);
  const [loading, setLoading] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluationType, setEvaluationType] = useState<"rag" | "agent">("rag");

  const fetchVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const res = await fetch(
        `/api/evaluation/versions?evaluationType=${evaluationType}&limit=30`
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setVersions(json.versions);
      }
    } catch {
      console.error("获取版本列表失败");
    } finally {
      setVersionsLoading(false);
    }
  }, [evaluationType]);

  useEffect(() => {
    fetchVersions();
    setSelectedIds([]);
    setComparisons([]);
  }, [fetchVersions]);

  const handleToggleVersion = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((v) => v !== id);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, id].sort((a, b) => a - b);
    });
  };

  const handleCompare = async () => {
    if (selectedIds.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/evaluation/compare?versionIds=${selectedIds.join(",")}`
      );
      if (!res.ok) throw new Error("版本对比失败");
      const json = await res.json();
      if (json.success) {
        setComparisons(json.comparisons);
      } else {
        setError(json.message || "版本对比失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  const selectedVersions = versions.filter((v) =>
    selectedIds.includes(v.id)
  );

  const sortedSelectedVersions = [...selectedVersions].sort((a, b) => a.version - b.version);

  const trendChartData = comparisons.length > 0 && sortedSelectedVersions.length > 0
    ? sortedSelectedVersions.map((v) => {
        const point: Record<string, number | string | null> = {
          name: `v${v.version}`,
        };
        comparisons.forEach((comp) => {
          const val = comp.values.find((cv) => cv.versionId === v.id);
          point[comp.metricName] =
            val && val.value !== null
              ? parseFloat((val.value * 100).toFixed(1))
              : null;
        });
        return point;
      })
    : [];

  const LINE_COLORS = [
    "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
    "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
    "#84cc16", "#e11d48", "#0ea5e9", "#a855f7", "#10b981", "#f43f5e",
  ];

  const trendMetricOptions = comparisons.map((c, i) => ({
    value: c.metricName,
    label: c.metricLabel,
    color: LINE_COLORS[i % LINE_COLORS.length],
  }));

  const [selectedTrendMetrics, setSelectedTrendMetrics] = useState<string[]>([]);

  useEffect(() => {
    if (comparisons.length > 0 && selectedTrendMetrics.length === 0) {
      setSelectedTrendMetrics(comparisons.slice(0, 3).map((c) => c.metricName));
    }
  }, [comparisons, selectedTrendMetrics.length]);

  const handleToggleTrendMetric = (metricName: string) => {
    setSelectedTrendMetrics((prev) => {
      if (prev.includes(metricName)) {
        return prev.filter((m) => m !== metricName);
      }
      if (prev.length >= 5) return prev;
      return [...prev, metricName];
    });
  };

  const activeTrendMetrics = trendMetricOptions.filter((opt) =>
    selectedTrendMetrics.includes(opt.value)
  );

  const formatValue = (value: number | null) => {
    if (value === null) return "-";
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatDelta = (delta: number | null) => {
    if (delta === null) return null;
    const sign = delta > 0 ? "+" : "";
    return `${sign}${(delta * 100).toFixed(1)}%`;
  };

  const trendColor = (trend: "↑" | "↓" | "→" | null) => {
    if (trend === "↑") return "text-green-600";
    if (trend === "↓") return "text-red-600";
    if (trend === "→") return "text-gray-500";
    return "";
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link
                href="/dashboard/evaluation"
                className="text-gray-500 hover:text-gray-700 mr-4"
              >
                &larr; 返回评估
              </Link>
              <span className="text-xl font-bold text-gray-800">
                评估版本对比
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/dashboard/evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                RAG 评估
              </Link>
              <Link href="/dashboard/agent-evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 评估
              </Link>
              <Link href="/dashboard/evaluation/trend" className="text-gray-600 hover:text-gray-900 text-sm">
                评估趋势
              </Link>
              <Link href="/dashboard/evaluation/settings" className="text-gray-600 hover:text-gray-900 text-sm">
                评估配置
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800">选择对比版本</h3>
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">评估类型:</label>
              <div className="flex border rounded-md overflow-hidden">
                <button
                  onClick={() => setEvaluationType("rag")}
                  className={`px-3 py-1.5 text-sm ${
                    evaluationType === "rag"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  RAG
                </button>
                <button
                  onClick={() => setEvaluationType("agent")}
                  className={`px-3 py-1.5 text-sm ${
                    evaluationType === "agent"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Agent
                </button>
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-500 mb-3">
            请选择 2-5 个版本进行对比（已选 {selectedIds.length}/5）
          </p>

          {versionsLoading ? (
            <div className="text-center py-4 text-gray-400">加载版本列表...</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-4 text-gray-400">暂无版本数据</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              {versions.map((v) => {
                const isSelected = selectedIds.includes(v.id);
                return (
                  <button
                    key={v.id}
                    onClick={() => handleToggleVersion(v.id)}
                    className={`p-3 border rounded-lg text-left transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">
                        v{v.version}
                      </span>
                      {isSelected && (
                        <span className="text-blue-600 text-sm">✓</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(v.timestamp).toLocaleString("zh-CN")}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {v.evaluationLevel}
                      </span>
                      {v.milestone && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          {v.milestone}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleCompare}
              disabled={selectedIds.length < 2 || loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "对比中..." : "开始对比"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-600 text-sm">
            {error}
          </div>
        )}

        {comparisons.length > 0 && (
          <>
            {/* Version Comparison Table with Color Coding */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                逐指标数值对比
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-3 text-gray-600 sticky left-0 bg-gray-50">
                        指标
                      </th>
                      {sortedSelectedVersions.map((v) => (
                        <th
                          key={v.id}
                          className="text-center py-3 px-3 text-gray-600"
                        >
                          v{v.version}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisons.map((comp) => (
                      <tr key={comp.metricName} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-700 sticky left-0 bg-white">
                          {comp.metricLabel}
                        </td>
                        {comp.values.map((val) => (
                          <td
                            key={val.versionId}
                            className={`py-2 px-3 text-center ${getCellColor(comp.metricName, val.value)}`}
                          >
                            <div className="font-medium">{formatValue(val.value)}</div>
                            {val.delta !== null && (
                              <div
                                className={`text-xs ${trendColor(val.trend)}`}
                              >
                                {val.trend} {formatDelta(val.delta)}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded bg-green-50 border border-green-200" />
                  优秀
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded bg-yellow-50 border border-yellow-200" />
                  合格
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200" />
                  不合格
                </span>
              </div>
            </div>

            {/* SVG Metric Trend Chart */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">
                  指标变化趋势
                </h3>
              </div>

              {/* Metric selector chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                {trendMetricOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleToggleTrendMetric(opt.value)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      selectedTrendMetrics.includes(opt.value)
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {selectedTrendMetrics.includes(opt.value) && (
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: opt.color }}
                      />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>

              {trendChartData.length > 0 && activeTrendMetrics.length > 0 ? (
                <SvgLineChart
                  data={trendChartData}
                  metrics={activeTrendMetrics.map((m) => ({
                    key: m.value,
                    label: m.label,
                    color: m.color,
                  }))}
                />
              ) : (
                <div className="text-center py-8 text-gray-400">
                  请选择至少一个指标查看趋势
                </div>
              )}
            </div>

            {/* Optimization Timeline */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                优化时间线
              </h3>
              <OptimizationTimeline
                versions={selectedVersions}
                comparisons={comparisons}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
