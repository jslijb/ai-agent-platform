import type {
  EnhancedSkillDefinition,
  EnhancedSkillStep,
  OrchestrationContext,
  ErrorRecoveryStrategy,
} from "./enhanced-types";
import { ToolRegistry } from "@/server/tools/registry";
import { resolveToolName } from "@/server/tools/name-aliases";

export interface EnhancedOrchestrationResult {
  success: boolean;
  finalOutput: string;
  stepResults: Array<{
    step: number;
    tool: string;
    success: boolean;
    output: string;
    skipped?: boolean;
    retried?: number;
  }>;
  context: OrchestrationContext;
}

function resolveParamRefs(
  paramRefs: Record<string, string>,
  stepResults: Array<{ output: unknown }>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, ref] of Object.entries(paramRefs)) {
    const match = ref.match(
      /^\{\{steps\[(\d+)\]\.output(?:\.(.+))?\}\}$/
    );
    if (match) {
      const stepIdx = parseInt(match[1], 10);
      const field = match[2];
      const stepOutput = stepResults[stepIdx]?.output;
      if (stepOutput && typeof stepOutput === "object") {
        resolved[key] = field
          ? (stepOutput as Record<string, unknown>)[field]
          : stepOutput;
      } else {
        resolved[key] = stepOutput;
      }
    } else {
      resolved[key] = ref;
    }
  }
  return resolved;
}

function evaluateCondition(
  condition: string,
  context: OrchestrationContext
): boolean {
  if (condition === "always") return true;
  if (condition === "noError") return context.status !== "error";

  const stepMatch = condition.match(
    /^steps\[(\d+)\]\.output(?:\.(.+))?$/
  );
  if (stepMatch) {
    const stepIdx = parseInt(stepMatch[1], 10);
    const field = stepMatch[2];
    const stepOutput = context.stepResults[stepIdx]?.output;
    if (stepOutput && typeof stepOutput === "object" && field) {
      return !!(stepOutput as Record<string, unknown>)[field];
    }
    return !!stepOutput;
  }

  const prevMatch = condition.match(/^previousOutput\.(.+)$/);
  if (prevMatch) {
    const field = prevMatch[1];
    const lastResult =
      context.stepResults.length > 0
        ? context.stepResults[context.stepResults.length - 1]
        : null;
    if (lastResult?.output && typeof lastResult.output === "object") {
      return !!(lastResult.output as Record<string, unknown>)[field];
    }
    return false;
  }

  if (condition === "hasPreviousResult") {
    const lastResult =
      context.stepResults.length > 0
        ? context.stepResults[context.stepResults.length - 1]
        : null;
    return lastResult !== null && lastResult.output !== null;
  }

  try {
    const fn = new Function(
      "context",
      `with(context) { return !!(${condition}); }`
    );
    return fn(context);
  } catch {
    console.warn(
      `[EnhancedOrchestrator] 条件表达式求值失败: ${condition}`
    );
    return true;
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`工具执行超时 (${timeoutMs}ms)`)),
        timeoutMs
      )
    ),
  ]);
}

export async function executeEnhancedSkill(
  skill: EnhancedSkillDefinition,
  params: Record<string, unknown>,
  timeoutMs?: number
): Promise<EnhancedOrchestrationResult> {
  const defaultTimeout = timeoutMs ?? skill.timeoutMs ?? 30000;

  const context: OrchestrationContext = {
    skillId: skill.name,
    currentStepIndex: 0,
    stepResults: [],
    status: "running",
    initialParams: params,
  };

  const stepResults: EnhancedOrchestrationResult["stepResults"] = [];

  console.log(
    `[EnhancedOrchestrator] 开始执行Skill: ${skill.name} (步骤数: ${skill.steps.length})`
  );

  for (let i = 0; i < skill.steps.length; i++) {
    const step: EnhancedSkillStep = skill.steps[i];
    context.currentStepIndex = i;

    if (step.condition) {
      const condResult = evaluateCondition(step.condition, context);
      if (!condResult) {
        console.log(
          `[EnhancedOrchestrator] 步骤${i} 条件不满足，跳过: ${step.condition}`
        );
        stepResults.push({
          step: i,
          tool: step.tool,
          success: true,
          output: "",
          skipped: true,
        });
        context.stepResults.push({ output: null });
        continue;
      }
    }

    const mergedParams: Record<string, unknown> = {
      ...step.params,
      ...params,
    };

    if (step.paramRefs) {
      const resolved = resolveParamRefs(step.paramRefs, context.stepResults);
      Object.assign(mergedParams, resolved);
    }

    if (step.dynamicParamResolver) {
      try {
        const fn = new Function(
          "context",
          "params",
          `return (${step.dynamicParamResolver});`
        );
        const dynamicResult = fn(context, mergedParams);
        if (dynamicResult && typeof dynamicResult === "object") {
          Object.assign(mergedParams, dynamicResult);
        }
      } catch (err) {
        console.warn(
          `[EnhancedOrchestrator] dynamicParamResolver 求值失败: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const resolvedToolName = resolveToolName(step.tool, ToolRegistry);
    const tool = ToolRegistry.get(resolvedToolName);

    if (!tool) {
      console.error(
        `[EnhancedOrchestrator] 工具 "${step.tool}" (解析后: "${resolvedToolName}") 未注册`
      );
      stepResults.push({
        step: i,
        tool: step.tool,
        success: false,
        output: `工具 "${step.tool}" 未注册`,
      });
      context.stepResults.push({ output: null });

      if (skill.errorRecovery?.type === "abort") {
        context.status = "error";
        context.errorInfo = `工具 "${step.tool}" 未注册，策略abort终止`;
        break;
      }
      continue;
    }

    const stepTimeout = step.timeoutMs ?? defaultTimeout;
    const strategy = skill.errorRecovery;
    let stepSuccess = false;
    let stepOutput = "";
    let retryCount = 0;
    let aborted = false;

    if (strategy?.type === "retry") {
      const maxRetries = strategy.maxRetries ?? 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const output = await withTimeout(
            Promise.resolve(tool.execute(mergedParams)),
            stepTimeout
          );
          stepOutput =
            typeof output === "string" ? output : JSON.stringify(output);
          stepSuccess = true;
          retryCount = attempt;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[EnhancedOrchestrator] 步骤${i} 工具"${step.tool}" 第${attempt + 1}次执行失败: ${msg}`
          );
          if (attempt < maxRetries) {
            console.log(
              `[EnhancedOrchestrator] 步骤${i} 重试中 (${attempt + 1}/${maxRetries})...`
            );
          } else {
            stepOutput = msg;
          }
          retryCount = attempt;
        }
      }
    } else {
      try {
        const output = await withTimeout(
          Promise.resolve(tool.execute(mergedParams)),
          stepTimeout
        );
        stepOutput =
          typeof output === "string" ? output : JSON.stringify(output);
        stepSuccess = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[EnhancedOrchestrator] 步骤${i} 工具"${step.tool}" 执行失败: ${msg}`
        );
        stepOutput = msg;

        if (strategy?.type === "fallback" && step.fallbackTool) {
          console.log(
            `[EnhancedOrchestrator] 步骤${i} 使用fallback工具: ${step.fallbackTool}`
          );
          const fallbackResolved = resolveToolName(
            step.fallbackTool,
            ToolRegistry
          );
          const fallbackTool = ToolRegistry.get(fallbackResolved);
          if (fallbackTool) {
            try {
              const fbOutput = await withTimeout(
                Promise.resolve(fallbackTool.execute(mergedParams)),
                stepTimeout
              );
              stepOutput =
                typeof fbOutput === "string"
                  ? fbOutput
                  : JSON.stringify(fbOutput);
              stepSuccess = true;
            } catch (fbErr) {
              const fbMsg =
                fbErr instanceof Error ? fbErr.message : String(fbErr);
              console.error(
                `[EnhancedOrchestrator] 步骤${i} fallback工具"${step.fallbackTool}"也失败: ${fbMsg}`
              );
              stepOutput = `主工具失败: ${msg}; fallback失败: ${fbMsg}`;
            }
          } else {
            stepOutput = `主工具失败: ${msg}; fallback工具"${step.fallbackTool}"未注册`;
          }
        } else if (strategy?.type === "abort") {
          aborted = true;
        }
      }
    }

    stepResults.push({
      step: i,
      tool: step.tool,
      success: stepSuccess,
      output: stepOutput,
      ...(retryCount > 0 ? { retried: retryCount } : {}),
    });
    context.stepResults.push({
      output: stepSuccess ? stepOutput : null,
    });

    if (aborted) {
      context.status = "error";
      context.errorInfo = stepOutput;
      break;
    }
  }

  const allSuccess = stepResults.every(
    (r) => r.success || r.skipped
  );
  context.status = allSuccess ? "completed" : "error";

  let finalOutput: string;
  if (skill.outputTemplate) {
    finalOutput = skill.outputTemplate;
    for (let i = 0; i < stepResults.length; i++) {
      const result = stepResults[i];
      finalOutput = finalOutput.replace(
        new RegExp(`\\{\\{steps\\[${i}\\]\\.output\\}\\}`, "g"),
        result.output
      );
    }
  } else {
    const parts = stepResults
      .filter((r) => !r.skipped)
      .map((r, idx) => {
        const label = `【步骤${idx + 1}: ${r.tool}】`;
        return r.success
          ? `${label}\n${r.output}`
          : `${label} 失败: ${r.output}`;
      });
    finalOutput = `=== ${skill.name} 报告 ===\n\n${parts.join("\n\n")}`;
  }

  console.log(
    `[EnhancedOrchestrator] Skill "${skill.name}" 执行完成, 状态: ${context.status}, 步骤: ${stepResults.length}`
  );

  return {
    success: allSuccess,
    finalOutput,
    stepResults,
    context,
  };
}
