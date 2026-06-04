import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import { auth } from "@/lib/auth";
import {
  getTriggerMode,
  setTriggerMode,
  type TriggerMode,
  type EvaluationConfig,
} from "@/server/evaluation/evaluation-trigger";

export const dynamic = "force-dynamic";

const CONFIG_PATH = path.resolve(process.cwd(), "config/evaluation-config.yaml");

function loadConfig(): EvaluationConfig {
  console.log("[evaluation-config] 加载评估配置文件");

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("[evaluation-config] 配置文件不存在: " + CONFIG_PATH);
    throw new Error("评估配置文件不存在");
  }

  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const config = yaml.load(raw) as EvaluationConfig;
  console.log("[evaluation-config] 配置文件加载成功");
  return config;
}

function saveConfig(config: EvaluationConfig): void {
  console.log("[evaluation-config] 保存评估配置文件");

  try {
    const content = yaml.dump(config, { indent: 2, lineWidth: 120 });
    fs.writeFileSync(CONFIG_PATH, content, "utf-8");
    console.log("[evaluation-config] 配置文件保存成功");
  } catch (error) {
    console.error("[evaluation-config] 配置文件保存失败:", error);
    throw error;
  }
}

export async function GET() {
  console.log("[evaluation-config] 收到获取评估配置请求");

  try {
    const session = await auth();
    if (!session?.user) {
      console.error("[evaluation-config] 未认证用户，拒绝请求");
      return NextResponse.json(
        { success: false, message: "未认证用户，请先登录" },
        { status: 401 }
      );
    }

    const config = loadConfig();
    const triggerMode = getTriggerMode();

    console.log(`[evaluation-config] 配置获取成功, 触发模式: ${triggerMode}`);

    return NextResponse.json({
      success: true,
      config,
      triggerMode,
    });
  } catch (error) {
    console.error("[evaluation-config] 获取评估配置失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "获取评估配置失败",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  console.log("[evaluation-config] 收到更新评估配置请求");

  try {
    const session = await auth();
    if (!session?.user) {
      console.error("[evaluation-config] 未认证用户，拒绝请求");
      return NextResponse.json(
        { success: false, message: "未认证用户，请先登录" },
        { status: 401 }
      );
    }

    const userRole = (session.user as any).role ?? "user";
    if (userRole !== "admin") {
      console.error(`[evaluation-config] 用户 ${session.user.email} 角色为 ${userRole}，无权修改配置`);
      return NextResponse.json(
        { success: false, message: "仅管理员可修改评估配置" },
        { status: 403 }
      );
    }

    const body = await request.json();
    console.log(`[evaluation-config] 更新参数: ${JSON.stringify(body)}`);

    const config = loadConfig();

    if (body.triggerMode !== undefined) {
      const newMode: TriggerMode = body.triggerMode;
      if (newMode !== "manual" && newMode !== "auto") {
        console.error(`[evaluation-config] 无效的触发模式: ${newMode}`);
        return NextResponse.json(
          { success: false, message: "无效的触发模式，有效值为 manual 或 auto" },
          { status: 400 }
        );
      }
      console.log(`[evaluation-config] 更新触发模式: ${config.trigger?.default_mode} -> ${newMode}`);
      config.trigger.default_mode = newMode;
    }

    if (body.autoConfig !== undefined && typeof body.autoConfig === "object") {
      console.log(`[evaluation-config] 更新自动触发配置: ${JSON.stringify(body.autoConfig)}`);

      if (body.autoConfig.schedule !== undefined) {
        Object.assign(config.trigger.auto.schedule, body.autoConfig.schedule);
        console.log("[evaluation-config] 定时触发配置已更新");
      }
      if (body.autoConfig.post_deploy !== undefined) {
        Object.assign(config.trigger.auto.post_deploy, body.autoConfig.post_deploy);
        console.log("[evaluation-config] 部署后触发配置已更新");
      }
      if (body.autoConfig.post_document_update !== undefined) {
        Object.assign(config.trigger.auto.post_document_update, body.autoConfig.post_document_update);
        console.log("[evaluation-config] 文档更新后触发配置已更新");
      }
      if (body.autoConfig.error_rate_spike !== undefined) {
        Object.assign(config.trigger.auto.error_rate_spike, body.autoConfig.error_rate_spike);
        console.log("[evaluation-config] 错误率上升触发配置已更新");
      }
    }

    if (body.ragWeights !== undefined && typeof body.ragWeights === "object") {
      console.log("[evaluation-config] 更新 RAG 评估指标权重");
      Object.assign(config.rag_weights as Record<string, unknown>, body.ragWeights);
    }

    if (body.agentWeights !== undefined && typeof body.agentWeights === "object") {
      console.log("[evaluation-config] 更新 Agent 评估指标权重");
      Object.assign(config.agent_weights as Record<string, unknown>, body.agentWeights);
    }

    if (body.thresholds !== undefined && typeof body.thresholds === "object") {
      console.log("[evaluation-config] 更新评估阈值配置");
      Object.assign(config.thresholds as Record<string, unknown>, body.thresholds);
    }

    saveConfig(config);

    const updatedTriggerMode = getTriggerMode();
    console.log(`[evaluation-config] 配置更新成功, 当前触发模式: ${updatedTriggerMode}`);

    return NextResponse.json({
      success: true,
      triggerMode: updatedTriggerMode,
      message: "评估配置更新成功",
    });
  } catch (error) {
    console.error("[evaluation-config] 更新评估配置失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "更新评估配置失败",
      },
      { status: 500 }
    );
  }
}
