export interface ToolExampleCall {
  description: string;
  parameters: Record<string, unknown>;
}

export interface EnhancedToolDescription {
  name: string;
  description: string;
  whenToUse: string;
  whenNotToUse: string;
  parameters: Record<string, unknown>;
  exampleCalls: ToolExampleCall[];
  groupId: string;
}

export interface EnhancedSkillDescription {
  name: string;
  description: string;
  applicableScenarios: string;
  orchestrationSummary: string;
  typicalQueries: string[];
  relatedTools: string[];
}
