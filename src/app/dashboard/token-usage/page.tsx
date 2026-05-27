"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TokenSummary {
  totalCalls: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  avgLatencyMs: number;
  avgIterations: number;
  byModel: Record<
    string,
    { count: number; tokens: number; avgLatency: number }
  >;
  byStatus: Record<string, number>;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function TokenBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{formatTokens(value)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function TokenUsagePage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [summary, setSummary] = useState<TokenSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (authStatus === "authenticated") {
      fetchTokenUsage();
    }
  }, [authStatus, router]);

  async function fetchTokenUsage() {
    try {
      const res = await fetch("/api/agent/token-usage");
      const data = await res.json();
      if (data.success) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error("获取Token用量失败:", err);
    } finally {
      setLoading(false);
    }
  }

  const modelEntries = summary?.byModel
    ? Object.entries(summary.byModel).sort((a, b) => b[1].tokens - a[1].tokens)
    : [];
  const maxModelTokens =
    modelEntries.length > 0 ? Math.max(...modelEntries.map(([, v]) => v.tokens)) : 1;

  const statusEntries = summary?.byStatus
    ? Object.entries(summary.byStatus)
    : [];

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link
                href="/dashboard"
                className="text-gray-500 hover:text-gray-700 mr-2"
              >
                &larr;
              </Link>
              <span className="text-xl font-bold text-gray-800">
                Token 用量
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/dashboard/logs"
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Agent 日志
              </Link>
              <Link href="/chat" className="text-gray-600 hover:text-gray-900 text-sm">
                对话
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {authStatus === "loading" ? (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="text-sm text-gray-400">正在验证身份...</p>
          </div>
        ) : loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : !summary ? (
          <div className="text-center py-16 bg-white rounded-lg shadow-sm">
            <div className="text-4xl mb-3">📊</div>
            <div className="text-gray-500">暂无使用数据</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">总调用次数</div>
                <div className="text-2xl font-bold text-blue-600">
                  {summary.totalCalls}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">总 Token 消耗</div>
                <div className="text-2xl font-bold text-purple-600">
                  {formatTokens(summary.totalTokens)}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">
                  Prompt Tokens
                </div>
                <div className="text-2xl font-bold text-green-600">
                  {formatTokens(summary.totalPromptTokens)}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5">
                <div className="text-sm text-gray-500 mb-1">
                  Completion Tokens
                </div>
                <div className="text-2xl font-bold text-orange-600">
                  {formatTokens(summary.totalCompletionTokens)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  各模型 Token 用量
                </h3>
                {modelEntries.length === 0 ? (
                  <div className="text-gray-400 text-sm">暂无数据</div>
                ) : (
                  modelEntries.map(([model, data]) => (
                    <TokenBar
                      key={model}
                      label={`${model} (${data.count}次)`}
                      value={data.tokens}
                      max={maxModelTokens}
                      color="bg-blue-500"
                    />
                  ))
                )}
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  性能指标
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">平均响应时间</span>
                    <span className="font-medium">
                      {formatLatency(summary.avgLatencyMs)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">平均迭代轮次</span>
                    <span className="font-medium">
                      {summary.avgIterations} 轮
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">
                      Prompt / Completion 比
                    </span>
                    <span className="font-medium">
                      {summary.totalCompletionTokens > 0
                        ? (
                            summary.totalPromptTokens /
                            summary.totalCompletionTokens
                          ).toFixed(1)
                        : "-"}
                      :1
                    </span>
                  </div>

                  <div className="pt-2">
                    <div className="text-gray-600 mb-2">调用状态分布</div>
                    <div className="flex gap-3">
                      {statusEntries.map(([status, count]) => (
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
                          {status}: {count}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {modelEntries.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  模型详细对比
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-4 text-gray-600">
                        模型
                      </th>
                      <th className="text-right py-3 px-4 text-gray-600">
                        调用次数
                      </th>
                      <th className="text-right py-3 px-4 text-gray-600">
                        Token 总量
                      </th>
                      <th className="text-right py-3 px-4 text-gray-600">
                        平均延迟
                      </th>
                      <th className="text-right py-3 px-4 text-gray-600">
                        每次调用 Token
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelEntries.map(([model, data]) => (
                      <tr key={model} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-800">
                          {model}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {data.count}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {formatTokens(data.tokens)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {formatLatency(data.avgLatency)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {data.count > 0
                            ? formatTokens(Math.round(data.tokens / data.count))
                            : "-"}
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
