"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div className="text-center py-8 text-gray-400">加载图谱组件...</div>,
});

interface DocInfo {
  id: string;
  fileName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  documentType: string;
  version: number;
  chunkCount: number;
  metadata?: Record<string, unknown> | null;
}

interface ChunkInfo {
  id: string;
  chunkIndex: number;
  chunkText: string;
  tokenCount: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface EmbeddingItem {
  id: string;
  chunkIndex: number;
  chunkTextPreview: string;
  chunkTextLength: number;
  tokenCount: number | null;
  vectorDim: number;
  vectorPreview: string;
}

interface ChunkingStrategy {
  method: string;
  maxChunkSize: number;
  overlapSize: number;
  minChunkSize: number;
  description: string;
}

interface ReportFile {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  category: string;
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

interface GraphData {
  neo4jAvailable: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    topEntities: Array<{ name: string; degree: number }>;
  };
  message?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "等待处理", color: "bg-yellow-100 text-yellow-700" },
  processing: { label: "处理中", color: "bg-blue-100 text-blue-700" },
  completed: { label: "已完成", color: "bg-green-100 text-green-700" },
  partial: { label: "部分完成", color: "bg-orange-100 text-orange-700" },
  failed: { label: "失败", color: "bg-red-100 text-red-700" },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function DocumentsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [reports, setReports] = useState<ReportFile[]>([]);
  const [reportCategories, setReportCategories] = useState<Record<string, number>>({});
  const [totalReports, setTotalReports] = useState(0);
  const [filteredReportTotal, setFilteredReportTotal] = useState(0);
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize] = useState(50);
  const [reportTotalPages, setReportTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [rebuildingGraph, setRebuildingGraph] = useState<string | null>(null);
  const [rebuildMsg, setRebuildMsg] = useState("");
  const [rebuildingIndex, setRebuildingIndex] = useState<string | null>(null);
  const [rebuildIndexMsg, setRebuildIndexMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"uploaded" | "reports">("reports");
  const [reportSearch, setReportSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDoc, setSelectedDoc] = useState<DocInfo | null>(null);
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [chunkingStrategy, setChunkingStrategy] = useState<ChunkingStrategy | null>(null);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [fullText, setFullText] = useState("");
  const [loadingFullText, setLoadingFullText] = useState(false);
  const [previewTab, setPreviewTab] = useState<"original" | "chunks" | "embeddings" | "graph">("original");
  const [embeddingItems, setEmbeddingItems] = useState<EmbeddingItem[]>([]);
  const [loadingEmbeddings, setLoadingEmbeddings] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const graphRef = useRef<any>(null);
  const [rawTextIsMerged, setRawTextIsMerged] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [pdfPreviewName, setPdfPreviewName] = useState("");
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/document/list");
      const data = await res.json();
      if (data.success) {
        setDocs(data.documents || []);
      }
    } catch (err) {
      console.error("获取文档列表失败:", err);
    }
  }, []);

  const fetchChunks = useCallback(async (docId: string) => {
    setLoadingChunks(true);
    try {
      const res = await fetch(`/api/document/chunks/${docId}`);
      const data = await res.json();
      if (data.success) {
        setChunks(data.chunks || []);
        setChunkingStrategy(data.chunkingStrategy || null);
      } else {
        setChunks([]);
        console.error("获取切片失败:", data.message);
      }
    } catch (err) {
      console.error("获取切片详情失败:", err);
      setChunks([]);
    } finally {
      setLoadingChunks(false);
    }
  }, []);

  const fetchFullText = useCallback(async (docId: string) => {
    setLoadingFullText(true);
    try {
      const res = await fetch(`/api/document/content/${docId}`);
      const data = await res.json();
      if (data.success) {
        setFullText(data.rawText || "");
        setRawTextIsMerged(data.isMerged || false);
      } else {
        setFullText("");
        console.error("获取原文失败:", data.message);
      }
    } catch (err) {
      console.error("获取原文失败:", err);
      setFullText("");
    } finally {
      setLoadingFullText(false);
    }
  }, []);

  const fetchEmbeddings = useCallback(async (docId: string) => {
    setLoadingEmbeddings(true);
    try {
      const res = await fetch(`/api/document/embeddings/${docId}`);
      const data = await res.json();
      if (data.success) {
        setEmbeddingItems(data.embeddings || []);
      } else {
        setEmbeddingItems([]);
        console.error("获取向量数据失败:", data.message);
      }
    } catch (err) {
      console.error("获取向量数据失败:", err);
      setEmbeddingItems([]);
    } finally {
      setLoadingEmbeddings(false);
    }
  }, []);

  const fetchGraph = useCallback(async (docId: string) => {
    setLoadingGraph(true);
    try {
      const res = await fetch(`/api/document/graph/${docId}`);
      const data = await res.json();
      if (data.success) {
        setGraphData(data);
      } else {
        setGraphData(null);
        console.error("获取知识图谱失败:", data.message);
      }
    } catch (err) {
      console.error("获取知识图谱失败:", err);
      setGraphData(null);
    } finally {
      setLoadingGraph(false);
    }
  }, []);

  const handleViewChunks = async (doc: DocInfo) => {
    setSelectedDoc(doc);
    setPreviewTab("original");
    setPreviewError("");
    setChunks([]);
    setFullText("");
    setEmbeddingItems([]);
    setGraphData(null);

    try {
      await Promise.all([fetchChunks(doc.id), fetchFullText(doc.id), fetchEmbeddings(doc.id), fetchGraph(doc.id)]);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleViewGraph = async (doc: DocInfo) => {
    setSelectedDoc(doc);
    setPreviewTab("graph");
    setPreviewError("");
    setChunks([]);
    setFullText("");
    setEmbeddingItems([]);
    setGraphData(null);

    try {
      await Promise.all([fetchChunks(doc.id), fetchFullText(doc.id), fetchEmbeddings(doc.id), fetchGraph(doc.id)]);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCloseChunks = () => {
    setSelectedDoc(null);
    setChunks([]);
    setChunkingStrategy(null);
    setFullText("");
    setEmbeddingItems([]);
    setRawTextIsMerged(false);
    setPreviewError("");
    setExpandedChunks(new Set());
    setGraphData(null);
    setHighlightNodes(new Set());
  };

  const toggleChunk = (index: number) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const expandAllChunks = () => {
    setExpandedChunks(new Set(chunks.map((_, i) => i)));
  };

  const collapseAllChunks = () => {
    setExpandedChunks(new Set());
  };

  const handlePreviewReportPdf = (report: ReportFile) => {
    const encodedPath = report.path.split("/").map(encodeURIComponent).join("/");
    setPdfPreviewUrl(`/api/document/preview/${encodedPath}`);
    setPdfPreviewName(report.name);
  };

  const handlePreviewUploadedPdf = (doc: DocInfo) => {
    setPdfPreviewUrl(`/api/document/uploaded-file/${doc.id}`);
    setPdfPreviewName(doc.fileName);
  };

  const handleClosePdfPreview = () => {
    setPdfPreviewUrl("");
    setPdfPreviewName("");
  };

  const fetchReports = useCallback(async (page: number, search: string, category: string) => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(reportPageSize),
      });
      if (search) params.set("search", search);
      if (category !== "all") params.set("category", category);

      const res = await fetch(`/api/document/reports?${params}`);
      const data = await res.json();
      if (data.success) {
        setReports(data.files || []);
        setReportCategories(data.categories || {});
        setTotalReports(data.totalFiles || 0);
        setFilteredReportTotal(data.filteredTotal || 0);
        setReportTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("获取财报列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, [reportPageSize]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (authStatus === "authenticated") {
      fetchDocs();
      fetchReports(reportPage, reportSearch, selectedCategory);
    }
  }, [authStatus, router, fetchDocs, fetchReports, reportPage, reportSearch, selectedCategory]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newTotal = uploadProgress.total + files.length;
    setUploading(true);
    setUploadMsg("");
    setUploadProgress((prev) => ({ done: prev.done, total: newTotal }));

    const results: Array<{ fileName: string; success: boolean; message: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/document/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.success) {
          const graphInfo = data.graphStatus === "failed"
            ? ` (图谱失败: ${data.graphMessage || "未知"})`
            : data.graphStatus === "no_triples"
            ? " (无三元组)"
            : "";
          results.push({ fileName: file.name, success: true, message: `分块数: ${data.chunkCount}${graphInfo}` });
        } else {
          results.push({ fileName: file.name, success: false, message: data.message || "未知错误" });
        }
      } catch (err) {
        results.push({ fileName: file.name, success: false, message: err instanceof Error ? err.message : String(err) });
      }

      setUploadProgress((prev) => ({ done: prev.done + 1, total: prev.total }));
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    if (failCount === 0) {
      setUploadMsg(`全部上传成功! ${successCount} 个文档已处理`);
    } else {
      const failedNames = results.filter((r) => !r.success).map((r) => r.fileName).join(", ");
      setUploadMsg(`成功 ${successCount} 个, 失败 ${failCount} 个: ${failedNames}`);
    }

    await fetchDocs();
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("确定删除此文档？相关嵌入向量也会一并删除。")) return;

    try {
      const res = await fetch("/api/document/list", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      const data = await res.json();
      if (data.success) {
        setDocs((prev) => prev.filter((d) => d.id !== docId));
        if (selectedDoc?.id === docId) {
          handleCloseChunks();
        }
      } else {
        alert(`删除失败: ${data.message}`);
      }
    } catch (err) {
      alert(`删除异常: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRebuildGraph = async (docId: string) => {
    setRebuildingGraph(docId);
    setRebuildMsg("");
    try {
      const res = await fetch(`/api/document/rebuild-graph/${docId}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setRebuildMsg(`知识图谱重建成功! 提取到 ${data.tripleCount} 个三元组`);
        await fetchDocs();
        if (selectedDoc?.id === docId) {
          await fetchGraph(docId);
        }
      } else {
        setRebuildMsg(`重建失败: ${data.message}`);
      }
    } catch (err) {
      setRebuildMsg(`重建异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRebuildingGraph(null);
      setTimeout(() => setRebuildMsg(""), 8000);
    }
  };

  const handleRebuildIndex = async (docId: string) => {
    setRebuildingIndex(docId);
    setRebuildIndexMsg("");
    try {
      const res = await fetch("/api/document/rebuild-index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      const data = await res.json();
      if (data.success) {
        const details = data.results?.map((r: any) => `${r.fileName}: ${r.oldChunks}→${r.newChunks} chunks`).join("; ");
        setRebuildIndexMsg(`索引重建成功! ${details}`);
        await fetchDocs();
        if (selectedDoc?.id === docId) {
          await fetchChunks(docId);
        }
      } else {
        setRebuildIndexMsg(`重建失败: ${data.message}`);
      }
    } catch (err) {
      setRebuildIndexMsg(`重建异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRebuildingIndex(null);
      setTimeout(() => setRebuildIndexMsg(""), 8000);
    }
  };

  const handleRebuildAllIndex = async () => {
    if (!confirm("确定重建所有文档的索引？这将删除所有旧的 Embedding 并重新切片和生成向量。")) return;
    setRebuildingIndex("all");
    setRebuildIndexMsg("");
    try {
      const res = await fetch("/api/document/rebuild-index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        const details = data.results?.map((r: any) => `${r.fileName}: ${r.oldChunks}→${r.newChunks} chunks`).join("; ");
        setRebuildIndexMsg(`全部索引重建成功! ${details}`);
        await fetchDocs();
      } else {
        setRebuildIndexMsg(`重建失败: ${data.message}`);
      }
    } catch (err) {
      setRebuildIndexMsg(`重建异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRebuildingIndex(null);
      setTimeout(() => setRebuildIndexMsg(""), 8000);
    }
  };

  const handleReportSearch = (value: string) => {
    setReportSearch(value);
    setReportPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setReportPage(1);
  };

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
              <span className="text-gray-600 text-sm">文档管理</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/chat" className="text-gray-600 hover:text-gray-900 text-sm">
                智能对话
              </Link>
              <Link href="/dashboard/evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                RAG 评估
              </Link>
              <Link href="/dashboard/agent-evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 评估
              </Link>
              <Link href="/dashboard/logs" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 日志
              </Link>
              <Link href="/dashboard/token-usage" className="text-gray-600 hover:text-gray-900 text-sm">
                Token 用量
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
          <h1 className="text-2xl font-bold text-gray-800">文档管理</h1>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRebuildAllIndex}
              disabled={rebuildingIndex !== null}
              className="px-3 py-1.5 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rebuildingIndex === "all" ? "重建中..." : "重建全部索引"}
            </button>
            <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition ${
              uploading
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}>
              {uploading ? `上传中 (${uploadProgress.done}/${uploadProgress.total})...` : "上传文档"}
              <input
                type="file"
                accept=".pdf,.txt,.md,.csv"
                multiple
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {uploadMsg && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            uploadMsg.includes("成功")
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}>
            {uploadMsg}
          </div>
        )}

        {rebuildMsg && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            rebuildMsg.includes("成功")
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}>
            {rebuildMsg}
          </div>
        )}

        {rebuildIndexMsg && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            rebuildIndexMsg.includes("成功")
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}>
            {rebuildIndexMsg}
          </div>
        )}

        <div className="flex space-x-1 mb-6 bg-gray-200 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === "reports"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            本地财报 ({totalReports})
          </button>
          <button
            onClick={() => setActiveTab("uploaded")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === "uploaded"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            已上传文档 ({docs.length})
          </button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">加载中...</div>
        ) : activeTab === "reports" ? (
          <div>
            <div className="flex items-center space-x-4 mb-4">
              <input
                type="text"
                placeholder="搜索财报文件名..."
                value={reportSearch}
                onChange={(e) => handleReportSearch(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">全部分类</option>
                {Object.entries(reportCategories).map(([cat, count]) => (
                  <option key={cat} value={cat}>{cat} ({count})</option>
                ))}
              </select>
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b text-sm text-gray-500 flex items-center justify-between">
                <span>
                  共 {filteredReportTotal} 个财报文件
                  {reportSearch || selectedCategory !== "all" ? ` (总计 ${totalReports})` : ""}
                </span>
                <span className="text-xs text-gray-400">
                  第 {reportPage}/{reportTotalPages} 页
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">文件名</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">分类</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">大小</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">修改时间</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handlePreviewReportPdf(report)}
                          className="flex items-center space-x-2 text-left hover:bg-blue-50 rounded px-1 py-0.5 -mx-1 transition"
                          title="点击预览PDF"
                        >
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white leading-none">PDF</span>
                          <span className="font-medium text-blue-600 hover:text-blue-800 hover:underline truncate max-w-md">
                            {report.name}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          {report.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatSize(report.size)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(report.modifiedAt).toLocaleString("zh-CN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportTotalPages > 1 && (
                <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    每页 {reportPageSize} 条
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setReportPage(1)}
                      disabled={reportPage === 1}
                      className="px-3 py-1 rounded border text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      首页
                    </button>
                    <button
                      onClick={() => setReportPage((p) => Math.max(1, p - 1))}
                      disabled={reportPage === 1}
                      className="px-3 py-1 rounded border text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      上一页
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-600">
                      {reportPage} / {reportTotalPages}
                    </span>
                    <button
                      onClick={() => setReportPage((p) => Math.min(reportTotalPages, p + 1))}
                      disabled={reportPage === reportTotalPages}
                      className="px-3 py-1 rounded border text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      下一页
                    </button>
                    <button
                      onClick={() => setReportPage(reportTotalPages)}
                      disabled={reportPage === reportTotalPages}
                      className="px-3 py-1 rounded border text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      末页
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg shadow-sm">
            <div className="text-4xl mb-3">📁</div>
            <div className="text-gray-500">暂无上传文档</div>
            <div className="text-gray-400 text-sm mt-1">点击上方&ldquo;上传文档&rdquo;按钮添加</div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">文件名</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">状态</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">分块数</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">类型</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">上传时间</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => {
                  const st = STATUS_MAP[doc.status] || { label: doc.status, color: "bg-gray-100 text-gray-600" };
                  return (
                    <tr key={doc.id} className={`border-b hover:bg-gray-50 ${selectedDoc?.id === doc.id ? "bg-blue-50" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{doc.fileName}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{doc.id.substring(0, 12)}...</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>
                          {st.label}
                        </span>
                        {doc.status === "partial" && doc.metadata && typeof doc.metadata === "object" && "graphMessage" in doc.metadata && (
                          <div className="text-xs text-orange-500 mt-1" title={String(doc.metadata.graphMessage)}>
                            图谱: {String(doc.metadata.graphMessage).slice(0, 30)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{doc.chunkCount}</td>
                      <td className="px-4 py-3 text-gray-600">{doc.documentType}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(doc.createdAt).toLocaleString("zh-CN")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          {doc.fileName.toLowerCase().endsWith(".pdf") ? (
                            <button
                              onClick={() => handlePreviewUploadedPdf(doc)}
                              className="text-blue-500 hover:text-blue-700 text-xs font-medium"
                            >
                              预览PDF
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleViewChunks(doc)}
                            className="text-green-600 hover:text-green-800 text-xs font-medium"
                          >
                            原文/切片
                          </button>
                          <button
                            onClick={() => handleViewGraph(doc)}
                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                          >
                            查看图谱
                          </button>
                          <button
                            onClick={() => handleRebuildGraph(doc.id)}
                            disabled={rebuildingGraph === doc.id}
                            className="text-purple-600 hover:text-purple-800 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {rebuildingGraph === doc.id ? "重建中..." : "重建图谱"}
                          </button>
                          <button
                            onClick={() => handleRebuildIndex(doc.id)}
                            disabled={rebuildingIndex === doc.id}
                            className="text-amber-600 hover:text-amber-800 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {rebuildingIndex === doc.id ? "重建中..." : "重建索引"}
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedDoc && (
          <div className="mt-6 bg-white rounded-lg shadow-sm border">
            <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  文档预览: {selectedDoc.fileName}
                </h3>
                <span className="text-xs text-gray-500">
                  {selectedDoc.chunkCount} 个切片 | 状态: {STATUS_MAP[selectedDoc.status]?.label || selectedDoc.status}
                </span>
              </div>
              <button
                onClick={handleCloseChunks}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕ 关闭
              </button>
            </div>

            {previewError && (
              <div className="px-4 py-3 bg-red-50 border-b text-sm text-red-700">
                预览加载出错: {previewError}
              </div>
            )}

            {selectedDoc.status !== "completed" && (
              <div className="px-4 py-3 bg-amber-50 border-b text-sm text-amber-700">
                ⚠️ 文档状态为「{STATUS_MAP[selectedDoc.status]?.label || selectedDoc.status}」，预览数据可能不完整
              </div>
            )}

            <div className="flex space-x-1 px-4 pt-3 bg-gray-50 border-b">
              <button
                onClick={() => setPreviewTab("original")}
                className={`px-4 py-2 rounded-t-md text-sm font-medium transition ${
                  previewTab === "original"
                    ? "bg-white text-gray-800 border border-b-white -mb-px"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                📄 原文预览
              </button>
              <button
                onClick={() => setPreviewTab("chunks")}
                className={`px-4 py-2 rounded-t-md text-sm font-medium transition ${
                  previewTab === "chunks"
                    ? "bg-white text-gray-800 border border-b-white -mb-px"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                ✂️ 切片预览 ({chunks.length})
              </button>
              <button
                onClick={() => setPreviewTab("embeddings")}
                className={`px-4 py-2 rounded-t-md text-sm font-medium transition ${
                  previewTab === "embeddings"
                    ? "bg-white text-gray-800 border border-b-white -mb-px"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                🧮 向量库 ({embeddingItems.length})
              </button>
              <button
                onClick={() => setPreviewTab("graph")}
                className={`px-4 py-2 rounded-t-md text-sm font-medium transition ${
                  previewTab === "graph"
                    ? "bg-white text-gray-800 border border-b-white -mb-px"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                🔗 知识图谱 {graphData?.neo4jAvailable ? `(${graphData.stats.nodeCount})` : ""}
              </button>
            </div>

            {previewTab === "original" ? (
              loadingFullText ? (
                <div className="text-center py-8 text-gray-400">
                  <div className="inline-block w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2" />
                  <div>加载原文中...</div>
                </div>
              ) : fullText ? (
                <div className="p-4 max-h-[500px] overflow-y-auto">
                  {rawTextIsMerged && (
                    <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                      ⚠️ 该文档上传时未保存原文，当前显示为切片合并内容。重新上传可保存完整原文。
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mb-2">共 {fullText.length} 字符</div>
                  <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-4 border">
                    {fullText}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <div className="text-2xl mb-2">📄</div>
                  <div>暂无原文内容</div>
                  <div className="text-xs mt-1">该文档可能未成功处理，或上传时未保存原文</div>
                </div>
              )
            ) : previewTab === "chunks" ? (
              <>
                {chunkingStrategy && (
                  <div className="px-4 py-3 bg-blue-50 border-b text-xs text-blue-700">
                    <span className="font-medium">切片策略:</span>{" "}
                    {chunkingStrategy.description}
                    <span className="ml-3">maxChunkSize={chunkingStrategy.maxChunkSize}</span>
                    <span className="ml-2">overlapSize={chunkingStrategy.overlapSize}</span>
                    <span className="ml-2">minChunkSize={chunkingStrategy.minChunkSize}</span>
                  </div>
                )}

                {loadingChunks ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="inline-block w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2" />
                    <div>加载切片中...</div>
                  </div>
                ) : chunks.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-2xl mb-2">✂️</div>
                    <div>暂无切片数据</div>
                    <div className="text-xs mt-1">文档可能未完成切片处理</div>
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto">
                    <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between sticky top-0 z-10">
                      <span className="text-xs text-gray-500">共 {chunks.length} 个切片</span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={expandAllChunks}
                          className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition"
                        >
                          全部展开
                        </button>
                        <button
                          onClick={collapseAllChunks}
                          className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition"
                        >
                          全部收起
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {chunks.map((chunk, idx) => {
                        const isExpanded = expandedChunks.has(idx);
                        const previewLen = 150;
                        const isLong = chunk.chunkText.length > previewLen;
                        return (
                          <div
                            key={chunk.id}
                            className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition ${isExpanded ? "bg-blue-50/40" : ""}`}
                            onClick={() => toggleChunk(idx)}
                          >
                            <div className="flex items-start space-x-3">
                              <div className="flex-shrink-0 mt-0.5">
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                                  {chunk.chunkIndex}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                {isExpanded ? (
                                  <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed bg-white rounded-lg p-3 border border-gray-200">
                                    {chunk.chunkText}
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-600 leading-relaxed">
                                    {isLong
                                      ? chunk.chunkText.substring(0, previewLen) + "..."
                                      : chunk.chunkText}
                                  </div>
                                )}
                              </div>
                              <div className="flex-shrink-0 flex items-center space-x-2">
                                {chunk.tokenCount != null && (
                                  <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                                    {chunk.tokenCount} tokens
                                  </span>
                                )}
                                <span className="text-gray-400 text-xs">
                                  {isExpanded ? "▲" : "▼"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : previewTab === "embeddings" ? (
              <>
                {loadingEmbeddings ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="inline-block w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2" />
                    <div>加载向量数据中...</div>
                  </div>
                ) : embeddingItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-2xl mb-2">🧮</div>
                    <div>暂无向量数据</div>
                    <div className="text-xs mt-1">文档可能未完成向量化处理</div>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2 bg-green-50 border-b text-xs text-green-700">
                      ✅ 已存储到向量库，共 {embeddingItems.length} 条向量记录
                      {embeddingItems[0] && ` | 向量维度: ${embeddingItems[0].vectorDim}`}
                    </div>
                    <div className="max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="border-b">
                            <th className="text-left px-4 py-2 text-gray-600 font-medium w-16">#</th>
                            <th className="text-left px-4 py-2 text-gray-600 font-medium">切片预览</th>
                            <th className="text-right px-4 py-2 text-gray-600 font-medium w-16">字符</th>
                            <th className="text-right px-4 py-2 text-gray-600 font-medium w-16">Token</th>
                            <th className="text-right px-4 py-2 text-gray-600 font-medium w-20">维度</th>
                            <th className="text-left px-4 py-2 text-gray-600 font-medium">向量预览</th>
                          </tr>
                        </thead>
                        <tbody>
                          {embeddingItems.map((item) => (
                            <tr key={item.id} className="border-b hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-500">{item.chunkIndex}</td>
                              <td className="px-4 py-2 text-gray-700 max-w-xs truncate text-xs" title={item.chunkTextPreview}>
                                {item.chunkTextPreview}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-500 text-xs">{item.chunkTextLength}</td>
                              <td className="px-4 py-2 text-right text-gray-500 text-xs">{item.tokenCount ?? "-"}</td>
                              <td className="px-4 py-2 text-right text-gray-500 text-xs">{item.vectorDim || "-"}</td>
                              <td className="px-4 py-2 text-gray-400 text-xs font-mono">{item.vectorPreview || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {loadingGraph ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="inline-block w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2" />
                    <div>加载知识图谱中...</div>
                  </div>
                ) : !graphData?.neo4jAvailable ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">🔗</div>
                    <div className="text-gray-500 font-medium">知识图谱不可用</div>
                    <div className="text-gray-400 text-sm mt-2 max-w-md mx-auto">
                      {graphData?.message || "Neo4j 服务未启动，知识图谱数据不可用。"}
                    </div>
                    <div className="text-gray-400 text-xs mt-3">
                      修复方法：启动 Neo4j 服务后重新上传文档
                    </div>
                  </div>
                ) : graphData.nodes.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">🔗</div>
                    <div className="text-gray-500">暂无知识图谱数据</div>
                    <div className="text-gray-400 text-sm mt-1">该文档未提取到实体和关系</div>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2 bg-purple-50 border-b text-xs text-purple-700 flex items-center justify-between">
                      <span>
                        📊 实体数: {graphData.stats.nodeCount} | 关系数: {graphData.stats.edgeCount}
                        {graphData.stats.topEntities.length > 0 && (
                          <> | Top实体: {graphData.stats.topEntities.slice(0, 5).map((e) => `${e.name}(${e.degree})`).join(", ")}</>
                        )}
                      </span>
                      <span className="text-purple-500">拖拽节点 · 滚轮缩放 · 悬停高亮</span>
                    </div>
                    <div className="bg-gray-50" style={{ height: 500 }}>
                      <ForceGraph2D
                        ref={graphRef}
                        graphData={{
                          nodes: graphData.nodes.map((n) => ({
                            id: n.id,
                            label: n.label,
                            val: (graphData.stats.topEntities.find((e) => e.name === n.id)?.degree || 1) + 2,
                          })),
                          links: graphData.edges.map((e) => ({
                            source: e.source,
                            target: e.target,
                            label: e.relation,
                          })),
                        }}
                        nodeId="id"
                        nodeLabel="label"
                        nodeVal="val"
                        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                          const label = node.label || node.id;
                          const fontSize = Math.max(10 / globalScale, 4);
                          const isHighlighted = highlightNodes.has(node.id);
                          const nodeR = Math.max(Math.cbrt(node.val || 1) * 3, 4 / globalScale);

                          ctx.beginPath();
                          ctx.arc(node.x!, node.y!, nodeR, 0, 2 * Math.PI);
                          ctx.fillStyle = isHighlighted ? "#7c3aed" : "#8b5cf6";
                          ctx.fill();
                          ctx.strokeStyle = isHighlighted ? "#5b21b6" : "#7c3aed";
                          ctx.lineWidth = isHighlighted ? 2 / globalScale : 0.5 / globalScale;
                          ctx.stroke();

                          if (fontSize > 3) {
                            ctx.font = `${fontSize}px Sans-Serif`;
                            ctx.textAlign = "center";
                            ctx.textBaseline = "top";
                            ctx.fillStyle = isHighlighted ? "#1f2937" : "#6b7280";
                            ctx.fillText(label, node.x!, node.y! + nodeR + 2 / globalScale);
                          }
                        }}
                        linkLabel="label"
                        linkCanvasObjectMode={() => "after"}
                        linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                          const label = link.label;
                          if (!label || globalScale < 0.5) return;
                          const fontSize = Math.max(8 / globalScale, 3);
                          if (fontSize < 3) return;
                          const midX = (link.source.x! + link.target.x!) / 2;
                          const midY = (link.source.y! + link.target.y!) / 2;
                          ctx.font = `${fontSize}px Sans-Serif`;
                          ctx.textAlign = "center";
                          ctx.textBaseline = "bottom";
                          ctx.fillStyle = "#9ca3af";
                          ctx.fillText(label, midX, midY - 2 / globalScale);
                        }}
                        linkColor={() => "#d1d5db"}
                        linkWidth={0.5}
                        linkDirectionalArrowLength={3}
                        linkDirectionalArrowRelPos={1}
                        onNodeHover={(node: any) => {
                          if (!node) {
                            setHighlightNodes(new Set());
                            return;
                          }
                          const connected = new Set<string>();
                          connected.add(node.id);
                          graphData.edges.forEach((e) => {
                            if (e.source === node.id) connected.add(e.target);
                            if (e.target === node.id) connected.add(e.source);
                          });
                          setHighlightNodes(connected);
                        }}
                        cooldownTicks={100}
                        enableNodeDrag={true}
                        enableZoomInteraction={true}
                        enablePanInteraction={true}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
        </>
        )}
      </main>

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
          <div className="flex items-center justify-between bg-white px-4 py-3 shadow-md">
            <div className="flex items-center space-x-3">
              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-500 text-white">PDF</span>
              <h3 className="font-semibold text-gray-800 truncate max-w-xl">{pdfPreviewName}</h3>
            </div>
            <button
              onClick={handleClosePdfPreview}
              className="text-gray-500 hover:text-gray-800 text-2xl leading-none px-2"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 bg-gray-200">
            <iframe
              src={pdfPreviewUrl}
              className="w-full h-full border-0"
              title={pdfPreviewName}
            />
          </div>
        </div>
      )}
    </div>
  );
}
