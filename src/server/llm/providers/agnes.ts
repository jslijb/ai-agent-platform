import { getConfigValue, getRawSection } from "@/server/lib/config";

// 从 bailian.ts 重新导出类型别名，保持语义清晰
import type {
  BailianMessage,
  BailianTool,
  BailianToolCall,
  BailianResponse,
} from "@/server/llm/providers/bailian";

export type AgnesMessage = BailianMessage;
export type AgnesTool = BailianTool;
export type AgnesToolCall = BailianToolCall;
export type AgnesResponse = BailianResponse;

const AGNES_DEFAULT_BASE_URL = "https://api.agnes-ai.cn/v1";
// AGNES AI 免费用户限流严格：减少重试次数，更快降级到备用provider
const MAX_RETRIES = 3;
// 重试退避基础时间5秒（429限流需要更长等待）
const BASE_RETRY_INTERVAL = 5000;
// LLM 调用超时从默认增加到120秒（适配 AGNES 20 RPM 限流）
const TIMEOUT_MS = 120000;
const DEFAULT_TEMPERATURE = 0;

/**
 * 解析 AGNES 模型名：从 config 的 llm.models 中找 provider=agnes 的模型
 */
export function resolveAgnesModel(): string {
  const llmSection = getRawSection("llm");
  const models: Array<{ id?: string; provider?: string }> = Array.isArray(
    llmSection?.models
  )
    ? llmSection.models
    : [];

  const agnesModel = models.find((m) => m.provider === "agnes" && m.id);
  if (agnesModel?.id) {
    return agnesModel.id;
  }

  throw new Error("api_keys.yaml 中未找到 provider=agnes 的模型，请配置至少一个 agnes 模型");
}

/**
 * 获取 AGNES API Key：优先从 config 读取，其次从环境变量读取
 */
export function getAgnesApiKey(): string {
  const apiKey =
    getConfigValue("llm", "AGNES_KEY", "") || process.env.AGNES_KEY || "";
  if (!apiKey) {
    console.error("[agnes] AGNES_KEY 环境变量未设置");
    throw new Error("AGNES_KEY 环境变量未设置");
  }
  return apiKey;
}

/**
 * 获取 AGNES base URL：优先从 config 读取，其次使用默认值
 */
function getBaseUrl(): string {
  return (
    getConfigValue("llm", "AGNES_BASE_URL", "") ||
    process.env.AGNES_BASE_URL ||
    AGNES_DEFAULT_BASE_URL
  );
}

function getModel(model?: string): string {
  if (model) return model;
  const resolved = resolveAgnesModel();
  console.log(`[agnes] 使用模型: ${resolved}`);
  return resolved;
}

export let sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function __setSleep(fn: (ms: number) => Promise<void>) {
  sleepFn = fn;
}

export function __resetSleep() {
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 调用 AGNES AI API（OpenAI 兼容协议）
 */
export async function callAgnes(
  messages: AgnesMessage[],
  model?: string,
  temperature?: number,
  tools?: AgnesTool[]
): Promise<AgnesResponse> {
  const apiKey = getAgnesApiKey();
  const useModel = getModel(model);
  const baseUrl = getBaseUrl();

  console.log(
    `[agnes] 调用模型: ${useModel}, 消息数: ${messages.length}${tools && tools.length > 0 ? `, 工具数: ${tools.length}` : ""}`
  );

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        model: useModel,
        messages,
        temperature: temperature ?? DEFAULT_TEMPERATURE,
      };
      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[agnes] API 请求失败 (第${attempt}次): ${response.status} ${errorText}`
        );
        // 429 限流错误：打印清晰的等待消息
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : 5;
          console.warn(
            `[agnes] ⚠️ 收到 429 限流错误 (第${attempt}/${MAX_RETRIES}次)，等待 ${waitSeconds} 秒后重试...`
          );
          if (attempt < MAX_RETRIES) {
            await sleepFn(waitSeconds * 1000);
            continue;
          }
          throw new Error(
            `AGNES API 429 限流: 已重试 ${MAX_RETRIES} 次仍被限流`
          );
        }
        // 不可重试的 HTTP 状态码
        const nonRetryableStatuses = [400, 401, 403, 404, 422];
        if (nonRetryableStatuses.includes(response.status)) {
          console.error(
            `[agnes] HTTP ${response.status} 为不可重试错误，立即终止`
          );
          throw new Error(
            `AGNES API 请求失败(不可重试): ${response.status} ${errorText}`
          );
        }
        if (attempt < MAX_RETRIES) {
          await sleepFn(BASE_RETRY_INTERVAL * Math.pow(2, attempt - 1));
          continue;
        }
        throw new Error(
          `AGNES API 请求失败: ${response.status} ${errorText}`
        );
      }

      const result = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              type: "function";
              function: { name: string; arguments: string };
            }>;
          };
        }>;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const content = result.choices?.[0]?.message?.content ?? null;
      const rawToolCalls = result.choices?.[0]?.message?.tool_calls;
      const toolCalls: AgnesToolCall[] | undefined = rawToolCalls
        ? rawToolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }))
        : undefined;

      if ((content === null || (content !== undefined && content.length === 0)) && (!toolCalls || toolCalls.length === 0)) {
        console.error(
          `[agnes] API 返回内容为空且无tool_calls (第${attempt}次)`
        );
        if (attempt < MAX_RETRIES) {
          await sleepFn(BASE_RETRY_INTERVAL * Math.pow(2, attempt - 1));
          continue;
        }
        throw new Error("AGNES API 返回内容为空且无tool_calls");
      }

      const contentLen = content ? content.length : 0;
      const tcInfo = toolCalls ? `, tool_calls: ${toolCalls.length}` : "";
      console.log(
        `[agnes] 调用成功, 返回内容长度: ${contentLen}${tcInfo}, tokens: ${result.usage?.total_tokens ?? "unknown"}`
      );

      return {
        content,
        toolCalls,
        usage: result.usage
          ? {
              prompt_tokens: result.usage.prompt_tokens,
              completion_tokens: result.usage.completion_tokens,
              total_tokens: result.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.message.includes("不可重试")) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        console.error(
          `[agnes] 请求超时 (第${attempt}次), 超时时间: ${TIMEOUT_MS}ms`
        );
        if (attempt >= 2) {
          throw new Error(
            `AGNES API 请求超时: 模型 ${useModel} 连续 ${attempt} 次超时`
          );
        }
      } else {
        console.error(`[agnes] 调用异常 (第${attempt}次):`, error);
      }

      if (attempt < MAX_RETRIES) {
        await sleepFn(BASE_RETRY_INTERVAL * Math.pow(2, attempt - 1));
        continue;
      }
      throw error;
    }
  }

  throw new Error("AGNES API 调用失败: 超过最大重试次数");
}
