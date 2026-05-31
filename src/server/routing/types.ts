export type GroupResponsibility = "data_acquisition" | "data_analysis" | "mixed";

export interface ToolGroupConfig {
  groupId: string;
  groupName: string;
  groupResponsibility: GroupResponsibility;
  tools: string[];
  description: string;
  priority: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
