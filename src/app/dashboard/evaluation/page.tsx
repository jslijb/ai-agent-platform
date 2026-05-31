"use client";

import { useEffect, useState, useCallback } from "react";
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

interface EvaluationReport {
  timestamp: string;
  totalTests: number;
  avgHitsAtK: number;
  avgContextRelevance: number;
  avgContextRecall: number;
  avgFaithfulness: number;
  avgAnswerRelevance: number;
  overallScore: number;
  evaluationLevel?: "daily" | "standard" | "full";
  dataSource?: "golden" | "historical" | "opendataset" | "mixed";
  triggerMode?: "manual" | "auto";
  milestone?: string;
  financialOverallScore?: number;
  avgNumericalAccuracy?: number;
  avgComplianceScore?: number;
  avgHallucinationRate?: number;
  avgRiskDisclosureScore?: number;
  avgTimelinessScore?: number;
  resultsByCategory: Record<
    string,
    {
      count: number;
      avgHitsAtK: number;
      avgFaithfulness: number;
      avgAnswerRelevance: number;
    }
  >;
  resultsByDifficulty: Record<
    string,
    {
      count: number;
      avgHitsAtK: number;
      avgFaithfulness: number;
      avgAnswerRelevance: number;
    }
  >;
  results: Array<{
    id: number;
    query: string;
    expectedAnswer: string;
    actualAnswer: string;
    retrieval: {
      hitsAtK: number;
      contextRelevance: number;
      contextRecall: number;
    };
    answer: {
      faithfulness: number;
      answerRelevance: number;
    };
    category: string;
    difficulty: string;
    durationMs: number;
  }>;
}

interface ReportSummary {
  filename: string;
  timestamp: string;
  totalTests: number;
  overallScore: number;
  avgHitsAtK: number;
  avgFaithfulness: number;
  avgAnswerRelevance: number;
  avgContextRelevance: number;
  avgContextRecall: number;
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

interface ApiResponse {
  success: boolean;
  reports: ReportSummary[];
  latest: EvaluationReport | null;
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100);
  const color =
    percent >= 70
      ? "bg-green-500"
      : percent >= 40
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`${color} h-2.5 rounded-full`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function FinancialScoreCard({
  value,
  label,
  color,
  invert = false,
}: {
  value: number | undefined;
  label: string;
  color: string;
  invert?: boolean;
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
  const displayColor = invert
    ? percent <= 10
      ? "text-green-600"
      : percent <= 30
        ? "text-yellow-600"
        : "text-red-600"
    : percent >= 70
      ? `text-${color}-600`
      : percent >= 40
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <div className="bg-white rounded-lg shadow-md p-5">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${displayColor}`}>
        {(value * 100).toFixed(1)}%
      </div>
    </div>
  );
}

const INDUSTRY_BENCHMARKS = [
  { key: "avgNumericalAccuracy", label: "数值精确度", excellent: 0.85, passing: 0.70, invert: false },
  { key: "avgComplianceScore", label: "合规性", excellent: 0.90, passing: 0.80, invert: false },
  { key: "avgHallucinationRate", label: "幻觉率", excellent: 0.10, passing: 0.20, invert: true },
  { key: "avgRiskDisclosureScore", label: "风险提示", excellent: 0.80, passing: 0.60, invert: false },
  { key: "avgTimelinessScore", label: "时效性", excellent: 0.70, passing: 0.50, invert: false },
] as const;

function getBenchmarkStatus(
  value: number | undefined | null,
  excellent: number,
  passing: number,
  invert: boolean
): { label: string; color: string; bgColor: string } {
  if (value === undefined || value === null) {
    return { label: "无数据", color: "text-gray-400", bgColor: "bg-gray-50" };
  }
  if (invert) {
    if (value <= excellent) return { label: "优秀", color: "text-green-700", bgColor: "bg-green-50" };
    if (value <= passing) return { label: "合格", color: "text-yellow-700", bgColor: "bg-yellow-50" };
    return { label: "不合格", color: "text-red-700", bgColor: "bg-red-50" };
  }
  if (value >= excellent) return { label: "优秀", color: "text-green-700", bgColor: "bg-green-50" };
  if (value >= passing) return { label: "合格", color: "text-yellow-700", bgColor: "bg-yellow-50" };
  return { label: "不合格", color: "text-red-700", bgColor: "bg-red-50" };
}

function IndustryBenchmarkCard({ report }: { report: EvaluationReport }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h3 className="text-lg font-bold text-gray-800 mb-1">
        行业基准参考
      </h3>
      <p className="text-xs text-gray-400 mb-4">金融行业通用标准</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-2.5 px-3 text-gray-600">指标</th>
              <th className="text-right py-2.5 px-3 text-gray-600">当前值</th>
              <th className="text-center py-2.5 px-3 text-gray-600">状态</th>
              <th className="text-right py-2.5 px-3 text-gray-600">优秀标准</th>
              <th className="text-right py-2.5 px-3 text-gray-600">合格标准</th>
            </tr>
          </thead>
          <tbody>
            {INDUSTRY_BENCHMARKS.map((b) => {
              const currentValue = report[b.key as keyof EvaluationReport] as number | undefined;
              const status = getBenchmarkStatus(currentValue, b.excellent, b.passing, b.invert);
              return (
                <tr key={b.key} className="border-b hover:bg-gray-50">
                  <td className="py-2.5 px-3 font-medium text-gray-700">{b.label}</td>
                  <td className="text-right py-2.5 px-3">
                    {currentValue !== undefined && currentValue !== null
                      ? `${(currentValue * 100).toFixed(1)}%`
                      : "-"}
                  </td>
                  <td className="text-center py-2.5 px-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${status.color} ${status.bgColor}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="text-right py-2.5 px-3 text-green-600">
                    {b.invert ? `≤${(b.excellent * 100).toFixed(0)}%` : `≥${(b.excellent * 100).toFixed(0)}%`}
                  </td>
                  <td className="text-right py-2.5 px-3 text-yellow-600">
                    {b.invert ? `≤${(b.passing * 100).toFixed(0)}%` : `≥${(b.passing * 100).toFixed(0)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EvaluationPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [versionReport, setVersionReport] = useState<EvaluationReport | null>(null);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [runLevel, setRunLevel] = useState<"daily" | "standard" | "full">("standard");
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<string | null>(null);
  const [triggerMode, setTriggerModeState] = useState<"manual" | "auto">("manual");
  const [trendData, setTrendData] = useState<Array<{ timestamp: string; version: number; value: number | null }>>([]);
  const [radarData, setRadarData] = useState<Array<{ metricName: string; metricLabel: string; value: number | null }>>([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/evaluation/results");
      if (!res.ok) throw new Error("获取评估数据失败");
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch("/api/evaluation/versions?evaluationType=rag&limit=20");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setVersions(json.versions);
      }
    } catch {
      console.error("获取版本列表失败");
    }
  }, []);

  const fetchTriggerMode = useCallback(async () => {
    try {
      const res = await fetch("/api/evaluation/config");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.triggerMode) {
        setTriggerModeState(json.triggerMode);
      }
    } catch {
      console.error("获取触发模式失败");
    }
  }, []);

  const fetchTrendData = useCallback(async () => {
    try {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 19).replace("T", " ");
      const dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      const res = await fetch(
        `/api/evaluation/trend?metric=financialOverallScore&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&evaluationType=rag`
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        const last5 = json.data.slice(-5);
        setTrendData(last5);
      }
    } catch {
      console.error("获取趋势数据失败");
    }
  }, []);

  const fetchRadarData = useCallback(async (versionId: number | null) => {
    if (!versionId) return;
    try {
      const res = await fetch(`/api/evaluation/radar?versionId=${versionId}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        setRadarData(json.data);
      }
    } catch {
      console.error("获取雷达图数据失败");
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchVersions();
    fetchTriggerMode();
    fetchTrendData();
  }, [fetchData, fetchVersions, fetchTriggerMode, fetchTrendData]);

  useEffect(() => {
    if (selectedVersionId) return;
    if (versions.length === 0) return;
    fetchRadarData(versions[0].id);
  }, [versions, selectedVersionId, fetchRadarData]);

  useEffect(() => {
    if (!selectedVersionId) {
      setVersionReport(null);
      return;
    }
    async function loadVersion() {
      try {
        const res = await fetch(`/api/evaluation/versions/${selectedVersionId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.report) {
          setVersionReport(json.report);
        }
      } catch {
        console.error("获取版本详情失败");
      }
    }
    loadVersion();
    fetchRadarData(selectedVersionId);
  }, [selectedVersionId, fetchRadarData]);

  const handleRunEvaluation = async () => {
    setRunning(true);
    setRunProgress("正在触发评估...");
    setShowRunDialog(false);

    try {
      const res = await fetch("/api/evaluation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluationLevel: runLevel,
          evaluationType: "rag",
        }),
      });

      const json = await res.json();

      if (json.success) {
        setRunProgress(`评估完成，版本号: ${json.version}`);
        await fetchData();
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

  const handleToggleTriggerMode = async () => {
    const newMode = triggerMode === "manual" ? "auto" : "manual";
    try {
      const res = await fetch("/api/evaluation/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerMode: newMode }),
      });
      const json = await res.json();
      if (json.success) {
        setTriggerModeState(newMode);
      }
    } catch {
      console.error("切换触发模式失败");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500 text-lg">加载评估数据中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-red-500 text-lg">错误: {error}</div>
      </div>
    );
  }

  const latest = data?.latest;
  const displayReport = selectedVersionId ? versionReport : latest;

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link
                href="/"
                className="text-gray-500 hover:text-gray-700 mr-4"
              >
                &larr; 返回
              </Link>
              <span className="text-xl font-bold text-gray-800">
                RAG 评估监控面板
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/chat" className="text-gray-600 hover:text-gray-900 text-sm">
                智能对话
              </Link>
              <Link href="/dashboard/documents" className="text-gray-600 hover:text-gray-900 text-sm">
                文档管理
              </Link>
              <Link href="/dashboard/agent-evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 评估
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
            {latest && (
              <span className="text-sm text-gray-500">
                最近评估: {new Date(latest.timestamp).toLocaleString("zh-CN")}
              </span>
            )}
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
                <option value="">最新版本</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version} - {new Date(v.timestamp).toLocaleString("zh-CN")} ({v.evaluationLevel})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">触发模式:</label>
              <button
                onClick={handleToggleTriggerMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  triggerMode === "auto" ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    triggerMode === "auto" ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-gray-600">
                {triggerMode === "auto" ? "自动" : "手动"}
              </span>
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
                      name="evalLevel"
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

        {!displayReport ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="text-4xl mb-4">&#128202;</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              暂无评估数据
            </h2>
            <p className="text-gray-500">
              请先运行评估脚本生成评估报告：
            </p>
            <code className="block mt-3 bg-gray-100 p-3 rounded text-sm text-gray-700">
              npx tsx scripts/run-evaluation.ts
            </code>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">Overall Score</div>
                <div className="text-2xl font-bold text-blue-600">
                  {(displayReport.overallScore * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">Hits@K</div>
                <div className="text-2xl font-bold text-green-600">
                  {(displayReport.avgHitsAtK * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">Faithfulness</div>
                <div className="text-2xl font-bold text-purple-600">
                  {(displayReport.avgFaithfulness * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">
                  Answer Relevance
                </div>
                <div className="text-2xl font-bold text-orange-600">
                  {(displayReport.avgAnswerRelevance * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">
                  Context Recall
                </div>
                <div className="text-2xl font-bold text-teal-600">
                  {(displayReport.avgContextRecall * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                金融专用指标
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <FinancialScoreCard
                  value={displayReport.avgNumericalAccuracy}
                  label="数值精确度"
                  color="blue"
                />
                <FinancialScoreCard
                  value={displayReport.avgComplianceScore}
                  label="合规性"
                  color="green"
                />
                <FinancialScoreCard
                  value={displayReport.avgHallucinationRate}
                  label="幻觉率"
                  color="red"
                  invert
                />
                <FinancialScoreCard
                  value={displayReport.avgRiskDisclosureScore}
                  label="风险提示"
                  color="amber"
                />
                <FinancialScoreCard
                  value={displayReport.avgTimelinessScore}
                  label="时效性"
                  color="teal"
                />
              </div>
              {displayReport.financialOverallScore !== undefined && displayReport.financialOverallScore !== null && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">金融综合评分</span>
                    <span className="text-xl font-bold text-indigo-600">
                      {(displayReport.financialOverallScore * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            <IndustryBenchmarkCard report={displayReport} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  综合指标
                </h3>
                <ScoreBar value={displayReport.avgHitsAtK} label="Hits@K" />
                <ScoreBar
                  value={displayReport.avgContextRelevance}
                  label="Context Relevance"
                />
                <ScoreBar
                  value={displayReport.avgContextRecall}
                  label="Context Recall"
                />
                <ScoreBar
                  value={displayReport.avgFaithfulness}
                  label="Faithfulness"
                />
                <ScoreBar
                  value={displayReport.avgAnswerRelevance}
                  label="Answer Relevance"
                />
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">测试用例数</span>
                    <span className="font-medium">{displayReport.totalTests}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  按分类统计
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 text-gray-600">分类</th>
                      <th className="text-right py-2 text-gray-600">数量</th>
                      <th className="text-right py-2 text-gray-600">
                        Hits@K
                      </th>
                      <th className="text-right py-2 text-gray-600">
                        Faith.
                      </th>
                      <th className="text-right py-2 text-gray-600">
                        Rel.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(displayReport.resultsByCategory).map(
                      ([category, stats]) => (
                        <tr key={category} className="border-b">
                          <td className="py-2">{category}</td>
                          <td className="text-right py-2">{stats.count}</td>
                          <td className="text-right py-2">
                            {(stats.avgHitsAtK * 100).toFixed(1)}%
                          </td>
                          <td className="text-right py-2">
                            {(stats.avgFaithfulness * 100).toFixed(1)}%
                          </td>
                          <td className="text-right py-2">
                            {(stats.avgAnswerRelevance * 100).toFixed(1)}%
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>

                <h3 className="text-lg font-bold text-gray-800 mt-6 mb-4">
                  按难度统计
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 text-gray-600">难度</th>
                      <th className="text-right py-2 text-gray-600">数量</th>
                      <th className="text-right py-2 text-gray-600">
                        Hits@K
                      </th>
                      <th className="text-right py-2 text-gray-600">
                        Faith.
                      </th>
                      <th className="text-right py-2 text-gray-600">
                        Rel.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(displayReport.resultsByDifficulty).map(
                      ([difficulty, stats]) => (
                        <tr key={difficulty} className="border-b">
                          <td className="py-2">{difficulty}</td>
                          <td className="text-right py-2">{stats.count}</td>
                          <td className="text-right py-2">
                            {(stats.avgHitsAtK * 100).toFixed(1)}%
                          </td>
                          <td className="text-right py-2">
                            {(stats.avgFaithfulness * 100).toFixed(1)}%
                          </td>
                          <td className="text-right py-2">
                            {(stats.avgAnswerRelevance * 100).toFixed(1)}%
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                逐条评估结果
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-3 text-gray-600">ID</th>
                      <th className="text-left py-3 px-3 text-gray-600">
                        问题
                      </th>
                      <th className="text-left py-3 px-3 text-gray-600">
                        分类
                      </th>
                      <th className="text-left py-3 px-3 text-gray-600">
                        难度
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        Hits@K
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        Ctx Rel
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        Ctx Rec
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        Faith.
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        Ans Rel
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        耗时
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayReport.results.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">{r.id}</td>
                        <td
                          className="py-2 px-3 max-w-xs truncate"
                          title={r.query}
                        >
                          {r.query}
                        </td>
                        <td className="py-2 px-3">{r.category}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs ${
                              r.difficulty === "easy"
                                ? "bg-green-100 text-green-700"
                                : r.difficulty === "medium"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {r.difficulty}
                          </span>
                        </td>
                        <td className="text-right py-2 px-3">
                          {(r.retrieval.hitsAtK * 100).toFixed(0)}%
                        </td>
                        <td className="text-right py-2 px-3">
                          {(r.retrieval.contextRelevance * 100).toFixed(1)}%
                        </td>
                        <td className="text-right py-2 px-3">
                          {(r.retrieval.contextRecall * 100).toFixed(1)}%
                        </td>
                        <td className="text-right py-2 px-3">
                          {(r.answer.faithfulness * 100).toFixed(1)}%
                        </td>
                        <td className="text-right py-2 px-3">
                          {(r.answer.answerRelevance * 100).toFixed(1)}%
                        </td>
                        <td className="text-right py-2 px-3 text-gray-500">
                          {r.durationMs}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {data?.reports && data.reports.length > 1 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  历史评估记录
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-3 text-gray-600">
                        时间
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        用例数
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        Overall
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        Hits@K
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        Faith.
                      </th>
                      <th className="text-right py-3 px-3 text-gray-600">
                        Ans Rel
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reports.map((report) => (
                      <tr key={report.filename} className="border-b">
                        <td className="py-2 px-3">
                          {new Date(report.timestamp).toLocaleString("zh-CN")}
                        </td>
                        <td className="text-right py-2 px-3">
                          {report.totalTests}
                        </td>
                        <td className="text-right py-2 px-3 font-medium">
                          {(report.overallScore * 100).toFixed(1)}%
                        </td>
                        <td className="text-right py-2 px-3">
                          {(report.avgHitsAtK * 100).toFixed(1)}%
                        </td>
                        <td className="text-right py-2 px-3">
                          {(report.avgFaithfulness * 100).toFixed(1)}%
                        </td>
                        <td className="text-right py-2 px-3">
                          {(report.avgAnswerRelevance * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  评估趋势（最近5次）
                </h3>
                {trendData.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-2xl mb-2">📈</div>
                    <div>暂无趋势数据</div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={trendData
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
                        formatter={(value: unknown) => [`${value}%`, "金融综合评分"]}
                        labelFormatter={(label: unknown) => {
                          const labelStr = String(label);
                          const point = trendData
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
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        name="金融综合评分"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  能力雷达图
                </h3>
                {radarData.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-2xl mb-2">🎯</div>
                    <div>暂无雷达图数据</div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart
                      data={radarData
                        .filter((d) => d.value !== null)
                        .map((d) => ({
                          metric: d.metricLabel,
                          value: d.value !== null ? parseFloat((d.value * 100).toFixed(1)) : 0,
                          fullMark: 100,
                        }))}
                    >
                      <PolarGrid />
                      <PolarAngleAxis dataKey="metric" fontSize={11} />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                        fontSize={10}
                      />
                      <Radar
                        name="当前评分"
                        dataKey="value"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.3}
                      />
                      <Tooltip formatter={(value: unknown) => [`${value}%`, "当前评分"]} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
