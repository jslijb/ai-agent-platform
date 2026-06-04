import type { VisionResult } from "./types";

export class VisionFallbackClient {
  private visionModel: string;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.visionModel = process.env.VISION_MODEL || "qwen3.5-plus";
    this.apiKey = process.env.DASHSCOPE_API_KEY || "";
    this.baseUrl =
      process.env.DASHSCOPE_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1";
  }

  isAvailable(): boolean {
    return !!this.apiKey && !!this.visionModel;
  }

  async analyze(
    imageBase64: string,
    prompt?: string
  ): Promise<VisionResult> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      return {
        success: false,
        error: "Vision模型未配置（缺少DASHSCOPE_API_KEY或VISION_MODEL）",
        engineUsed: this.visionModel,
        executionTimeMs: Date.now() - startTime,
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.visionModel,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${imageBase64}` },
                },
                {
                  type: "text",
                  text:
                    prompt || "请详细描述这张图片的内容，提取所有文字和数据",
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Vision API返回错误: ${response.status}`,
          engineUsed: this.visionModel,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const data = await response.json();
      const description = data.choices?.[0]?.message?.content || "";

      return {
        success: true,
        description,
        engineUsed: this.visionModel,
        tokenUsage: data.usage?.total_tokens,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        engineUsed: this.visionModel,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }
}
