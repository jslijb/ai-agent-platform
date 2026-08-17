export type GuardrailType = "topic" | "output" | "safety";

export interface GuardrailRule {
  id: string;
  type: GuardrailType;
  name: string;
  description: string;
  enabled: boolean;
  severity: "block" | "warn" | "log";
  patterns?: string[];
  allowedTopics?: string[];
  blockedTopics?: string[];
  outputFormat?: "json" | "markdown" | "natural";
  action?: string;
}

export interface GuardrailResult {
  passed: boolean;
  ruleId: string;
  ruleName: string;
  type: GuardrailType;
  severity: "block" | "warn" | "log";
  reason: string;
  originalInput?: string;
  modifiedOutput?: string;
}

export interface GuardrailCheckRequest {
  input: string;
  output?: string;
  context?: string;
  userId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

const DEFAULT_RULES: GuardrailRule[] = [
  {
    id: "topic-finance-oa",
    type: "topic",
    name: "金融+OA/CRM主题限制",
    description: "只允许金融分析、OA审批、CRM业务相关话题",
    enabled: true,
    severity: "block",
    allowedTopics: [
      "股票", "基金", "债券", "期货", "外汇", "行情", "财报", "估值",
      "审批", "请假", "报销", "日程", "通知", "考勤",
      "客户", "商机", "合同", "销售", "报表", "CRM",
      "知识库", "RAG", "检索", "分析", "报告",
      "OA", "HR", "员工", "入职", "离职",
    ],
    blockedTopics: [
      "政治", "色情", "暴力", "赌博", "毒品",
      "黑客", "攻击", "入侵", "漏洞利用",
      "身份证号", "手机号", "密码", "密钥", "token",
    ],
  },
  {
    id: "output-format-control",
    type: "output",
    name: "输出格式控制",
    description: "约束Agent输出格式，确保结构化",
    enabled: true,
    severity: "warn",
    outputFormat: "markdown",
  },
  {
    id: "safety-jailbreak",
    type: "safety",
    name: "越狱/Prompt注入防护",
    description: "防止Prompt注入和越狱攻击",
    enabled: true,
    severity: "block",
    patterns: [
      "ignore previous instructions",
      "disregard all above",
      "you are now",
      "act as if",
      "pretend you are",
      "system prompt",
      "forget your instructions",
      "override your rules",
      "jailbreak",
      "DAN mode",
    ],
  },
];

export class GuardrailsEngine {
  private rules: GuardrailRule[];
  private checkCount = 0;
  private blockCount = 0;
  private warnCount = 0;

  constructor(rules?: GuardrailRule[]) {
    this.rules = rules || [...DEFAULT_RULES];
  }

  getRules(): GuardrailRule[] {
    return [...this.rules];
  }

  addRule(rule: GuardrailRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx >= 0) {
      this.rules.splice(idx, 1);
      return true;
    }
    return false;
  }

  enableRule(ruleId: string): boolean {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = true;
      return true;
    }
    return false;
  }

  disableRule(ruleId: string): boolean {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = false;
      return true;
    }
    return false;
  }

  async checkInput(request: GuardrailCheckRequest): Promise<GuardrailResult[]> {
    const results: GuardrailResult[] = [];
    const input = request.input.toLowerCase();

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      if (rule.type === "topic") {
        const topicResult = this.checkTopic(rule, input);
        if (topicResult) results.push(topicResult);
      }

      if (rule.type === "safety") {
        const safetyResult = this.checkSafety(rule, input);
        if (safetyResult) results.push(safetyResult);
      }
    }

    this.checkCount++;
    this.blockCount += results.filter((r) => r.severity === "block" && !r.passed).length;
    this.warnCount += results.filter((r) => r.severity === "warn" && !r.passed).length;

    return results;
  }

  async checkOutput(request: GuardrailCheckRequest): Promise<GuardrailResult[]> {
    if (!request.output) return [];

    const results: GuardrailResult[] = [];
    const output = request.output.toLowerCase();

    for (const rule of this.rules) {
      if (!rule.enabled || rule.type !== "output") continue;

      const result = this.checkOutputFormat(rule, output, request.output);
      if (result) results.push(result);
    }

    this.checkCount++;
    return results;
  }

  async checkAll(request: GuardrailCheckRequest): Promise<{
    inputResults: GuardrailResult[];
    outputResults: GuardrailResult[];
    blocked: boolean;
    warnings: number;
  }> {
    const inputResults = await this.checkInput(request);
    const outputResults = await this.checkOutput(request);
    const blocked = inputResults.some((r) => r.severity === "block" && !r.passed);
    const warnings = [...inputResults, ...outputResults].filter(
      (r) => r.severity === "warn" && !r.passed
    ).length;

    return { inputResults, outputResults, blocked, warnings };
  }

  private checkTopic(rule: GuardrailRule, input: string): GuardrailResult | null {
    if (rule.blockedTopics) {
      for (const topic of rule.blockedTopics) {
        if (input.includes(topic.toLowerCase())) {
          return {
            passed: false,
            ruleId: rule.id,
            ruleName: rule.name,
            type: "topic",
            severity: rule.severity,
            reason: `输入包含禁止话题: ${topic}`,
          };
        }
      }
    }

    if (rule.allowedTopics && rule.allowedTopics.length > 0) {
      const hasAllowed = rule.allowedTopics.some((topic) =>
        input.includes(topic.toLowerCase())
      );
      if (!hasAllowed && input.length > 10) {
        return {
          passed: false,
          ruleId: rule.id,
          ruleName: rule.name,
          type: "topic",
          severity: rule.severity,
          reason: "输入不在允许的话题范围内",
        };
      }
    }

    return null;
  }

  private checkSafety(rule: GuardrailRule, input: string): GuardrailResult | null {
    if (!rule.patterns) return null;

    for (const pattern of rule.patterns) {
      if (input.includes(pattern.toLowerCase())) {
        return {
          passed: false,
          ruleId: rule.id,
          ruleName: rule.name,
          type: "safety",
          severity: rule.severity,
          reason: `检测到潜在安全风险: ${pattern}`,
        };
      }
    }

    return null;
  }

  private checkOutputFormat(rule: GuardrailRule, _lowerOutput: string, originalOutput: string): GuardrailResult | null {
    if (!rule.outputFormat) return null;

    const hasStructuredFormat =
      originalOutput.includes("#") ||
      originalOutput.includes("- ") ||
      originalOutput.includes("```") ||
      originalOutput.includes("|") ||
      originalOutput.includes("{") ||
      originalOutput.includes("1.");

    if (!hasStructuredFormat && originalOutput.length > 200) {
      return {
        passed: false,
        ruleId: rule.id,
        ruleName: rule.name,
        type: "output",
        severity: rule.severity,
        reason: "长输出缺乏结构化格式",
      };
    }

    return null;
  }

  getStats(): { totalChecks: number; blocks: number; warnings: number } {
    return {
      totalChecks: this.checkCount,
      blocks: this.blockCount,
      warnings: this.warnCount,
    };
  }

  resetStats(): void {
    this.checkCount = 0;
    this.blockCount = 0;
    this.warnCount = 0;
  }
}

export function createGuardrailsEngine(rules?: GuardrailRule[]): GuardrailsEngine {
  return new GuardrailsEngine(rules);
}

export const defaultGuardrailsEngine = new GuardrailsEngine();