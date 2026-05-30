"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface WrongAnswer {
  id: string;
  userId: string;
  conversationId: string | null;
  agentLogId: string | null;
  query: string;
  wrongAnswer: string;
  correctAnswer: string | null;
  errorType: string;
  toolsUsed: string | null;
  model: string | null;
  iterations: number | null;
  note: string | null;
  resolved: number;
  createdAt: string;
  updatedAt: string;
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  hallucination: "数据编造",
  wrong_calculation: "计算错误",
  missing_data: "数据缺失",
  wrong_tool: "工具选择错误",
  incomplete: "回答不完整",
  other: "其他",
};

const ERROR_TYPE_COLORS: Record<string, string> = {
  hallucination: "bg-red-100 text-red-700",
  wrong_calculation: "bg-orange-100 text-orange-700",
  missing_data: "bg-yellow-100 text-yellow-700",
  wrong_tool: "bg-purple-100 text-purple-700",
  incomplete: "bg-blue-100 text-blue-700",
  other: "bg-gray-100 text-gray-700",
};

function EditModal({
  item,
  onClose,
  onSave,
}: {
  item: WrongAnswer;
  onClose: () => void;
  onSave: (id: string, data: Record<string, unknown>) => void;
}) {
  const [correctAnswer, setCorrectAnswer] = useState(item.correctAnswer || "");
  const [errorType, setErrorType] = useState(item.errorType);
  const [note, setNote] = useState(item.note || "");
  const [resolved, setResolved] = useState(item.resolved === 1);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">编辑错题</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">原始问题</label>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800">{item.query}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">错误回答</label>
            <div className="bg-red-50 rounded-lg p-3 text-sm text-red-800 max-h-40 overflow-y-auto whitespace-pre-wrap">{item.wrongAnswer}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">错误类型</label>
            <select
              value={errorType}
              onChange={(e) => setErrorType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(ERROR_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">正确答案</label>
            <textarea
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              rows={4}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="填写正确答案..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="分析错误原因..."
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="resolved"
              checked={resolved}
              onChange={(e) => setResolved(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="resolved" className="text-sm text-gray-700">已解决</label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => onSave(item.id, { correctAnswer, errorType, note, resolved: resolved ? 1 : 0 })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WrongAnswersPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<WrongAnswer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [errorTypeFilter, setErrorTypeFilter] = useState("");
  const [resolvedFilter, setResolvedFilter] = useState("");
  const [editingItem, setEditingItem] = useState<WrongAnswer | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (errorTypeFilter) params.set("errorType", errorTypeFilter);
      if (resolvedFilter) params.set("resolved", resolvedFilter);

      const res = await fetch(`/api/wrong-answers?${params}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.wrongAnswers || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("获取错题列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, errorTypeFilter, resolvedFilter]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (authStatus === "authenticated") {
      fetchItems();
    }
  }, [authStatus, router, fetchItems]);

  const handleSave = async (id: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/wrong-answers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      const result = await res.json();
      if (result.success) {
        setEditingItem(null);
        fetchItems();
      }
    } catch (err) {
      console.error("更新错题失败:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此错题记录？")) return;
    try {
      const res = await fetch(`/api/wrong-answers?id=${id}`, { method: "DELETE" });
      const result = await res.json();
      if (result.success) {
        fetchItems();
      }
    } catch (err) {
      console.error("删除错题失败:", err);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const stats = {
    total,
    unresolved: items.filter((i) => i.resolved === 0).length,
    byType: items.reduce<Record<string, number>>((acc, i) => {
      acc[i.errorType] = (acc[i.errorType] || 0) + 1;
      return acc;
    }, {}),
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-500 hover:text-gray-700 mr-2">&larr;</Link>
              <span className="text-xl font-bold text-gray-800">错题本</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/chat" className="text-gray-600 hover:text-gray-900 text-sm">智能对话</Link>
              <Link href="/dashboard/logs" className="text-gray-600 hover:text-gray-900 text-sm">Agent 日志</Link>
              <Link href="/dashboard/documents" className="text-gray-600 hover:text-gray-900 text-sm">文档管理</Link>
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
                <h1 className="text-2xl font-bold text-gray-800">错题本</h1>
                <p className="text-sm text-gray-500 mt-1">
                  共 {total} 条错题记录 · {stats.unresolved} 条未解决
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <select
                  value={errorTypeFilter}
                  onChange={(e) => { setErrorTypeFilter(e.target.value); setPage(1); }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全部类型</option>
                  {Object.entries(ERROR_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <select
                  value={resolvedFilter}
                  onChange={(e) => { setResolvedFilter(e.target.value); setPage(1); }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全部状态</option>
                  <option value="0">未解决</option>
                  <option value="1">已解决</option>
                </select>
                <button
                  onClick={() => fetchItems()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  刷新
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">加载中...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-lg shadow-sm">
                <div className="text-4xl mb-3">📝</div>
                <div className="text-gray-500">暂无错题记录</div>
                <div className="text-gray-400 text-sm mt-1">
                  在聊天界面点击"标记为错误"按钮添加错题
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${
                        item.resolved === 1 ? "border-l-green-400" : "border-l-red-400"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ERROR_TYPE_COLORS[item.errorType] || ERROR_TYPE_COLORS.other}`}>
                              {ERROR_TYPE_LABELS[item.errorType] || item.errorType}
                            </span>
                            {item.resolved === 1 && (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">已解决</span>
                            )}
                            {item.model && (
                              <span className="text-xs text-gray-400">{item.model}</span>
                            )}
                            <span className="text-xs text-gray-400">
                              {new Date(item.createdAt).toLocaleString("zh-CN")}
                            </span>
                          </div>

                          <div className="text-sm font-medium text-gray-800 mb-1">
                            Q: {item.query}
                          </div>

                          <div className="text-sm text-red-600 bg-red-50 rounded p-2 mb-2 line-clamp-3">
                            <span className="font-medium">错误回答: </span>{item.wrongAnswer.substring(0, 300)}{item.wrongAnswer.length > 300 ? "..." : ""}
                          </div>

                          {item.correctAnswer && (
                            <div className="text-sm text-green-700 bg-green-50 rounded p-2 mb-2 line-clamp-3">
                              <span className="font-medium">正确答案: </span>{item.correctAnswer.substring(0, 300)}{item.correctAnswer.length > 300 ? "..." : ""}
                            </div>
                          )}

                          {item.note && (
                            <div className="text-xs text-gray-500 mt-1">
                              备注: {item.note}
                            </div>
                          )}

                          {item.toolsUsed && (
                            <div className="text-xs text-gray-400 mt-1">
                              使用工具: {item.toolsUsed}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <button
                            onClick={() => setEditingItem(item)}
                            className="px-3 py-1.5 border rounded text-xs text-gray-700 hover:bg-gray-50"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="px-3 py-1.5 border border-red-200 rounded text-xs text-red-600 hover:bg-red-50"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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
                    <span className="text-sm text-gray-600">{page} / {totalPages}</span>
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

      {editingItem && (
        <EditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
