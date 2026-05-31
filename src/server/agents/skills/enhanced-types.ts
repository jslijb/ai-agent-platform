import type { SkillStep, SkillDefinition } from "./types";

export type SkillCategory =
  | "investment_analysis"
  | "risk_compliance"
  | "comprehensive_diagnosis"
  | "vision_analysis";

export type ErrorRecoveryType = "retry" | "fallback" | "abort";

export interface ErrorRecoveryStrategy {
  type: ErrorRecoveryType;
  maxRetries?: number;
  fallbackTool?: string;
}

export interface EnhancedSkillStep extends SkillStep {
  condition?: string;
  fallbackTool?: string;
  timeoutMs?: number;
  dynamicParamResolver?: string;
  subSkillId?: string;
}

export interface EnhancedSkillDefinition extends SkillDefinition {
  applicableScenarios?: string;
  orchestrationSummary?: string;
  typicalQueries?: string[];
  relatedTools?: string[];
  relatedGroups?: string[];
  errorRecovery?: ErrorRecoveryStrategy;
  skillCategory?: SkillCategory;
  timeoutMs?: number;
  steps: EnhancedSkillStep[];
}

export interface OrchestrationContext {
  skillId: string;
  currentStepIndex: number;
  stepResults: Array<{ output: unknown }>;
  status: "running" | "completed" | "error" | "timeout";
  errorInfo?: string;
  initialParams: Record<string, unknown>;
}
