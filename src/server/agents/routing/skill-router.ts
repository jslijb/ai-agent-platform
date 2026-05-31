import type { EnhancedSkillDefinition } from "../skills/enhanced-types";
import { EnhancedSkillRegistry } from "../skills/enhanced-registry";
import { ToolRegistry } from "../../tools/registry";
import { SkillVectorRetriever } from "../../retrieval/skill-vector-retriever";
import { EmbeddingService } from "../../retrieval/embedding-service";

export interface SkillRouteResult {
  matched: boolean;
  skill?: EnhancedSkillDefinition;
  confidence: number;
  routeType: "skill" | "group_fallback" | "full_fallback";
  relatedGroups?: string[];
}

const CONFIDENCE_THRESHOLD = 0.6;
const VECTOR_CONFIDENCE_THRESHOLD = 0.5;

export class SkillRouterAgent {
  private vectorRetriever = new SkillVectorRetriever();
  private vectorIndexBuilt = false;
  private confidenceThreshold = CONFIDENCE_THRESHOLD;

  async buildVectorIndex(): Promise<void> {
    try {
      const skills = EnhancedSkillRegistry.list();
      await this.vectorRetriever.buildIndex(skills);
      this.vectorIndexBuilt = true;
      console.log("[SkillRouterAgent] 向量索引构建成功");
    } catch (err) {
      console.warn(
        `[SkillRouterAgent] 向量索引构建失败，降级到关键词匹配: ${err instanceof Error ? err.message : String(err)}`
      );
      this.vectorIndexBuilt = false;
    }
  }

  route(query: string): SkillRouteResult {
    const skill = EnhancedSkillRegistry.match(query);

    if (skill) {
      const relatedGroups = skill.relatedGroups || this.inferGroups(skill);
      return {
        matched: true,
        skill,
        confidence: 1.0,
        routeType: "skill",
        relatedGroups,
      };
    }

    return {
      matched: false,
      confidence: 0,
      routeType: "group_fallback",
    };
  }

  async routeWithVector(query: string): Promise<SkillRouteResult> {
    let result = this.route(query);
    if (result.matched) {
      return result;
    }

    if (!result.matched) {
      try {
        const embeddingService = new EmbeddingService();
        if (await embeddingService.checkReady()) {
          if (this.vectorIndexBuilt && this.vectorRetriever.isReady()) {
            const vectorResults = await this.vectorRetriever.retrieve(query, 5);
            if (vectorResults.length > 0 && vectorResults[0].score >= this.confidenceThreshold) {
              const bestMatch = vectorResults[0];
              const skill = EnhancedSkillRegistry.get(bestMatch.skillId);
              if (skill) {
                const relatedGroups = skill.relatedGroups || this.inferGroups(skill);
                console.log(
                  `[SkillRouterAgent] 向量检索匹配Skill: ${skill.name}, score=${bestMatch.score.toFixed(4)}`
                );
                result = {
                  matched: true,
                  skill,
                  confidence: bestMatch.score,
                  routeType: "skill",
                  relatedGroups,
                };
              }
            }
          }
        }
      } catch {
        // 降级到关键词匹配
      }
    }

    return result;
  }

  private inferGroups(skill: EnhancedSkillDefinition): string[] {
    const groups: string[] = [];
    if (skill.relatedTools) {
      for (const toolName of skill.relatedTools) {
        const tool = ToolRegistry.get(toolName);
        if (tool?.category && !groups.includes(tool.category)) {
          groups.push(tool.category);
        }
      }
    }
    if (skill.steps) {
      for (const step of skill.steps) {
        const tool = ToolRegistry.get(step.tool);
        if (tool?.category && !groups.includes(tool.category)) {
          groups.push(tool.category);
        }
      }
    }
    return groups;
  }
}
