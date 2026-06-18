import { View, Text, Input, ScrollView } from "@tarojs/components";
import { useState, useCallback } from "react";
import { request } from "../../services/request";
import "./index.scss";

interface SearchResult {
  text: string;
  documentId: string;
  score: number;
}

export default function SearchPage() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const query = keyword.trim();
    if (!query || loading) return;

    setLoading(true);
    setSearched(true);

    try {
      const res = await request<{ success: boolean; results: SearchResult[]; total: number }>({
        url: "/api/miniapp/search",
        method: "POST",
        data: { query, topK: 10 },
      });

      setResults(res.results || []);
    } catch (error) {
      console.error("[search] 搜索失败:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [keyword, loading]);

  return (
    <View className="search-page">
      <View className="search-bar">
        <Input
          className="search-input"
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
          onConfirm={handleSearch}
          placeholder="搜索股票、财报、公告..."
          confirmType="search"
        />
        <View className="search-btn" onClick={handleSearch}>
          搜索
        </View>
      </View>

      <ScrollView className="search-results" scrollY>
        {!searched ? (
          <View className="empty-state">
            <Text className="empty-icon">🔍</Text>
            <Text className="empty-text">输入关键词开始搜索</Text>
            <Text className="empty-hint">支持股票代码、公司名称、财务指标等</Text>
          </View>
        ) : loading ? (
          <View className="loading-state">
            <Text>搜索中...</Text>
          </View>
        ) : results.length === 0 ? (
          <View className="empty-state">
            <Text className="empty-text">未找到相关结果</Text>
          </View>
        ) : (
          results.map((item, index) => (
            <View key={index} className="result-card">
              <Text className="result-text">{item.text}</Text>
              <View className="result-meta">
                <Text className="result-score">相关度: {(item.score * 100).toFixed(1)}%</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
