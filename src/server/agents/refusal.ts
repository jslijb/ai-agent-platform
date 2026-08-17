/**
 * R002 统一拒绝话语
 *
 * 全系统两类拒绝话术的唯一来源（常量 + 识别/归一化工具）：
 * - 合规拒绝（受国家政策/法规影响，如违法内容、投资建议类）
 * - 库外拒绝（知识库未覆盖 / 数据未获取到）
 *
 * 使用方：
 * - simpleAgent.ts 确定性拒绝模板（对抗性拦截 / 投资建议合规拒绝）
 * - langgraph-patterns.ts complianceNode
 * - rag-evaluator.ts isRefusalAnswer（评估器必须能识别规范话术）
 */

/** 合规拒绝：受国家政策、法规影响无法回答 */
export const COMPLIANCE_REFUSAL =
  "非常抱歉，您问的问题受国家政策、法规影响，我回答不了，换一个问题。";

/** 库外拒绝：超出知识库覆盖范围 / 知识储备不足 */
export const OUT_OF_KNOWLEDGE_REFUSAL =
  "不好意思，您问的问题由于我的大脑知识储备不足，回答不了您的问题，不能影响您的投资决策。后续我会不断充实我的大脑知识储备。";

/**
 * 拒绝回答识别模式（全量，含历史表述 + R002 规范话术）
 * 与 rag-evaluator.ts 原 isRefusalAnswer 模式一致，新增：
 * - /回答不了/ 覆盖两条规范话术
 * - /知识储备不足/ 覆盖库外规范话术
 */
export const REFUSAL_PATTERNS: RegExp[] = [
  /无法回答/,
  /无法提供/,
  /不能回答/,
  /抱歉/,
  /我不知道/,
  /没有相关信息/,
  /无法给出/,
  /无法确定/,
  /无法判断/,
  /暂无.*信息/,
  /未找到.*相关/,
  /无法从.*中获取/,
  // L9 "未包含/未涉及/不在覆盖范围" 类拒绝表述
  /未包含.*(信息|数据|内容|指标|数值|记录)/,
  /文档.*未包含/,
  /片段.*未包含/,
  /不在.*覆盖范围/,
  /不在.*范围内/,
  /未涉及/,
  /无法获取/,
  /未披露/,
  /无.*相关数据/,
  /无.*相关信息/,
  /基于.*文档.*无法/,
  /如需.*请.*查阅/,
  /请.*参考.*官方/,
  // R002 规范话术
  /回答不了/,
  /知识储备不足/,
];

/** 合规拒绝特征词（判定优先级高于库外拒绝） */
const COMPLIANCE_MARKERS: RegExp[] = [
  /国家政策/,
  /法规/,
  /政策影响/,
  /违法/,
  /合规/,
  /证券法/,
  /操纵市场/,
  /内幕/,
  /洗钱/,
  /投资建议/,
  /买入|卖出|持有/,
];

/** 库外拒绝特征词 */
const OUT_OF_KNOWLEDGE_MARKERS: RegExp[] = [
  /知识储备不足/,
  /覆盖范围/,
  /知识库/,
  /未包含/,
  /未获取/,
  /未找到/,
  /未披露/,
  /没有相关信息/,
  /无.*相关数据/,
  /无.*相关信息/,
];

/** 是否为拒绝回答 */
export function isRefusalAnswer(answer: string): boolean {
  if (!answer || answer.trim().length === 0) return false;
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(answer));
}

/**
 * 判断拒绝类型
 * @returns "compliance" | "out_of_knowledge" | null（非拒绝回答）
 */
export function classifyRefusal(
  text: string
): "compliance" | "out_of_knowledge" | null {
  if (!text || text.trim().length === 0) return null;
  if (!isRefusalAnswer(text)) return null;
  if (COMPLIANCE_MARKERS.some((p) => p.test(text))) return "compliance";
  if (OUT_OF_KNOWLEDGE_MARKERS.some((p) => p.test(text))) return "out_of_knowledge";
  // 无法区分类型的泛化拒绝（如"无法回答该问题"）按库外拒绝处理
  return "out_of_knowledge";
}

/**
 * 将短拒绝回答归一化为 R002 规范话术
 *
 * 规则：
 * - 非拒绝回答 → 原样返回
 * - 拒绝回答但超过 maxLength（可能夹带数据/补充说明）→ 原样返回，避免破坏内容
 * - 短拒绝回答 → 替换为对应规范话术（合规/库外）
 */
export function normalizeRefusal(text: string, maxLength = 120): string {
  if (!isRefusalAnswer(text)) return text;
  if (text.trim().length > maxLength) return text;
  return classifyRefusal(text) === "compliance"
    ? COMPLIANCE_REFUSAL
    : OUT_OF_KNOWLEDGE_REFUSAL;
}
