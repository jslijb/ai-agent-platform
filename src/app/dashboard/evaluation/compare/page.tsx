"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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

  const trendChartData = comparisons.length > 0 && selectedVersions.length > 0
    ? selectedVersions
        .sort((a, b) => a.version - b.version)
        .map((v) => {
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

  const trendMetricOptions = comparisons.map((c) => ({
    value: c.metricName,
    label: c.metricLabel,
  }));

  const [trendMetric, setTrendMetric] = useState<string>("overallScore");

  useEffect(() => {
    if (comparisons.length > 0 && !comparisons.find((c) => c.metricName === trendMetric)) {
      setTrendMetric(comparisons[0].metricName);
    }
  }, [comparisons, trendMetric]);

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
                      {selectedVersions
                        .sort((a, b) => a.version - b.version)
                        .map((v) => (
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
                          <td key={val.versionId} className="py-2 px-3 text-center">
                            <div>{formatValue(val.value)}</div>
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
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">
                  指标变化趋势
                </h3>
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-600">指标:</label>
                  <select
                    className="border rounded-md px-3 py-1.5 text-sm bg-white"
                    value={trendMetric}
                    onChange={(e) => setTrendMetric(e.target.value)}
                  >
                    {trendMetricOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {trendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis
                      domain={[0, 100]}
                      fontSize={12}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(value: unknown) => {
                        const v = value as number | null | undefined;
                        return v !== null && v !== undefined ? [`${v}%`] : ["-"];
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey={trendMetric}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 5 }}
                      activeDot={{ r: 7 }}
                      name={
                        trendMetricOptions.find((o) => o.value === trendMetric)
                          ?.label || trendMetric
                      }
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  暂无数据
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
