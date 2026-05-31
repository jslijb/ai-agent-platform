import { EnhancedSkillRegistry } from "../skills/enhanced-registry";
import type { EnhancedSkillDefinition } from "../skills/enhanced-types";

export interface MultiSkillMatchResult {
  primarySkill: EnhancedSkillDefinition;
  auxiliarySkills: EnhancedSkillDefinition[];
  mergedToolGroups: string[];
}

export class MultiSkillMatcher {
  match(query: string): MultiSkillMatchResult | null {
    const allSkills = EnhancedSkillRegistry.list();
    const lowerQuery = query.toLowerCase();

    const matchedSkills: Array<{
      skill: EnhancedSkillDefinition;
      score: number;
    }> = [];

    for (const skill of allSkills) {
      let score = 0;
      if (skill.triggerKeywords) {
        for (const kw of skill.triggerKeywords) {
          if (lowerQuery.includes(kw.toLowerCase())) score += 2;
        }
      }
      if (skill.typicalQueries) {
        for (const tq of skill.typicalQueries) {
          if (lowerQuery.includes(tq.toLowerCase())) score += 3;
        }
      }
      if (score >= 2) {
        matchedSkills.push({ skill, score });
      }
    }

    if (matchedSkills.length <= 1) return null;

    matchedSkills.sort((a, b) => b.score - a.score);
    const primarySkill = matchedSkills[0].skill;
    const auxiliarySkills = matchedSkills.slice(1).map((m) => m.skill);

    const mergedToolGroups = [
      ...(primarySkill.relatedGroups || []),
      ...auxiliarySkills.flatMap((s) => s.relatedGroups || []),
    ];
    const uniqueGroups = Array.from(new Set(mergedToolGroups));

    return { primarySkill, auxiliarySkills, mergedToolGroups: uniqueGroups };
  }
}
