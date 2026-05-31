import type { EnhancedSkillDefinition } from "@/server/agents/skills/enhanced-types";

export class SkillDescriptionEnhancer {
  formatForPrompt(skills: EnhancedSkillDefinition[]): string {
    return skills.map(s =>
      `- ${s.name}: ${s.description}\n  适用场景: ${s.applicableScenarios || '通用'}\n  编排概要: ${s.orchestrationSummary || '标准编排'}\n  典型查询: ${(s.typicalQueries || []).join(', ')}`
    ).join('\n\n');
  }
}

export const skillDescriptionEnhancer = new SkillDescriptionEnhancer();
