import type { SkillDefinition, SkillExecutionResult } from "./types";
import type {
  EnhancedSkillDefinition,
  SkillCategory,
} from "./enhanced-types";
import { executeEnhancedSkill } from "./enhanced-orchestrator";

class EnhancedSkillRegistryClass {
  private skills: Map<string, EnhancedSkillDefinition> = new Map();

  register(skill: EnhancedSkillDefinition | SkillDefinition): void {
    if (this.skills.has(skill.name)) {
      console.warn(
        `[EnhancedSkillRegistry] Skill "${skill.name}" 已注册，跳过重复注册`
      );
      return;
    }
    this.skills.set(skill.name, skill as EnhancedSkillDefinition);
    const cat = (skill as EnhancedSkillDefinition).skillCategory || "";
    console.log(
      `[EnhancedSkillRegistry] 注册Skill: ${skill.name}${cat ? ` [${cat}]` : ""}`
    );
  }

  get(name: string): EnhancedSkillDefinition | undefined {
    return this.skills.get(name);
  }

  list(): EnhancedSkillDefinition[] {
    return Array.from(this.skills.values());
  }

  listByCategory(category: SkillCategory): EnhancedSkillDefinition[] {
    return Array.from(this.skills.values()).filter(
      (s) => s.skillCategory === category
    );
  }

  listDescriptions(): string {
    return Array.from(this.skills.values())
      .map(
        (s) =>
          `- ${s.name}: ${s.description}${s.triggerKeywords ? ` (关键词: ${s.triggerKeywords.join(",")})` : ""}${s.skillCategory ? ` [${s.skillCategory}]` : ""}`
      )
      .join("\n");
  }

  listEnhancedDescriptions(): string {
    return Array.from(this.skills.values())
      .map((s) => {
        const parts = [`- ${s.name}: ${s.description}`];
        if (s.applicableScenarios)
          parts.push(`  适用场景: ${s.applicableScenarios}`);
        if (s.orchestrationSummary)
          parts.push(`  编排概要: ${s.orchestrationSummary}`);
        if (s.typicalQueries)
          parts.push(`  典型query: ${s.typicalQueries.join(", ")}`);
        if (s.skillCategory) parts.push(`  分类: ${s.skillCategory}`);
        return parts.join("\n");
      })
      .join("\n\n");
  }

  match(query: string): EnhancedSkillDefinition | null {
    const lowerQuery = query.toLowerCase();
    let bestMatch: EnhancedSkillDefinition | null = null;
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
      if (skill.typicalQueries) {
        for (const tq of skill.typicalQueries) {
          const lowerTq = tq.toLowerCase();
          if (
            lowerQuery.includes(lowerTq) ||
            lowerTq.split("").filter((c) => lowerQuery.includes(c)).length /
              lowerTq.length >
              0.6
          ) {
            score += 3;
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

export const EnhancedSkillRegistry = new EnhancedSkillRegistryClass();

export async function executeSkill(
  skill: SkillDefinition,
  initialParams: Record<string, unknown>
): Promise<SkillExecutionResult> {
  const enhancedSkill = skill as EnhancedSkillDefinition;
  const startTime = Date.now();

  const result = await executeEnhancedSkill(enhancedSkill, initialParams);

  const executionTimeMs = Date.now() - startTime;

  return {
    skillName: skill.name,
    success: result.success,
    stepResults: result.stepResults.map((r) => ({
      step: r.step,
      tool: r.tool,
      success: r.success,
      output: r.output,
      ...(r.skipped ? { error: "跳过" } : {}),
    })),
    finalOutput: result.finalOutput,
    executionTimeMs,
  };
}
