"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface AgentStep {
  type: "thinking" | "tool_call" | "tool_result" | "reflection" | "retrieval" | "answer";
  round: number;
  title: string;
  content: string;
  detail?: Record<string, unknown>;
  timestamp: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  steps?: AgentStep[];
  iterations?: number;
  conversationId?: string;
  streaming?: boolean;
  markedWrong?: boolean;
}

interface ConversationItem {
  id: string;
  title: string;
  createdAt: string;
}

const STEP_ICONS: Record<AgentStep["type"], string> = {
  thinking: "🧠",
  tool_call: "🔧",
  tool_result: "📊",
  reflection: "🤔",
  retrieval: "📄",
  answer: "✅",
};

const STEP_COLORS: Record<AgentStep["type"], string> = {
  thinking: "border-l-purple-400 bg-purple-50",
  tool_call: "border-l-blue-400 bg-blue-50",
  tool_result: "border-l-green-400 bg-green-50",
  reflection: "border-l-amber-400 bg-amber-50",
  retrieval: "border-l-cyan-400 bg-cyan-50",
  answer: "border-l-emerald-500 bg-emerald-50",
};

const ERROR_TYPE_OPTIONS = [
  { value: "hallucination", label: "数据编造" },
  { value: "wrong_calculation", label: "计算错误" },
  { value: "missing_data", label: "数据缺失" },
  { value: "wrong_tool", label: "工具选择错误" },
  { value: "incomplete", label: "回答不完整" },
  { value: "other", label: "其他" },
];

function MarkWrongModal({
  query,
  answer,
  steps,
  onClose,
  onSubmit,
}: {
  query: string;
  answer: string;
  steps: AgentStep[];
  onClose: () => void;
  onSubmit: (data: { errorType: string; correctAnswer: string; note: string }) => void;
}) {
  const [errorType, setErrorType] = useState("other");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [note, setNote] = useState("");

  const toolsUsed = steps
    .filter((s) => s.type === "tool_call" && s.detail?.toolName)
    .map((s) => s.detail?.toolName as string)
    .join(", ");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">标记为错误</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">问题</label>
            <div className="bg-gray-50 rounded p-2 text-sm text-gray-800">{query}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">错误回答</label>
            <div className="bg-red-50 rounded p-2 text-sm text-red-800 max-h-32 overflow-y-auto">{answer.substring(0, 500)}</div>
          </div>

          {toolsUsed && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">使用的工具</label>
              <div className="bg-blue-50 rounded p-2 text-sm text-blue-700">{toolsUsed}</div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">错误类型</label>
            <select
              value={errorType}
              onChange={(e) => setErrorType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ERROR_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">正确答案（可选）</label>
            <textarea
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="填写正确答案..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注（可选）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="分析错误原因..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50">取消</button>
          <button
            onClick={() => onSubmit({ errorType, correctAnswer, note })}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
          >
            确认标记
          </button>
        </div>
      </div>
    </div>
  );
}

function StepCard({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(step.type === "answer" || step.type === "retrieval" || step.type === "reflection");
  const icon = STEP_ICONS[step.type];
  const color = STEP_COLORS[step.type];
  const hasDetail = step.detail && Object.keys(step.detail).length > 0;
  const hasLongContent = step.content.length > 100;

  const d = step.detail || {};
  const needMore = d.needMore as boolean | undefined;
  const refinedQuery = d.refinedQuery as string | undefined;
  const results = d.results as Array<{ index: number; score: number; text: string; documentId?: string }> | undefined;
  const params = d.params as Record<string, unknown> | undefined;
  const resultPreview = d.resultPreview as string | undefined;
  const toolName = d.toolName as string | undefined;

  return (
    <div className={`border-l-4 ${color} rounded-r-lg mb-2`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:opacity-80 transition"
      >
        <span className="text-base">{icon}</span>
        <span className="text-xs font-medium text-gray-700 flex-1">{step.title}</span>
        <span className="text-xs text-gray-400">
          {(hasDetail || hasLongContent) && (open ? "▼" : "▶")}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 text-xs text-gray-600 space-y-2">
          {step.content && (
            <div className="whitespace-pre-wrap break-words bg-white/60 rounded p-2">
              {step.content}
            </div>
          )}
          {needMore !== undefined && (
            <div className="bg-white/60 rounded p-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${needMore ? "bg-amber-500" : "bg-emerald-500"}`} />
                <span className="font-medium">{needMore ? "需要继续检索" : "答案充分，结束迭代"}</span>
              </div>
              {refinedQuery && (
                <div>
                  <span className="text-gray-500">改写查询: </span>
                  <span className="font-mono text-cyan-700">&quot;{refinedQuery}&quot;</span>
                </div>
              )}
            </div>
          )}
          {results && Array.isArray(results) && results.length > 0 && (
            <div className="space-y-1">
              <div className="font-medium text-gray-500">检索到 {results.length} 条结果:</div>
              {results.map((r, idx) => (
                <div key={idx} className="bg-white/60 rounded p-2 flex gap-2">
                  <span className="shrink-0 text-gray-400">#{r.index}</span>
                  <div className="flex-1 min-w-0">
                    <span className="inline-block bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      分数: {r.score.toFixed(4)}
                    </span>
                    <div className="text-gray-600 line-clamp-2 mt-1">{r.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {params && (
            <div className="bg-white/60 rounded p-2">
              <div className="text-gray-500 mb-1">调用参数:</div>
              <pre className="text-[11px] font-mono overflow-x-auto">{JSON.stringify(params, null, 2)}</pre>
            </div>
          )}
          {resultPreview && !results && (
            <div className="bg-white/60 rounded p-2">
              <div className="text-gray-500 mb-1">结果预览:</div>
              <pre className="text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                {resultPreview.substring(0, 800)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentStepsPanel({ steps }: { steps: AgentStep[] }) {
  const [expanded, setExpanded] = useState(true);
  if (!steps || steps.length === 0) return null;

  const answerStep = steps.find((s) => s.type === "answer");
  const nonAnswerSteps = steps.filter((s) => s.type !== "answer");
  const roundCount = Math.max(...steps.map((s) => s.round), 0);

  return (
    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <span>🔍</span>
          <span>执行过程</span>
          <span className="text-xs text-gray-400">{roundCount} 轮迭代 · {steps.length} 个步骤</span>
        </div>
        <span className="text-gray-400 text-sm">{expanded ? "收起 ▲" : "展开 ▼"}</span>
      </button>

      {expanded && (
        <div className="p-3 max-h-96 overflow-y-auto">
          {nonAnswerSteps.map((step, idx) => (
            <StepCard key={idx} step={step} />
          ))}
          {answerStep && <StepCard step={answerStep} />}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; provider: string; description: string; context: string; thinking: boolean; functionCalling: boolean }>>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [markingWrongIdx, setMarkingWrongIdx] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("获取对话列表失败:", err);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/agent/models")
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setAvailableModels(data.models || []);
            setSelectedModel(data.defaultModel || "");
          }
        })
        .catch((err) => console.error("获取模型列表失败:", err));
      fetchConversations();
    }
  }, [status, fetchConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations?conversationId=${convId}`);
      const data = await res.json();
      if (data.success && data.conversation) {
        const convMessages: Message[] = data.conversation.messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
        setMessages(convMessages);
        setCurrentConvId(convId);
      }
    } catch (err) {
      console.error("加载对话失败:", err);
    }
  }, []);

  const handleDeleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定删除此对话？")) return;
    try {
      await fetch(`/api/conversations?conversationId=${convId}`, { method: "DELETE" });
      if (currentConvId === convId) {
        setMessages([]);
        setCurrentConvId(null);
      }
      fetchConversations();
    } catch (err) {
      console.error("删除对话失败:", err);
    }
  }, [currentConvId, fetchConversations]);

  const handleNewChat = () => {
    setMessages([]);
    setCurrentConvId(null);
  };

  const handleMarkWrong = async (msgIdx: number, data: { errorType: string; correctAnswer: string; note: string }) => {
    const msg = messages[msgIdx];
    const userMsg = msgIdx > 0 ? messages[msgIdx - 1] : null;
    if (!msg || msg.role !== "assistant") return;

    const toolsUsed = (msg.steps || [])
      .filter((s) => s.type === "tool_call" && s.detail?.toolName)
      .map((s) => s.detail?.toolName as string)
      .join(", ");

    try {
      const res = await fetch("/api/wrong-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: currentConvId || msg.conversationId,
          query: userMsg?.content || "",
          wrongAnswer: msg.content,
          correctAnswer: data.correctAnswer || null,
          errorType: data.errorType,
          toolsUsed: toolsUsed || null,
          model: selectedModel || null,
          iterations: msg.iterations || 0,
          note: data.note || null,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[msgIdx] = { ...updated[msgIdx], markedWrong: true };
          return updated;
        });
        console.log("[chat] 错题已标记");
      }
    } catch (err) {
      console.error("标记错题失败:", err);
    }
    setMarkingWrongIdx(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setLoading(true);

    const assistantMsg: Message = {
      role: "assistant",
      content: "",
      steps: [],
      streaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          userId: session?.user?.id,
          model: selectedModel || undefined,
          conversationId: currentConvId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `[Error] ${errData.error || errData.message || `HTTP ${res.status}`}`,
            streaming: false,
          };
          return updated;
        });
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "[Error] 无法读取流", streaming: false };
          return updated;
        });
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let convId = currentConvId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.substring(6);
            try {
              const data = JSON.parse(dataStr);

              if (currentEvent === "step") {
                const step = data as AgentStep;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    const existingSteps = last.steps || [];
                    const stepIndex = existingSteps.findIndex(
                      (s) => s.round === step.round && s.type === step.type && s.title === step.title
                    );
                    if (stepIndex >= 0) {
                      existingSteps[stepIndex] = step;
                    } else {
                      existingSteps.push(step);
                    }
                    updated[updated.length - 1] = { ...last, steps: [...existingSteps] };
                  }
                  return updated;
                });
              } else if (currentEvent === "done") {
                convId = data.conversationId || convId;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: data.answer || "(empty)",
                      iterations: data.iterations,
                      conversationId: data.conversationId,
                      streaming: false,
                    };
                  }
                  return updated;
                });
                if (data.conversationId && !currentConvId) {
                  setCurrentConvId(data.conversationId);
                  fetchConversations();
                  setTimeout(() => fetchConversations(), 2000);
                  setTimeout(() => fetchConversations(), 5000);
                }
              } else if (currentEvent === "error") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: `[Error] ${data.message || "未知错误"}`,
                      streaming: false,
                    };
                  }
                  return updated;
                });
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: `[Network Error] ${err instanceof Error ? err.message : String(err)}`,
            streaming: false,
          };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  if (status === "unauthenticated") return null;

  return (
    <div className="flex h-screen bg-gray-50">
      {sidebarOpen && (
        <div className="w-64 bg-white border-r flex flex-col shrink-0">
          <div className="p-3 border-b">
            <button
              onClick={handleNewChat}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              + 新对话
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`group flex items-center justify-between px-3 py-2.5 text-sm border-b hover:bg-gray-50 transition cursor-pointer ${
                  currentConvId === conv.id ? "bg-blue-50 text-blue-700" : "text-gray-700"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{conv.title || "新对话"}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(conv.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 ml-2 text-gray-400 hover:text-red-500 transition shrink-0 p-1 rounded hover:bg-red-50"
                  title="删除对话"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            {conversations.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-xs">暂无历史对话</div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <nav className="bg-white shadow-sm px-4 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              {sidebarOpen ? "◀" : "▶"}
            </button>
            <a href="/" className="text-lg font-bold text-gray-800">AI Agent Platform</a>
            <span className="text-gray-400">|</span>
            <span className="text-gray-600 text-sm">智能对话</span>
          </div>
          <div className="flex items-center space-x-4">
            <a href="/dashboard/documents" className="text-gray-600 hover:text-gray-900 text-sm">文档管理</a>
            <a href="/dashboard/evaluation" className="text-gray-600 hover:text-gray-900 text-sm">RAG 评估</a>
            <a href="/dashboard/agent-evaluation" className="text-gray-600 hover:text-gray-900 text-sm">Agent 评估</a>
            <a href="/dashboard/logs" className="text-gray-600 hover:text-gray-900 text-sm">Agent 日志</a>
            <a href="/dashboard/wrong-answers" className="text-gray-600 hover:text-gray-900 text-sm">错题本</a>
            <a href="/dashboard/token-usage" className="text-gray-600 hover:text-gray-900 text-sm">Token 用量</a>
          </div>
        </nav>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {status === "loading" ? (
              <div className="text-center text-gray-400 mt-20">
                <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-4" />
                <p className="text-sm">正在验证身份...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-400 mt-20">
                <p className="text-4xl mb-4">🤖</p>
                <p className="text-lg">智能对话</p>
                <p className="text-sm mt-2">支持 RAG 文档问答、量化分析、合规检查、风控计算、研报生成</p>
                <p className="text-xs mt-1 text-gray-300">自动判断问题类型，调用合适的工具回答</p>
                <div className="mt-6 space-y-2">
                  {[
                    "计算招商银行的 MA20 和 RSI",
                    "贵州茅台 2025 年营收是多少？",
                    "检查买入 600036 是否合规",
                    "分析白酒行业竞争格局",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="block mx-auto text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {status !== "loading" && messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] ${msg.role === "user" ? "" : "w-full"}`}>
                  <div
                    className={`rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : msg.content.startsWith("[Error]") || msg.content.startsWith("[Network Error]")
                          ? "bg-red-50 border border-red-200 text-red-700"
                          : "bg-white border text-gray-800 shadow-sm"
                    }`}
                  >
                    {msg.content || (msg.streaming ? " " : "(empty)")}
                  </div>

                  {msg.role === "assistant" && msg.steps && msg.steps.length > 0 && (
                    <AgentStepsPanel steps={msg.steps} />
                  )}

                  {msg.role === "assistant" && !msg.streaming && msg.content && !msg.content.startsWith("[Error]") && !msg.content.startsWith("[Network Error]") && (
                    <div className="mt-1 flex items-center gap-2">
                      {msg.markedWrong ? (
                        <span className="text-xs text-red-500 flex items-center gap-1">
                          <span>⚠️</span> 已标记为错误
                        </span>
                      ) : (
                        <button
                          onClick={() => setMarkingWrongIdx(i)}
                          className="text-xs text-gray-400 hover:text-red-500 transition flex items-center gap-1"
                        >
                          <span>🚫</span> 标记为错误
                        </button>
                      )}
                    </div>
                  )}

                  {msg.role === "assistant" && msg.streaming && (!msg.steps || msg.steps.length === 0) && (
                    <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
                      <span className="animate-pulse">●</span>
                      <span>Agent 启动中...</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        </div>

        <div className="shrink-0 border-t bg-white px-4 py-4">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-2">
            {availableModels.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">模型:</span>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={loading}
                  className="text-xs border rounded px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} | {m.context}上下文{m.thinking ? " | 思考" : ""}{m.functionCalling ? " | 工具" : ""} — {m.description}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={loading ? "等待回复..." : '输入问题，如「计算招商银行的MA20」'}
                disabled={loading}
                className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                发送
              </button>
            </div>
          </form>
        </div>
      </div>
      {markingWrongIdx !== null && messages[markingWrongIdx] && (
        <MarkWrongModal
          query={markingWrongIdx > 0 ? messages[markingWrongIdx - 1]?.content || "" : ""}
          answer={messages[markingWrongIdx].content}
          steps={messages[markingWrongIdx].steps || []}
          onClose={() => setMarkingWrongIdx(null)}
          onSubmit={(data) => handleMarkWrong(markingWrongIdx, data)}
        />
      )}
    </div>
  );
}
