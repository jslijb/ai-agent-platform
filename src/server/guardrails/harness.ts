import type { GuardrailResult, GuardrailCheckRequest } from "./engine";

export interface HarnessConfig {
  failSafeDefault: "deny" | "allow";
  progressiveConstraintLevels: Array<{
    level: number;
    name: string;
    description: string;
    rules: string[];
  }>;
  contextAwarenessEnabled: boolean;
  observabilityEnabled: boolean;
}

export interface HarnessEvaluation {
  principle: string;
  applied: boolean;
  details: string;
  level?: number;
}

const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  failSafeDefault: "deny",
  progressiveConstraintLevels: [
    {
      level: 1,
      name: "宽松",
      description: "仅阻止明确的安全威胁",
      rules: ["safety-jailbreak"],
    },
    {
      level: 2,
      name: "标准",
      description: "安全+主题限制",
      rules: ["safety-jailbreak", "topic-finance-oa"],
    },
    {
      level: 3,
      name: "严格",
      description: "安全+主题+输出格式",
      rules: ["safety-jailbreak", "topic-finance-oa", "output-format-control"],
    },
  ],
  contextAwarenessEnabled: true,
  observabilityEnabled: true,
};

export class HarnessPrinciples {
  private config: HarnessConfig;
  private currentLevel = 2;
  private conversationTurnCount = 0;
  private violationCount = 0;

  constructor(config?: Partial<HarnessConfig>) {
    this.config = { ...DEFAULT_HARNESS_CONFIG, ...config };
  }

  getConfig(): HarnessConfig {
    return { ...this.config };
  }

  getCurrentLevel(): number {
    return this.currentLevel;
  }

  setLevel(level: number): void {
    if (level >= 1 && level <= this.config.progressiveConstraintLevels.length) {
      this.currentLevel = level;
    }
  }

  evaluateGuardrailResults(
    results: GuardrailResult[],
    request: GuardrailCheckRequest
  ): HarnessEvaluation[] {
    this.conversationTurnCount++;
    const evaluations: HarnessEvaluation[] = [];

    evaluations.push(this.evaluateH1_ConstraintStructure(results));
    evaluations.push(this.evaluateH2_Observability(results, request));
    evaluations.push(this.evaluateH3_ProgressiveConstraint(results));
    evaluations.push(this.evaluateH4_ContextAwareness(request));
    evaluations.push(this.evaluateH5_FailSafe(results));

    return evaluations;
  }

  private evaluateH1_ConstraintStructure(results: GuardrailResult[]): HarnessEvaluation {
    const hasActiveRules = results.length > 0;
    const blockedRules = results.filter((r) => !r.passed);

    return {
      principle: "H1-约束结构",
      applied: hasActiveRules,
      details: hasActiveRules
        ? `${results.length}条规则触发，${blockedRules.length}条阻止/警告`
        : "无规则触发",
    };
  }

  private evaluateH2_Observability(
    results: GuardrailResult[],
    request: GuardrailCheckRequest
  ): HarnessEvaluation {
    if (!this.config.observabilityEnabled) {
      return {
        principle: "H2-可观测性",
        applied: false,
        details: "可观测性未启用",
      };
    }

    const blockedResults = results.filter((r) => !r.passed);
    if (blockedResults.length > 0) {
      console.log("[Harness-H2] Guardrails触发记录:", {
        userId: request.userId,
        rules: blockedResults.map((r) => r.ruleId),
        reasons: blockedResults.map((r) => r.reason),
      });
    }

    return {
      principle: "H2-可观测性",
      applied: true,
      details: blockedResults.length > 0
        ? `已记录${blockedResults.length}条Guardrails触发事件`
        : "无触发事件需记录",
    };
  }

  private evaluateH3_ProgressiveConstraint(results: GuardrailResult[]): HarnessEvaluation {
    const blockedResults = results.filter((r) => !r.passed && r.severity === "block");

    if (blockedResults.length > 0) {
      this.violationCount++;
    }

    if (this.violationCount >= 3 && this.currentLevel < this.config.progressiveConstraintLevels.length) {
      this.currentLevel++;
      this.violationCount = 0;
    }

    const levelConfig = this.config.progressiveConstraintLevels.find(
      (l) => l.level === this.currentLevel
    );

    return {
      principle: "H3-渐进约束",
      applied: true,
      level: this.currentLevel,
      details: `当前约束等级: ${levelConfig?.name || "未知"}(L${this.currentLevel})，累计违规: ${this.violationCount}`,
    };
  }

  private evaluateH4_ContextAwareness(request: GuardrailCheckRequest): HarnessEvaluation {
    if (!this.config.contextAwarenessEnabled) {
      return {
        principle: "H4-上下文感知",
        applied: false,
        details: "上下文感知未启用",
      };
    }

    const turnCount = this.conversationTurnCount;
    let suggestedLevel = 2;

    if (turnCount <= 2) {
      suggestedLevel = 1;
    } else if (turnCount >= 10) {
      suggestedLevel = 3;
    }

    if (suggestedLevel > this.currentLevel) {
      this.currentLevel = suggestedLevel;

    }

    return {
      principle: "H4-上下文感知",
      applied: true,
      level: this.currentLevel,
      details: `对话轮次: ${turnCount}，建议约束等级: L${suggestedLevel}`,
    };
  }

  private evaluateH5_FailSafe(results: GuardrailResult[]): HarnessEvaluation {
    const hasEngineError = results.some((r) => r.reason.includes("error") || r.reason.includes("异常"));

    if (hasEngineError) {
      if (this.config.failSafeDefault === "deny") {
        return {
          principle: "H5-失败安全",
          applied: true,
          details: "Guardrails异常，默认拒绝（fail-safe: deny）",
        };
      }
      return {
        principle: "H5-失败安全",
        applied: true,
        details: "Guardrails异常，默认允许（fail-safe: allow）",
      };
    }

    return {
      principle: "H5-失败安全",
      applied: true,
      details: "Guardrails正常运行，fail-safe策略: " + this.config.failSafeDefault,
    };
  }

  getActiveRuleIds(): string[] {
    const levelConfig = this.config.progressiveConstraintLevels.find(
      (l) => l.level === this.currentLevel
    );
    return levelConfig?.rules || [];
  }

  reset(): void {
    this.currentLevel = 2;
    this.conversationTurnCount = 0;
    this.violationCount = 0;
  }
}

export function createHarnessPrinciples(config?: Partial<HarnessConfig>): HarnessPrinciples {
  return new HarnessPrinciples(config);
}

export const defaultHarnessPrinciples = new HarnessPrinciples();