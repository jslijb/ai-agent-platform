import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRawSection } from "@/server/lib/config";

export const dynamic = "force-dynamic";

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  context: string;
  thinking: boolean;
  functionCalling: boolean;
}

function loadModelsFromConfig(): ModelOption[] {
  try {
    const llmSection = getRawSection("llm");
    const models = llmSection?.models;

    if (!Array.isArray(models) || models.length === 0) {
      console.warn("[agent/models] 配置文件中未找到 llm.models，使用空列表");
      return [];
    }

    const validModels: ModelOption[] = models
      .filter((m: any) => m && typeof m.id === "string" && typeof m.name === "string")
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        provider: m.provider || "unknown",
        description: m.description || "",
        context: m.context || "",
        thinking: m.thinking === true,
        functionCalling: m.functionCalling === true,
      }));

    console.log(`[agent/models] 从配置文件加载了 ${validModels.length} 个模型`);
    return validModels;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agent/models] 读取模型配置失败: ${message}`);
    return [];
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "未认证" },
        { status: 401 }
      );
    }

    const models = loadModelsFromConfig();
    const defaultModel = models.length > 0 ? models[0].id : "";

    return NextResponse.json({
      success: true,
      models,
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
