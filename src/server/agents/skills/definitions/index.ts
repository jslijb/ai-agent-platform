import { SkillRegistry } from "../executor";
import { EnhancedSkillRegistry } from "../enhanced-registry";
import { technicalAnalysisSkill } from "./technical-analysis";
import { complianceCheckSkill } from "./compliance-check";
import { riskAssessmentSkill } from "./risk-assessment";
import { comprehensiveDiagnosisSkill } from "./comprehensive-diagnosis";
import {
  fundamentalAnalysisSkill,
  debtSolvencyAnalysisSkill,
  valuationAnalysisSkill,
  investmentThesisSkill,
  sectorRotationSkill,
  stockComparisonSkill,
  sentimentAnalysisSkill,
} from "./investment";
import {
  screenshotToStructuredDataSkill,
  chartPatternRecognitionSkill,
  financialStatementOcrSkill,
} from "./vision";

const allSkills = [
  technicalAnalysisSkill,
  complianceCheckSkill,
  riskAssessmentSkill,
  comprehensiveDiagnosisSkill,
  fundamentalAnalysisSkill,
  debtSolvencyAnalysisSkill,
  valuationAnalysisSkill,
  investmentThesisSkill,
  sectorRotationSkill,
  stockComparisonSkill,
  sentimentAnalysisSkill,
  screenshotToStructuredDataSkill,
  chartPatternRecognitionSkill,
  financialStatementOcrSkill,
];

export function registerAllSkills(): void {
  for (const skill of allSkills) {
    SkillRegistry.register(skill);
    EnhancedSkillRegistry.register(skill);
  }

  console.log(
    `[Skills] 已注册 ${SkillRegistry.list().length} 个Skill (EnhancedSkillRegistry: ${EnhancedSkillRegistry.list().length})`
  );
}
