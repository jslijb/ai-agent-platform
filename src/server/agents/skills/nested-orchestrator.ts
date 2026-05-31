import type { EnhancedSkillStep, EnhancedSkillDefinition } from "./enhanced-types";
import type { SkillExecutionResult } from "./types";
import { EnhancedSkillRegistry } from "./enhanced-registry";
import { executeEnhancedSkill } from "./enhanced-orchestrator";

export interface NestedSkillStep extends EnhancedSkillStep {
  subSkillId?: string;
}

export interface NestedSkillDefinition extends EnhancedSkillDefinition {
  steps: NestedSkillStep[];
}

export async function executeNestedSkill(
  skill: NestedSkillDefinition,
  initialParams: Record<string, unknown>
): Promise<SkillExecutionResult> {
  const startTime = Date.now();
  const stepResults: SkillExecutionResult["stepResults"] = [];

  console.log(`[NestedOrchestrator] 开始执行嵌套Skill: ${skill.name}`);

  for (let i = 0; i < skill.steps.length; i++) {
    const step = skill.steps[i];

    if (step.subSkillId) {
      const subSkill = EnhancedSkillRegistry.get(step.subSkillId);
      if (!subSkill) {
        console.error(
          `[NestedOrchestrator] 子Skill "${step.subSkillId}" 未注册`
        );
        stepResults.push({
          step: i,
          tool: step.subSkillId,
          success: false,
          output: null,
          error: `子Skill "${step.subSkillId}" 未注册`,
        });
        continue;
      }

      console.log(
        `[NestedOrchestrator] 递归执行子Skill: ${step.subSkillId}`
      );
      try {
        const subResult = await executeEnhancedSkill(
          subSkill,
          { ...initialParams, ...step.params }
        );
        stepResults.push({
          step: i,
          tool: step.subSkillId,
          success: subResult.success,
          output: subResult.finalOutput,
          error: subResult.success
            ? undefined
            : `子Skill执行失败: ${subResult.finalOutput}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[NestedOrchestrator] 子Skill "${step.subSkillId}" 执行异常: ${msg}`
        );
        stepResults.push({
          step: i,
          tool: step.subSkillId,
          success: false,
          output: null,
          error: msg,
        });
      }
    } else {
      const subResult = await executeEnhancedSkill(
        {
          ...skill,
          steps: [step],
          outputTemplate: undefined,
        },
        { ...initialParams, ...step.params }
      );

      if (subResult.stepResults.length > 0) {
        stepResults.push(subResult.stepResults[0]);
      }
    }
  }

  const allSuccess = stepResults.every((r) => r.success);
  const finalOutput = allSuccess
    ? buildNestedOutput(skill, stepResults)
    : `嵌套Skill "${skill.name}" 执行失败: ${stepResults.filter((r) => !r.success).map((r) => r.error).join("; ")}`;

  const executionTimeMs = Date.now() - startTime;
  console.log(
    `[NestedOrchestrator] 嵌套Skill "${skill.name}" 执行完成, 耗时: ${executionTimeMs}ms, 成功: ${allSuccess}`
  );

  return {
    skillName: skill.name,
    success: allSuccess,
    stepResults,
    finalOutput,
    executionTimeMs,
  };
}

function buildNestedOutput(
  skill: NestedSkillDefinition,
  stepResults: SkillExecutionResult["stepResults"]
): string {
  if (skill.outputTemplate) {
    let output = skill.outputTemplate;
    for (let i = 0; i < stepResults.length; i++) {
      const result = stepResults[i];
      output = output.replace(
        new RegExp(`\\{\\{steps\\[${i}\\]\\.output\\}\\}`, "g"),
        typeof result.output === "string"
          ? result.output
          : JSON.stringify(result.output)
      );
    }
    return output;
  }

  const parts = stepResults.map((r, i) => {
    const label = skill.steps[i]?.subSkillId
      ? `子Skill: ${skill.steps[i].subSkillId}`
      : `步骤${i + 1}: ${r.tool}`;
    const outputStr =
      typeof r.output === "string"
        ? r.output
        : JSON.stringify(r.output, null, 2);
    return `【${label}】\n${outputStr}`;
  });

  return `=== ${skill.name} 报告 ===\n\n${parts.join("\n\n")}`;
}

export const comprehensiveDiagnosisNestedSkill: NestedSkillDefinition = {
  name: "comprehensive-diagnosis-nested",
  description: "综合诊断（嵌套编排）：通过子Skill引用实现技术分析和基本面分析的嵌套编排",
  triggerKeywords: ["综合诊断", "全面分析", "综合分析", "诊断报告", "全面评估"],
  applicableScenarios: "用户需要对股票进行全面综合诊断，嵌套调用技术分析和基本面分析子Skill",
  orchestrationSummary: "先执行技术分析子Skill(technical-analysis)，再执行基本面分析子Skill(fundamental-analysis)，最后执行合规检查",
  typicalQueries: ["五粮液综合诊断", "全面分析", "综合评估"],
  relatedTools: ["calculateMA", "calculateMACD", "calculateRSI", "checkTradeCompliance", "calculateVaR", "calculateMaxDrawdown", "calculateVolatility"],
  relatedGroups: ["technical-analysis", "fundamental-data", "risk-compliance"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "comprehensive_diagnosis",
  timeoutMs: 120000,
  steps: [
    {
      tool: "technical-analysis",
      params: {},
      subSkillId: "technical-analysis",
    },
    {
      tool: "fundamental-analysis",
      params: {},
      subSkillId: "fundamental-analysis",
    },
    {
      tool: "checkTradeCompliance",
      params: {},
    },
    {
      tool: "calculateVaR",
      params: {},
      parallel: true,
    },
    {
      tool: "calculateMaxDrawdown",
      params: {},
      parallel: true,
    },
    {
      tool: "calculateVolatility",
      params: {},
      parallel: true,
    },
  ],
  outputTemplate: `=== 综合诊断报告（嵌套编排） ===

【技术面分析】
{{steps[0].output}}

【基本面分析】
{{steps[1].output}}

【合规状态】
{{steps[2].output}}

【风控 - VaR】
{{steps[3].output}}

【风控 - 最大回撤】
{{steps[4].output}}

【风控 - 波动率】
{{steps[5].output}}`,
};
