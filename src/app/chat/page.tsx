"use client";

import { useState, useRef, useEffect } from "react";
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

function StepCard({ step, defaultOpen }: { step: AgentStep; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const icon = STEP_ICONS[step.type];
  const color = STEP_COLORS[step.type];

  const d = step.detail || {};
  const needMore = d.needMore as boolean | undefined;
  const refinedQuery = d.refinedQuery as string | undefined;
  const results = d.results as Array<{ index: number; score: number; text: string; documentId?: string }> | undefined;
  const params = d.params as Record<string, unknown> | undefined;
  const resultPreview = d.resultPreview as string | undefined;
  const answerPreview = d.answerPreview as string | undefined;
  const toolName = d.toolName as string | undefined;

  const hasDetail = step.detail && Object.keys(step.detail).length > 0;
  const hasLongContent = step.content.length > 100;

  const shouldAutoOpen = step.type === "answer" || step.type === "reflection" || step.type === "retrieval";

  useEffect(() => {
    if (shouldAutoOpen && defaultOpen) setOpen(true);
  }, [shouldAutoOpen, defaultOpen]);

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
                <span className="font-medium">
                  {needMore ? "需要继续检索" : "答案充分，结束迭代"}
                </span>
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
              <div className="font-medium text-gray-500">
                检索到 {results.length} 条结果:
              </div>
              {results.map((r, idx) => (
                <div key={idx} className="bg-white/60 rounded p-2 flex gap-2">
                  <span className="shrink-0 text-gray-400">#{r.index}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                        分数: {r.score.toFixed(4)}
                      </span>
                      {r.documentId && (
                        <span className="text-[10px] text-gray-400 truncate">
                          doc: {r.documentId.substring(0, 12)}...
                        </span>
                      )}
                    </div>
                    <div className="text-gray-600 line-clamp-3">{r.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {params && (
            <div className="bg-white/60 rounded p-2">
              <div className="text-gray-500 mb-1">调用参数:</div>
              <pre className="text-[11px] font-mono overflow-x-auto">
                {JSON.stringify(params, null, 2)}
              </pre>
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

          {answerPreview && (
            <div className="bg-white/60 rounded p-2">
              <div className="text-gray-500 mb-1">答案预览:</div>
              <div className="whitespace-pre-wrap">{answerPreview}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentStepsPanel({ steps, iterations }: { steps: AgentStep[]; iterations: number }) {
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
          <span>Agentic RAG 执行过程</span>
          <span className="text-xs text-gray-400">
            {roundCount} 轮迭代 · {steps.length} 个步骤
          </span>
        </div>
        <span className="text-gray-400 text-sm">{expanded ? "收起 ▲" : "展开 ▼"}</span>
      </button>

      {expanded && (
        <div className="p-3 max-h-96 overflow-y-auto">
          {nonAnswerSteps.map((step, idx) => (
            <StepCard key={idx} step={step} defaultOpen={step.type === "retrieval" || step.type === "reflection"} />
          ))}

          {answerStep && (
            <StepCard step={answerStep} defaultOpen={true} />
          )}
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
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

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
    }
  }, [status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setLoading(true);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          userId: session?.user?.id,
          model: selectedModel || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer || "(empty)",
            steps: data.steps || [],
            iterations: data.iterations || 0,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `[Error] ${data.error || "unknown error"}`,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `[Network Error] ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <nav className="bg-white shadow-sm px-6 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-4">
          <a href="/" className="text-xl font-bold text-gray-800">
            AI Agent Platform
          </a>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600 text-sm">Agent 对话</span>
        </div>
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-gray-600 hover:text-gray-900 text-sm">
            控制台
          </a>
          <a href="/dashboard/evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
            评估
          </a>
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
              <p className="text-lg">Agentic RAG 对话</p>
              <p className="text-sm mt-2">
                支持量化分析、合规检查、风控计算、RAG问答、研报生成
              </p>
              <p className="text-xs mt-1 text-gray-300">
                每次对话将展示完整的 Agent 推理、检索、反思过程
              </p>
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
                      : "bg-white border text-gray-800 shadow-sm"
                  }`}
                >
                  {msg.content}
                </div>

                {msg.role === "assistant" && msg.steps && msg.steps.length > 0 && (
                  <AgentStepsPanel steps={msg.steps} iterations={msg.iterations || 0} />
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border rounded-xl px-4 py-3 text-sm text-gray-400 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="animate-pulse">●</span>
                  <span>Agent 思考中...</span>
                </div>
                <div className="text-xs text-gray-300 mt-1">
                  正在执行推理、检索、反思循环
                </div>
              </div>
            </div>
          )}

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
                    {m.name} — {m.description}
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
              placeholder={
                loading
                  ? "等待回复..."
                  : '输入问题，如「计算招商银行的MA20」'
              }
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
  );
}
