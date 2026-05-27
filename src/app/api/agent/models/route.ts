import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
}

const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "bailian",
    description: "快速推理，适合日常对话和简单分析",
  },
  {
    id: "deepseek-v4",
    name: "DeepSeek V4",
    provider: "bailian",
    description: "深度推理，适合复杂分析和多步计算",
  },
  {
    id: "qwen-max",
    name: "Qwen Max",
    provider: "bailian",
    description: "通义千问旗舰模型，综合能力强",
  },
  {
    id: "qwen-plus",
    name: "Qwen Plus",
    provider: "bailian",
    description: "通义千问增强版，性价比高",
  },
  {
    id: "qwen-turbo",
    name: "Qwen Turbo",
    provider: "bailian",
    description: "通义千问快速版，响应速度快",
  },
  {
    id: "qwen-long",
    name: "Qwen Long",
    provider: "bailian",
    description: "长文本模型，支持超长上下文",
  },
];

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "未认证" },
        { status: 401 }
      );
    }

    const defaultModel = process.env.BAILIAN_MODEL || "";

    return NextResponse.json({
      success: true,
      models: AVAILABLE_MODELS,
      defaultModel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agent/models] 获取模型列表失败: ${message}`);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
