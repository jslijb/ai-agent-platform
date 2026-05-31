import { callWithFallback } from "@/server/llm/router";

function resolveVisionModel(): string {
  const configured = process.env.VISION_MODEL?.trim();
  if (!configured) {
    console.warn("[image-caption] ⚠️ VISION_MODEL 未设置，请在 .env.local 中配置，例如: VISION_MODEL=qwen-vl-max");
    throw new Error("VISION_MODEL 环境变量未设置，请在 .env.local 中配置视觉模型");
  }
  return configured;
}

const MAX_RETRIES = 3;
const RETRY_INTERVAL = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callVisionModel(imageBase64: string): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.error("[image-caption] DASHSCOPE_API_KEY 环境变量未设置");
    throw new Error("DASHSCOPE_API_KEY 环境变量未设置");
  }

  const visionModel = resolveVisionModel();
  const baseUrl =
    process.env.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1";

  console.log(
    `[image-caption] 调用视觉模型: ${visionModel}, 图片 base64 长度: ${imageBase64.length}`
  );

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: visionModel,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${imageBase64}`,
                  },
                },
                {
                  type: "text",
                  text: "请详细描述这张图片的内容，包括图表数据、文字信息、关键要素等。如果图片包含表格或图表，请描述其中的数据和趋势。",
                },
              ],
            },
          ],
          temperature: 0.3,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[image-caption] 视觉模型请求失败 (第${attempt}次): ${response.status} ${errorText}`
        );
        const nonRetryableStatuses = [400, 401, 403, 404, 422];
        if (nonRetryableStatuses.includes(response.status)) {
          console.error(`[image-caption] HTTP ${response.status} 为不可重试错误，立即终止`);
          throw new Error(`视觉模型请求失败(不可重试): ${response.status} ${errorText}`);
        }
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_INTERVAL);
          continue;
        }
        throw new Error(`视觉模型请求失败: ${response.status} ${errorText}`);
      }

      const result = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string };
        }>;
        usage?: { total_tokens: number };
      };

      const content = result.choices?.[0]?.message?.content;
      if (!content) {
        console.error(
          `[image-caption] 视觉模型返回内容为空 (第${attempt}次)`
        );
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_INTERVAL);
          continue;
        }
        throw new Error("视觉模型返回内容为空");
      }

      console.log(
        `[image-caption] 视觉模型调用成功, 描述长度: ${content.length}, tokens: ${result.usage?.total_tokens ?? "unknown"}`
      );

      return content;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === "AbortError") {
        console.error(
          `[image-caption] 视觉模型请求超时 (第${attempt}次)`
        );
      } else {
        console.error(
          `[image-caption] 视觉模型调用异常 (第${attempt}次):`,
          error
        );
      }

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_INTERVAL);
        continue;
      }
      throw error;
    }
  }

  throw new Error("视觉模型调用失败: 超过最大重试次数");
}

export async function describeImage(imageBase64: string): Promise<string> {
  console.log(
    `[image-caption] 开始生成图片描述, base64 长度: ${imageBase64.length}`
  );

  try {
    const description = await callVisionModel(imageBase64);
    console.log(
      `[image-caption] 图片描述生成完成, 长度: ${description.length}`
    );
    return description;
  } catch (error) {
    console.error("[image-caption] 图片描述生成失败:", error);

    try {
      console.log("[image-caption] 尝试使用 callBailian 文本模型降级处理...");
      const response = await callWithFallback([
        {
          role: "user",
          content:
            "由于视觉模型不可用，请返回空字符串作为图片描述占位符。仅返回：[图片内容暂无法识别]",
        },
      ]);
      console.log("[image-caption] 降级处理完成");
      return response.content ?? "";
    } catch (fallbackError) {
      console.error("[image-caption] 降级处理也失败:", fallbackError);
      return "[图片内容暂无法识别]";
    }
  }
}

export async function describeImages(
  imagesBase64: string[]
): Promise<string[]> {
  console.log(
    `[image-caption] 批量生成图片描述, 数量: ${imagesBase64.length}`
  );

  const descriptions: string[] = [];
  for (let i = 0; i < imagesBase64.length; i++) {
    try {
      const desc = await describeImage(imagesBase64[i]);
      descriptions.push(desc);
      console.log(
        `[image-caption] 第 ${i + 1}/${imagesBase64.length} 张图片描述完成`
      );
    } catch (error) {
      console.error(
        `[image-caption] 第 ${i + 1} 张图片描述失败:`,
        error
      );
      descriptions.push("[图片内容暂无法识别]");
    }
  }

  console.log(
    `[image-caption] 批量描述完成, 成功: ${descriptions.filter((d) => !d.startsWith("[图片")).length}/${imagesBase64.length}`
  );
  return descriptions;
}
