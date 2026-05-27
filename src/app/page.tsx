import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SignOutButton from "@/app/dashboard/SignOutButton";
import { db, sql } from "@/server/db/client";

interface HealthCheck {
  status: string;
  latency?: number;
  error?: string;
}

interface HealthResult {
  status: string;
  checks: Record<string, HealthCheck>;
}

const HEALTH_TIMEOUT_MS = 2000;
const HEALTH_TIMEOUT_MS_LLM = 3000;

async function checkDatabase(): Promise<{ key: string; check: HealthCheck }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    console.log(`[health] database: ${Date.now() - start}ms`);
    return { key: "database", check: { status: "up", latency: Date.now() - start } };
  } catch (e) {
    console.error(`[health] database FAILED:`, e instanceof Error ? e.message : e);
    return { key: "database", check: { status: "down", error: "连接失败" } };
  }
}

async function checkNeo4j(): Promise<{ key: string; check: HealthCheck }> {
  const start = Date.now();
  try {
    const neo4jUrl = process.env.NEO4J_URI || "bolt://localhost:7687";
    const neo4jUser = process.env.NEO4J_USER || "neo4j";
    const neo4jPass = process.env.NEO4J_PASSWORD || "test1234";
    const { default: neo4j } = await import("neo4j-driver");
    const driver = neo4j.driver(neo4jUrl, neo4j.auth.basic(neo4jUser, neo4jPass));
    const session = driver.session();
    try {
      await session.run("RETURN 1");
      console.log(`[health] neo4j: ${Date.now() - start}ms`);
      return { key: "neo4j", check: { status: "up", latency: Date.now() - start } };
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (e) {
    console.error(`[health] neo4j FAILED:`, e instanceof Error ? e.message : e);
    return { key: "neo4j", check: { status: "down", error: e instanceof Error ? e.message : String(e) } };
  }
}

async function checkEmbedding(): Promise<{ key: string; check: HealthCheck }> {
  const start = Date.now();
  try {
    const response = await fetch("http://localhost:8011/v1/models", {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (response.ok) {
      console.log(`[health] embedding: ${Date.now() - start}ms`);
      return { key: "embedding", check: { status: "up", latency: Date.now() - start } };
    } else {
      console.error(`[health] embedding FAILED: HTTP ${response.status}`);
      return { key: "embedding", check: { status: "down", error: `HTTP ${response.status}` } };
    }
  } catch (e) {
    console.error(`[health] embedding FAILED:`, e instanceof Error ? e.message : e);
    return { key: "embedding", check: { status: "down", error: e instanceof Error ? e.message : String(e) } };
  }
}

async function checkReranker(): Promise<{ key: string; check: HealthCheck }> {
  const start = Date.now();
  try {
    const rerankerUrl = process.env.RERANKER_URL || "http://localhost:8010";
    const response = await fetch(`${rerankerUrl}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (response.ok) {
      console.log(`[health] reranker: ${Date.now() - start}ms`);
      return { key: "reranker", check: { status: "up", latency: Date.now() - start } };
    } else {
      console.error(`[health] reranker FAILED: HTTP ${response.status}`);
      return { key: "reranker", check: { status: "down", error: `HTTP ${response.status}` } };
    }
  } catch (e) {
    console.error(`[health] reranker FAILED:`, e instanceof Error ? e.message : e);
    return { key: "reranker", check: { status: "down", error: e instanceof Error ? e.message : String(e) } };
  }
}

async function checkLLM(): Promise<{ key: string; check: HealthCheck }> {
  const start = Date.now();
  try {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      console.error(`[health] llm FAILED: API Key 未配置`);
      return { key: "llm", check: { status: "down", error: "API Key 未配置" } };
    }
    const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS_LLM),
    });
    if (response.ok) {
      console.log(`[health] llm: ${Date.now() - start}ms`);
      return { key: "llm", check: { status: "up", latency: Date.now() - start } };
    } else {
      console.error(`[health] llm FAILED: HTTP ${response.status}`);
      return { key: "llm", check: { status: "down", error: `HTTP ${response.status}` } };
    }
  } catch (e) {
    console.error(`[health] llm FAILED:`, e instanceof Error ? e.message : e);
    return { key: "llm", check: { status: "down", error: e instanceof Error ? e.message : String(e) } };
  }
}

async function getSystemHealth(): Promise<HealthResult> {
  const start = Date.now();
  const results = await Promise.all([
    checkDatabase(),
    checkNeo4j(),
    checkEmbedding(),
    checkReranker(),
    checkLLM(),
  ]);

  const checks: Record<string, HealthCheck> = {};
  let overallStatus = "healthy";
  for (const { key, check } of results) {
    checks[key] = check;
    if (check.status !== "up") {
      overallStatus = "degraded";
    }
  }
  console.log(`[health] all checks completed in ${Date.now() - start}ms`);
  return { status: overallStatus, checks };
}

const serviceLabels: Record<string, { name: string; tech: string }> = {
  database: { name: "数据库", tech: "PostgreSQL" },
  neo4j: { name: "图数据库", tech: "Neo4j" },
  embedding: { name: "向量服务", tech: "BGE-M3" },
  reranker: { name: "重排序", tech: "BGE-Reranker" },
  llm: { name: "大模型", tech: "百炼 DeepSeek" },
};

async function HealthPanel() {
  const health = await getSystemHealth();

  return (
    <div className="mt-8 bg-white rounded-xl shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          系统状态
        </h2>
        <span className={`text-xs px-2 py-1 rounded font-medium ${
          health.status === "healthy"
            ? "bg-green-100 text-green-700"
            : "bg-amber-100 text-amber-700"
        }`}>
          {health.status === "healthy" ? "全部正常" : "部分异常"}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        {Object.entries(serviceLabels).map(([key, label]) => {
          const check = health.checks[key];
          const isUp = check?.status === "up";
          return (
            <div key={key} className={`text-center p-3 rounded-lg border ${
              isUp ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
            }`}>
              <div className="font-medium text-gray-600">{label.name}</div>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <span className={`inline-block w-2 h-2 rounded-full ${isUp ? "bg-green-500" : "bg-red-500"}`} />
                <span className={isUp ? "text-green-600" : "text-red-600"}>
                  {isUp ? "运行中" : "不可用"}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{label.tech}</div>
              {check?.latency != null && (
                <div className="text-xs text-gray-400 mt-0.5">{check.latency}ms</div>
              )}
              {check?.error && (
                <div className="text-xs text-red-400 mt-0.5 truncate" title={check.error}>
                  {check.error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HealthPanelFallback() {
  return (
    <div className="mt-8 bg-white rounded-xl shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">系统状态</h2>
        <span className="text-xs px-2 py-1 rounded font-medium bg-gray-100 text-gray-500">
          检测中...
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        {Object.entries(serviceLabels).map(([key, label]) => (
          <div key={key} className="text-center p-3 rounded-lg border bg-gray-50 border-gray-200 animate-pulse">
            <div className="font-medium text-gray-600">{label.name}</div>
            <div className="text-xs text-gray-400 mt-1">{label.tech}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function HomePage() {
  const t0 = Date.now();
  console.log(`[page] HomePage start`);
  const session = await auth();
  console.log(`[page] auth() took ${Date.now() - t0}ms, session=${!!session?.user}`);

  if (!session?.user) {
    console.log(`[page] no session, redirecting to /login, total=${Date.now() - t0}ms`);
    redirect("/login");
  }

  const isAdmin = session.user.role === "admin";
  console.log(`[page] user role=${session.user.role}, isAdmin=${isAdmin}`);

  const features = isAdmin ? [
    {
      title: "RAG 智能问答",
      desc: "基于文档库的检索增强生成，支持混合检索、重排序、图谱推理",
      href: "/chat",
      icon: "💬",
      color: "blue",
    },
    {
      title: "文档管理",
      desc: "上传 PDF/TXT 文档，自动解析、切片、向量化、索引构建",
      href: "/dashboard/documents",
      icon: "📁",
      color: "green",
    },
    {
      title: "Agent 对话",
      desc: "量化分析、合规检查、风控计算、研报生成等多 Agent 协作",
      href: "/chat",
      icon: "🤖",
      color: "purple",
    },
    {
      title: "RAG 评估",
      desc: "检索质量评估、Hits@K、Faithfulness 等指标监控",
      href: "/dashboard/evaluation",
      icon: "📊",
      color: "orange",
    },
  ] : [
    {
      title: "RAG 智能问答",
      desc: "基于文档库的检索增强生成，支持混合检索、重排序、图谱推理",
      href: "/chat",
      icon: "💬",
      color: "blue",
    },
    {
      title: "Token 用量",
      desc: "查看各模型 Token 消耗统计",
      href: "/dashboard/token-usage",
      icon: "💰",
      color: "teal",
    },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200 hover:border-blue-400",
    green: "bg-green-50 border-green-200 hover:border-green-400",
    purple: "bg-purple-50 border-purple-200 hover:border-purple-400",
    orange: "bg-orange-50 border-orange-200 hover:border-orange-400",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <span className="text-xl font-bold text-gray-800">
                AI Agent Platform
              </span>
              <div className="hidden md:flex space-x-4">
                <a
                  href="/chat"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
                >
                  对话
                </a>
                <a
                  href="/dashboard"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
                >
                  控制台
                </a>
                <a
                  href="/dashboard/evaluation"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
                >
                  评估
                </a>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600 text-sm">
                {session.user.name}
              </span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">
            欢迎回来，{session.user.name}
          </h1>
          <p className="text-gray-500 mt-1">
            选择下方功能开始使用
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f) => (
            <a
              key={f.title}
              href={f.href}
              className={`block border-2 rounded-xl p-6 transition-colors ${
                colorMap[f.color] || colorMap.blue
              }`}
            >
              <div className="flex items-start space-x-4">
                <span className="text-3xl">{f.icon}</span>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    {f.title}
                  </h3>
                  <p className="text-gray-500 text-sm mt-1">{f.desc}</p>
                </div>
              </div>
            </a>
          ))}
        </div>

        {isAdmin && (
          <Suspense fallback={<HealthPanelFallback />}>
            <HealthPanel />
          </Suspense>
        )}
      </main>
    </div>
  );
}
