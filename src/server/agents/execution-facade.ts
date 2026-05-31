import type { EnhancedSkillDefinition } from "./skills/enhanced-types";
import { EnhancedSkillRegistry } from "./skills/enhanced-registry";
import { executeEnhancedSkill, type EnhancedOrchestrationResult } from "./skills/enhanced-orchestrator";
import { EnhancedReActExecutor, type ReActConfig, type ReActResult } from "./enhanced-react-executor";
import type { SkillExecutionResult } from "./skills/types";
import type { BailianMessage } from "@/server/llm/providers/bailian";

export interface ExecutionConfig {
  routeType: "skill" | "group" | "full_fallback";
  availableTools: string[];
  systemPrompt: string;
  reactConfig?: Partial<ReActConfig>;
  pushStep?: (step: unknown) => void;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  executionMode: "skill" | "react";
  skillResult?: SkillExecutionResult | EnhancedOrchestrationResult;
  reactResult?: ReActResult;
  executionTimeMs: number;
}

export class ExecutionFacade {
  private executor: EnhancedReActExecutor;

  constructor(config?: Partial<ReActConfig>) {
    this.executor = new EnhancedReActExecutor(config);
  }

  async execute(
    decision: {
      routeType: "skill" | "group" | "full_fallback";
      matchedSkill?: EnhancedSkillDefinition;
      availableTools: string[];
      enhancedPrompt: string;
    },
    query: string,
    config: ExecutionConfig,
    messages?: BailianMessage[]
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (decision.routeType === "skill" && decision.matchedSkill) {
      console.log(
        `[ExecutionFacade] 使用Skill模式执行: ${decision.matchedSkill.name}`
      );
      try {
        const skillResult = await executeEnhancedSkill(
          decision.matchedSkill,
          {}
        );
        return {
          success: skillResult.success,
          output: skillResult.finalOutput,
          executionMode: "skill",
          skillResult,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ExecutionFacade] Skill执行失败: ${msg}`);
        return {
          success: false,
          output: `Skill执行失败: ${msg}`,
          executionMode: "skill",
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    console.log(`[ExecutionFacade] 使用ReAct模式执行`);
    const msgs: BailianMessage[] = messages || [
      { role: "system", content: config.systemPrompt },
      { role: "user", content: query },
    ];

    try {
      const reactResult = await this.executor.run(
        query,
        config.availableTools,
        config.systemPrompt,
        msgs,
        config.pushStep as ((step: import("./enhanced-react-executor").ReActStep) => void) | undefined
      );
      return {
        success: true,
        output: reactResult.answer,
        executionMode: "react",
        reactResult,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ExecutionFacade] ReAct执行失败: ${msg}`);
      return {
        success: false,
        output: `ReAct执行失败: ${msg}`,
        executionMode: "react",
        executionTimeMs: Date.now() - startTime,
      };
    }
  }
}
