"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AgentStep {
  type: string;
  round: number;
  title: string;
  content: string;
  detail?: Record<string, unknown>;
  timestamp: number;
}

interface AgentLog {
  id: string;
  conversationId: string | null;
  userId: string;
  query: string;
  answer: string | null;
  model: string | null;
  iterations: number;
  totalSteps: number;
  steps: AgentStep[];
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
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

const STATUS_STYLE: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  timeout: "bg-amber-100 text-amber-700",
};

const STEP_ICON: Record<string, string> = {
  thinking: "🧠",
  tool_call: "🔧",
  tool_result: "📊",
  reflection: "🤔",
  retrieval: "📄",
  answer: "✅",
};

function StepTimeline({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-blue-600 hover:text-blue-800"
      >
        {open ? "收起详情 ▲" : `查看 ${steps.length} 个步骤 ▼`}
      </button>
      {open && (
        <div className="mt-2 space-y-1 border-l-2 border-gray-200 pl-3">
          {steps.map((step, idx) => (
            <div key={idx} className="text-xs">
              <span className="mr-1">{STEP_ICON[step.type] || "•"}</span>
              <span className="font-medium text-gray-700">
                R{step.round}
              </span>
              <span className="text-gray-500 ml-1">{step.title}</span>
              {step.content && (
                <div className="ml-5 text-gray-400 line-clamp-2 mt-0.5 whitespace-pre-wrap">
                  {step.content.substring(0, 200)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentLogsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/agent/logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("获取日志失败:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (authStatus === "authenticated") {
      fetchLogs();
    }
  }, [authStatus, router, fetchLogs]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link
                href="/"
                className="text-gray-500 hover:text-gray-700 mr-2"
              >
                &larr;
              </Link>
              <span className="text-xl font-bold text-gray-800">
                Agent 日志
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
              <Link href="/dashboard/agent-evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 评估
              </Link>
              <Link href="/dashboard/token-usage" className="text-gray-600 hover:text-gray-900 text-sm">
                Token 用量
              </Link>
              <Link href="/dashboard/wrong-answers" className="text-gray-600 hover:text-gray-900 text-sm">
                错题本
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
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">
                  Agent 对话日志
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  共 {total} 条记录
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全部状态</option>
                  <option value="success">成功</option>
                  <option value="error">错误</option>
                  <option value="timeout">超时</option>
                </select>
                <button
                  onClick={() => fetchLogs()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  刷新
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">加载中...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-lg shadow-sm">
                <div className="text-4xl mb-3">📋</div>
                <div className="text-gray-500">暂无对话日志</div>
                <div className="text-gray-400 text-sm mt-1">
                  开始对话后，日志将自动记录
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          时间
                        </th>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          问题
                        </th>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          模型
                        </th>
                        <th className="text-right px-4 py-3 text-gray-600 font-medium">
                          轮次
                        </th>
                        <th className="text-right px-4 py-3 text-gray-600 font-medium">
                          Token
                        </th>
                        <th className="text-right px-4 py-3 text-gray-600 font-medium">
                          耗时
                        </th>
                        <th className="text-center px-4 py-3 text-gray-600 font-medium">
                          状态
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString("zh-CN")}
                          </td>
                          <td className="px-4 py-3">
                            <div
                              className="font-medium text-gray-800 truncate max-w-xs"
                              title={log.query}
                            >
                              {log.query}
                            </div>
                            <StepTimeline steps={log.steps} />
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {log.model || "-"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {log.iterations}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {formatTokens(log.totalTokens)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {formatLatency(log.latencyMs)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                STATUS_STYLE[log.status] ||
                                "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center space-x-2 mt-6">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                      className="px-3 py-1.5 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      上一页
                    </button>
                    <span className="text-sm text-gray-600">
                      {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
