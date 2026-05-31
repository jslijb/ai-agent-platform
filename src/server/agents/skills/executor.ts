import type { SkillDefinition, SkillExecutionResult } from "./types";
import { ToolRegistry } from "../../tools/registry";

class SkillRegistryClass {
  private skills: Map<string, SkillDefinition> = new Map();

  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.name)) {
      console.warn(`[SkillRegistry] Skill "${skill.name}" 已注册，跳过重复注册`);
      return;
    }
    this.skills.set(skill.name, skill);
    console.log(`[SkillRegistry] 注册Skill: ${skill.name}`);
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  listDescriptions(): string {
    return Array.from(this.skills.values())
      .map((s) => `- ${s.name}: ${s.description}${s.triggerKeywords ? ` (关键词: ${s.triggerKeywords.join(",")})` : ""}`)
      .join("\n");
  }

  match(query: string): SkillDefinition | null {
    const lowerQuery = query.toLowerCase();
    let bestMatch: SkillDefinition | null = null;
    let bestScore = 0;

    for (const skill of Array.from(this.skills.values())) {
      let score = 0;
      if (skill.triggerKeywords) {
        for (const kw of skill.triggerKeywords) {
          if (lowerQuery.includes(kw.toLowerCase())) {
            score += 2;
          }
        }
      }
      for (const word of skill.description.toLowerCase().split(/\s+/)) {
        if (word.length >= 2 && lowerQuery.includes(word)) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = skill;
      }
    }

    return bestScore >= 2 ? bestMatch : null;
  }
}

export const SkillRegistry = new SkillRegistryClass();

function resolveParamRefs(
  paramRefs: Record<string, string>,
  stepResults: Array<{ output: unknown }>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, ref] of Object.entries(paramRefs)) {
    const match = ref.match(/^\{\{steps\[(\d+)\]\.output(?:\.(.+))?\}\}$/);
    if (match) {
      const stepIdx = parseInt(match[1], 10);
      const field = match[2];
      const stepOutput = stepResults[stepIdx]?.output;
      if (stepOutput && typeof stepOutput === "object") {
        resolved[key] = field ? (stepOutput as Record<string, unknown>)[field] : stepOutput;
      } else {
        resolved[key] = stepOutput;
      }
    } else {
      resolved[key] = ref;
    }
  }
  return resolved;
}

export async function executeSkill(
  skill: SkillDefinition,
  initialParams: Record<string, unknown>
): Promise<SkillExecutionResult> {
  const startTime = Date.now();
  const stepResults: SkillExecutionResult["stepResults"] = [];

  console.log(`[SkillExecutor] 开始执行Skill: ${skill.name}`);

  const stepGroups: Array<Array<{ index: number; step: typeof skill.steps[0] }>> = [];
  let currentGroup: Array<{ index: number; step: typeof skill.steps[0] }> = [];

  for (let i = 0; i < skill.steps.length; i++) {
    const step = skill.steps[i];
    if (step.parallel && currentGroup.length > 0) {
      currentGroup.push({ index: i, step });
    } else {
      if (currentGroup.length > 0) {
        stepGroups.push(currentGroup);
      }
      currentGroup = [{ index: i, step }];
    }
  }
  if (currentGroup.length > 0) {
    stepGroups.push(currentGroup);
  }

  for (const group of stepGroups) {
    const promises = group.map(async ({ index, step }) => {
      const tool = ToolRegistry.get(step.tool);
      if (!tool) {
        console.error(`[SkillExecutor] 工具 "${step.tool}" 未注册`);
        return {
          step: index,
          tool: step.tool,
          success: false,
          output: null,
          error: `工具 "${step.tool}" 未注册`,
        };
      }

      const mergedParams: Record<string, unknown> = { ...step.params, ...initialParams };
      if (step.paramRefs) {
        const resolved = resolveParamRefs(step.paramRefs, stepResults.map((r) => ({ output: r.output })));
        Object.assign(mergedParams, resolved);
      }

      try {
        const output = await tool.execute(mergedParams);
        return { step: index, tool: step.tool, success: true, output };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[SkillExecutor] 工具 "${step.tool}" 执行失败: ${msg}`);
        return { step: index, tool: step.tool, success: false, output: null, error: msg };
      }
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      stepResults.push(r);
    }
  }

  const allSuccess = stepResults.every((r) => r.success);
  const finalOutput = allSuccess
    ? formatSkillOutput(skill, stepResults)
    : `Skill "${skill.name}" 执行失败: ${stepResults.filter((r) => !r.success).map((r) => r.error).join("; ")}`;

  const executionTimeMs = Date.now() - startTime;
  console.log(`[SkillExecutor] Skill "${skill.name}" 执行完成, 耗时: ${executionTimeMs}ms, 成功: ${allSuccess}`);

  return {
    skillName: skill.name,
    success: allSuccess,
    stepResults,
    finalOutput,
    executionTimeMs,
  };
}

function formatSkillOutput(
  skill: SkillDefinition,
  stepResults: SkillExecutionResult["stepResults"]
): string {
  if (skill.outputTemplate) {
    let output = skill.outputTemplate;
    for (let i = 0; i < stepResults.length; i++) {
      const result = stepResults[i];
      output = output.replace(
        new RegExp(`\\{\\{steps\\[${i}\\]\\.output\\}\\}`, "g"),
        typeof result.output === "string" ? result.output : JSON.stringify(result.output)
      );
    }
    return output;
  }

  const parts = stepResults.map((r, i) => {
    const outputStr = typeof r.output === "string" ? r.output : JSON.stringify(r.output, null, 2);
    return `【步骤${i + 1}: ${r.tool}】\n${outputStr}`;
  });

  return `=== ${skill.name} 报告 ===\n\n${parts.join("\n\n")}`;
}
