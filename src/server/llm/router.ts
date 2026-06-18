import { callBailian, type BailianMessage, type BailianTool, type BailianToolCall } from "@/server/llm/providers/bailian";
import { callAgnes } from "@/server/llm/providers/agnes";
import { withCircuitBreaker, isCircuitOpen, forceOpenCircuit } from "@/server/lib/circuit-breaker";
import { getConfigValue, getRawSection } from "@/server/lib/config";

// 模型配置接口
interface ModelConfig {
  id: string;
  provider?: string;
  functionCalling?: boolean;
}

/**
 * 从配置读取模型降级链（包含 provider 信息）
 * 优先使用 getRawSection 读取，回退到直接读取 YAML 文件
 */
function readModelChain(requireFunctionCalling: boolean = false): ModelConfig[] {
  try {
    const llmSection = getRawSection("llm");
    const models: ModelConfig[] = Array.isArray(llmSection?.models) ? llmSection.models : [];
    return models.filter((m) => {
      if (!m || typeof m.id !== "string" || m.id.trim().length === 0) return false;
      if (requireFunctionCalling && !m.functionCalling) return false;
      return true;
    });
  } catch (err) {
    console.error("[llm-router] 读取模型配置失败:", err);
    return [];
  }
}

/**
 * 获取模型降级链
 */
function getModelChain(requireFunctionCalling: boolean = false): ModelConfig[] {
  const models = readModelChain(requireFunctionCalling);

  if (models.length === 0) {
    console.warn("[llm-router] 模型降级链为空");
    return [];
  }

  return models;
}

/**
 * 获取默认 provider：从 config 读取，默认为 agnes
 */
function getDefaultProvider(): string {
  return getConfigValue("llm", "provider", "") || "agnes";
}

/**
 * 解析模型的 provider：优先使用模型自身配置，其次使用全局默认
 */
function resolveProvider(model: ModelConfig): string {
  return model.provider || getDefaultProvider();
}

interface RouterResult {
  content: string | null;
  toolCalls?: BailianToolCall[];
  model: string;
  provider: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 根据模型 provider 选择对应的调用函数
 */
function getCallFunction(provider: string) {
  switch (provider) {
    case "agnes":
      return callAgnes;
    case "dashscope":
    case "bailian":
      return callBailian;
    default:
      console.warn(`[llm-router] 未知 provider: ${provider}，降级使用 callBailian`);
      return callBailian;
  }
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

  const chainDesc = modelChain
    .map((m) => `${m.id}(${resolveProvider(m)})`)
    .join(" → ");
  console.log(`[llm-router] 开始模型调用，降级链: ${chainDesc}`);

  for (const modelConfig of modelChain) {
    const model = modelConfig.id;
    const provider = resolveProvider(modelConfig);
    const circuitName = `llm-${provider}-${model}`;

    if (isCircuitOpen(circuitName)) {
      console.warn(`[llm-router] 模型 ${model}(${provider}) 熔断器已打开，跳过`);
      continue;
    }

    try {
      console.log(`[llm-router] 尝试调用模型: ${model} (provider: ${provider})`);
      const callFn = getCallFunction(provider);
      const response = await withCircuitBreaker(circuitName, () =>
        callFn(messages, model, temperature, tools)
      );

      console.log(`[llm-router] 模型 ${model}(${provider}) 调用成功`);
      return {
        content: response.content,
        toolCalls: response.toolCalls,
        model,
        provider,
        usage: response.usage,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isQuotaError = errMsg.includes("AllocationQuota") || errMsg.includes("403") || errMsg.includes("401") || errMsg.includes("FreeTierOnly");

      if (isQuotaError) {
        forceOpenCircuit(circuitName, `模型 ${model}(${provider}) 额度耗尽/认证失败`);
        console.error(`[llm-router] 模型 ${model}(${provider}) 额度耗尽，强制打开熔断器: ${errMsg.slice(0, 100)}`);
      } else {
        console.error(`[llm-router] 模型 ${model}(${provider}) 调用失败:`, error);
      }
      continue;
    }
  }

  console.error("[llm-router] 所有模型均不可用");
  throw new Error("所有 LLM 模型均不可用，请检查 api_keys.yaml 中的模型列表或API额度");
}
