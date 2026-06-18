"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
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

/* ─── New Helper Components ─── */

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function SystemPerformanceSection({ report }: { report: EvaluationReport }) {
  const durations = report.results.map((r) => r.durationMs).filter((d) => d > 0);
  const p50 = durations.length > 0 ? percentile(durations, 50) : 0;
  const p95 = durations.length > 0 ? percentile(durations, 95) : 0;
  const p99 = durations.length > 0 ? percentile(durations, 99) : 0;

  const successCount = report.results.filter(
    (r) => r.answer.faithfulness >= 0.5 && r.answer.answerRelevance >= 0.5
  ).length;
  const successRate = report.results.length > 0 ? successCount / report.results.length : 0;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h3 className="text-lg font-bold text-gray-800 mb-1">系统性能指标</h3>
      <p className="text-xs text-gray-400 mb-4">端到端延迟分布及成功率</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-2.5 px-3 text-gray-600">阶段</th>
                <th className="text-right py-2.5 px-3 text-gray-600">P50</th>
                <th className="text-right py-2.5 px-3 text-gray-600">P95</th>
                <th className="text-right py-2.5 px-3 text-gray-600">P99</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-medium text-gray-700">端到端延迟</td>
                <td className="text-right py-2 px-3">{p50}ms</td>
                <td className="text-right py-2 px-3">{p95}ms</td>
                <td className="text-right py-2 px-3">{p99}ms</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-gray-600">成功率</span>
            <span className="font-medium">{(successRate * 100).toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all ${
                successRate >= 0.9
                  ? "bg-green-500"
                  : successRate >= 0.7
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${Math.max(successRate * 100, 2)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            成功标准: 忠实度 ≥ 50% 且 答案相关性 ≥ 50%
          </p>
        </div>
      </div>
    </div>
  );
}

function DiagnosticMatrixSection({ report }: { report: EvaluationReport }) {
  const threshold = 0.7;

  const quadrants = {
    highHigh: { count: 0, label: "检索高 + 生成高", color: "bg-green-50 border-green-300", textColor: "text-green-700", desc: "优秀：检索和生成均表现良好" },
    highLow: { count: 0, label: "检索高 + 生成低", color: "bg-yellow-50 border-yellow-300", textColor: "text-yellow-700", desc: "生成瓶颈：检索正常但生成质量不足" },
    lowHigh: { count: 0, label: "检索低 + 生成高", color: "bg-yellow-50 border-yellow-300", textColor: "text-yellow-700", desc: "检索瓶颈：生成正常但检索召回不足" },
    lowLow: { count: 0, label: "检索低 + 生成低", color: "bg-red-50 border-red-300", textColor: "text-red-700", desc: "严重问题：检索和生成均需改进" },
  };

  report.results.forEach((r) => {
    const retrievalScore = (r.retrieval.hitsAtK + r.retrieval.contextRelevance + r.retrieval.contextRecall) / 3;
    const generationScore = (r.answer.faithfulness + r.answer.answerRelevance) / 2;
    const retrievalHigh = retrievalScore >= threshold;
    const generationHigh = generationScore >= threshold;

    if (retrievalHigh && generationHigh) quadrants.highHigh.count++;
    else if (retrievalHigh && !generationHigh) quadrants.highLow.count++;
    else if (!retrievalHigh && generationHigh) quadrants.lowHigh.count++;
    else quadrants.lowLow.count++;
  });

  const total = report.results.length;
  const bottleneck =
    quadrants.lowLow.count > quadrants.highLow.count && quadrants.lowLow.count > quadrants.lowHigh.count
      ? "检索和生成模块均需优化"
      : quadrants.highLow.count > quadrants.lowHigh.count
        ? "生成模块为主要瓶颈"
        : quadrants.lowHigh.count > quadrants.highLow.count
          ? "检索模块为主要瓶颈"
          : "系统表现良好，无明显瓶颈";

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h3 className="text-lg font-bold text-gray-800 mb-1">诊断矩阵</h3>
      <p className="text-xs text-gray-400 mb-4">基于检索和生成得分的 2×2 分类诊断（阈值: {threshold}）</p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        {Object.values(quadrants).map((q) => (
          <div key={q.label} className={`border rounded-lg p-4 ${q.color}`}>
            <div className={`font-bold text-sm ${q.textColor}`}>{q.label}</div>
            <div className={`text-2xl font-bold mt-1 ${q.textColor}`}>{q.count}</div>
            <div className="text-xs text-gray-500 mt-1">
              {total > 0 ? `${((q.count / total) * 100).toFixed(1)}%` : "0%"}
            </div>
            <div className="text-xs text-gray-600 mt-2">{q.desc}</div>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <span className="text-sm font-medium text-blue-700">瓶颈识别: </span>
        <span className="text-sm text-blue-600">{bottleneck}</span>
      </div>
    </div>
  );
}

function TopFailureCasesSection({ report }: { report: EvaluationReport }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const scored = report.results.map((r) => {
    const retrievalScore = (r.retrieval.hitsAtK + r.retrieval.contextRelevance + r.retrieval.contextRecall) / 3;
    const generationScore = (r.answer.faithfulness + r.answer.answerRelevance) / 2;
    const combinedScore = (retrievalScore + generationScore) / 2;

    let failureReason = "";
    let category = "";
    if (retrievalScore < 0.5 && generationScore < 0.5) {
      failureReason = "检索和生成均失败";
      category = "双重失败";
    } else if (retrievalScore < 0.5) {
      failureReason = "检索召回不足";
      category = "检索失败";
    } else if (generationScore < 0.5) {
      failureReason = "生成质量不足";
      category = "生成失败";
    } else {
      failureReason = "整体表现偏低";
      category = "表现不佳";
    }

    return { ...r, combinedScore, failureReason, category };
  });

  const top5 = scored.sort((a, b) => a.combinedScore - b.combinedScore).slice(0, 5);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h3 className="text-lg font-bold text-gray-800 mb-1">Top 5 失败案例</h3>
      <p className="text-xs text-gray-400 mb-4">综合得分最低的 5 个查询案例</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-2.5 px-3 text-gray-600">查询</th>
              <th className="text-left py-2.5 px-3 text-gray-600">期望答案</th>
              <th className="text-left py-2.5 px-3 text-gray-600">实际答案</th>
              <th className="text-left py-2.5 px-3 text-gray-600">失败原因</th>
              <th className="text-left py-2.5 px-3 text-gray-600">分类</th>
              <th className="text-center py-2.5 px-3 text-gray-600">详情</th>
            </tr>
          </thead>
          <tbody>
            {top5.map((r) => (
              <Fragment key={r.id}>
                <tr
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <td className="py-2 px-3 max-w-[200px] truncate" title={r.query}>{r.query}</td>
                  <td className="py-2 px-3 max-w-[150px] truncate" title={r.expectedAnswer}>{r.expectedAnswer}</td>
                  <td className="py-2 px-3 max-w-[150px] truncate" title={r.actualAnswer}>{r.actualAnswer}</td>
                  <td className="py-2 px-3">
                    <span className="text-red-600 text-xs">{r.failureReason}</span>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      r.category === "双重失败"
                        ? "bg-red-100 text-red-700"
                        : r.category === "检索失败"
                          ? "bg-yellow-100 text-yellow-700"
                          : r.category === "生成失败"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-gray-100 text-gray-700"
                    }`}>
                      {r.category}
                    </span>
                  </td>
                  <td className="text-center py-2 px-3">
                    <span className="text-blue-500 text-xs">
                      {expandedId === r.id ? "▲ 收起" : "▼ 展开"}
                    </span>
                  </td>
                </tr>
                {expandedId === r.id && (
                  <tr>
                    <td colSpan={6} className="bg-gray-50 px-6 py-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Hits@K:</span>{" "}
                          <span className="font-medium">{(r.retrieval.hitsAtK * 100).toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">上下文相关性:</span>{" "}
                          <span className="font-medium">{(r.retrieval.contextRelevance * 100).toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">上下文召回率:</span>{" "}
                          <span className="font-medium">{(r.retrieval.contextRecall * 100).toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">忠实度:</span>{" "}
                          <span className="font-medium">{(r.answer.faithfulness * 100).toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">答案相关性:</span>{" "}
                          <span className="font-medium">{(r.answer.answerRelevance * 100).toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">耗时:</span>{" "}
                          <span className="font-medium">{r.durationMs}ms</span>
                        </div>
                        <div>
                          <span className="text-gray-500">分类:</span>{" "}
                          <span className="font-medium">{r.category}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">难度:</span>{" "}
                          <span className="font-medium">{r.difficulty}</span>
                        </div>
                      </div>
                      <div className="mt-3 text-sm">
                        <span className="text-gray-500">完整查询:</span>
                        <p className="text-gray-700 mt-1">{r.query}</p>
                      </div>
                      <div className="mt-2 text-sm">
                        <span className="text-gray-500">期望答案:</span>
                        <p className="text-gray-700 mt-1">{r.expectedAnswer}</p>
                      </div>
                      <div className="mt-2 text-sm">
                        <span className="text-gray-500">实际答案:</span>
                        <p className="text-gray-700 mt-1">{r.actualAnswer}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SvgRadarChart({
  data,
}: {
  data: Array<{
    label: string;
    current: number;
    ragas: number;
    finance: number;
  }>;
}) {
  const centerX = 180;
  const centerY = 160;
  const radius = 120;
  const numAxes = data.length;
  if (numAxes < 3) return <div className="text-center py-8 text-gray-400">数据不足，至少需要 3 个维度</div>;

  const angleStep = (2 * Math.PI) / numAxes;

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    return {
      x: centerX + radius * value * Math.cos(angle),
      y: centerY + radius * value * Math.sin(angle),
    };
  };

  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <svg viewBox="0 0 360 340" className="w-full max-w-lg mx-auto">
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={Array.from({ length: numAxes }, (_, i) => {
            const p = getPoint(i, level);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="1"
        />
      ))}

      {data.map((_, i) => {
        const p = getPoint(i, 1);
        return (
          <line
            key={`axis-${i}`}
            x1={centerX}
            y1={centerY}
            x2={p.x}
            y2={p.y}
            stroke="#d1d5db"
            strokeWidth="1"
          />
        );
      })}

      <polygon
        points={data.map((d, i) => {
          const p = getPoint(i, d.finance);
          return `${p.x},${p.y}`;
        }).join(" ")}
        fill="rgba(251, 146, 60, 0.08)"
        stroke="#fb923c"
        strokeWidth="1.5"
        strokeDasharray="4 2"
      />

      <polygon
        points={data.map((d, i) => {
          const p = getPoint(i, d.ragas);
          return `${p.x},${p.y}`;
        }).join(" ")}
        fill="rgba(34, 197, 94, 0.08)"
        stroke="#22c55e"
        strokeWidth="1.5"
        strokeDasharray="6 3"
      />

      <polygon
        points={data.map((d, i) => {
          const p = getPoint(i, d.current);
          return `${p.x},${p.y}`;
        }).join(" ")}
        fill="rgba(59, 130, 246, 0.15)"
        stroke="#3b82f6"
        strokeWidth="2"
      />

      {data.map((d, i) => {
        const p = getPoint(i, d.current);
        return <circle key={`dot-${i}`} cx={p.x} cy={p.y} r="3.5" fill="#3b82f6" />;
      })}

      {data.map((d, i) => {
        const p = getPoint(i, 1.18);
        return (
          <text
            key={`lbl-${i}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            fill="#374151"
          >
            {d.label}
          </text>
        );
      })}

      <rect x="30" y="305" width="12" height="12" fill="#3b82f6" rx="2" />
      <text x="46" y="315" fontSize="11" fill="#374151">当前系统</text>
      <rect x="120" y="305" width="12" height="12" fill="#22c55e" rx="2" />
      <text x="136" y="315" fontSize="11" fill="#374151">RAGAS标准</text>
      <rect x="220" y="305" width="12" height="12" fill="#fb923c" rx="2" />
      <text x="236" y="315" fontSize="11" fill="#374151">金融行业基准</text>
    </svg>
  );
}

const METRIC_DEFINITIONS = [
  {
    key: "overallScore",
    name: "综合评分",
    definition: "所有指标加权平均后的整体表现评分",
    excellent: 0.80,
    passing: 0.60,
    calculation: "各指标加权平均，权重: Hits@K(20%), Context Relevance(15%), Context Recall(15%), Faithfulness(25%), Answer Relevance(25%)",
    failureReason: "整体系统表现不达标，需逐项排查各子指标",
  },
  {
    key: "avgHitsAtK",
    name: "检索命中率 (Hits@K)",
    definition: "检索结果中包含正确文档的比例",
    excellent: 0.80,
    passing: 0.60,
    calculation: "正确文档出现在 Top-K 结果中的查询数 / 总查询数",
    failureReason: "检索模块未能召回相关文档，可能原因：索引质量差、查询理解不准确、分块策略不当",
  },
  {
    key: "avgContextRelevance",
    name: "上下文相关性",
    definition: "检索到的上下文与查询的相关程度",
    excellent: 0.75,
    passing: 0.55,
    calculation: "相关上下文片段数 / 检索到的总上下文片段数",
    failureReason: "检索返回了大量无关内容，可能原因：检索策略过于宽泛、缺少重排序",
  },
  {
    key: "avgContextRecall",
    name: "上下文召回率",
    definition: "期望答案所需信息在检索上下文中被覆盖的比例",
    excellent: 0.80,
    passing: 0.60,
    calculation: "上下文覆盖的期望信息片段数 / 期望答案所需的总信息片段数",
    failureReason: "检索上下文未覆盖回答所需的关键信息，可能原因：分块过细、检索深度不足",
  },
  {
    key: "avgFaithfulness",
    name: "忠实度",
    definition: "生成答案与检索上下文的一致性",
    excellent: 0.85,
    passing: 0.65,
    calculation: "与上下文一致的声明数 / 生成答案中的总声明数",
    failureReason: "生成内容偏离了检索上下文，可能原因：模型幻觉、指令遵循不足",
  },
  {
    key: "avgAnswerRelevance",
    name: "答案相关性",
    definition: "生成答案与原始查询的相关程度",
    excellent: 0.80,
    passing: 0.60,
    calculation: "与原查询相关的答案片段数 / 答案总片段数",
    failureReason: "生成答案未直接回应查询，可能原因：查询理解偏差、生成策略不当",
  },
  {
    key: "avgNumericalAccuracy",
    name: "数值精确度",
    definition: "金融数据中数值信息的准确程度",
    excellent: 0.85,
    passing: 0.70,
    calculation: "正确数值数 / 答案中涉及的总数值数",
    failureReason: "数值信息不准确，可能原因：检索文档版本过时、模型数值推理能力不足",
  },
  {
    key: "avgComplianceScore",
    name: "合规性评分",
    definition: "答案符合金融监管要求的程度",
    excellent: 0.90,
    passing: 0.80,
    calculation: "合规声明数 / 需要合规声明的总场景数",
    failureReason: "合规性不足，可能原因：缺少合规知识库、合规规则未注入提示词",
  },
  {
    key: "avgHallucinationRate",
    name: "幻觉率",
    definition: "生成内容中无依据信息的比例（越低越好）",
    excellent: 0.10,
    passing: 0.20,
    calculation: "无依据声明数 / 生成答案中的总声明数",
    failureReason: "幻觉率过高，可能原因：模型过度推理、检索上下文不足、缺少事实约束",
    invert: true,
  },
  {
    key: "avgRiskDisclosureScore",
    name: "风险披露评分",
    definition: "答案中适当披露风险提示的程度",
    excellent: 0.80,
    passing: 0.60,
    calculation: "包含风险提示的回答数 / 需要风险提示的总场景数",
    failureReason: "风险披露不足，可能原因：缺少风险提示模板、风险场景识别不全",
  },
  {
    key: "avgTimelinessScore",
    name: "时效性评分",
    definition: "答案引用信息的时效性程度",
    excellent: 0.70,
    passing: 0.50,
    calculation: "引用时效信息的回答数 / 涉及时效性的总场景数",
    failureReason: "时效性不足，可能原因：知识库更新不及时、缺少时间感知检索",
  },
];

function MetricDetailsSection({ report }: { report: EvaluationReport }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h3 className="text-lg font-bold text-gray-800 mb-1">指标详情</h3>
      <p className="text-xs text-gray-400 mb-4">各指标定义、当前值、阈值及状态</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-2.5 px-3 text-gray-600">指标名称</th>
              <th className="text-left py-2.5 px-3 text-gray-600">定义</th>
              <th className="text-right py-2.5 px-3 text-gray-600">当前值</th>
              <th className="text-right py-2.5 px-3 text-gray-600">优秀阈值</th>
              <th className="text-center py-2.5 px-3 text-gray-600">状态</th>
              <th className="text-center py-2.5 px-3 text-gray-600">详情</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_DEFINITIONS.map((m) => {
              const currentValue = report[m.key as keyof EvaluationReport] as number | undefined;
              const invert = "invert" in m && m.invert;
              const status = getBenchmarkStatus(currentValue, m.excellent, m.passing, !!invert);
              return (
                <Fragment key={m.key}>
                  <tr
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedKey(expandedKey === m.key ? null : m.key)}
                  >
                    <td className="py-2 px-3 font-medium text-gray-700">{m.name}</td>
                    <td className="py-2 px-3 text-gray-500 max-w-[200px] truncate" title={m.definition}>{m.definition}</td>
                    <td className="text-right py-2 px-3">
                      {currentValue !== undefined && currentValue !== null
                        ? `${(currentValue * 100).toFixed(1)}%`
                        : "-"}
                    </td>
                    <td className="text-right py-2 px-3 text-green-600">
                      {invert ? `≤${(m.excellent * 100).toFixed(0)}%` : `≥${(m.excellent * 100).toFixed(0)}%`}
                    </td>
                    <td className="text-center py-2 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${status.color} ${status.bgColor}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="text-center py-2 px-3">
                      <span className="text-blue-500 text-xs">
                        {expandedKey === m.key ? "▲" : "▼"}
                      </span>
                    </td>
                  </tr>
                  {expandedKey === m.key && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50 px-6 py-4">
                        <div className="text-sm space-y-2">
                          <div>
                            <span className="text-gray-500 font-medium">计算方法:</span>
                            <p className="text-gray-700 mt-0.5">{m.calculation}</p>
                          </div>
                          <div>
                            <span className="text-gray-500 font-medium">失败原因分析:</span>
                            <p className="text-gray-700 mt-0.5">{m.failureReason}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── End New Helper Components ─── */

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

            {/* System Performance Metrics */}
            <SystemPerformanceSection report={displayReport} />

            {/* Diagnostic Matrix */}
            <DiagnosticMatrixSection report={displayReport} />

            <IndustryBenchmarkCard report={displayReport} />

            {/* Metric Details */}
            <MetricDetailsSection report={displayReport} />

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

            {/* Top 5 Failure Cases */}
            <TopFailureCasesSection report={displayReport} />

            {data?.reports && data.reports.length > 1 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
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

            {/* Industry Benchmark Radar Chart (SVG) */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h3 className="text-lg font-bold text-gray-800 mb-1">
                行业基准雷达图
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                当前系统 vs RAGAS 标准 vs 金融行业基准
              </p>
              <SvgRadarChart
                data={[
                  { label: "Hits@K", current: displayReport.avgHitsAtK, ragas: 0.80, finance: 0.85 },
                  { label: "上下文相关性", current: displayReport.avgContextRelevance, ragas: 0.75, finance: 0.80 },
                  { label: "上下文召回率", current: displayReport.avgContextRecall, ragas: 0.80, finance: 0.85 },
                  { label: "忠实度", current: displayReport.avgFaithfulness, ragas: 0.85, finance: 0.90 },
                  { label: "答案相关性", current: displayReport.avgAnswerRelevance, ragas: 0.80, finance: 0.85 },
                ]}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
