import { getConfigValue } from "@/server/lib/config";

// 从 bailian.ts 重新导出类型别名，保持语义清晰
import type {
  BailianMessage,
  BailianTool,
  BailianToolCall,
  BailianResponse,
} from "@/server/llm/providers/bailian";

export type ShushengMessage = BailianMessage;
export type ShushengTool = BailianTool;
export type ShushengToolCall = BailianToolCall;
export type ShushengResponse = BailianResponse;

// 书生（上海AI实验室 InternAI）开放平台：OpenAI 兼容接口
const SHUSHENG_DEFAULT_BASE_URL = "https://discovery-api.intern-ai.org.cn/v1";
// 官方限流 rpm=30、单 key 并发 5：重试 3 次 + 退避即可，无需激进重试
const MAX_RETRIES = 3;
const BASE_RETRY_INTERVAL = 5000;
const TIMEOUT_MS = 120000;
const DEFAULT_TEMPERATURE = 0;

/**
 * 获取书生 API Key：优先 config，其次 SHUSHENG_KEY / SHUSHENG_TOKEN 环境变量
 */
export function getShushengApiKey(): string {
  const apiKey =
    getConfigValue("llm", "SHUSHENG_KEY", "") ||
    process.env.SHUSHENG_KEY ||
    process.env.SHUSHENG_TOKEN ||
    "";
  if (!apiKey) {
    throw new Error("SHUSHENG_KEY 环境变量未设置");
  }
  return apiKey;
}

function getBaseUrl(): string {
  return (
    getConfigValue("llm", "SHUSHENG_BASE_URL", "") ||
    process.env.SHUSHENG_BASE_URL ||
    SHUSHENG_DEFAULT_BASE_URL
  );
}

/**
 * 调用书生开放平台 API（OpenAI 兼容协议）
 *
 * R031：作为 LLM 降级链的备用 provider——百炼 10 模型额度耗尽后、AGNES 之前启用。
 * 链内按 priority 循环降级：flash 系（省墨点）→ pro 系。
 * 内容为空视为失败（deepseek-v4-flash-0731 为 reasoning 模型，生产调用不设 max_tokens 不会截断）。
 */
export async function callShusheng(
  messages: ShushengMessage[],
  model?: string,
  temperature?: number,
  tools?: ShushengTool[],
  // R033：TTFT 流式目前仅在 bailian provider 实现；保持 router 调用签名一致（忽略）
  _onFirstToken?: (ttftMs: number) => void
): Promise<ShushengResponse> {
  const apiKey = getShushengApiKey();
  const baseUrl = getBaseUrl();
  const useModel = model ?? "";

  console.log(
    `[shusheng] 调用模型: ${useModel}, 消息数: ${messages.length}${tools && tools.length > 0 ? `, 工具数: ${tools.length}` : ""}`
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
          `[shusheng] API 请求失败 (第${attempt}次): ${response.status} ${errorText.slice(0, 200)}`
        );
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : 5;
          console.warn(
            `[shusheng] ⚠️ 429 限流 (第${attempt}/${MAX_RETRIES}次)，等待 ${waitSeconds} 秒后重试...`
          );
          if (attempt < MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
            continue;
          }
          throw new Error(`书生 API 429 限流: 已重试 ${MAX_RETRIES} 次仍被限流`);
        }
        const nonRetryableStatuses = [400, 401, 403, 404, 422];
        if (nonRetryableStatuses.includes(response.status)) {
          throw new Error(
            `书生 API 请求失败(不可重试): ${response.status} ${errorText.slice(0, 200)}`
          );
        }
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, BASE_RETRY_INTERVAL * Math.pow(2, attempt - 1)));
          continue;
        }
        throw new Error(`书生 API 请求失败: ${response.status} ${errorText.slice(0, 200)}`);
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
      const toolCalls: ShushengToolCall[] | undefined = rawToolCalls
        ? rawToolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }))
        : undefined;

      if (content === null && (!toolCalls || toolCalls.length === 0)) {
        console.error(`[shusheng] API 返回内容为空且无tool_calls (第${attempt}次)`);
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, BASE_RETRY_INTERVAL * Math.pow(2, attempt - 1)));
          continue;
        }
        throw new Error("书生 API 返回内容为空且无tool_calls");
      }

      const contentLen = content ? content.length : 0;
      console.log(
        `[shusheng] 调用成功, 返回内容长度: ${contentLen}, tokens: ${result.usage?.total_tokens ?? "unknown"}`
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
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes("不可重试") || errMsg.includes("429 限流")) {
        throw error;
      }
      console.error(`[shusheng] 请求异常 (第${attempt}次): ${errMsg}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, BASE_RETRY_INTERVAL * Math.pow(2, attempt - 1)));
        continue;
      }
      throw new Error(`书生 API 请求失败: ${errMsg}`);
    }
  }
  throw new Error("书生 API 请求失败: 重试耗尽");
}
