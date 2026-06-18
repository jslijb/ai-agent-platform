import { View, Text, ScrollView } from "@tarojs/components";
import { useState, useEffect } from "react";
import { request } from "../../services/request";
import "./index.scss";

interface Document {
  id: string;
  fileName: string;
  status: string;
  documentType: string;
  createdAt: string;
  version: number;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const res = await request<{ success: boolean; documents: Document[] }>({
        url: "/api/miniapp/documents",
        method: "GET",
      });
      setDocuments(res.documents || []);
    } catch (error) {
      console.error("[documents] 加载失败:", error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusText(status: string) {
    const map: Record<string, string> = {
      pending: "处理中",
      parsing: "解析中",
      embedding: "向量化中",
      completed: "已完成",
      error: "处理失败",
    };
    return map[status] || status;
  }

  function getStatusClass(status: string) {
    return status === "completed" ? "status-done" : "status-processing";
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  return (
    <View className="documents-page">
      <View className="page-header">
        <Text className="page-title">文档管理</Text>
      </View>
      <ScrollView className="document-list" scrollY>
        {loading ? (
          <View className="loading-state"><Text>加载中...</Text></View>
        ) : documents.length === 0 ? (
          <View className="empty-state">
            <Text className="empty-icon">📄</Text>
            <Text className="empty-text">暂无文档</Text>
            <Text className="empty-hint">可在Web端上传文档</Text>
          </View>
        ) : (
          documents.map((doc) => (
            <View key={doc.id} className="document-item">
              <View className="doc-icon">📄</View>
              <View className="doc-info">
                <Text className="doc-name">{doc.fileName}</Text>
                <View className="doc-meta">
                  <Text className={getStatusClass(doc.status)}>{getStatusText(doc.status)}</Text>
                  <Text className="doc-date">{formatDate(doc.createdAt)}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
