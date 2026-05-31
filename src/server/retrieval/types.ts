export interface RetrievalResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SkillVectorEntry {
  skillId: string;
  embedding: number[];
  metadata: {
    relatedTools: string[];
    applicableScenarios: string;
    skillCategory: string;
    relatedGroups: string[];
  };
}

export interface ToolVectorEntry {
  toolName: string;
  embedding: number[];
  metadata: {
    groupId: string;
    whenToUse: string;
    groupResponsibility: string;
  };
}
