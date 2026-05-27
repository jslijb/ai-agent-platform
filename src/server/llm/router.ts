import { callBailian, type BailianMessage } from "@/server/llm/providers/bailian";
import { withCircuitBreaker, isCircuitOpen } from "@/server/lib/circuit-breaker";

function getModelChain(): string[] {
  const configured = process.env.BAILIAN_MODEL?.trim();
  if (configured) {
    const fallbacks = process.env.BAILIAN_FALLBACK_MODELS?.trim();
    if (fallbacks) {
      return [configured, ...fallbacks.split(",").map((m) => m.trim()).filter(Boolean)];
    }
    return [configured];
  }
  console.warn("[llm-router] BAILIAN_MODEL 未设置，降级链为空");
  return [];
}

interface RouterResult {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callWithFallback(
  messages: BailianMessage[],
  temperature?: number
): Promise<RouterResult> {
  const modelChain = getModelChain();
  if (modelChain.length === 0) {
    throw new Error("BAILIAN_MODEL 未设置，无法调用 LLM。请在 .env.local 中配置 BAILIAN_MODEL");
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
        callBailian(messages, model, temperature)
      );

      console.log(`[llm-router] 模型 ${model} 调用成功`);
      return {
        content: response.content,
        model,
        usage: response.usage,
      };
    } catch (error) {
      console.error(`[llm-router] 模型 ${model} 调用失败:`, error);
      continue;
    }
  }

  console.error("[llm-router] 所有模型均不可用");
  throw new Error("所有 LLM 模型均不可用，请稍后重试");
}
