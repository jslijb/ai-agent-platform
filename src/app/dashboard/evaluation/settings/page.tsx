"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface EvaluationConfig {
  trigger: {
    default_mode: "manual" | "auto";
    auto: {
      schedule: { enabled: boolean; cron: string; level: "daily" | "standard" | "full" };
      post_deploy: { enabled: boolean; level: "daily" | "standard" | "full" };
      post_document_update: { enabled: boolean; level: "daily" | "standard" | "full" };
      error_rate_spike: { enabled: boolean; threshold: number; level: "daily" | "standard" | "full" };
    };
  };
  rag_weights?: Record<string, number>;
  agent_weights?: Record<string, number>;
  thresholds?: Record<string, number>;
  [key: string]: unknown;
}

type EvaluationLevel = "daily" | "standard" | "full";
type DataSource = "golden" | "historical" | "opendataset";
type ScenePreset = "compliance" | "accuracy" | "efficiency";

const RAG_WEIGHT_ITEMS = [
  { key: "avgHitsAtK", label: "检索命中率" },
  { key: "avgContextRelevance", label: "上下文相关性" },
  { key: "avgContextRecall", label: "上下文召回率" },
  { key: "avgFaithfulness", label: "忠实度" },
  { key: "avgAnswerRelevance", label: "答案相关性" },
  { key: "avgNumericalAccuracy", label: "数值精确度" },
  { key: "avgComplianceScore", label: "合规性评分" },
  { key: "avgHallucinationRate", label: "幻觉率" },
  { key: "avgRiskDisclosureScore", label: "风险披露评分" },
  { key: "avgTimelinessScore", label: "时效性评分" },
];

const AGENT_WEIGHT_ITEMS = [
  { key: "avgToolSelectionScore", label: "工具选择评分" },
  { key: "avgPlanningScore", label: "规划评分" },
  { key: "avgAgentComplianceScore", label: "Agent合规评分" },
  { key: "avgConsistencyScore", label: "一致性评分" },
  { key: "avgEfficiencyScore", label: "效率评分" },
];

const SCENE_PRESETS: Record<ScenePreset, { label: string; ragWeights: Record<string, number>; agentWeights: Record<string, number> }> = {
  compliance: {
    label: "合规优先",
    ragWeights: {
      avgHitsAtK: 0.1,
      avgContextRelevance: 0.1,
      avgContextRecall: 0.1,
      avgFaithfulness: 0.15,
      avgAnswerRelevance: 0.1,
      avgNumericalAccuracy: 0.1,
      avgComplianceScore: 0.2,
      avgHallucinationRate: 0.1,
      avgRiskDisclosureScore: 0.05,
      avgTimelinessScore: 0.0,
    },
    agentWeights: {
      avgToolSelectionScore: 0.1,
      avgPlanningScore: 0.1,
      avgAgentComplianceScore: 0.4,
      avgConsistencyScore: 0.2,
      avgEfficiencyScore: 0.2,
    },
  },
  accuracy: {
    label: "准确性优先",
    ragWeights: {
      avgHitsAtK: 0.15,
      avgContextRelevance: 0.15,
      avgContextRecall: 0.1,
      avgFaithfulness: 0.2,
      avgAnswerRelevance: 0.15,
      avgNumericalAccuracy: 0.15,
      avgComplianceScore: 0.05,
      avgHallucinationRate: 0.05,
      avgRiskDisclosureScore: 0.0,
      avgTimelinessScore: 0.0,
    },
    agentWeights: {
      avgToolSelectionScore: 0.3,
      avgPlanningScore: 0.2,
      avgAgentComplianceScore: 0.1,
      avgConsistencyScore: 0.3,
      avgEfficiencyScore: 0.1,
    },
  },
  efficiency: {
    label: "效率优先",
    ragWeights: {
      avgHitsAtK: 0.2,
      avgContextRelevance: 0.15,
      avgContextRecall: 0.15,
      avgFaithfulness: 0.1,
      avgAnswerRelevance: 0.2,
      avgNumericalAccuracy: 0.05,
      avgComplianceScore: 0.05,
      avgHallucinationRate: 0.0,
      avgRiskDisclosureScore: 0.0,
      avgTimelinessScore: 0.1,
    },
    agentWeights: {
      avgToolSelectionScore: 0.2,
      avgPlanningScore: 0.15,
      avgAgentComplianceScore: 0.05,
      avgConsistencyScore: 0.1,
      avgEfficiencyScore: 0.5,
    },
  },
};

export default function EvaluationSettingsPage() {
  const [config, setConfig] = useState<EvaluationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [evaluationLevel, setEvaluationLevel] = useState<EvaluationLevel>("standard");
  const [dataSource, setDataSource] = useState<DataSource>("golden");
  const [triggerMode, setTriggerMode] = useState<"manual" | "auto">("manual");
  const [ragWeights, setRagWeights] = useState<Record<string, number>>({});
  const [agentWeights, setAgentWeights] = useState<Record<string, number>>({});
  const [scenePreset, setScenePreset] = useState<ScenePreset | "custom">("custom");

  const [autoConfig, setAutoConfig] = useState({
    scheduleEnabled: false,
    scheduleCron: "0 8 * * 1-5",
    scheduleLevel: "daily" as EvaluationLevel,
    postDeployEnabled: false,
    postDeployLevel: "standard" as EvaluationLevel,
    postDocUpdateEnabled: false,
    postDocUpdateLevel: "daily" as EvaluationLevel,
    errorRateEnabled: false,
    errorRateThreshold: 0.15,
    errorRateLevel: "standard" as EvaluationLevel,
  });

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/evaluation/config");
      if (!res.ok) throw new Error("获取配置失败");
      const json = await res.json();
      if (json.success) {
        const cfg = json.config as EvaluationConfig;
        setConfig(cfg);
        setTriggerMode(cfg.trigger?.default_mode ?? "manual");
        setEvaluationLevel(cfg.trigger?.auto?.schedule?.level ?? "standard");

        if (cfg.trigger?.auto) {
          setAutoConfig({
            scheduleEnabled: cfg.trigger.auto.schedule?.enabled ?? false,
            scheduleCron: cfg.trigger.auto.schedule?.cron ?? "0 8 * * 1-5",
            scheduleLevel: cfg.trigger.auto.schedule?.level ?? "daily",
            postDeployEnabled: cfg.trigger.auto.post_deploy?.enabled ?? false,
            postDeployLevel: cfg.trigger.auto.post_deploy?.level ?? "standard",
            postDocUpdateEnabled: cfg.trigger.auto.post_document_update?.enabled ?? false,
            postDocUpdateLevel: cfg.trigger.auto.post_document_update?.level ?? "daily",
            errorRateEnabled: cfg.trigger.auto.error_rate_spike?.enabled ?? false,
            errorRateThreshold: cfg.trigger.auto.error_rate_spike?.threshold ?? 0.15,
            errorRateLevel: cfg.trigger.auto.error_rate_spike?.level ?? "standard",
          });
        }

        if (cfg.rag_weights && typeof cfg.rag_weights === "object") {
          setRagWeights(cfg.rag_weights as Record<string, number>);
        }
        if (cfg.agent_weights && typeof cfg.agent_weights === "object") {
          setAgentWeights(cfg.agent_weights as Record<string, number>);
        }
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "获取配置失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleApplyPreset = (preset: ScenePreset) => {
    const p = SCENE_PRESETS[preset];
    setRagWeights({ ...p.ragWeights });
    setAgentWeights({ ...p.agentWeights });
    setScenePreset(preset);
  };

  const handleRagWeightChange = (key: string, value: number) => {
    setRagWeights((prev) => ({ ...prev, [key]: value }));
    setScenePreset("custom");
  };

  const handleAgentWeightChange = (key: string, value: number) => {
    setAgentWeights((prev) => ({ ...prev, [key]: value }));
    setScenePreset("custom");
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const body: Record<string, unknown> = {
        triggerMode,
        autoConfig: {
          schedule: {
            enabled: autoConfig.scheduleEnabled,
            cron: autoConfig.scheduleCron,
            level: autoConfig.scheduleLevel,
          },
          post_deploy: {
            enabled: autoConfig.postDeployEnabled,
            level: autoConfig.postDeployLevel,
          },
          post_document_update: {
            enabled: autoConfig.postDocUpdateEnabled,
            level: autoConfig.postDocUpdateLevel,
          },
          error_rate_spike: {
            enabled: autoConfig.errorRateEnabled,
            threshold: autoConfig.errorRateThreshold,
            level: autoConfig.errorRateLevel,
          },
        },
        ragWeights,
        agentWeights,
      };

      const res = await fetch("/api/evaluation/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (json.success) {
        setMessage({ type: "success", text: "配置保存成功" });
      } else {
        setMessage({ type: "error", text: json.message || "保存失败" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500 text-lg">加载配置中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link
                href="/dashboard/evaluation"
                className="text-gray-500 hover:text-gray-700 mr-4"
              >
                &larr; 返回评估
              </Link>
              <span className="text-xl font-bold text-gray-800">
                评估配置
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/dashboard/evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                RAG 评估
              </Link>
              <Link href="/dashboard/agent-evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 评估
              </Link>
              <Link href="/dashboard/evaluation/trend" className="text-gray-600 hover:text-gray-900 text-sm">
                评估趋势
              </Link>
              <Link href="/dashboard/evaluation/compare" className="text-gray-600 hover:text-gray-900 text-sm">
                版本对比
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">基础配置</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  评估级别
                </label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                  value={evaluationLevel}
                  onChange={(e) => setEvaluationLevel(e.target.value as EvaluationLevel)}
                >
                  <option value="daily">日常评估 - 快速验证</option>
                  <option value="standard">标准评估 - 常规验证</option>
                  <option value="full">全面评估 - 完整验证</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  数据源
                </label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                  value={dataSource}
                  onChange={(e) => setDataSource(e.target.value as DataSource)}
                >
                  <option value="golden">黄金测试集</option>
                  <option value="historical">历史查询</option>
                  <option value="opendataset">开源数据集</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  场景预设
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { value: "compliance", label: "合规优先" },
                    { value: "accuracy", label: "准确性优先" },
                    { value: "efficiency", label: "效率优先" },
                    { value: "custom", label: "自定义" },
                  ] as const).map((item) => (
                    <button
                      key={item.value}
                      onClick={() =>
                        item.value !== "custom"
                          ? handleApplyPreset(item.value)
                          : setScenePreset("custom")
                      }
                      className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                        scenePreset === item.value
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  触发模式
                </label>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setTriggerMode(triggerMode === "manual" ? "auto" : "manual")}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      triggerMode === "auto" ? "bg-blue-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        triggerMode === "auto" ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-600">
                    {triggerMode === "auto" ? "自动触发" : "手动触发"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              自动触发条件
            </h3>

            <div className={`space-y-4 ${triggerMode === "manual" ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={autoConfig.scheduleEnabled}
                    onChange={(e) =>
                      setAutoConfig((prev) => ({
                        ...prev,
                        scheduleEnabled: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-700">定时触发</div>
                    <div className="text-xs text-gray-500">按计划定时执行评估</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={autoConfig.scheduleCron}
                    onChange={(e) =>
                      setAutoConfig((prev) => ({
                        ...prev,
                        scheduleCron: e.target.value,
                      }))
                    }
                    className="border rounded px-2 py-1 text-xs w-32"
                    placeholder="Cron 表达式"
                  />
                  <select
                    value={autoConfig.scheduleLevel}
                    onChange={(e) =>
                      setAutoConfig((prev) => ({
                        ...prev,
                        scheduleLevel: e.target.value as EvaluationLevel,
                      }))
                    }
                    className="border rounded px-2 py-1 text-xs"
                  >
                    <option value="daily">日常</option>
                    <option value="standard">标准</option>
                    <option value="full">全面</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={autoConfig.postDeployEnabled}
                    onChange={(e) =>
                      setAutoConfig((prev) => ({
                        ...prev,
                        postDeployEnabled: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-700">部署后触发</div>
                    <div className="text-xs text-gray-500">系统部署完成后自动评估</div>
                  </div>
                </div>
                <select
                  value={autoConfig.postDeployLevel}
                  onChange={(e) =>
                    setAutoConfig((prev) => ({
                      ...prev,
                      postDeployLevel: e.target.value as EvaluationLevel,
                    }))
                  }
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="daily">日常</option>
                  <option value="standard">标准</option>
                  <option value="full">全面</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={autoConfig.postDocUpdateEnabled}
                    onChange={(e) =>
                      setAutoConfig((prev) => ({
                        ...prev,
                        postDocUpdateEnabled: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-700">文档更新后触发</div>
                    <div className="text-xs text-gray-500">知识库文档更新后自动评估</div>
                  </div>
                </div>
                <select
                  value={autoConfig.postDocUpdateLevel}
                  onChange={(e) =>
                    setAutoConfig((prev) => ({
                      ...prev,
                      postDocUpdateLevel: e.target.value as EvaluationLevel,
                    }))
                  }
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="daily">日常</option>
                  <option value="standard">标准</option>
                  <option value="full">全面</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={autoConfig.errorRateEnabled}
                    onChange={(e) =>
                      setAutoConfig((prev) => ({
                        ...prev,
                        errorRateEnabled: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-700">错误率上升触发</div>
                    <div className="text-xs text-gray-500">错误率超过阈值时自动评估</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={autoConfig.errorRateThreshold}
                    onChange={(e) =>
                      setAutoConfig((prev) => ({
                        ...prev,
                        errorRateThreshold: parseFloat(e.target.value) || 0.15,
                      }))
                    }
                    className="border rounded px-2 py-1 text-xs w-20"
                    step="0.05"
                    min="0"
                    max="1"
                  />
                  <select
                    value={autoConfig.errorRateLevel}
                    onChange={(e) =>
                      setAutoConfig((prev) => ({
                        ...prev,
                        errorRateLevel: e.target.value as EvaluationLevel,
                      }))
                    }
                    className="border rounded px-2 py-1 text-xs"
                  >
                    <option value="daily">日常</option>
                    <option value="standard">标准</option>
                    <option value="full">全面</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              RAG 指标权重
            </h3>
            <div className="space-y-3">
              {RAG_WEIGHT_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center space-x-3">
                  <label className="text-sm text-gray-600 w-28 shrink-0">
                    {item.label}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.05"
                    value={ragWeights[item.key] ?? 0}
                    onChange={(e) =>
                      handleRagWeightChange(item.key, parseFloat(e.target.value))
                    }
                    className="flex-1"
                  />
                  <span className="text-sm font-medium text-gray-700 w-12 text-right">
                    {((ragWeights[item.key] ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
              <div className="pt-3 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">权重总和</span>
                  <span
                    className={`font-medium ${
                      Math.abs(
                        Object.values(ragWeights).reduce((a, b) => a + b, 0) - 1
                      ) < 0.01
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {(Object.values(ragWeights).reduce((a, b) => a + b, 0) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Agent 指标权重
            </h3>
            <div className="space-y-3">
              {AGENT_WEIGHT_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center space-x-3">
                  <label className="text-sm text-gray-600 w-28 shrink-0">
                    {item.label}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.6"
                    step="0.05"
                    value={agentWeights[item.key] ?? 0}
                    onChange={(e) =>
                      handleAgentWeightChange(item.key, parseFloat(e.target.value))
                    }
                    className="flex-1"
                  />
                  <span className="text-sm font-medium text-gray-700 w-12 text-right">
                    {((agentWeights[item.key] ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
              <div className="pt-3 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">权重总和</span>
                  <span
                    className={`font-medium ${
                      Math.abs(
                        Object.values(agentWeights).reduce((a, b) => a + b, 0) - 1
                      ) < 0.01
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {(Object.values(agentWeights).reduce((a, b) => a + b, 0) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-8 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </main>
    </div>
  );
}
