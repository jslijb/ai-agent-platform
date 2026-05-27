"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DocInfo {
  id: string;
  fileName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  documentType: string;
  version: number;
  chunkCount: number;
}

interface ReportFile {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  category: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "等待处理", color: "bg-yellow-100 text-yellow-700" },
  processing: { label: "处理中", color: "bg-blue-100 text-blue-700" },
  completed: { label: "已完成", color: "bg-green-100 text-green-700" },
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
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"uploaded" | "reports">("reports");
  const [reportSearch, setReportSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

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

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/document/reports");
      const data = await res.json();
      if (data.success) {
        setReports(data.files || []);
        setReportCategories(data.categories || {});
        setTotalReports(data.totalFiles || 0);
      }
    } catch (err) {
      console.error("获取财报列表失败:", err);
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
      fetchReports();
    }
  }, [authStatus, router, fetchDocs, fetchReports]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/document/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setUploadMsg(`上传成功! 文档ID: ${data.documentId?.substring(0, 12)}..., 分块数: ${data.chunkCount}`);
        await fetchDocs();
      } else {
        setUploadMsg(`上传失败: ${data.message || "未知错误"}`);
      }
    } catch (err) {
      setUploadMsg(`上传异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
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
      } else {
        alert(`删除失败: ${data.message}`);
      }
    } catch (err) {
      alert(`删除异常: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const filteredReports = reports.filter((r) => {
    const matchSearch = !reportSearch || r.name.toLowerCase().includes(reportSearch.toLowerCase());
    const matchCategory = selectedCategory === "all" || r.category === selectedCategory;
    return matchSearch && matchCategory;
  });

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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">文档管理</h1>
          <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition ${
            uploading
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}>
            {uploading ? "上传中..." : "上传文档"}
            <input
              type="file"
              accept=".pdf,.txt,.md,.csv"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
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
                onChange={(e) => setReportSearch(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">全部分类</option>
                {Object.entries(reportCategories).map(([cat, count]) => (
                  <option key={cat} value={cat}>{cat} ({count})</option>
                ))}
              </select>
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b text-sm text-gray-500">
                共 {filteredReports.length} 个财报文件
                {filteredReports.length > 100 && "（仅显示前100个）"}
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
                  {filteredReports.slice(0, 100).map((report, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <span className="text-red-500">PDF</span>
                          <span className="font-medium text-gray-800 truncate max-w-md" title={report.name}>
                            {report.name}
                          </span>
                        </div>
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
            </div>
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg shadow-sm">
            <div className="text-4xl mb-3">📁</div>
            <div className="text-gray-500">暂无上传文档</div>
            <div className="text-gray-400 text-sm mt-1">点击上方"上传文档"按钮添加</div>
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
                    <tr key={doc.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{doc.fileName}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{doc.id.substring(0, 12)}...</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{doc.chunkCount}</td>
                      <td className="px-4 py-3 text-gray-600">{doc.documentType}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(doc.createdAt).toLocaleString("zh-CN")}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
