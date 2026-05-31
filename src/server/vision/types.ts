export type VisionEngine = "paddleocr_vl" | "qwen3.5-plus" | "mineru";

export interface PaddleOCRResult {
  success: boolean;
  text?: string;
  structuredData?: Record<string, unknown>;
  pageCount?: number;
  error?: string;
  engineUsed: "paddleocr_vl";
  executionTimeMs: number;
}

export interface VisionResult {
  success: boolean;
  description?: string;
  engineUsed: "qwen3.5-plus";
  tokenUsage?: number;
  executionTimeMs: number;
  error?: string;
}

export interface DualEngineResult {
  success: boolean;
  result: PaddleOCRResult | VisionResult;
  engineUsed: VisionEngine;
  degraded: boolean;
  degradationReason?: string;
  degradationTimeMs?: number;
}
