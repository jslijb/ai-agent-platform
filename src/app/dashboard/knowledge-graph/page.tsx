"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

// react-force-graph-2d 依赖 canvas，必须关闭 SSR
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      图谱组件加载中...
    </div>
  ),
});

interface DocInfo {
  id: string;
  fileName: string;
  status: string;
  documentType: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  topEntities: Array<{ name: string; degree: number }>;
  labelStats: Record<string, number>;
}

interface GraphResponse {
  success: boolean;
  neo4jAvailable: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
  message?: string;
}

// 实体类型 → 颜色（中国股市惯例无关，仅分类用色）
const TYPE_COLORS: Record<string, string> = {
  Company: "#e11d48",
  Indicator: "#2563eb",
  Product: "#7c3aed",
  Location: "#059669",
  Amount: "#92400e",
  Person: "#db2777",
  Entity: "#64748b",
};

const RELATION_COLORS: Record<string, string> = {
  增长: "#dc2626",
  下降: "#16a34a",
  持股: "#7c3aed",
  生产: "#2563eb",
};

export default function KnowledgeGraphPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();

  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(""); // 空 = 全局图谱
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphEdge[] }>({
    nodes: [],
    links: [],
  });
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [neo4jAvailable, setNeo4jAvailable] = useState(true);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/document/list");
      const data = await res.json();
      if (data.success) setDocs(data.documents || []);
    } catch (err) {
      console.error("获取文档列表失败:", err);
    }
  }, []);

  const fetchGraph = useCallback(async (docId: string) => {
    setLoading(true);
    setMessage("");
    try {
      const url = docId
        ? `/api/graph?documentId=${encodeURIComponent(docId)}`
        : "/api/graph";
      const res = await fetch(url);
      const data: GraphResponse = await res.json();
      setNeo4jAvailable(data.neo4jAvailable);
      if (data.success) {
        setGraphData({ nodes: data.nodes, links: data.edges });
        setStats(data.stats);
        if (!data.neo4jAvailable && data.message) setMessage(data.message);
      } else {
        setMessage(data.message || "获取图谱数据失败");
      }
    } catch (err) {
      setMessage(`获取图谱异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (authStatus === "authenticated") {
      fetchDocs();
      fetchGraph("");
    }
  }, [authStatus, router, fetchDocs, fetchGraph]);

  // 容器尺寸自适应
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setDimensions({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSelectDoc = (docId: string) => {
    setSelectedDocId(docId);
    fetchGraph(docId);
  };

  const nodeColor = useCallback((node: object) => {
    const n = node as GraphNode;
    return TYPE_COLORS[n.type] || TYPE_COLORS.Entity;
  }, []);

  const linkColor = useCallback((link: object) => {
    const l = link as GraphEdge;
    return RELATION_COLORS[l.relation] || "#cbd5e1";
  }, []);

  if (authStatus === "unauthenticated") return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-xl font-bold text-gray-800 hover:text-gray-600">
                AI Agent Platform
              </Link>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600 text-sm">知识图谱</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/chat" className="text-gray-600 hover:text-gray-900 text-sm">
                对话
              </Link>
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-900 text-sm">
                控制台
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
            <h1 className="text-2xl font-bold text-gray-800 mb-4">知识图谱</h1>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                value={selectedDocId}
                onChange={(e) => handleSelectDoc(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全局图谱（全量文档）</option>
                {docs.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.fileName}
                  </option>
                ))}
              </select>
              {stats && (
                <span className="text-sm text-gray-500">
                  节点 <b className="text-gray-700">{stats.nodeCount}</b> · 关系{" "}
                  <b className="text-gray-700">{stats.edgeCount}</b>
                </span>
              )}
              {Object.entries(stats?.labelStats || {}).map(([label, count]) => (
                <span key={label} className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: TYPE_COLORS[label] || TYPE_COLORS.Entity }}
                  />
                  {label} ({count})
                </span>
              ))}
            </div>

            {message && (
              <div className="mb-4 p-3 rounded-lg text-sm bg-yellow-50 border border-yellow-200 text-yellow-700">
                {message}
              </div>
            )}

            {!neo4jAvailable ? (
              <div className="bg-white rounded-lg shadow-sm py-20 text-center text-gray-400">
                <div className="text-4xl mb-3">🕸️</div>
                <div>Neo4j 服务不可用</div>
                <div className="text-sm mt-1 text-gray-400">
                  启动 Docker Desktop 并执行 docker compose up -d 后刷新本页
                </div>
              </div>
            ) : loading ? (
              <div className="bg-white rounded-lg shadow-sm py-20 text-center text-gray-400">
                <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-4" />
                <p className="text-sm">加载图谱数据...</p>
              </div>
            ) : graphData.nodes.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm py-20 text-center text-gray-400">
                <div className="text-4xl mb-3">🕸️</div>
                <div>暂无图谱数据</div>
                <div className="text-sm mt-1 text-gray-400">
                  上传文档并等待抽取完成后查看，或切换到全局图谱
                </div>
              </div>
            ) : (
              <div className="flex gap-4">
                <div
                  ref={containerRef}
                  className="bg-white rounded-lg shadow-sm border h-[600px] flex-1 overflow-hidden"
                >
                  <ForceGraph2D
                    graphData={graphData}
                    width={dimensions.width}
                    height={dimensions.height}
                    nodeLabel="label"
                    nodeColor={nodeColor}
                    nodeVal={(node: object) => {
                      const n = node as GraphNode;
                      return stats?.topEntities.find((t) => t.name === n.label)?.degree ?? 3;
                    }}
                    nodeRelSize={5}
                    onNodeHover={(node: object | null) =>
                      setHoveredNode(node as GraphNode | null)
                    }
                    linkColor={linkColor}
                    linkLabel="relation"
                    linkDirectionalArrowLength={4}
                    linkDirectionalArrowRelPos={1}
                    linkWidth={1}
                    cooldownTicks={120}
                  />
                </div>

                <div className="w-64 shrink-0 space-y-4">
                  {hoveredNode && (
                    <div className="bg-white rounded-lg shadow-sm border p-3">
                      <div className="text-xs text-gray-400 mb-1">当前悬停</div>
                      <div className="font-medium text-gray-800 text-sm break-all">
                        {hoveredNode.label}
                      </div>
                      <span
                        className="inline-block mt-1 px-2 py-0.5 rounded text-xs text-white"
                        style={{ backgroundColor: TYPE_COLORS[hoveredNode.type] || TYPE_COLORS.Entity }}
                      >
                        {hoveredNode.type}
                      </span>
                    </div>
                  )}

                  <div className="bg-white rounded-lg shadow-sm border p-3">
                    <div className="text-xs text-gray-400 mb-2">度数 Top 20 实体</div>
                    <div className="space-y-1.5">
                      {stats?.topEntities.map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700 truncate mr-2" title={t.name}>
                            {t.name}
                          </span>
                          <span className="text-gray-400 shrink-0">{t.degree}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
