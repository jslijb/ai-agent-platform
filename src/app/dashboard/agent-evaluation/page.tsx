"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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

interface AgentLog {
  id: string;
  query: string;
  answer: string | null;
  model: string | null;
  iterations: number;
  totalSteps: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface ToolUsage {
  name: string;
  count: number;
  successRate: number;
}

interface AgentStats {
  totalCalls: number;
  successRate: number;
  avgIterations: number;
  avgLatencyMs: number;
  totalTokens: number;
  byModel: Record<string, { count: number; success: number; tokens: number; avgLatency: number }>;
  byStatus: Record<string, number>;
  toolUsage: ToolUsage[];
  recentErrors: AgentLog[];
}

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

interface AgentVersionDetail {
  avgToolSelectionScore: number | null;
  avgPlanningScore: number | null;
  avgComplianceScore: number | null;
  avgConsistencyScore: number | null;
  avgEfficiencyScore: number | null;
  agentOverallScore: number | null;
  totalTests: number;
}

function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number | null): string {
  if (n === null || n === undefined) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function ScoreBar({ value, label, color = "blue" }: { value: number; label: string; color?: string }) {
  const percent = Math.round(value * 100);
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
    orange: "bg-orange-500",
  };
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`${colorMap[color] || colorMap.blue} h-2.5 rounded-full`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function AgentMetricCard({
  value,
  label,
  color,
}: {
  value: number | null | undefined;
  label: string;
  color: string;
}) {
  if (value === undefined || value === null) {
    return (
      <div className="bg-white rounded-lg shadow-md p-5">
        <div className="text-sm text-gray-500 mb-1">{label}</div>
        <div className="text-2xl font-bold text-gray-300">-</div>
      </div>
    );
  }

  const percent = Math.round(value * 100);
  const colorClasses: Record<string, string> = {
    blue: "text-blue-600",
    green: "text-green-600",
    purple: "text-purple-600",
    orange: "text-orange-600",
    teal: "text-teal-600",
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-5">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorClasses[color] || "text-blue-600"}`}>
        {(value * 100).toFixed(1)}%
      </div>
    </div>
  );
}

export default function AgentEvaluationPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [versionDetail, setVersionDetail] = useState<AgentVersionDetail | null>(null);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [runLevel, setRunLevel] = useState<"daily" | "standard" | "full">("standard");
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<string | null>(null);
  const [agentTrendData, setAgentTrendData] = useState<Array<{ timestamp: string; version: number; value: number | null }>>([]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/token-usage");
      const data = await res.json();
      if (data.success) {
        const s = data.summary;
        const byModel: AgentStats["byModel"] = {};
        if (s.byModel) {
          for (const [model, info] of Object.entries(s.byModel)) {
            const d = info as { count: number; tokens: number; avgLatency: number };
            byModel[model] = {
              count: d.count,
              success: d.count,
              tokens: d.tokens,
              avgLatency: d.avgLatency,
            };
          }
        }

        setStats({
          totalCalls: s.totalCalls || 0,
          successRate: s.byStatus?.success
            ? s.byStatus.success / s.totalCalls
            : 0,
          avgIterations: s.avgIterations || 0,
          avgLatencyMs: s.avgLatencyMs || 0,
          totalTokens: s.totalTokens || 0,
          byModel,
          byStatus: s.byStatus || {},
          toolUsage: [],
          recentErrors: [],
        });
      }
    } catch (err) {
      console.error("获取Agent统计失败:", err);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: "error",
      });
      const res = await fetch(`/api/agent/logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("获取Agent日志失败:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch("/api/evaluation/versions?evaluationType=agent&limit=20");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setVersions(json.versions);
      }
    } catch {
      console.error("获取版本列表失败");
    }
  }, []);

  const fetchAgentTrendData = useCallback(async () => {
    try {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 19).replace("T", " ");
      const dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      const res = await fetch(
        `/api/evaluation/trend?metric=overallScore&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&evaluationType=agent`
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        const last5 = json.data.slice(-5);
        setAgentTrendData(last5);
      }
    } catch {
      console.error("获取Agent趋势数据失败");
    }
  }, []);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (authStatus === "authenticated") {
      fetchStats();
      fetchLogs();
      fetchVersions();
      fetchAgentTrendData();
    }
  }, [authStatus, router, fetchStats, fetchLogs, fetchVersions, fetchAgentTrendData]);

  useEffect(() => {
    if (!selectedVersionId) {
      setVersionDetail(null);
      return;
    }
    async function loadVersion() {
      try {
        const res = await fetch(`/api/evaluation/versions/${selectedVersionId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.report) {
          const r = json.report;
          setVersionDetail({
            avgToolSelectionScore: r.avgToolSelectionScore ?? null,
            avgPlanningScore: r.avgPlanningScore ?? null,
            avgComplianceScore: r.avgComplianceScore ?? null,
            avgConsistencyScore: r.avgConsistencyScore ?? null,
            avgEfficiencyScore: r.avgEfficiencyScore ?? null,
            agentOverallScore: r.agentOverallScore ?? null,
            totalTests: r.totalTests ?? 0,
          });
        }
      } catch {
        console.error("获取版本详情失败");
      }
    }
    loadVersion();
  }, [selectedVersionId]);

  const handleRunEvaluation = async () => {
    setRunning(true);
    setRunProgress("正在触发Agent评估...");
    setShowRunDialog(false);

    try {
      const res = await fetch("/api/evaluation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluationLevel: runLevel,
          evaluationType: "agent",
        }),
      });

      const json = await res.json();

      if (json.success) {
        setRunProgress(`评估完成，版本号: ${json.version}`);
        await fetchVersions();
      } else {
        setRunProgress(`评估失败: ${json.message}`);
      }
    } catch (err) {
      setRunProgress(`评估异常: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setRunning(false);
      setTimeout(() => setRunProgress(null), 5000);
    }
  };

  if (authStatus === "loading") return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-500 hover:text-gray-700 mr-2">
                &larr;
              </Link>
              <span className="text-xl font-bold text-gray-800">
                Agent 评估
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/chat" className="text-gray-600 hover:text-gray-900 text-sm">
                智能对话
              </Link>
              <Link href="/dashboard/documents" className="text-gray-600 hover:text-gray-900 text-sm">
                文档管理
              </Link>
              <Link href="/dashboard/evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                RAG 评估
              </Link>
              <Link href="/dashboard/evaluation/trend" className="text-gray-600 hover:text-gray-900 text-sm">
                评估趋势
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
              <Link href="/dashboard/token-usage" className="text-gray-600 hover:text-gray-900 text-sm">
                Token 用量
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">评估版本:</label>
              <select
                className="border rounded-md px-3 py-1.5 text-sm bg-white"
                value={selectedVersionId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedVersionId(val ? parseInt(val, 10) : null);
                }}
              >
                <option value="">运行时统计</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version} - {new Date(v.timestamp).toLocaleString("zh-CN")} ({v.evaluationLevel})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {runProgress && (
              <span className={`text-sm ${running ? "text-blue-600" : "text-green-600"}`}>
                {running && (
                  <span className="inline-block animate-spin mr-1">⟳</span>
                )}
                {runProgress}
              </span>
            )}
            <button
              onClick={() => setShowRunDialog(true)}
              disabled={running}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? "评估运行中..." : "运行评估"}
            </button>
          </div>
        </div>

        {showRunDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
              <h3 className="text-lg font-bold text-gray-800 mb-4">选择评估级别</h3>
              <div className="space-y-3 mb-6">
                {([
                  { value: "daily", label: "日常评估", desc: "快速验证，少量测试用例" },
                  { value: "standard", label: "标准评估", desc: "常规验证，中等测试用例" },
                  { value: "full", label: "全面评估", desc: "完整验证，全部测试用例" },
                ] as const).map((item) => (
                  <label
                    key={item.value}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                      runLevel === item.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="agentEvalLevel"
                      value={item.value}
                      checked={runLevel === item.value}
                      onChange={() => setRunLevel(item.value)}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-medium text-gray-800">{item.label}</div>
                      <div className="text-xs text-gray-500">{item.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowRunDialog(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  取消
                </button>
                <button
                  onClick={handleRunEvaluation}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  开始评估
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : !stats && !versionDetail ? (
          <div className="text-center py-16 bg-white rounded-lg shadow-sm">
            <div className="text-4xl mb-3">🤖</div>
            <div className="text-gray-500">暂无 Agent 评估数据</div>
            <div className="text-gray-400 text-sm mt-1">
              开始 Agent 对话后，评估数据将自动生成
            </div>
          </div>
        ) : (
          <>
            {versionDetail && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  金融专用指标
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <AgentMetricCard
                    value={versionDetail.avgToolSelectionScore}
                    label="工具选择"
                    color="blue"
                  />
                  <AgentMetricCard
                    value={versionDetail.avgPlanningScore}
                    label="规划能力"
                    color="purple"
                  />
                  <AgentMetricCard
                    value={versionDetail.avgComplianceScore}
                    label="合规性"
                    color="green"
                  />
                  <AgentMetricCard
                    value={versionDetail.avgConsistencyScore}
                    label="一致性"
                    color="orange"
                  />
                  <AgentMetricCard
                    value={versionDetail.avgEfficiencyScore}
                    label="效率"
                    color="teal"
                  />
                </div>
                {versionDetail.agentOverallScore !== null && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Agent 综合评分</span>
                      <span className="text-xl font-bold text-indigo-600">
                        {(versionDetail.agentOverallScore * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {stats && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                  <div className="bg-white rounded-lg shadow-md p-5">
                    <div className="text-sm text-gray-500 mb-1">总调用次数</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {stats.totalCalls}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-5">
                    <div className="text-sm text-gray-500 mb-1">成功率</div>
                    <div className="text-2xl font-bold text-green-600">
                      {(stats.successRate * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-5">
                    <div className="text-sm text-gray-500 mb-1">平均迭代轮次</div>
                    <div className="text-2xl font-bold text-purple-600">
                      {stats.avgIterations.toFixed(1)}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-5">
                    <div className="text-sm text-gray-500 mb-1">平均响应时间</div>
                    <div className="text-2xl font-bold text-orange-600">
                      {formatLatency(stats.avgLatencyMs)}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-5">
                    <div className="text-sm text-gray-500 mb-1">总 Token 消耗</div>
                    <div className="text-2xl font-bold text-teal-600">
                      {formatTokens(stats.totalTokens)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      Agent 性能指标
                    </h3>
                    <ScoreBar value={stats.successRate} label="成功率" color="green" />
                    <ScoreBar
                      value={Math.min(1, stats.avgIterations / 5)}
                      label={`平均迭代轮次 (${stats.avgIterations.toFixed(1)})`}
                      color="purple"
                    />
                    <ScoreBar
                      value={Math.min(1, stats.avgLatencyMs > 0 ? 5000 / stats.avgLatencyMs : 0)}
                      label={`响应速度 (${formatLatency(stats.avgLatencyMs)})`}
                      color="orange"
                    />

                    <div className="mt-4 pt-4 border-t">
                      <div className="text-gray-600 mb-2 text-sm">调用状态分布</div>
                      <div className="flex gap-3">
                        {Object.entries(stats.byStatus).map(([status, count]) => (
                          <div
                            key={status}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                              status === "success"
                                ? "bg-green-100 text-green-700"
                                : status === "error"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {status}: {count as number}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      各模型表现
                    </h3>
                    {Object.keys(stats.byModel).length === 0 ? (
                      <div className="text-gray-400 text-sm">暂无模型数据</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 text-gray-600">模型</th>
                            <th className="text-right py-2 text-gray-600">调用</th>
                            <th className="text-right py-2 text-gray-600">Token</th>
                            <th className="text-right py-2 text-gray-600">平均延迟</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(stats.byModel).map(([model, info]) => (
                            <tr key={model} className="border-b">
                              <td className="py-2 font-medium">{model}</td>
                              <td className="text-right py-2">{info.count}</td>
                              <td className="text-right py-2">
                                {formatTokens(info.tokens)}
                              </td>
                              <td className="text-right py-2">
                                {formatLatency(info.avgLatency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">
                    最近错误日志
                  </h3>
                  {logs.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-2xl mb-2">✅</div>
                      <div>暂无错误记录</div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="text-left py-3 px-3 text-gray-600">时间</th>
                            <th className="text-left py-3 px-3 text-gray-600">问题</th>
                            <th className="text-left py-3 px-3 text-gray-600">模型</th>
                            <th className="text-right py-3 px-3 text-gray-600">轮次</th>
                            <th className="text-right py-3 px-3 text-gray-600">耗时</th>
                            <th className="text-left py-3 px-3 text-gray-600">错误信息</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map((log) => (
                            <tr key={log.id} className="border-b hover:bg-gray-50">
                              <td className="py-2 px-3 text-gray-500 text-xs whitespace-nowrap">
                                {new Date(log.createdAt).toLocaleString("zh-CN")}
                              </td>
                              <td className="py-2 px-3 max-w-xs truncate" title={log.query}>
                                {log.query}
                              </td>
                              <td className="py-2 px-3 text-xs">{log.model || "-"}</td>
                              <td className="py-2 px-3 text-right">{log.iterations}</td>
                              <td className="py-2 px-3 text-right">
                                {formatLatency(log.latencyMs)}
                              </td>
                              <td className="py-2 px-3 text-red-600 text-xs max-w-xs truncate" title={log.errorMessage || ""}>
                                {log.errorMessage || "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                评估趋势（最近5次）
              </h3>
              {agentTrendData.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-2xl mb-2">📈</div>
                  <div>暂无趋势数据</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={agentTrendData
                      .filter((d) => d.value !== null)
                      .map((d) => ({
                        name: `v${d.version}`,
                        timestamp: new Date(d.timestamp).toLocaleString("zh-CN"),
                        value: d.value !== null ? parseFloat((d.value * 100).toFixed(1)) : null,
                      }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis
                      domain={[0, 100]}
                      fontSize={12}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(value: unknown) => [`${value}%`, "Agent 综合评分"]}
                      labelFormatter={(label: unknown) => {
                        const labelStr = String(label);
                        const point = agentTrendData
                          .filter((d) => d.value !== null)
                          .map((d) => ({
                            name: `v${d.version}`,
                            timestamp: new Date(d.timestamp).toLocaleString("zh-CN"),
                          }))
                          .find((d) => d.name === labelStr);
                        return point ? point.timestamp : labelStr;
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Agent 综合评分"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
