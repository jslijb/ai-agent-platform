"use client";

import { useEffect, useState } from "react";

interface EvaluationReport {
  timestamp: string;
  totalTests: number;
  avgHitsAtK: number;
  avgContextRelevance: number;
  avgContextRecall: number;
  avgFaithfulness: number;
  avgAnswerRelevance: number;
  overallScore: number;
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

export default function EvaluationPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/evaluation/results");
        if (!res.ok) throw new Error("获取评估数据失败");
        const json = (await res.json()) as ApiResponse;
        setData(json);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "未知错误"
        );
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

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

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <a
                href="/"
                className="text-gray-500 hover:text-gray-700 mr-4"
              >
                &larr; 返回
              </a>
              <span className="text-xl font-bold text-gray-800">
                RAG 评估监控面板
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <a href="/chat" className="text-gray-600 hover:text-gray-900 text-sm">
                智能对话
              </a>
              <a href="/dashboard/documents" className="text-gray-600 hover:text-gray-900 text-sm">
                文档管理
              </a>
              <a href="/dashboard/agent-evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 评估
              </a>
              <a href="/dashboard/logs" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 日志
              </a>
              <a href="/dashboard/token-usage" className="text-gray-600 hover:text-gray-900 text-sm">
                Token 用量
              </a>
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
        {!latest ? (
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
                  {(latest.overallScore * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">Hits@K</div>
                <div className="text-2xl font-bold text-green-600">
                  {(latest.avgHitsAtK * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">Faithfulness</div>
                <div className="text-2xl font-bold text-purple-600">
                  {(latest.avgFaithfulness * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">
                  Answer Relevance
                </div>
                <div className="text-2xl font-bold text-orange-600">
                  {(latest.avgAnswerRelevance * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">
                  Context Recall
                </div>
                <div className="text-2xl font-bold text-teal-600">
                  {(latest.avgContextRecall * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  综合指标
                </h3>
                <ScoreBar value={latest.avgHitsAtK} label="Hits@K" />
                <ScoreBar
                  value={latest.avgContextRelevance}
                  label="Context Relevance"
                />
                <ScoreBar
                  value={latest.avgContextRecall}
                  label="Context Recall"
                />
                <ScoreBar
                  value={latest.avgFaithfulness}
                  label="Faithfulness"
                />
                <ScoreBar
                  value={latest.avgAnswerRelevance}
                  label="Answer Relevance"
                />
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">测试用例数</span>
                    <span className="font-medium">{latest.totalTests}</span>
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
                    {Object.entries(latest.resultsByCategory).map(
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
                    {Object.entries(latest.resultsByDifficulty).map(
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
                    {latest.results.map((r) => (
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
          </>
        )}
      </main>
    </div>
  );
}
