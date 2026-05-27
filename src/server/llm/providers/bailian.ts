const DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MAX_RETRIES = 3;
const BASE_RETRY_INTERVAL = 1000;
const TIMEOUT_MS = 30000;
const DEFAULT_TEMPERATURE = 0;

function resolveModel(): string {
  const configured = process.env.BAILIAN_MODEL?.trim();
  if (!configured) {
    console.warn("[bailian] ⚠️ BAILIAN_MODEL 未设置，请检查 .env / .env.local 配置");
    console.warn("[bailian] 请在 .env.local 中设置 BAILIAN_MODEL，例如: BAILIAN_MODEL=deepseek-v4-flash");
    throw new Error("BAILIAN_MODEL 环境变量未设置，请在 .env.local 中配置");
  }
  return configured;
}

export interface BailianMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BailianResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function getApiKey(): string {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.error("[bailian] DASHSCOPE_API_KEY 环境变量未设置");
    throw new Error("DASHSCOPE_API_KEY 环境变量未设置");
  }
  return apiKey;
}

function getModel(model?: string): string {
  if (model) return model;
  const resolved = resolveModel();
  console.log(`[bailian] 使用模型: ${resolved}`);
  return resolved;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callBailian(
  messages: BailianMessage[],
  model?: string,
  temperature?: number
): Promise<BailianResponse> {
  const apiKey = getApiKey();
  const useModel = getModel(model);

  console.log(
    `[bailian] 调用模型: ${useModel}, 消息数: ${messages.length}`
  );

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(
        `${DASHSCOPE_BASE_URL}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: useModel,
            messages,
            temperature: temperature ?? DEFAULT_TEMPERATURE,
            seed: 42,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[bailian] API 请求失败 (第${attempt}次): ${response.status} ${errorText}`
        );
        const nonRetryableStatuses = [400, 401, 403, 404, 422];
        if (nonRetryableStatuses.includes(response.status)) {
          console.error(`[bailian] HTTP ${response.status} 为不可重试错误，立即终止`);
          throw new Error(
            `百炼 API 请求失败(不可重试): ${response.status} ${errorText}`
          );
        }
        if (attempt < MAX_RETRIES) {
          await sleep(BASE_RETRY_INTERVAL * Math.pow(2, attempt - 1));
          continue;
        }
        throw new Error(
          `百炼 API 请求失败: ${response.status} ${errorText}`
        );
      }

      const result = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string };
        }>;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const content = result.choices?.[0]?.message?.content;
      if (content === undefined || content === null) {
        console.error(
          `[bailian] API 返回内容为空 (第${attempt}次)`
        );
        if (attempt < MAX_RETRIES) {
          await sleep(BASE_RETRY_INTERVAL * Math.pow(2, attempt - 1));
          continue;
        }
        throw new Error("百炼 API 返回内容为空");
      }

      console.log(
        `[bailian] 调用成功, 返回内容长度: ${content.length}, tokens: ${result.usage?.total_tokens ?? "unknown"}`
      );

      return {
        content,
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

      if (error instanceof DOMException && error.name === "AbortError") {
        console.error(
          `[bailian] 请求超时 (第${attempt}次), 超时时间: ${TIMEOUT_MS}ms`
        );
      } else {
        console.error(
          `[bailian] 调用异常 (第${attempt}次):`,
          error
        );
      }

      if (attempt < MAX_RETRIES) {
        await sleep(BASE_RETRY_INTERVAL * Math.pow(2, attempt - 1));
        continue;
      }
      throw error;
    }
  }

  throw new Error("百炼 API 调用失败: 超过最大重试次数");
}
