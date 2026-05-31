export interface SkillStep {
  tool: string;
  params: Record<string, unknown>;
  paramRefs?: Record<string, string>;
  parallel?: boolean;
}

export interface SkillDefinition {
  name: string;
  description: string;
  triggerKeywords?: string[];
  steps: SkillStep[];
  outputTemplate?: string;
}

export interface SkillExecutionResult {
  skillName: string;
  success: boolean;
  stepResults: Array<{
    step: number;
    tool: string;
    success: boolean;
    output: unknown;
    error?: string;
  }>;
  finalOutput: string;
  executionTimeMs: number;
}

export interface RegisteredTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  category?: string;
}
