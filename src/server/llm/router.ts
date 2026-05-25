import { callBailian, type BailianMessage } from "@/server/llm/providers/bailian";
import { withCircuitBreaker, isCircuitOpen } from "@/server/lib/circuit-breaker";

const MODEL_CHAIN = ["qwen-max", "qwen-plus", "qwen-turbo"];

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
  console.log(`[llm-router] 开始模型调用，降级链: ${MODEL_CHAIN.join(" → ")}`);

  for (const model of MODEL_CHAIN) {
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
