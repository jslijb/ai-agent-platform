"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface UserProfile {
  id: string;
  userId: string;
  preferences: Record<string, string>;
  frequentStocks: Array<{ code: string; name: string; queryCount: number; lastQueriedAt: string }>;
  riskProfile: string | null;
  investmentStyle: string | null;
  customNotes: Array<{ key: string; value: string; updatedAt: string }>;
}

interface MemoryFragment {
  id: string;
  content: string;
  sourceType: string;
  scope: string;
  createdAt: string;
}

interface MemorySummary {
  id: string;
  conversationId: string;
  summary: string;
  messageRangeStart: number;
  messageRangeEnd: number;
  createdAt: string;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  leaderId: string;
  createdAt: string;
  members: Array<{ userId: string; role: string }>;
  myRole: string;
}

const riskMap: Record<string, string> = { conservative: "保守型", moderate: "稳健型", aggressive: "激进型" };
const styleMap: Record<string, string> = { value: "价值投资", growth: "成长投资", momentum: "动量投资", balanced: "均衡投资" };

export default function MemoriesPage() {
  const [activeTab, setActiveTab] = useState<"profile" | "fragments" | "summaries" | "teams">("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fragments, setFragments] = useState<MemoryFragment[]>([]);
  const [summaries, setSummaries] = useState<MemorySummary[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [addMemberUserId, setAddMemberUserId] = useState("");

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/memories?tab=profile");
      const data = await res.json();
      if (data.success) setProfile(data.profile);
    } catch (err) {
      console.error("获取画像失败:", err);
    }
  }, []);

  const fetchFragments = useCallback(async () => {
    try {
      const res = await fetch("/api/memories?tab=fragments");
      const data = await res.json();
      if (data.success) setFragments(data.fragments);
    } catch (err) {
      console.error("获取记忆片段失败:", err);
    }
  }, []);

  const fetchSummaries = useCallback(async () => {
    try {
      const res = await fetch("/api/memories?tab=summaries");
      const data = await res.json();
      if (data.success) setSummaries(data.summaries);
    } catch (err) {
      console.error("获取摘要失败:", err);
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/teams");
      const data = await res.json();
      if (data.success) setTeams(data.teams);
    } catch (err) {
      console.error("获取团队失败:", err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const loaders: Promise<void>[] = [];
    if (activeTab === "profile") loaders.push(fetchProfile().then(() => {}));
    if (activeTab === "fragments") loaders.push(fetchFragments().then(() => {}));
    if (activeTab === "summaries") loaders.push(fetchSummaries().then(() => {}));
    if (activeTab === "teams") loaders.push(fetchTeams().then(() => {}));
    Promise.all(loaders).finally(() => setLoading(false));
  }, [activeTab, fetchProfile, fetchFragments, fetchSummaries, fetchTeams]);

  const handleUpdateField = async (field: string, value: unknown) => {
    try {
      const res = await fetch("/api/memories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingField(null);
        fetchProfile();
      } else {
        alert("更新失败: " + data.error);
      }
    } catch (err) {
      console.error("更新失败:", err);
    }
  };

  const handleDeleteFragment = async (id: string) => {
    if (!confirm("确定删除此记忆片段？")) return;
    try {
      const res = await fetch(`/api/memories?target=fragment&id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) fetchFragments();
      else alert("删除失败: " + data.error);
    } catch (err) {
      console.error("删除失败:", err);
    }
  };

  const handleDeleteSummary = async (id: string) => {
    if (!confirm("确定删除此摘要？")) return;
    try {
      const res = await fetch(`/api/memories?target=summary&id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) fetchSummaries();
      else alert("删除失败: " + data.error);
    } catch (err) {
      console.error("删除失败:", err);
    }
  };

  const handleDeleteAllFragments = async () => {
    if (!confirm("确定删除所有记忆片段？此操作不可恢复！")) return;
    try {
      const res = await fetch("/api/memories?target=all-fragments", { method: "DELETE" });
      const data = await res.json();
      if (data.success) fetchFragments();
      else alert("删除失败: " + data.error);
    } catch (err) {
      console.error("删除失败:", err);
    }
  };

  const handleDeleteAllSummaries = async () => {
    if (!confirm("确定删除所有摘要？此操作不可恢复！")) return;
    try {
      const res = await fetch("/api/memories?target=all-summaries", { method: "DELETE" });
      const data = await res.json();
      if (data.success) fetchSummaries();
      else alert("删除失败: " + data.error);
    } catch (err) {
      console.error("删除失败:", err);
    }
  };

  const handleExport = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName, description: newTeamDesc }),
      });
      const data = await res.json();
      if (data.success) {
        setNewTeamName("");
        setNewTeamDesc("");
        fetchTeams();
      } else {
        alert("创建失败: " + data.error);
      }
    } catch (err) {
      console.error("创建团队失败:", err);
    }
  };

  const handleAddMember = async (teamId: string) => {
    if (!addMemberUserId.trim()) return;
    try {
      const res = await fetch("/api/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, userId: addMemberUserId, action: "add" }),
      });
      const data = await res.json();
      if (data.success) {
        setAddMemberTeamId(null);
        setAddMemberUserId("");
        fetchTeams();
      } else {
        alert("添加失败: " + data.error);
      }
    } catch (err) {
      console.error("添加成员失败:", err);
    }
  };

  const handleRemoveMember = async (teamId: string, userId: string) => {
    if (!confirm("确定移除此成员？")) return;
    try {
      const res = await fetch("/api/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, userId, action: "remove" }),
      });
      const data = await res.json();
      if (data.success) fetchTeams();
      else alert("移除失败: " + data.error);
    } catch (err) {
      console.error("移除成员失败:", err);
    }
  };

  const tabs = [
    { key: "profile" as const, label: "用户画像", icon: "👤" },
    { key: "fragments" as const, label: "记忆片段", icon: "🧩" },
    { key: "summaries" as const, label: "会话摘要", icon: "📝" },
    { key: "teams" as const, label: "团队管理", icon: "👥" },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-800 hover:text-gray-600">
                AI Agent Platform
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/chat" className="text-gray-600 hover:text-gray-900 text-sm">智能对话</Link>
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-900 text-sm">控制台</Link>
              <Link href="/dashboard/memories" className="text-blue-600 font-medium text-sm">记忆管理</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">记忆管理</h1>
          <p className="text-gray-500 mt-1">管理您的用户画像、记忆片段、会话摘要和团队</p>
        </div>

        <div className="flex space-x-1 bg-white rounded-lg shadow-sm p-1 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {activeTab === "profile" && (
              <div className="space-y-6">
                {profile ? (
                  <>
                    <div className="bg-white rounded-lg shadow-md p-6">
                      <h2 className="text-lg font-bold text-gray-800 mb-4">基本信息</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border rounded-lg p-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-500">风险偏好</span>
                            {editingField !== "riskProfile" ? (
                              <button
                                onClick={() => { setEditingField("riskProfile"); setEditValue(profile.riskProfile || ""); }}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                编辑
                              </button>
                            ) : (
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleUpdateField("riskProfile", editValue || null)}
                                  className="text-xs text-green-600 hover:text-green-800"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => setEditingField(null)}
                                  className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                  取消
                                </button>
                              </div>
                            )}
                          </div>
                          {editingField === "riskProfile" ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full border rounded px-2 py-1 text-sm"
                            >
                              <option value="">未设置</option>
                              <option value="conservative">保守型</option>
                              <option value="moderate">稳健型</option>
                              <option value="aggressive">激进型</option>
                            </select>
                          ) : (
                            <span className="font-medium">
                              {profile.riskProfile ? riskMap[profile.riskProfile] || profile.riskProfile : "未设置"}
                            </span>
                          )}
                        </div>

                        <div className="border rounded-lg p-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-500">投资风格</span>
                            {editingField !== "investmentStyle" ? (
                              <button
                                onClick={() => { setEditingField("investmentStyle"); setEditValue(profile.investmentStyle || ""); }}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                编辑
                              </button>
                            ) : (
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleUpdateField("investmentStyle", editValue || null)}
                                  className="text-xs text-green-600 hover:text-green-800"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => setEditingField(null)}
                                  className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                  取消
                                </button>
                              </div>
                            )}
                          </div>
                          {editingField === "investmentStyle" ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full border rounded px-2 py-1 text-sm"
                            >
                              <option value="">未设置</option>
                              <option value="value">价值投资</option>
                              <option value="growth">成长投资</option>
                              <option value="momentum">动量投资</option>
                              <option value="balanced">均衡投资</option>
                            </select>
                          ) : (
                            <span className="font-medium">
                              {profile.investmentStyle ? styleMap[profile.investmentStyle] || profile.investmentStyle : "未设置"}
                            </span>
                          )}
                        </div>
                      </div>

                      {profile.preferences && Object.keys(profile.preferences).length > 0 && (
                        <div className="mt-4 border rounded-lg p-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-500">偏好设置</span>
                            {editingField !== "preferences" ? (
                              <button
                                onClick={() => { setEditingField("preferences"); setEditValue(JSON.stringify(profile.preferences)); }}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                编辑
                              </button>
                            ) : (
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => {
                                    try {
                                      handleUpdateField("preferences", JSON.parse(editValue));
                                    } catch { alert("JSON格式错误"); }
                                  }}
                                  className="text-xs text-green-600 hover:text-green-800"
                                >
                                  保存
                                </button>
                                <button onClick={() => setEditingField(null)} className="text-xs text-gray-500 hover:text-gray-700">
                                  取消
                                </button>
                              </div>
                            )}
                          </div>
                          {editingField === "preferences" ? (
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full border rounded px-2 py-1 text-sm font-mono"
                              rows={3}
                            />
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(profile.preferences).map(([k, v]) => (
                                <span key={k} className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-sm">
                                  {k}: {v}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {profile.customNotes && profile.customNotes.length > 0 && (
                        <div className="mt-4 border rounded-lg p-4">
                          <span className="text-sm text-gray-500">注意事项</span>
                          <div className="mt-2 space-y-1">
                            {profile.customNotes.map((note, i) => (
                              <div key={i} className="flex items-center space-x-2">
                                <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded text-sm">
                                  {note.key}: {note.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-white rounded-lg shadow-md p-6">
                      <h2 className="text-lg font-bold text-gray-800 mb-4">常用股票</h2>
                      {profile.frequentStocks && profile.frequentStocks.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="min-w-full">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">代码</th>
                                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">名称</th>
                                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">查询次数</th>
                                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">最后查询</th>
                              </tr>
                            </thead>
                            <tbody>
                              {profile.frequentStocks.slice(0, 10).map((stock, i) => (
                                <tr key={i} className="border-t hover:bg-gray-50">
                                  <td className="px-4 py-2 text-sm font-mono">{stock.code}</td>
                                  <td className="px-4 py-2 text-sm">{stock.name}</td>
                                  <td className="px-4 py-2 text-sm">{stock.queryCount}</td>
                                  <td className="px-4 py-2 text-sm text-gray-500">{stock.lastQueriedAt}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm">暂无常用股票记录</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-lg shadow-md p-6 text-center">
                    <p className="text-gray-400">暂无用户画像数据</p>
                    <p className="text-gray-400 text-sm mt-2">开始与AI对话后，系统将自动构建您的画像</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "fragments" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">共 {fragments.length} 条记忆片段</span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleExport(fragments, `memory-fragments-${new Date().toISOString().slice(0, 10)}.json`)}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      导出全部
                    </button>
                    <button
                      onClick={handleDeleteAllFragments}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      删除全部
                    </button>
                  </div>
                </div>
                {fragments.length > 0 ? (
                  <div className="space-y-3">
                    {fragments.map((f) => (
                      <div key={f.id} className="bg-white rounded-lg shadow-md p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{f.content}</p>
                            <div className="flex items-center space-x-3 mt-2">
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{f.sourceType}</span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{f.scope}</span>
                              <span className="text-xs text-gray-400">{new Date(f.createdAt).toLocaleString()}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteFragment(f.id)}
                            className="ml-3 text-red-500 hover:text-red-700 text-sm"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-md p-6 text-center">
                    <p className="text-gray-400">暂无记忆片段</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "summaries" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">共 {summaries.length} 条会话摘要</span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleExport(summaries, `memory-summaries-${new Date().toISOString().slice(0, 10)}.json`)}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      导出全部
                    </button>
                    <button
                      onClick={handleDeleteAllSummaries}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      删除全部
                    </button>
                  </div>
                </div>
                {summaries.length > 0 ? (
                  <div className="space-y-3">
                    {summaries.map((s) => (
                      <div key={s.id} className="bg-white rounded-lg shadow-md p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{s.summary}</p>
                            <div className="flex items-center space-x-3 mt-2">
                              <span className="text-xs text-gray-400">消息范围: {s.messageRangeStart}-{s.messageRangeEnd}</span>
                              <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString()}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteSummary(s.id)}
                            className="ml-3 text-red-500 hover:text-red-700 text-sm"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-md p-6 text-center">
                    <p className="text-gray-400">暂无会话摘要</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "teams" && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">创建团队</h2>
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="团队名称"
                      className="flex-1 border rounded px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={newTeamDesc}
                      onChange={(e) => setNewTeamDesc(e.target.value)}
                      placeholder="描述（可选）"
                      className="flex-1 border rounded px-3 py-2 text-sm"
                    />
                    <button
                      onClick={handleCreateTeam}
                      className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      创建
                    </button>
                  </div>
                </div>

                {teams.length > 0 ? (
                  <div className="space-y-4">
                    {teams.map((team) => (
                      <div key={team.id} className="bg-white rounded-lg shadow-md p-6">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <h3 className="font-bold text-gray-800">{team.name}</h3>
                            {team.description && <p className="text-sm text-gray-500">{team.description}</p>}
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${
                            team.myRole === "leader" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                          }`}>
                            {team.myRole === "leader" ? "队长" : "成员"}
                          </span>
                        </div>

                        <div className="border-t pt-3">
                          <span className="text-sm text-gray-500">成员 ({team.members.length})</span>
                          <div className="mt-2 space-y-1">
                            {team.members.map((m, i) => (
                              <div key={i} className="flex justify-between items-center py-1">
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm">{m.userId}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    m.role === "leader" ? "bg-amber-50 text-amber-600" : "bg-gray-50 text-gray-500"
                                  }`}>
                                    {m.role === "leader" ? "队长" : "成员"}
                                  </span>
                                </div>
                                {team.myRole === "leader" && m.role !== "leader" && (
                                  <button
                                    onClick={() => handleRemoveMember(team.id, m.userId)}
                                    className="text-xs text-red-500 hover:text-red-700"
                                  >
                                    移除
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          {team.myRole === "leader" && (
                            <div className="mt-3 pt-3 border-t">
                              {addMemberTeamId === team.id ? (
                                <div className="flex space-x-2">
                                  <input
                                    type="text"
                                    value={addMemberUserId}
                                    onChange={(e) => setAddMemberUserId(e.target.value)}
                                    placeholder="输入用户ID"
                                    className="flex-1 border rounded px-2 py-1 text-sm"
                                  />
                                  <button
                                    onClick={() => handleAddMember(team.id)}
                                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                                  >
                                    添加
                                  </button>
                                  <button
                                    onClick={() => { setAddMemberTeamId(null); setAddMemberUserId(""); }}
                                    className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-sm hover:bg-gray-300"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAddMemberTeamId(team.id)}
                                  className="text-sm text-blue-600 hover:text-blue-800"
                                >
                                  + 添加成员
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-md p-6 text-center">
                    <p className="text-gray-400">暂无团队</p>
                    <p className="text-gray-400 text-sm mt-2">创建团队后可共享记忆和协作分析</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
