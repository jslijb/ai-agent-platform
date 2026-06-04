import { PaddleOCRMcpClient } from "./paddleocr-mcp-client";
import { VisionFallbackClient } from "./vision-fallback-client";
import type { DualEngineResult, PaddleOCRResult, VisionResult } from "./types";

export class DualEngineRouter {
  private paddleOcr: PaddleOCRMcpClient;
  private visionFallback: VisionFallbackClient;

  constructor() {
    this.paddleOcr = new PaddleOCRMcpClient();
    this.visionFallback = new VisionFallbackClient();
  }

  async analyze(
    imageBase64: string,
    prompt?: string
  ): Promise<DualEngineResult> {
    if (this.paddleOcr.isEnabled()) {
      const startTime = Date.now();
      const result = await this.paddleOcr.analyze(imageBase64, prompt);

      if (result.success) {
        return {
          success: true,
          result,
          engineUsed: "paddleocr_vl",
          degraded: false,
        };
      }

      console.warn(
        `[DualEngineRouter] PaddleOCR失败: ${result.error}，尝试降级到Vision`
      );

      // PaddleOCR 失败时降级到 Vision 模型
      if (this.visionFallback.isAvailable()) {
        const degradationTimeMs = Date.now() - startTime;
        const fallbackResult = await this.visionFallback.analyze(
          imageBase64,
          prompt
        );

        if (fallbackResult.success) {
          return {
            success: true,
            result: fallbackResult,
            engineUsed: "vision-fallback",
            degraded: true,
            degradationReason: result.error,
            degradationTimeMs,
          };
        }

        return {
          success: false,
          result: fallbackResult,
          engineUsed: "vision-fallback",
          degraded: true,
          degradationReason: `PaddleOCR: ${result.error}; Vision: ${fallbackResult.error}`,
          degradationTimeMs,
        };
      }

      return {
        success: false,
        result,
        engineUsed: "paddleocr_vl",
        degraded: false,
        degradationReason: result.error,
      };
    }

    // PaddleOCR 未启用时直接使用 Vision 模型
    if (this.visionFallback.isAvailable()) {
      const result = await this.visionFallback.analyze(imageBase64, prompt);
      return {
        success: result.success,
        result,
        engineUsed: "vision-fallback",
        degraded: true,
        degradationReason: "PaddleOCR未启用，直接使用Vision模型",
      };
    }

    return {
      success: false,
      result: {
        success: false,
        error: "双引擎均不可用",
        engineUsed: "paddleocr_vl",
        executionTimeMs: 0,
      },
      engineUsed: "paddleocr_vl",
      degraded: false,
      degradationReason: "PaddleOCR未启用且Vision模型不可用",
    };
  }
}
