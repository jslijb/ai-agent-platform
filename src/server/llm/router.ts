import { callBailian, type BailianMessage, type BailianTool, type BailianToolCall } from "@/server/llm/providers/bailian";
import { withCircuitBreaker, isCircuitOpen, forceOpenCircuit } from "@/server/lib/circuit-breaker";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

function readModelChainFromYaml(requireFunctionCalling: boolean = false): string[] {
  const configPath = path.resolve(process.cwd(), "config/api_keys.yaml");
  if (!fs.existsSync(configPath)) return [];

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = yaml.load(raw) as Record<string, any>;
    const llmSection = parsed?.llm || {};
    const models: Array<{ id?: string; functionCalling?: boolean }> = Array.isArray(llmSection.models) ? llmSection.models : [];
    return models
      .filter((m) => {
        if (!m || typeof m.id !== "string" || m.id.trim().length === 0) return false;
        if (requireFunctionCalling && !m.functionCalling) return false;
        return true;
      })
      .map((m) => m.id!.trim());
  } catch (err) {
    console.error("[llm-router] 读取 api_keys.yaml 失败:", err);
    return [];
  }
}

function getModelChain(requireFunctionCalling: boolean = false): string[] {
  const yamlModelIds = readModelChainFromYaml(requireFunctionCalling);

  if (yamlModelIds.length === 0) {
    console.warn("[llm-router] api_keys.yaml 中 llm.models 列表为空，降级链为空");
    return [];
  }

  return yamlModelIds;
}

interface RouterResult {
  content: string | null;
  toolCalls?: BailianToolCall[];
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callWithFallback(
  messages: BailianMessage[],
  temperature?: number,
  requireFunctionCalling: boolean = false,
  tools?: BailianTool[]
): Promise<RouterResult> {
  const modelChain = getModelChain(requireFunctionCalling);
  if (modelChain.length === 0) {
    throw new Error("api_keys.yaml 中 llm.models 列表为空，无法调用 LLM。请在 api_keys.yaml 中配置至少一个模型");
  }
  console.log(`[llm-router] 开始模型调用，降级链: ${modelChain.join(" → ")}`);

  for (const model of modelChain) {
    const circuitName = `llm-${model}`;

    if (isCircuitOpen(circuitName)) {
      console.warn(`[llm-router] 模型 ${model} 熔断器已打开，跳过`);
      continue;
    }

    try {
      console.log(`[llm-router] 尝试调用模型: ${model}`);
      const response = await withCircuitBreaker(circuitName, () =>
        callBailian(messages, model, temperature, tools)
      );

      console.log(`[llm-router] 模型 ${model} 调用成功`);
      return {
        content: response.content,
        toolCalls: response.toolCalls,
        model,
        usage: response.usage,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isQuotaError = errMsg.includes("AllocationQuota") || errMsg.includes("403") || errMsg.includes("401") || errMsg.includes("FreeTierOnly");

      if (isQuotaError) {
        forceOpenCircuit(circuitName, `模型 ${model} 额度耗尽/认证失败`);
        console.error(`[llm-router] 模型 ${model} 额度耗尽，强制打开熔断器: ${errMsg.slice(0, 100)}`);
      } else {
        console.error(`[llm-router] 模型 ${model} 调用失败:`, error);
      }
      continue;
    }
  }

  console.error("[llm-router] 所有模型均不可用");
  throw new Error("所有 LLM 模型均不可用，请检查 api_keys.yaml 中的模型列表或百炼API额度");
}
