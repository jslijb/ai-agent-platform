import type { PaddleOCRResult } from "./types";

export class PaddleOCRMcpClient {
  private enabled: boolean;
  private endpoint: string;
  private timeoutMs: number = 30000;

  constructor() {
    this.enabled = process.env.PADDLEOCR_MCP_ENABLED === "true";
    this.endpoint =
      process.env.PADDLEOCR_MCP_ENDPOINT || "http://localhost:8020";
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async analyze(
    imageBase64: string,
    prompt?: string
  ): Promise<PaddleOCRResult> {
    const startTime = Date.now();
    if (!this.enabled) {
      return {
        success: false,
        error: "PaddleOCR MCP Server 未启用",
        engineUsed: "paddleocr_vl",
        executionTimeMs: Date.now() - startTime,
      };
    }

    try {
      const response = await fetch(`${this.endpoint}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          prompt: prompt || "请详细解析这张图片的内容，提取所有文字和结构化数据",
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `PaddleOCR返回错误: ${response.status}`,
          engineUsed: "paddleocr_vl",
          executionTimeMs: Date.now() - startTime,
        };
      }

      const data = await response.json();
      return {
        success: true,
        text: data.text || data.markdown,
        structuredData: data.structured || data.json,
        pageCount: data.pageCount,
        engineUsed: "paddleocr_vl",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        engineUsed: "paddleocr_vl",
        executionTimeMs: Date.now() - startTime,
      };
    }
  }
}
