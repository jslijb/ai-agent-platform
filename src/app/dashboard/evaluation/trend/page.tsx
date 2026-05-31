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
  ReferenceLine,
} from "recharts";

interface TrendDataPoint {
  timestamp: string;
  version: number;
  value: number | null;
}

interface Milestone {
  id: number;
  version: number;
  timestamp: string;
  evaluationType: string;
  milestone: string | null;
  overallScore: string;
}

const RAG_METRICS = [
  { value: "overallScore", label: "综合评分" },
  { value: "financialOverallScore", label: "金融综合评分" },
  { value: "avgHitsAtK", label: "检索命中率" },
  { value: "avgContextRelevance", label: "上下文相关性" },
  { value: "avgContextRecall", label: "上下文召回率" },
  { value: "avgFaithfulness", label: "忠实度" },
  { value: "avgAnswerRelevance", label: "答案相关性" },
  { value: "avgNumericalAccuracy", label: "数值精确度" },
  { value: "avgComplianceScore", label: "合规性评分" },
  { value: "avgHallucinationRate", label: "幻觉率" },
  { value: "avgRiskDisclosureScore", label: "风险披露评分" },
  { value: "avgTimelinessScore", label: "时效性评分" },
];

const AGENT_METRICS = [
  { value: "overallScore", label: "综合评分" },
  { value: "avgToolSelectionScore", label: "工具选择评分" },
  { value: "avgPlanningScore", label: "规划评分" },
  { value: "avgAgentComplianceScore", label: "Agent合规评分" },
  { value: "avgConsistencyScore", label: "一致性评分" },
  { value: "avgEfficiencyScore", label: "效率评分" },
];

const TIME_RANGES = [
  { value: "7d", label: "最近7天" },
  { value: "30d", label: "最近30天" },
  { value: "90d", label: "最近90天" },
  { value: "all", label: "全部" },
];

function getDateRange(range: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateTo = now.toISOString().slice(0, 19).replace("T", " ");

  let dateFrom: string;
  switch (range) {
    case "7d":
      dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      break;
    case "30d":
      dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      break;
    case "90d":
      dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      break;
    default:
      dateFrom = "2020-01-01 00:00:00";
  }

  return { dateFrom, dateTo };
}

export default function EvaluationTrendPage() {
  const [evaluationType, setEvaluationType] = useState<"rag" | "agent">("rag");
  const [selectedMetric, setSelectedMetric] = useState("overallScore");
  const [timeRange, setTimeRange] = useState("30d");
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const metrics = evaluationType === "rag" ? RAG_METRICS : AGENT_METRICS;

  const fetchTrendData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { dateFrom, dateTo } = getDateRange(timeRange);

      const res = await fetch(
        `/api/evaluation/trend?metric=${selectedMetric}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&evaluationType=${evaluationType}`
      );

      if (!res.ok) throw new Error("获取趋势数据失败");

      const json = await res.json();
      if (json.success) {
        setTrendData(json.data);
      } else {
        setError(json.message || "获取趋势数据失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, [selectedMetric, timeRange, evaluationType]);

  const fetchMilestones = useCallback(async () => {
    try {
      const { dateFrom, dateTo } = getDateRange(timeRange);
      const res = await fetch(
        `/api/evaluation/milestones?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setMilestones(json.milestones);
      }
    } catch {
      console.error("获取里程碑数据失败");
    }
  }, [timeRange]);

  useEffect(() => {
    fetchTrendData();
    fetchMilestones();
  }, [fetchTrendData, fetchMilestones]);

  useEffect(() => {
    const defaultMetric = evaluationType === "rag" ? "overallScore" : "overallScore";
    setSelectedMetric(defaultMetric);
  }, [evaluationType]);

  const chartData = trendData
    .filter((d) => d.value !== null)
    .map((d) => ({
      name: `v${d.version}`,
      timestamp: new Date(d.timestamp).toLocaleString("zh-CN"),
      value: d.value !== null ? parseFloat((d.value * 100).toFixed(1)) : null,
      version: d.version,
    }));

  const milestoneVersions = new Set(
    milestones.map((m) => m.version)
  );

  const milestoneLabels: Record<number, string> = {};
  milestones.forEach((m) => {
    milestoneLabels[m.version] = m.milestone || `v${m.version}`;
  });

  const metricLabel =
    metrics.find((m) => m.value === selectedMetric)?.label || selectedMetric;

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
                评估趋势
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/dashboard/evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                RAG 评估
              </Link>
              <Link href="/dashboard/agent-evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 评估
              </Link>
              <Link href="/dashboard/evaluation/compare" className="text-gray-600 hover:text-gray-900 text-sm">
                版本对比
              </Link>
              <Link href="/dashboard/evaluation/settings" className="text-gray-600 hover:text-gray-900 text-sm">
                评估配置
              </Link>
              <Link href="/dashboard/logs" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 日志
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-wrap items-center gap-4">
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

            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">指标:</label>
              <select
                className="border rounded-md px-3 py-1.5 text-sm bg-white"
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
              >
                {metrics.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">时间范围:</label>
              <div className="flex border rounded-md overflow-hidden">
                {TIME_RANGES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setTimeRange(r.value)}
                    className={`px-3 py-1.5 text-sm ${
                      timeRange === r.value
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            {metricLabel} 趋势
          </h3>

          {loading ? (
            <div className="text-center py-12 text-gray-400">加载趋势数据中...</div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">{error}</div>
          ) : chartData.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-2xl mb-2">📈</div>
              <div>暂无趋势数据，请先运行评估</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis
                  domain={[0, 100]}
                  fontSize={12}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: unknown) => [`${value}%`, metricLabel]}
                  labelFormatter={(label: unknown) => {
                    const labelStr = String(label);
                    const point = chartData.find((d) => d.name === labelStr);
                    return point ? point.timestamp : labelStr;
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={(props: Record<string, unknown>) => {
                    const { cx, cy, payload } = props as {
                      cx: number;
                      cy: number;
                      payload: { version: number };
                    };
                    const isMilestone = milestoneVersions.has(payload.version);
                    return (
                      <circle
                        key={`dot-${payload.version}`}
                        cx={cx}
                        cy={cy}
                        r={isMilestone ? 6 : 4}
                        fill={isMilestone ? "#f59e0b" : "#3b82f6"}
                        stroke={isMilestone ? "#d97706" : "#2563eb"}
                        strokeWidth={isMilestone ? 2 : 1}
                      />
                    );
                  }}
                  activeDot={{ r: 6 }}
                  name={metricLabel}
                />
                {milestones.map((m, idx) => {
                  const dataPoint = chartData.find(
                    (d) => d.version === m.version
                  );
                  if (!dataPoint) return null;
                  return (
                    <ReferenceLine
                      key={`milestone-${m.id}`}
                      x={dataPoint.name}
                      stroke="#f59e0b"
                      strokeDasharray="5 5"
                      label={{
                        value: m.milestone || `v${m.version}`,
                        position: "top",
                        fill: "#d97706",
                        fontSize: 11,
                      }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {milestones.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              里程碑记录
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-3 text-gray-600">版本</th>
                  <th className="text-left py-3 px-3 text-gray-600">里程碑</th>
                  <th className="text-left py-3 px-3 text-gray-600">类型</th>
                  <th className="text-left py-3 px-3 text-gray-600">时间</th>
                  <th className="text-right py-3 px-3 text-gray-600">综合评分</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m) => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">v{m.version}</td>
                    <td className="py-2 px-3 font-medium text-amber-700">
                      {m.milestone || "-"}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs ${
                          m.evaluationType === "rag"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {m.evaluationType}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-500">
                      {new Date(m.timestamp).toLocaleString("zh-CN")}
                    </td>
                    <td className="text-right py-2 px-3 font-medium">
                      {(parseFloat(m.overallScore) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
