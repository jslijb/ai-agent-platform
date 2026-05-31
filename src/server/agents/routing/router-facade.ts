import { SkillRouterAgent } from "./skill-router";
import { GroupRouterAgent } from "./group-router";
import { EnhancedSkillRegistry } from "../skills/enhanced-registry";
import { ToolRegistry } from "../../tools/registry";
import { SkillVectorRetriever } from "../../retrieval/skill-vector-retriever";
import { ToolVectorRetriever } from "../../retrieval/tool-vector-retriever";
import { toolDescriptionEnhancer } from "../../description/tool-description-enhancer";
import { fewShotInjector, FINANCE_FEW_SHOT_EXAMPLES } from "../../description/fewshot-injector";
import { MultiSkillMatcher } from "./multi-skill-matcher";

export interface RouteDecision {
  routeType: "skill" | "group" | "full_fallback";
  matchedSkill?: ReturnType<SkillRouterAgent["route"]>["skill"];
  matchedGroups?: ReturnType<GroupRouterAgent["route"]>["matchedGroups"];
  availableTools: string[];
  enhancedPrompt: string;
}

export class RouterFacade {
  private skillRouter = new SkillRouterAgent();
  private groupRouter = new GroupRouterAgent();
  private multiSkillMatcher = new MultiSkillMatcher();
  private vectorReady = false;

  async initialize(): Promise<void> {
    try {
      await Promise.all([
        this.skillRouter.buildVectorIndex(),
        this.groupRouter.buildVectorIndex(),
      ]);
      this.vectorReady = true;
      console.log("[RouterFacade] 向量索引初始化完成");
    } catch (err) {
      console.warn(
        `[RouterFacade] 向量索引初始化失败，降级到关键词路由: ${err instanceof Error ? err.message : String(err)}`
      );
      this.vectorReady = false;
    }
  }

  route(query: string, images?: string[]): RouteDecision {
    if (images && images.length > 0) {
      return this.routeVision(query, images);
    }

    const skillResult = this.skillRouter.route(query);

    const multiMatch = this.multiSkillMatcher.match(query);
    if (multiMatch) {
      const allTools = Array.from(
        new Set([
          ...(multiMatch.primarySkill.relatedTools || []),
          ...multiMatch.auxiliarySkills.flatMap((s) => s.relatedTools || []),
        ])
      );
      const allGroups = multiMatch.mergedToolGroups;
      const groupTools =
        allGroups.length > 0
          ? this.groupRouter.route(query, allGroups).mergedToolNames
          : [];
      const availableTools = Array.from(new Set([...allTools, ...groupTools]));
      const enhancedPrompt = this.buildEnhancedPrompt(
        query,
        availableTools,
        multiMatch.primarySkill.name
      );

      return {
        routeType: "skill",
        matchedSkill: multiMatch.primarySkill,
        matchedGroups:
          allGroups.length > 0
            ? allGroups
                .map((id) => {
                  const groups = this.groupRouter.route(query, [id]).matchedGroups;
                  return groups[0];
                })
                .filter(Boolean) as RouteDecision["matchedGroups"]
            : undefined,
        availableTools,
        enhancedPrompt,
      };
    }

    if (skillResult.matched && skillResult.skill) {
      const skillTools = skillResult.skill.relatedTools || [];
      const skillGroups = skillResult.relatedGroups || [];
      const groupTools =
        skillGroups.length > 0
          ? this.groupRouter.route(query, skillGroups).mergedToolNames
          : [];
      const availableTools = Array.from(new Set([...skillTools, ...groupTools]));
      const enhancedPrompt = this.buildEnhancedPrompt(
        query,
        availableTools,
        skillResult.skill.name
      );

      return {
        routeType: "skill",
        matchedSkill: skillResult.skill,
        availableTools,
        enhancedPrompt,
      };
    }

    const groupResult = this.groupRouter.route(query);
    const availableTools =
      groupResult.mergedToolNames.length > 0
        ? groupResult.mergedToolNames
        : ToolRegistry.listNames();

    const enhancedPrompt = this.buildEnhancedPrompt(
      query,
      availableTools,
      undefined
    );

    return {
      routeType: groupResult.routeType === "full_fallback" ? "full_fallback" : "group",
      matchedGroups:
        groupResult.matchedGroups.length > 0
          ? groupResult.matchedGroups
          : undefined,
      availableTools,
      enhancedPrompt,
    };
  }

  async routeWithVector(query: string, images?: string[]): Promise<RouteDecision> {
    if (images && images.length > 0) {
      return this.routeVision(query, images);
    }

    const skillResult = await this.skillRouter.routeWithVector(query);

    if (skillResult.matched && skillResult.skill) {
      const skillTools = skillResult.skill.relatedTools || [];
      const skillGroups = skillResult.relatedGroups || [];
      let groupTools: string[] = [];
      if (skillGroups.length > 0) {
        const gr = await this.groupRouter.routeWithVector(query, skillGroups);
        groupTools = gr.mergedToolNames;
      }
      const availableTools = Array.from(new Set([...skillTools, ...groupTools]));
      const enhancedPrompt = this.buildEnhancedPrompt(
        query,
        availableTools,
        skillResult.skill.name
      );

      return {
        routeType: "skill",
        matchedSkill: skillResult.skill,
        availableTools,
        enhancedPrompt,
      };
    }

    return this.route(query, images);
  }

  private routeVision(query: string, images: string[]): RouteDecision {
    const visionKeywords = ["截图", "图片", "图表", "K线图", "财报", "研报", "OCR"];
    const lowerQuery = query.toLowerCase();
    const isVisionQuery = visionKeywords.some((kw) => lowerQuery.includes(kw));

    if (isVisionQuery) {
      const visionSkills = EnhancedSkillRegistry.listByCategory("vision_analysis");
      if (visionSkills.length > 0) {
        const skill = visionSkills[0];
        return {
          routeType: "skill",
          matchedSkill: skill,
          availableTools: skill.relatedTools || [],
          enhancedPrompt: this.buildEnhancedPrompt(
            query,
            skill.relatedTools || [],
            skill.name
          ),
        };
      }
    }

    return this.route(query);
  }

  private buildEnhancedPrompt(
    query: string,
    availableTools: string[],
    skillName?: string
  ): string {
    let toolDescriptions: string;
    try {
      toolDescriptions = toolDescriptionEnhancer.formatForPrompt(availableTools);
    } catch {
      toolDescriptions = availableTools
        .map((name) => {
          const tool = ToolRegistry.get(name);
          return tool ? `- ${tool.name}: ${tool.description}` : null;
        })
        .filter(Boolean)
        .join("\n");
    }

    const skillDesc = skillName
      ? `\n\n当前匹配的Skill: ${skillName}\n请按照Skill编排步骤执行，不要自行选择工具。`
      : "";

    let prompt = `可用工具:\n${toolDescriptions}${skillDesc}`;

    try {
      prompt = fewShotInjector.inject(prompt, FINANCE_FEW_SHOT_EXAMPLES);
    } catch {
      // few-shot注入失败时不影响主流程
    }

    return prompt;
  }
}
