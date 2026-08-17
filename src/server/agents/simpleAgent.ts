import { callBailian, type BailianMessage, type BailianTool, type BailianToolCall } from "@/server/llm/providers/bailian";
import { callWithFallback } from "@/server/llm/router";
import { saveAgentLog, saveLLMUsage } from "./agent-logger";
import { hybridSearch } from "@/server/rag/retrieval/hybrid-retriever";
import { graphSearch } from "@/server/rag/graph/graph-retriever";
import { isNeo4jAvailable } from "@/server/rag/graph/graph-builder";
import { routeQuery as r001RouteQuery } from "@/server/rag/query/query-router";
import { formatSqlResultAsText, formatRawTablesAsText } from "@/server/rag/query/sql-result-formatter";
import { rerank } from "@/server/rag/reranking/reranker";
import { logCompliance } from "@/server/compliance/log";
import { shouldRetrieveAgain } from "@/server/agents/reflection-node";
import { COMPLIANCE_REFUSAL, OUT_OF_KNOWLEDGE_REFUSAL, normalizeRefusal } from "@/server/agents/refusal";
import { createConversation, addMessage, updateConversationTitle, assembleContext, extractAndApplyPreferences, trackStockQuery } from "@/server/agents/memory";
import { ToolRegistry } from "@/server/tools/registry";
import { SkillRegistry, executeSkill } from "@/server/agents/skills";
import { registerAllSkills } from "@/server/agents/skills/definitions";
import { RouterFacade } from "@/server/agents/routing/router-facade";
import { ToolVectorRetriever } from "@/server/retrieval/tool-vector-retriever";
import { toolDescriptionEnhancer } from "@/server/description/tool-description-enhancer";
import { fewShotInjector } from "@/server/description/fewshot-injector";
import { ToolCallValidator } from "@/server/validation/tool-call-validator";
import { CallLimiter } from "@/server/validation/call-limiter";
import { technicalAnalysisTool } from "@/server/agents/tools/technical-analysis";
import { riskAnalysisTool } from "@/server/agents/tools/risk-analysis";
import { complianceCheckTool } from "@/server/agents/tools/compliance-check";
import { marketDataTool } from "@/server/agents/tools/market-data";
import { toolSearchTool } from "@/server/agents/tools/tool-search";
import { compactContext } from "@/server/agents/context-compaction";
import { saveCheckpoint, loadCheckpoint, recordError, canRetry, buildRecoveryContext, clearCheckpoint } from "@/server/agents/checkpoint";

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:8001";

const AGENT_TIMEOUT_MS = 300000;

interface CachedStockData {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  dates: string[];
  code: string;
  dateRange: string;
  latestTradeDate: string;
  rowCount: number;
}

let lastStockData: CachedStockData | null = null;
const stockDataByCode = new Map<string, CachedStockData>();

let currentUserId: string = "default-user";

/** 检索结果项类型 */
type SearchResult = { text: string; documentId: string; score: number; denseScore?: number; sparseScore?: number; metadata?: Record<string, any> };

/** 最近一次 hybridSearch 的原始结果（精排后），供引用收集使用 */
let lastHybridSearchRawResults: SearchResult[] = [];

/** 最近一次 hybridSearch 的粗排结果（精排前），供前端展示对比 */
let lastCoarseResults: SearchResult[] = [];

// ========== 意图识别层 - 对抗性关键词（Unsafe 级） ==========
// 集中定义，支持后续扩展为外部配置文件
const ADVERSARIAL_KEYWORDS: string[] = [
  "预测股价",
  "操纵市场",
  "内幕消息",
  "保证盈利",
  "涨停预测",
  "老鼠仓",
  "稳赚不赔",
  "绕过涨跌幅限制",
  "虚假信息影响股价",
  "洗钱",
];

// ========== 意图识别层 - 投资建议关键词（Controversial 级） ==========
const INVESTMENT_ADVICE_KEYWORDS: string[] = [
  "该不该买",
  "该不该卖",
  "持有",
  "加仓",
  "抄底",
  "定投",
  "推荐基金",
  "推荐股票",
  "哪个更值得投资",
  "能赚多少钱",
  "是不是底部",
  "适合投资吗",
  "值得投资吗",
];

// 对抗性关键词到违规类型的映射
const ADVERSARIAL_VIOLATION_MAP: Record<string, string> = {
  预测股价: "预测股价",
  涨停预测: "预测股价",
  内幕消息: "内幕消息",
  操纵市场: "操纵市场",
  老鼠仓: "操纵市场",
  绕过涨跌幅限制: "操纵市场",
  虚假信息影响股价: "操纵市场",
  保证盈利: "其他",
  稳赚不赔: "其他",
  洗钱: "其他",
};

/**
 * 意图识别函数 - 在工具调用之前识别问题类型并分流处理
 *
 * 三种类型：
 * - adversarial: 对抗性问题 → 不执行检索，直接返回安全拒绝模板
 * - investment_advice: 投资建议问题 → 检索财务数据，返回合规拒绝+数据参考
 * - factual: 事实查询 → 走正常 RAG 检索流程
 */
/**
 * 组合关键词正则映射
 *
 * 用于处理查询中词序变化或中间插入其他词的情况。
 * 例如 "预测股价" 在用户查询中可能是 "预测明天贵州茅台的股价"，
 * 此时 query.includes("预测股价") 会失败，需要用正则 预测.{0,30}股价 匹配。
 *
 * key: 原始关键词（与 ADVERSARIAL_KEYWORDS 中保持一致）
 * value: 匹配该关键词的正则表达式
 */
const ADVERSARIAL_COMPOSITE_PATTERNS: Record<string, RegExp> = {
  预测股价: /预测.{0,30}股价/,
  涨停预测: /涨停.{0,30}预测|预测.{0,30}涨停/,
  内幕消息: /内幕.{0,10}消息/,
  操纵市场: /操纵.{0,10}市场/,
  老鼠仓: /老鼠仓/,
  绕过涨跌幅限制: /绕过.{0,20}涨跌幅.{0,10}限制/,
  虚假信息影响股价: /虚假信息.{0,20}股价|散布.{0,20}虚假.{0,20}股价/,
};

function classifyIntent(query: string): {
  type: "adversarial" | "investment_advice" | "factual";
  matchedKeywords?: string[];
} {
  // 优先检测对抗性关键词（Unsafe 级优先于 Controversial 级）
  // 支持组合关键词正则匹配（处理词序变化或中间插入其他词的情况）
  const matchedAdversarial = ADVERSARIAL_KEYWORDS.filter((kw) => {
    if (query.includes(kw)) return true;
    const pattern = ADVERSARIAL_COMPOSITE_PATTERNS[kw];
    return pattern ? pattern.test(query) : false;
  });
  if (matchedAdversarial.length > 0) {
    return { type: "adversarial", matchedKeywords: matchedAdversarial };
  }

  const matchedAdvice = INVESTMENT_ADVICE_KEYWORDS.filter((kw) => query.includes(kw));
  if (matchedAdvice.length > 0) {
    return { type: "investment_advice", matchedKeywords: matchedAdvice };
  }

  return { type: "factual" };
}

/**
 * 构建对抗性问题拒绝模板（Unsafe 级）
 */
function buildAdversarialRejection(matchedKeywords: string[]): string {
  const violationDesc = matchedKeywords
    .map((kw) => {
      const descMap: Record<string, string> = {
        预测股价: "预测股价",
        操纵市场: "操纵市场",
        内幕消息: "刺探/传播内幕消息",
        保证盈利: "承诺保证盈利",
        涨停预测: "涨停预测",
        老鼠仓: "老鼠仓交易",
        稳赚不赔: "承诺稳赚不赔",
        绕过涨跌幅限制: "绕过涨跌幅限制",
        虚假信息影响股价: "散布虚假信息影响股价",
        洗钱: "洗钱",
      };
      return descMap[kw] || kw;
    })
    .join("、");

  return `【拒绝声明】${COMPLIANCE_REFUSAL}
【违法警示】${violationDesc}违反《证券法》相关规定，
可能面临行政处罚甚至刑事处罚。
【风险提示】投资有风险，入市需谨慎。
如您需要了解某公司的基本面财务数据，我可以为您提供参考信息。`;
}

/**
 * 将检索片段按关键词归类到财务数据类别
 */
function categorizeChunk(text: string): "fundamental" | "valuation" | "risk" | "other" {
  if (/营业收入|营收|净利润|利润|ROE|净资产收益率|毛利率|净利率|同比增长|增长率/.test(text)) {
    return "fundamental";
  }
  if (/PE|市盈率|PB|市净率|股息率|市值|估值/.test(text)) {
    return "valuation";
  }
  if (/资产负债率|流动比率|速动比率|负债|杠杆/.test(text)) {
    return "risk";
  }
  return "other";
}

/**
 * 格式化单条检索片段为财务数据参考条目
 */
function formatFinancialChunk(r: SearchResult): string {
  const meta = r.metadata || {};
  const pageRef = meta.startPage
    ? `第${meta.startPage}${meta.endPage && meta.endPage !== meta.startPage ? "-" + meta.endPage : ""}页`
    : "";
  const sourceRef = meta.source ? `（来源：${meta.source}${pageRef ? " " + pageRef : ""}）` : "";
  return `- ${r.text.substring(0, 300)}${sourceRef}`;
}

/**
 * 构建投资建议合规拒绝（Controversial 级）+ 标准化财务数据参考
 *
 * 数据标准（6.6）：
 * - 必选三类：基本面 + 估值 + 风险指标
 * - 每项标注数值、报告期、数据来源（文档名+页码）
 * - 知识库缺数据时跳过该项，不编造
 * - 不提供技术指标、收益预测、保本承诺、买卖建议
 */
function buildInvestmentAdviceResponse(
  searchResults: SearchResult[]
): string {
  let financialDataSection = "";
  if (searchResults.length > 0) {
    const fundamental = searchResults.filter((r) => categorizeChunk(r.text) === "fundamental");
    const valuation = searchResults.filter((r) => categorizeChunk(r.text) === "valuation");
    const risk = searchResults.filter((r) => categorizeChunk(r.text) === "risk");
    const other = searchResults.filter((r) => categorizeChunk(r.text) === "other");

    financialDataSection = "\n\n【财务数据参考】以下为您询问公司的客观数据，仅供参考：\n";

    if (fundamental.length > 0) {
      financialDataSection += "── 基本面数据 ──\n";
      financialDataSection += fundamental.map(formatFinancialChunk).join("\n") + "\n";
    }
    if (valuation.length > 0) {
      financialDataSection += "── 估值数据 ──\n";
      financialDataSection += valuation.map(formatFinancialChunk).join("\n") + "\n";
    }
    if (risk.length > 0) {
      financialDataSection += "── 风险指标 ──\n";
      financialDataSection += risk.map(formatFinancialChunk).join("\n") + "\n";
    }
    if (other.length > 0) {
      financialDataSection += "── 其他相关数据 ──\n";
      financialDataSection += other.map(formatFinancialChunk).join("\n") + "\n";
    }
  }

  return `【合规声明】${COMPLIANCE_REFUSAL}
投资决策需要根据您自身的风险承受能力、投资目标和财务状况综合判断。${financialDataSection}

【风险提示】
1. 以上数据为客观信息展示，不构成任何投资建议
2. 历史数据不代表未来表现，市场有风险，投资需谨慎
3. 数据可能存在滞后性，请以最新公告为准
4. 本系统不承诺数据准确性、完整性，不保证盈利或本金安全`;
}

const stockDataCache = new Map<string, { data: CachedStockData; expiresAt: number }>();
const STOCK_CACHE_TTL_MS = 30 * 60 * 1000;

function getStockCache(userId: string): CachedStockData | null {
  const cached = stockDataCache.get(userId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    stockDataCache.delete(userId);
    return null;
  }
  return cached.data;
}

function setStockCache(userId: string, data: CachedStockData): void {
  stockDataCache.set(userId, { data, expiresAt: Date.now() + STOCK_CACHE_TTL_MS });
  if (stockDataCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of Array.from(stockDataCache.entries())) {
      if (now > value.expiresAt) stockDataCache.delete(key);
    }
  }
}

export interface AgentStep {
  type: "thinking" | "tool_call" | "tool_result" | "reflection" | "retrieval" | "answer";
  round: number;
  title: string;
  content: string;
  detail?: Record<string, unknown>;
  timestamp: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean; items?: { type: string } }>;
  execute: (params: Record<string, unknown>) => Promise<string> | string;
  category?: string;
}

const tools: ToolDefinition[] = [
  technicalAnalysisTool,
  riskAnalysisTool,
  complianceCheckTool,
  marketDataTool,
  toolSearchTool,
  {
    name: "hybridSearch",
    category: "knowledge-documents",
    description: "RAG 混合检索工具。使用稠密检索和稀疏检索的 RRF 融合方式（粗排），再调用 bge-reranker 精排，从知识库中检索与查询相关的文档片段。适用于查找公司财报、行业分析、政策法规等文档内容。",
    parameters: {
      query: { type: "string", description: "搜索查询文本", required: true },
      topK: { type: "number", description: "返回结果数量，默认10" },
    },
    execute: async (params) => {
      try {
        const searchStartTime = Date.now();
        const topK = (params.topK as number) || 10;

        // 第一步：粗排 - 混合检索取 topK*2 条
        const coarseResults = await hybridSearch(params.query as string, topK * 2);
        console.log("[hybridSearch] 粗排完成, 耗时: " + ((Date.now() - searchStartTime) / 1000).toFixed(2) + "s, 粗排结果: " + coarseResults.length + " 条");

        // 保存粗排结果（精排前），供前端展示对比
        lastCoarseResults = coarseResults;

        let rerankedResults: SearchResult[];

        // 第二步：精排 - 调用 bge-reranker 重排序
        try {
          const texts = coarseResults.map((r) => r.text);
          const rerankStartTime = Date.now();
          const rerankResults = await rerank(params.query as string, texts, topK);
          console.log("[hybridSearch] 精排完成, 耗时: " + ((Date.now() - rerankStartTime) / 1000).toFixed(2) + "s, 精排结果: " + rerankResults.length + " 条");

          // 精排结果映射回原始结果（保留 metadata：来源文档、页码等）
          rerankedResults = rerankResults.map((rr) => {
            const original = coarseResults[rr.index ?? 0];
            return {
              text: rr.text,
              documentId: original?.documentId || "",
              score: rr.score,
              denseScore: original?.denseScore,
              sparseScore: original?.sparseScore,
              metadata: original?.metadata || {},
            };
          });
        } catch (rerankError) {
          // 精排失败时降级为粗排结果直接截取 topK
          console.error("[hybridSearch] 精排失败, 降级为粗排结果: " + (rerankError instanceof Error ? rerankError.message : String(rerankError)));
          rerankedResults = coarseResults.slice(0, topK);
        }

        // 保存精排结果（精排后）
        lastHybridSearchRawResults = rerankedResults;

        // 第三步：图谱检索补充（如果 Neo4j 可用）
        let graphText = "";
        try {
          const neo4jOk = await isNeo4jAvailable();
          if (neo4jOk) {
            const graphStartTime = Date.now();
            const graphResults = await graphSearch(params.query as string, 2);
            console.log("[hybridSearch] 图谱检索完成, 耗时: " + ((Date.now() - graphStartTime) / 1000).toFixed(2) + "s, 结果: " + graphResults.length + " 条");
            if (graphResults.length > 0) {
              graphText = "\n\n--- 知识图谱补充 ---\n" + graphResults
                .slice(0, 3)
                .map((r, i) => `[图谱${i + 1}] (score: ${r.score.toFixed(4)}) ${r.text}`)
                .join("\n");
            }
          }
        } catch (graphErr) {
          console.warn("[hybridSearch] 图谱检索失败, 跳过:", graphErr instanceof Error ? graphErr.message : String(graphErr));
        }

        console.log("[hybridSearch] 总检索耗时: " + ((Date.now() - searchStartTime) / 1000).toFixed(2) + "s, 最终结果: " + rerankedResults.length + " 条");

        const formatted = rerankedResults
          .map((r, i) => {
            const meta = r.metadata || {};
            const pageRef = meta.startPage ? ` (第${meta.startPage}${meta.endPage && meta.endPage !== meta.startPage ? '-' + meta.endPage : ''}页)` : '';
            const sourceRef = meta.source ? ` [来源: ${meta.source}${pageRef}]` : '';
            return "[" + (i + 1) + "] (score: " + r.score.toFixed(4) + ")" + sourceRef + " " + r.text;
          })
          .join("\n\n");
        return formatted + graphText || "未找到相关结果";
      } catch (error) {
        console.error("[simpleAgent] hybridSearch 执行失败:", error);
        return "Search failed: " + (error instanceof Error ? error.message : String(error));
      }
    },
  },
];

let toolsRegistered = false;
function ensureToolsAndSkillsRegistered(): void {
  if (toolsRegistered) return;
  for (const tool of tools) {
    ToolRegistry.register(tool);
  }
  registerAllSkills();
  toolsRegistered = true;
}

function getToolDescriptions(): string {
  return tools
    .map(
      (t) =>
        `- ${t.name}: ${t.description}\n  params: ${JSON.stringify(t.parameters)}`
    )
    .join("\n\n");
}

function extractBalancedJson(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.substring(startIndex, i + 1);
      }
    }
  }
  return null;
}

function parseSingleToolCall(text: string): { name: string; params: Record<string, unknown> } | null {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.skill) {
        console.log("[simpleAgent] Parse skill call: skill=" + parsed.skill);
        return { name: "__skill__", params: { skillName: parsed.skill } };
      }
      if (parsed.tool && parsed.parameters) {
        console.log("[simpleAgent] Parse tool call success (format 1): tool=" + parsed.tool);
        return { name: parsed.tool, params: parsed.parameters };
      }
      if (parsed.name || parsed.function?.name) {
        const toolName = parsed.name || parsed.function?.name;
        const toolArgs = parsed.arguments || parsed.function?.arguments || parsed.parameters || {};
        if (typeof toolArgs === "string") {
          try { return { name: toolName, params: JSON.parse(toolArgs) }; } catch { /* ignore */ }
        }
        console.log("[simpleAgent] Parse tool call success (format 1-alt): tool=" + toolName);
        return { name: toolName, params: toolArgs };
      }
    }

    const actionMatch = text.match(/Action:\s*(\w+)\s*\n\s*Action Input:\s*([\s\S]*?)(?=\n\n|Observation|$)/i);
    if (actionMatch) {
      const name = actionMatch[1].trim();
      const params = JSON.parse(actionMatch[2].trim());
      console.log("[simpleAgent] Parse tool call success (format 2): tool=" + name);
      return { name, params };
    }

    const funcCallMatch = text.match(/(?:调用|使用|执行)\s*(?:工具|函数)?\s*[:：]?\s*(\w+)\s*[\(（]([\s\S]*?)[\)）]/);
    if (funcCallMatch) {
      try {
        const name = funcCallMatch[1].trim();
        const argsStr = funcCallMatch[2].trim();
        if (tools.some(t => t.name === name)) {
          const params = JSON.parse(argsStr);
          console.log("[simpleAgent] Parse tool call success (format 3): tool=" + name);
          return { name, params };
        }
      } catch { /* ignore */ }
    }

    const inlineJsonMatch = text.match(/\{\s*"tool"\s*:\s*"(\w+)"\s*,\s*"parameters"\s*:\s*(\{[\s\S]*?\})\s*\}/);
    if (inlineJsonMatch) {
      const name = inlineJsonMatch[1];
      const params = JSON.parse(inlineJsonMatch[2]);
      if (tools.some(t => t.name === name)) {
        console.log("[simpleAgent] Parse tool call success (format 4-inline): tool=" + name);
        return { name, params };
      }
    }

    // Format 5: 鲁棒JSON提取 - 处理缺少闭合```或格式混乱的情况
    const toolKeyPattern = /\{\s*"tool"\s*:\s*"(\w+)"/g;
    let toolMatch;
    while ((toolMatch = toolKeyPattern.exec(text)) !== null) {
      const startIndex = toolMatch.index;
      const jsonStr = extractBalancedJson(text, startIndex);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.tool && parsed.parameters && tools.some(t => t.name === parsed.tool)) {
            console.log("[simpleAgent] Parse tool call success (format 5-robust): tool=" + parsed.tool);
            return { name: parsed.tool, params: parsed.parameters };
          }
        } catch { /* continue trying */ }
      }
    }

    // Format 6: ```json缺少闭合```的情况
    const unclosedJsonMatch = text.match(/```json\s*([\s\S]+)$/);
    if (unclosedJsonMatch) {
      let jsonStr = unclosedJsonMatch[1].trim();
      // 去除尾部可能的非JSON字符
      const firstBrace = jsonStr.indexOf('{');
      if (firstBrace >= 0) {
        const extracted = extractBalancedJson(jsonStr, firstBrace);
        if (extracted) {
          try {
            const parsed = JSON.parse(extracted);
            if (parsed.tool && parsed.parameters && tools.some(t => t.name === parsed.tool)) {
              console.log("[simpleAgent] Parse tool call success (format 6-unclosed): tool=" + parsed.tool);
              return { name: parsed.tool, params: parsed.parameters };
            }
          } catch { /* ignore */ }
        }
      }
    }
  } catch (e) {
    console.error("[simpleAgent] 解析工具调用异常:", e);
  }
  return null;
}

function parseToolCalls(text: string): { name: string; params: Record<string, unknown> }[] {
  const results: { name: string; params: Record<string, unknown> }[] = [];

  const jsonBlocks = text.match(/```json\s*([\s\S]*?)```/g);
  if (jsonBlocks && jsonBlocks.length > 1) {
    for (const block of jsonBlocks) {
      const inner = block.replace(/```json\s*/, "").replace(/```$/, "");
      try {
        const parsed = JSON.parse(inner);
        if (parsed.tool && parsed.parameters) {
          results.push({ name: parsed.tool, params: parsed.parameters });
        } else if (parsed.name || parsed.function?.name) {
          const toolName = parsed.name || parsed.function?.name;
          const toolArgs = parsed.arguments || parsed.function?.arguments || parsed.parameters || {};
          const finalArgs = typeof toolArgs === "string" ? JSON.parse(toolArgs) : toolArgs;
          results.push({ name: toolName, params: finalArgs });
        }
      } catch { /* ignore */ }
    }
    if (results.length > 0) {
      console.log("[simpleAgent] Parsed " + results.length + " tool calls: " + results.map(r => r.name).join(", "));
      return results;
    }
  }

  const single = parseSingleToolCall(text);
  if (single) {
    results.push(single);
  }
  return results;
}

function convertToBailianTools(toolsList: ToolDefinition[]): BailianTool[] {
  return toolsList.map(t => {
    const enhanced = toolDescriptionEnhancer.get(t.name);
    let description = t.description;
    if (enhanced) {
      description = `${description}\n何时使用: ${enhanced.whenToUse}\n何时不使用: ${enhanced.whenNotToUse}`;
    }
    return {
      type: "function" as const,
      function: {
        name: t.name,
        description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type || "string", description: v.description || "" }])
          ),
          required: Object.entries(t.parameters).filter(([_, v]) => v.required).map(([k]) => k),
        }
      }
    };
  });
}

export interface CitationSource {
  type: "pdf" | "sql";
  documentId?: string;
  fileName?: string;
  startPage?: number;
  endPage?: number;
  text?: string;
  dataSource?: string;
  apiEndpoint?: string;
  query?: string;
}

export interface AgentResult {
  answer: string;
  iterations: number;
  conversationId: string;
  steps: AgentStep[];
  citations?: CitationSource[];
  coarseResults?: SearchResult[];
}

async function generateConversationTitle(query: string, answer: string, conversationId: string, model?: string): Promise<void> {
  try {
    const titlePrompt: BailianMessage[] = [
      {
        role: "system",
        content: "你是一个会话标题生成器。根据用户的问题和AI的回答，生成一个简短的中文会话标题（不超过15个字）。只输出标题文本，不要输出任何其他内容。标题要概括对话的核心主题。",
      },
      {
        role: "user",
        content: "User query: " + query + "\nAI answer: " + answer.substring(0, 500),
      },
    ];
    const response = await callWithFallback(titlePrompt, 0.7);
    const title = (response.content ?? "").trim().replace(/["""'']/g, "").substring(0, 20);
    if (title && title.length > 0) {
      await updateConversationTitle(conversationId, title);
      console.log("[simpleAgent] Conversation title generated: " + title);
    }
  } catch (err) {
    console.error("[simpleAgent] Generate conversation title failed: " + (err instanceof Error ? err.message : String(err)));
  }
}

export async function runAgent(query: string, maxIterations: number = 5, conversationId?: string, userId: string = "default-user", model?: string, _userName?: string, _userEmail?: string, onStep?: (step: AgentStep) => void): Promise<AgentResult> {
  console.log("[simpleAgent] Received query: " + query + ", maxIterations: " + maxIterations + ", userId: " + userId + ", model: " + (model || "default"));
  const startTime = Date.now();
  const steps: AgentStep[] = [];
  const citations: CitationSource[] = [];
  let lastSearchCitations: CitationSource[] = [];
  ensureToolsAndSkillsRegistered();
  lastStockData = getStockCache(userId);
  stockDataByCode.clear();
  currentUserId = userId;

  const pushStep = (step: AgentStep) => {
    steps.push(step);
    onStep?.(step);
  };

  let convId = conversationId;
  let needGenerateTitle = false;
  if (!convId) {
    convId = await createConversation(userId);
    needGenerateTitle = true;
  }

  await addMessage(convId, "user", query, userId);

  extractAndApplyPreferences(userId, query).catch((err) => {
    console.error(`[simpleAgent] 偏好提取失败: ${err instanceof Error ? err.message : String(err)}`);
  });

  pushStep({
    type: "thinking",
    round: 0,
    title: "Received User Query",
    content: query,
    timestamp: Date.now(),
  });

  // ========== 意图识别层 - 在工具调用之前识别问题类型并分流处理（Task 6） ==========
  const intentResult = classifyIntent(query);
  console.log("[simpleAgent] 意图识别结果: type=" + intentResult.type + (intentResult.matchedKeywords ? ", keywords=" + intentResult.matchedKeywords.join(",") : ""));

  if (intentResult.type === "adversarial") {
    // 对抗性问题（Unsafe 级）：不执行检索，直接返回安全拒绝模板
    const rejection = buildAdversarialRejection(intentResult.matchedKeywords || []);

    pushStep({
      type: "answer",
      round: 0,
      title: "对抗性问题拦截 - 安全拒绝",
      content: rejection,
      detail: { intentType: "adversarial", matchedKeywords: intentResult.matchedKeywords },
      timestamp: Date.now(),
    });

    await addMessage(convId, "assistant", rejection);

    // 记录合规日志（Unsafe 级）
    const violationType = (intentResult.matchedKeywords || [])
      .map((kw) => ADVERSARIAL_VIOLATION_MAP[kw] || "其他")
      .filter((v, i, arr) => arr.indexOf(v) === i)[0] || "其他";
    await logCompliance({
      userId,
      inputContent: query,
      riskLevel: "Unsafe",
      violationType,
      handlingAction: "直接拒绝+违法警示",
      outputContent: rejection,
    });

    const latencyMs = Date.now() - startTime;
    saveAgentLog({
      userId,
      conversationId: convId,
      query,
      answer: rejection,
      model: model || "unknown",
      iterations: 0,
      steps,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs,
      status: "success",
    }).catch((e) => console.error("[simpleAgent] 保存日志失败:", e));

    if (needGenerateTitle) await generateConversationTitle(query, rejection, convId, model);
    return { answer: rejection, iterations: 0, conversationId: convId, steps, citations: [], coarseResults: [] };
  }

  if (intentResult.type === "investment_advice") {
    // 投资建议问题（Controversial 级）：先检索该公司财务数据，然后返回合规拒绝+数据参考
    pushStep({
      type: "retrieval",
      round: 0,
      title: "投资建议拦截 - 检索财务数据",
      content: "检测到投资建议类问题，检索公司财务数据作为参考...",
      detail: { intentType: "investment_advice", matchedKeywords: intentResult.matchedKeywords },
      timestamp: Date.now(),
    });

    let searchResults: SearchResult[] = [];
    try {
      const searchStartTime = Date.now();
      // 粗排：混合检索
      const coarseResults = await hybridSearch(query, 20);
      lastCoarseResults = coarseResults;

      // 精排：bge-reranker
      let rerankedResults: SearchResult[];
      try {
        const texts = coarseResults.map((r) => r.text);
        const rerankResults = await rerank(query, texts, 10);
        rerankedResults = rerankResults.map((rr) => {
          const original = coarseResults[rr.index ?? 0];
          return {
            text: rr.text,
            documentId: original?.documentId || "",
            score: rr.score,
            denseScore: original?.denseScore,
            sparseScore: original?.sparseScore,
            metadata: original?.metadata || {},
          };
        });
      } catch {
        rerankedResults = coarseResults.slice(0, 10);
      }
      lastHybridSearchRawResults = rerankedResults;
      searchResults = rerankedResults;

      console.log("[simpleAgent] 投资建议检索完成, 耗时: " + ((Date.now() - searchStartTime) / 1000).toFixed(2) + "s, 结果: " + searchResults.length + " 条");
    } catch (searchError) {
      console.error("[simpleAgent] 投资建议检索失败: " + (searchError instanceof Error ? searchError.message : String(searchError)));
    }

    const response = buildInvestmentAdviceResponse(searchResults);

    // 收集引用
    const adviceCitations: CitationSource[] = [];
    for (const r of searchResults) {
      const meta = r.metadata || {};
      if (r.documentId) {
        adviceCitations.push({
          type: "pdf",
          documentId: r.documentId,
          fileName: meta.source,
          startPage: meta.startPage,
          endPage: meta.endPage,
          text: r.text.substring(0, 200),
        });
      }
    }

    pushStep({
      type: "answer",
      round: 0,
      title: "投资建议合规拒绝 + 财务数据参考",
      content: response,
      detail: { intentType: "investment_advice", searchResultCount: searchResults.length },
      timestamp: Date.now(),
    });

    await addMessage(convId, "assistant", response);

    // 记录合规日志（Controversial 级）
    await logCompliance({
      userId,
      inputContent: query,
      riskLevel: "Controversial",
      violationType: "投资建议",
      handlingAction: "合规拒绝+数据参考",
      outputContent: response,
    });

    const latencyMs = Date.now() - startTime;
    saveAgentLog({
      userId,
      conversationId: convId,
      query,
      answer: response,
      model: model || "unknown",
      iterations: 0,
      steps,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs,
      status: "success",
    }).catch((e) => console.error("[simpleAgent] 保存日志失败:", e));

    if (needGenerateTitle) await generateConversationTitle(query, response, convId, model);
    return { answer: response, iterations: 0, conversationId: convId, steps, citations: adviceCitations, coarseResults: lastCoarseResults };
  }

  // 事实查询（factual）：走正常 Agent 流程
  // ========== R001 路由预查询：数值类查询优先走 SQL，结果注入 LLM context ==========
  let r001SqlContext = "";
  let r001Route: "sql_standard" | "sql_raw_tables" | "vector" | null = null;
  try {
    const routeResult = await r001RouteQuery(query);
    r001Route = routeResult.route;
    if (routeResult.route === "sql_standard" && routeResult.sqlResult && routeResult.sqlResult.length > 0) {
      // 命中标准化指标 SQL 查询：格式化为自然语言上下文（V13-r6 优化：替代 JSON.stringify）
      const company = routeResult.company;
      const indicators = routeResult.indicators.map((i) => i.standardName).join(", ");
      const formattedText = formatSqlResultAsText(
        routeResult.sqlResult,
        company?.stockNameShort,
        company?.stockCode,
      );
      r001SqlContext = `\n\n${formattedText}\n命中指标: ${indicators}\n\n请基于上述 SQL 查询结果直接回答用户问题，不要调用 marketData(financial)/marketData(financialReport)/hybridSearch 重复获取相同数据。`;
      console.log("[R001] SQL 标准化查询命中，注入上下文: " + routeResult.sqlResult.length + " 行");
      pushStep({
        type: "retrieval",
        round: 0,
        title: "R001 SQL 精确查询命中",
        content: `公司: ${company?.stockNameShort} | 指标: ${indicators} | 结果: ${routeResult.sqlResult.length} 行`,
        detail: { route: routeResult.route, company: routeResult.company, indicators: routeResult.indicators },
        timestamp: Date.now(),
      });
    } else if (routeResult.route === "sql_raw_tables" && routeResult.sqlResult && routeResult.sqlResult.length > 0) {
      // 命中原始表格 fallback：格式化为自然语言上下文（V13-r6 优化）
      const company = routeResult.company;
      r001SqlContext = `\n\n${formatRawTablesAsText(routeResult.sqlResult, company?.stockNameShort, company?.stockCode)}\n\n请基于上述原始表格数据回答用户问题，必要时可补充调用 hybridSearch。`;
      console.log("[R001] SQL 原始表格查询命中，注入上下文: " + routeResult.sqlResult.length + " 张表");
      pushStep({
        type: "retrieval",
        round: 0,
        title: "R001 原始表格查询命中",
        content: `公司: ${company?.stockNameShort} | 原始表格: ${routeResult.sqlResult.length} 张`,
        detail: { route: routeResult.route, company: routeResult.company },
        timestamp: Date.now(),
      });
    } else {
      console.log("[R001] 路由到向量检索: intent=" + routeResult.intent + ", route=" + routeResult.route);
    }
  } catch (r001Error) {
    console.error("[R001] 路由预查询失败，降级到原 Agent 流程: " + (r001Error instanceof Error ? r001Error.message : String(r001Error)));
  }

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const systemPrompt = `你是一个金融分析AI助手，可以使用以下工具来回答用户的问题：

当前日期: ${todayStr}

${getToolDescriptions()}

当你需要使用工具时，请按以下格式输出：
\`\`\`json
{
  "tool": "工具名称",
  "parameters": { 参数 }
}
\`\`\`

当你已经获得足够信息可以回答时，直接输出最终答案，不要使用工具格式。
为了减少迭代轮次，你可以在同一轮中同时调用多个工具（最多3个）。

【核心规则 - 必须严格遵守】：

1. 【严禁编造数据】所有具体的股价、财务数字（营收、利润、ROE等）、技术指标数值必须来自工具调用结果，绝不能凭空编造！如果工具未返回数据，必须明确告知用户"未获取到该数据"。
   【禁止猜测原因】当工具未返回数据时，你不得声称"财报未发布"、"数据尚未公布"、"还未到披露时间"等理由——你无法判断财报是否已发布，只能说"系统未获取到该数据"。财报是否已发布是客观事实，不由你推测。
   【知识库覆盖范围】本系统知识库仅覆盖部分公司的财务数据，并非所有A股公司都在覆盖范围内。当工具返回空数据时，应告知用户"该数据可能不在系统当前覆盖范围内，或数据源暂时无法获取"。

2. 【必须调用工具的场景】以下场景必须先调用对应工具获取数据，不能直接回答：
   - 用户询问营收、利润、ROE、毛利率等财务指标 → 必须调用 marketData(dataType:"financial", code:"600519")
   - 用户询问具体股价、涨跌幅 → 必须调用 marketData(dataType:"realtime", code:"600036")
   - 用户要求计算技术指标（MA、RSI、MACD等）→ 调用 technicalAnalysis（传入code参数自动获取数据）
   - 用户要求获取历史K线 → 调用 marketData(dataType:"history", code:"sh.600036")
   - 用户询问详细财务报表项目 → 调用 marketData(dataType:"financialReport", code:"600519")
   - 用户询问公司财报、行业分析等文档内容 → 使用 hybridSearch
   - 用户要求计算风险指标（VWAP/Sharpe/MaxDD/Vol/Corr/VaR）→ 调用 riskAnalysis
   - 用户要求合规检查 → 调用 complianceCheck
   - 不确定工具参数详情时 → 调用 toolSearch 获取工具说明

3. 【工具选择优先级】当用户询问财务数据时：
   - 首选 marketData(dataType:"financialReport")（返回完整报表+盈利能力指标）
   - 如果只需要关键财务指标（ROE、毛利率等），使用 marketData(dataType:"financial")
   - 不要使用 hybridSearch 来查找财务数字（hybridSearch是检索文档的，不是获取实时财务数据的）
   - 不要同时调用 marketData financial 和 financialReport，它们有重叠，选一个即可
   - 当用户问利润表中的具体项目，必须用 marketData(dataType:"financialReport")

4. 【股票代码格式 - 必须严格遵守】：
   - marketData realtime/financial/financialReport: 不需要前缀，如 600519、000858
   - marketData history(baostock): 需要 sh./sz. 前缀
     * 沪市（6开头）: sh.600519、sh.600036
     * 深市（0开头）: sz.000858、sz.000066、sz.000651
     * 绝对不能把深市股票用sh.前缀！000066是深市，必须用sz.000066，不能用sh.000066
     * 绝对不能把沪市股票用sz.前缀！600519是沪市，必须用sh.600519，不能用sz.600519
   - 常见股票代码对照：
     * 中国长城 000066 → baostock: sz.000066, efinance: 000066
     * 五粮液 000858 → baostock: sz.000858, efinance: 000858
     * 格力电器 000651 → baostock: sz.000651, efinance: 000651
     * 贵州茅台 600519 → baostock: sh.600519, efinance: 600519

5. 【数据来源说明】所有数据工具调用的是真实的金融数据接口（baostock/efinance），返回的是实时或历史真实数据，数据会自动缓存到本地。

6. 如果工具调用失败或返回空数据，应如实告知用户，不要用编造的数据来回答。可以尝试换一个数据源重新获取。

7. 【技术指标计算流程】当用户要求计算技术指标时，调用 technicalAnalysis 工具，传入 indicator 和 code 参数即可：
   - technicalAnalysis 会自动获取数据（如未缓存），无需先单独调用 marketData(history)
   - 示例：technicalAnalysis(indicator:"MA", code:"sh.600036", period:20)
   - 如果用户指定了某个日期（如"2026-05-06的MA20"），需先调用 marketData(dataType:"history", code:"sh.600036", start_date:"2026-02-06", end_date:"2026-05-06")，再调用 technicalAnalysis

8. 【重要】计算技术指标时，technicalAnalysis 传入 code 参数会自动获取数据。对于多公司查询，也应在同一轮中同时调用。riskAnalysis 同理，传入 code 参数自动获取数据。

9. 【相关系数计算流程】当用户要求计算两只股票的相关系数时，调用 riskAnalysis(metric:"Correlation", code:"sh.600036", code2:"sz.000858")。riskAnalysis 会自动获取两只股票的数据。

10. 【回答格式要求 - 时间相关数据必须标注日期（最高优先级规则）】当你回答涉及股价、技术指标、财务数据等与时间相关的数据时，必须在回答中明确标注数据的查询日期或截止日期。这是最高优先级规则，不可违反！
   - 股价数据："截至2026-06-03（最新交易日），格力电器最新价为39.50元"
   - 财务数据："根据2025年年报（报告期：2025-12-31，发布日期：2026-04-30），五粮液营业收入为405.29亿元"
   - 技术指标："截至2026-06-03（最新交易日），MA20为86.23"
   - 如果用户指定了日期，回答中使用用户指定的日期
   - 如果用户未指定日期，回答中必须使用工具返回的latestTradeDate或报告期日期作为数据截止日期
   - 实时行情必须标注"数据时间：YYYY-MM-DD"
   - 财报数据必须标注"报告期"和"发布日期"
   - 违反此规则视为严重错误

11. 【计算公式和验证数据】当计算MA、RSI等技术指标时，工具返回结果中包含formula（计算公式）和calcDetail（计算过程和中间数据）。你必须在回答中输出这些信息，让用户可以手动验证计算结果是否正确。格式示例：
   - MA20计算公式：MA20 = (最近20个交易日收盘价之和) / 20
   - 计算过程：(2026-05-06: 38.50 + ... + 2026-05-29: 37.50) / 20 = 758.35 / 20 = 37.9175
   - RSI(14)计算公式：RSI(14) = 100 - 100 / (1 + RS)，RS = 平均涨幅 / 平均跌幅
   - 计算过程：列出最近15日收盘价变动、每日涨跌、avgGain、avgLoss、RS、最终RSI

12. 【回答完整性原则】你的回答必须覆盖用户查询的所有方面。如果用户同时问了财务数据和行情数据，你必须两类数据都获取并回答。如果用户问了A和B的对比，你必须两家公司都分析。当你已经获取到足够覆盖查询所有方面的数据后，立即输出最终答案，不要调用与查询无关的额外工具。

13. 【禁止重复调用 - 严重错误】绝对不要重复调用已经调用过的工具！
   - 如果marketData(financial)已经返回了数据，不要再次调用它
   - 如果marketData(history)已经返回了K线数据，不要再次调用它
   - 如果marketData(financialReport)已经返回了报表数据，不要再次调用它，也不要再调marketData(financial)
   - 如果technicalAnalysis已经返回了指标值，不要再次调用它
   - 不要对同一个工具用相同参数重复调用
   - 重复调用相同的工具是严重错误，会浪费时间和资源
   - 一旦获取到数据，立即基于已有数据回答问题
   - 如果某个工具调用失败，不要用相同参数重试，应该换数据源或换工具

14. 【迭代效率】每个工具最多调用1次。如果某个工具返回了数据但你觉得不够完整，应该使用hybridSearch补充文档信息，而不是再次调用同一个工具。如果所有工具都已调用过，必须立即输出最终答案。

15. 【数据真实性原则】当工具调用返回错误（如"fetch failed"、"获取失败"、"Error"等）时，你绝对不能编造或幻觉该工具本应返回的数据。你必须如实告知用户该工具调用失败，无法获取相关数据。你只能使用工具实际成功返回的数据来回答问题。

16. 【工具失败处理】如果某个工具调用失败或返回空数据，不要用相同参数重复调用该工具！你应该：
   - 换一个数据源（如从efinance切换到baostock）
   - 或者换一个工具（如从marketData(financial)切换到marketData(financialReport)）
   - 如果没有替代方案，直接告知用户该数据暂时无法获取，不要浪费轮次重试

17. 【立即回答原则 - 最高优先级】当你在某一轮中成功获取了用户所需的数据后，必须立即输出最终答案，不要进入下一轮！
   - 如果marketData(financialReport)返回了利润表数据，不要再去调hybridSearch补充，直接基于已有数据回答
   - 如果technicalAnalysis返回了MA值，直接回答，不要再调其他工具
   - 如果marketData(realtime)返回了实时行情，直接回答，不要再调marketData(financial)
   - 不要为了"补充信息"或"验证数据"而额外调用工具，除非用户明确要求了该信息
   - 每多一轮迭代都是浪费时间和资源
   - 第一轮获取到数据后，第二轮必须输出最终答案，绝不允许第三轮

18. 【数据已足够判断】当工具返回了数据，即使你觉得数据可能不够完整，也必须基于已有数据直接回答。不要因为"想获取更多信息"而继续迭代。例如：
   - marketData(financialReport)返回了利润表，其中包含营业利润和利润总额，直接计算差额回答，不要再调hybridSearch
   - technicalAnalysis/riskAnalysis返回了计算结果，直接比较回答，不要再调其他工具验证
   - 你的目标是：用最少的工具调用、最少的迭代轮次，给出准确的答案

19. 【Skill能力】当用户需要进行综合分析时，以下Skill可以一次性编排多个工具：
${SkillRegistry.listDescriptions()}
当用户需求匹配某个Skill时，你可以在工具调用中使用 "skill" 字段指定Skill名称，格式如下：
\`\`\`json
{"skill": "technical-analysis"}
\`\`\`
系统会自动执行该Skill包含的所有工具步骤。你也可以继续使用单独的工具调用方式。

20. 【统一拒绝话术 - 必须一字不差使用】当出现以下两种情况时，必须使用对应的规范话术回复，不得改用"无法回答"、"无法提供"等其它表述：
   - 问题涉及违法违规内容或需合规拒绝时（如操纵市场、内幕交易、洗钱、索要投资建议等）："${COMPLIANCE_REFUSAL}"
   - 问题超出知识库覆盖范围或工具未获取到数据时："${OUT_OF_KNOWLEDGE_REFUSAL}"`;

  // R001 路由预查询结果注入 systemPrompt（数值类查询走 SQL 的核心入口）
  // sql_standard / sql_raw_tables 命中时把查询结果拼到 systemPrompt 末尾
  // vector 路由时 r001SqlContext 为空字符串，不影响原行为
  const finalSystemPrompt = fewShotInjector.inject(systemPrompt + r001SqlContext);

  const modelMaxTokens = 32768;
  let contextMemory: string[] = [];
  let l1Messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  try {
    const assembled = await assembleContext(query, userId, convId, modelMaxTokens);
    contextMemory = [
      assembled.l4Profile,
      assembled.l2Summary,
      assembled.l3Fragments,
    ].filter((s) => s.length > 0);
    l1Messages = assembled.l1Messages;
    if (!needGenerateTitle && l1Messages.length <= 1) {
      needGenerateTitle = true;
    }
    console.log(`[simpleAgent] 记忆上下文: L1=${l1Messages.length}条, L4=${assembled.l4Profile ? "有" : "无"}, L2=${assembled.l2Summary ? "有" : "无"}, L3=${assembled.l3Fragments ? "有" : "无"}`);
  } catch (err) {
    console.error(`[simpleAgent] 记忆上下文组装失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  const memorySection = contextMemory.length > 0
    ? `\n\n【用户记忆上下文】\n${contextMemory.join("\n\n")}`
    : "";

  const messages: BailianMessage[] = [
    { role: "system", content: finalSystemPrompt + memorySection },
    ...l1Messages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  let iterations = 0;
  let lastSearchResults: string[] = [];
  let toolObservations: string[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let currentModel = model || "unknown";
  let toolCallHistory: string[] = [];
  let duplicateCallCount = 0;

  const routerFacade = new RouterFacade();
  const routeResult = routerFacade.route(query);
  let activeTools = tools;
  if (routeResult.routeType === "skill" && routeResult.matchedSkill) {
    const skillToolNames = routeResult.availableTools;
    activeTools = tools.filter(t => skillToolNames.includes(t.name));
    console.log(`[simpleAgent] RouterFacade matched skill: ${routeResult.matchedSkill.name}, tools: ${activeTools.map(t => t.name).join(", ")}`);
  } else if (routeResult.routeType === "group" && routeResult.matchedGroups && routeResult.matchedGroups.length > 0) {
    const groupToolNames = routeResult.availableTools;
    activeTools = tools.filter(t => groupToolNames.includes(t.name));
    if (activeTools.length === 0) activeTools = tools;
    console.log(`[simpleAgent] RouterFacade matched groups: ${routeResult.matchedGroups.map(g => g.groupId).join(", ")}, tools: ${activeTools.map(t => t.name).join(", ")}`);
  } else {
    const toolVectorRetriever = new ToolVectorRetriever();
    if (toolVectorRetriever.isReady()) {
      try {
        const candidateGroups = routeResult.matchedGroups?.map(g => g.groupId);
        const retrievedTools = await toolVectorRetriever.retrieve(query, 8, candidateGroups);
        if (retrievedTools.length > 0) {
          const retrievedNames = retrievedTools.map(r => r.toolName);
          activeTools = tools.filter(t => retrievedNames.includes(t.name));
          if (activeTools.length === 0) activeTools = tools;
          console.log(`[simpleAgent] VectorRetriever top-${retrievedTools.length} tools: ${retrievedNames.join(", ")}`);
        } else {
          console.log(`[simpleAgent] VectorRetriever no results, using all ${tools.length} tools`);
        }
      } catch (err) {
        console.error(`[simpleAgent] VectorRetriever error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      console.log(`[simpleAgent] VectorRetriever not ready, using all ${tools.length} tools`);
    }
  }
  const bailianTools = convertToBailianTools(activeTools);
  const callLimiter = new CallLimiter({ maxToolCalls: maxIterations * 3 });

  for (let i = 0; i < maxIterations; i++) {
    if (i > 0 && messages.length > 20) {
      try {
        const { messages: compacted, result: compactionResult } = await compactContext(messages);
        if (compactionResult.compacted) {
          messages.length = 0;
          messages.push(...compacted);
          console.log(`[simpleAgent] Context compacted: ${compactionResult.originalMessageCount}→${compactionResult.compactedMessageCount} messages, saved ${compactionResult.savedTokens} tokens`);
          pushStep({
            type: "thinking",
            round: i + 1,
            title: "Context Compaction",
            content: `对话历史压缩: ${compactionResult.originalMessageCount}→${compactionResult.compactedMessageCount}条, 节省${compactionResult.savedTokens}tokens`,
            detail: compactionResult as unknown as Record<string, unknown>,
            timestamp: Date.now(),
          });
        }
      } catch (compactionErr) {
        console.error("[simpleAgent] Context compaction failed:", compactionErr);
      }
    }

    if (Date.now() - startTime > AGENT_TIMEOUT_MS) {
      const elapsedMs = Date.now() - startTime;
      const elapsedSec = (elapsedMs / 1000).toFixed(1);
      console.error("[simpleAgent] Agent timeout after " + AGENT_TIMEOUT_MS + "ms, elapsed: " + elapsedSec + "s");
      pushStep({
        type: "answer",
        round: i + 1,
        title: "Agent Timeout",
        content: "Agent timeout, please try again later or simplify your question.",
        timestamp: Date.now(),
      });
      await addMessage(convId, "assistant", "Agent 执行超时，请稍后重试或简化您的问题。");
      saveAgentLog({
        userId,
        conversationId: convId,
        query,
        answer: "Agent 执行超时，请稍后重试或简化您的问题。",
        model: currentModel,
        iterations,
        steps,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        latencyMs: Date.now() - startTime,
        status: "timeout",
      }).catch((e) => console.error("[simpleAgent] 保存超时日志失败:", e));
      if (needGenerateTitle) await generateConversationTitle(query, "Agent 执行超时", convId, model);
      return { answer: "Agent 执行超时，请稍后重试或简化您的问题。", iterations, conversationId: convId, steps, citations, coarseResults: lastCoarseResults };
    }
    iterations++;
    const roundStartTime = Date.now();
    const elapsedMs = roundStartTime - startTime;
    const elapsedSec = (elapsedMs / 1000).toFixed(1);
    console.log("[simpleAgent] Round " + (i + 1) + "/" + maxIterations + " elapsed: " + elapsedSec + "s");

    pushStep({
      type: "thinking",
      round: i + 1,
      title: "Round " + (i + 1) + " - LLM Reasoning",
      content: "Calling LLM for reasoning...",
      detail: { roundIndex: i + 1, elapsedMs },
      timestamp: Date.now(),
    });

    try {
      const llmStartTime = Date.now();
      const response = await callWithFallback(messages, undefined, true, bailianTools);
      const llmMs = Date.now() - llmStartTime;
      const assistantContent = response.content ?? "";

      if (response.usage) {
        totalPromptTokens += response.usage.prompt_tokens || 0;
        totalCompletionTokens += response.usage.completion_tokens || 0;
      }

      const nativeToolCalls = response.toolCalls && response.toolCalls.length > 0 ? response.toolCalls : undefined;

      console.log("[simpleAgent] Round " + (i + 1) + " LLM: " + (llmMs / 1000).toFixed(2) + "s, total: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s");
      if (nativeToolCalls) {
        console.log("[simpleAgent] LLM returned native tool_calls: " + nativeToolCalls.map(tc => tc.function.name).join(", "));
      } else {
        console.log("[simpleAgent] LLM response: " + assistantContent.substring(0, 200) + "...");
      }

      if (nativeToolCalls) {
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: nativeToolCalls,
        });
      } else {
        messages.push({ role: "assistant", content: assistantContent });
      }

      let toolCalls = nativeToolCalls
        ? nativeToolCalls.map(tc => {
            try {
              return { name: tc.function.name, params: JSON.parse(tc.function.arguments) };
            } catch {
              return { name: tc.function.name, params: {} };
            }
          })
        : parseToolCalls(assistantContent);
      const reasoningText = assistantContent.replace(/```json[\s\S]*?```/g, "").trim();
      const reasoning = reasoningText.substring(0, 500);

      if (toolCalls.length === 0) {
        // 安全网：检查答案中是否包含未解析的工具调用JSON
        const missedToolCall = parseSingleToolCall(assistantContent);
        if (missedToolCall && tools.some(t => t.name === missedToolCall.name)) {
          console.log("[simpleAgent] 检测到答案中包含未解析的工具调用: " + missedToolCall.name + "，转为执行工具");
          toolCalls = [missedToolCall];
          // 不走return路径，继续执行工具调用
        } else if (assistantContent.trim().length < 20 && toolObservations.length === 0 && i < maxIterations - 1) {
          console.log("[simpleAgent] LLM返回空/极短答案且无工具调用，强制要求LLM调用工具");
          messages.push({
            role: "user",
            content: "[Important] Your previous response was empty or too short. You MUST call the appropriate tools to answer the user's question. For financial data queries, call marketData. For technical indicators, call technicalAnalysis. For risk metrics, call riskAnalysis. For compliance checks, call complianceCheck. For document searches, call hybridSearch. Do NOT respond without calling tools first.",
          });
          continue;
        } else if (toolObservations.length === 0 && i < maxIterations - 1 && /```json/.test(assistantContent) && /"tool"\s*:/.test(assistantContent)) {
          console.log("[simpleAgent] LLM返回了工具调用JSON但未被解析，强制要求使用native function calling");
          messages.push({
            role: "user",
            content: "[Important] Your previous response contained a tool call in JSON format, but it was not executed. Please use the function calling feature (tool_calls) instead of writing JSON in your response. The system will automatically execute the tool for you. Try again with the same tool call.",
          });
          continue;
        } else if (toolObservations.length > 0) {
          const roundMs = Date.now() - roundStartTime;
          console.log("[simpleAgent] Has tool results and LLM final answer, done. Round: " + (roundMs / 1000).toFixed(2) + "s");

          pushStep({
            type: "answer",
            round: i + 1,
            title: "Final Answer",
            content: assistantContent,
            detail: { roundMs, llmMs, totalMs: Date.now() - startTime },
            timestamp: Date.now(),
          });

          await addMessage(convId, "assistant", assistantContent);

          const latencyMs = Date.now() - startTime;
          saveAgentLog({
            userId,
            conversationId: convId,
            query,
            answer: assistantContent,
            model: model || "unknown",
            iterations: i + 1,
            steps,
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens,
            latencyMs,
            status: "success",
          }).catch((e) => console.error("[simpleAgent] 保存日志失败:", e));

          if (needGenerateTitle) await generateConversationTitle(query, assistantContent, convId, model);
          clearCheckpoint(convId).catch(() => {});
          return { answer: normalizeRefusal(assistantContent), iterations, conversationId: convId, steps, citations, coarseResults: lastCoarseResults };
        }

        console.log("[simpleAgent] 无工具调用且无工具结果，进入反思评估阶段");

        pushStep({
          type: "reflection",
          round: i + 1,
          title: "Round " + (i + 1) + " - Reflection",
          content: "LLM did not call tools, evaluating if answer is sufficient...",
          detail: { answerPreview: assistantContent.substring(0, 300), llmMs },
          timestamp: Date.now(),
        });

        const reflectionStartTime = Date.now();
        const reflection = await shouldRetrieveAgain(query, assistantContent, lastSearchResults, toolObservations);
        const reflectionMs = Date.now() - reflectionStartTime;
        console.log("[simpleAgent] Round " + (i + 1) + " reflection: " + (reflectionMs / 1000).toFixed(2) + "s, needMore=" + reflection.needMore);

        if (reflection.needMore && reflection.refinedQuery && i < maxIterations - 1) {
          console.log(
            "[simpleAgent] Reflection result: need more info, suggestion: \"" + reflection.refinedQuery + "\""
          );

          const isToolSuggestion = reflection.refinedQuery.includes("marketData") ||
            reflection.refinedQuery.includes("technicalAnalysis") ||
            reflection.refinedQuery.includes("riskAnalysis") ||
            reflection.refinedQuery.includes("complianceCheck");

          pushStep({
            type: "reflection",
            round: i + 1,
            title: "Round " + (i + 1) + " - Reflection: " + (isToolSuggestion ? "Need Data Tools" : "Continue Search"),
            content: "Current answer insufficient, " + (isToolSuggestion ? "data may be fabricated, need real data tools" : "need more information"),
            detail: {
              needMore: true,
              refinedQuery: reflection.refinedQuery,
              reason: isToolSuggestion ? "检测到答案中的数字没有工具调用支撑，需要调用数据获取工具" : "答案中缺少关键信息，需要改写查询再次检索",
            },
            timestamp: Date.now(),
          });

          if (isToolSuggestion) {
            pushStep({
              type: "tool_call",
              round: i + 1,
              title: "Round " + (i + 1) + " - Reflection Triggered Data Tool Call",
              content: "Suggestion: " + reflection.refinedQuery,
              timestamp: Date.now(),
            });

            messages.push({
              role: "user",
              content: "[Important] Your previous answer contains specific numbers without tool call support, which may be fabricated. Reflection suggestion: " + reflection.refinedQuery + "\n\nPlease call the corresponding tools as suggested to get real data, then re-answer the user's question with the real data. Never use numbers without tool support!\n\n[CRITICAL] Do NOT retry the same tool with the same parameters if it already failed. Try a different data source or a different tool instead. If no alternative exists, tell the user the data is unavailable.",
            });
          } else {
            pushStep({
              type: "retrieval",
              round: i + 1,
              title: "Round " + (i + 1) + " - Reflection Triggered Additional Search",
              content: "Rewritten query: \"" + reflection.refinedQuery + "\"",
              timestamp: Date.now(),
            });

            const ragStartTime = Date.now();
            const ragResult = await hybridSearch(reflection.refinedQuery, 10);
            const ragMs = Date.now() - ragStartTime;
            console.log("[simpleAgent] Round " + (i + 1) + " reflection RAG: " + (ragMs / 1000).toFixed(2) + "s, results: " + ragResult.length);
            const formattedResult = ragResult
              .map((r, idx) => {
                const meta = r.metadata || {};
                const pageRef = meta.startPage ? ` (第${meta.startPage}${meta.endPage && meta.endPage !== meta.startPage ? '-' + meta.endPage : ''}页)` : '';
                const sourceRef = meta.source ? ` [来源: ${meta.source}${pageRef}]` : '';
                return "[" + (idx + 1) + "] (score: " + r.score.toFixed(4) + ")" + sourceRef + " " + r.text;
              })
              .join("\n\n");

            // 收集反思检索的引用
            for (const r of ragResult) {
              const meta = r.metadata || {};
              if (r.documentId) {
                citations.push({
                  type: "pdf",
                  documentId: r.documentId,
                  fileName: meta.source,
                  startPage: meta.startPage,
                  endPage: meta.endPage,
                  text: r.text.substring(0, 200),
                });
              }
            }

            lastSearchResults.push(formattedResult);

            pushStep({
              type: "retrieval",
              round: i + 1,
              title: "Round " + (i + 1) + " - Additional Search Results",
              content: "Found " + ragResult.length + " results",
              detail: {
                query: reflection.refinedQuery,
                resultCount: ragResult.length,
                results: ragResult.map((r, idx) => ({
                  index: idx + 1,
                  score: r.score,
                  text: r.text.substring(0, 200),
                  documentId: r.documentId,
                })),
              },
              timestamp: Date.now(),
            });

            messages.push({
              role: "user",
              content: "Reflection search results (query: \"" + reflection.refinedQuery + "\"):\n" + formattedResult + "\n\nPlease re-answer the user's question based on all the above information. If information is still insufficient, give your best answer directly.",
            });
          }

          const roundMs = Date.now() - roundStartTime;
          console.log("[simpleAgent] Round " + (i + 1) + " total: " + (roundMs / 1000).toFixed(2) + "s (LLM=" + (llmMs / 1000).toFixed(2) + "s, reflection=" + (reflectionMs / 1000).toFixed(2) + "s), total: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s");
          continue;
        }

        pushStep({
          type: "reflection",
          round: i + 1,
          title: "Round " + (i + 1) + " - Reflection: Answer Sufficient",
          content: "Answer sufficiently addresses the question, ending iteration",
          detail: { needMore: false, llmMs, reflectionMs },
          timestamp: Date.now(),
        });

        const roundMs = Date.now() - roundStartTime;
        console.log("[simpleAgent] Reflection passed, return final answer. Round: " + (roundMs / 1000).toFixed(2) + "s (LLM=" + (llmMs / 1000).toFixed(2) + "s, reflection=" + (reflectionMs / 1000).toFixed(2) + "s)");

        pushStep({
          type: "answer",
          round: i + 1,
          title: "Final Answer",
          content: assistantContent,
          timestamp: Date.now(),
        });

        await addMessage(convId, "assistant", assistantContent);

        const latencyMs = Date.now() - startTime;
        saveAgentLog({
          userId,
          conversationId: convId,
          query,
          answer: assistantContent,
          model: currentModel,
          iterations: i + 1,
          steps,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          latencyMs,
          status: "success",
        }).catch((e) => console.error("[simpleAgent] 保存日志失败:", e));

        if (needGenerateTitle) await generateConversationTitle(query, assistantContent, convId, model);
        clearCheckpoint(convId).catch(() => {});
        return { answer: normalizeRefusal(assistantContent), iterations, conversationId: convId, steps, citations, coarseResults: lastCoarseResults };
      }

      const toolCallsList = toolCalls;
      const skillCalls = toolCallsList.filter((tc) => tc.name === "__skill__");
      const regularCalls = toolCallsList.filter((tc) => tc.name !== "__skill__");

      const observationParts: string[] = [];
      let totalToolMs = 0;

      if (skillCalls.length > 0) {
        for (const skillCall of skillCalls) {
          const skillName = skillCall.params.skillName as string;
          const skill = SkillRegistry.get(skillName);
          if (!skill) {
            const errorMsg = "Skill not found: " + skillName;
            console.error("[simpleAgent] " + errorMsg);
            pushStep({
              type: "tool_call",
              round: i + 1,
              title: "Round " + (i + 1) + " - Skill Call Failed",
              content: errorMsg,
              detail: { skillName, error: true },
              timestamp: Date.now(),
            });
            observationParts.push(`[Skill:${skillName}] Error - ${errorMsg}`);
            continue;
          }

          pushStep({
            type: "tool_call",
            round: i + 1,
            title: "Round " + (i + 1) + " - Executing Skill: " + skillName,
            content: `Skill "${skillName}" 包含 ${skill.steps.length} 个步骤`,
            detail: { skillName, stepCount: skill.steps.length, reasoning },
            timestamp: Date.now(),
          });

          const skillStartTime = Date.now();
          try {
            const skillResult = await executeSkill(skill, skillCall.params);
            const skillMs = Date.now() - skillStartTime;
            console.log(`[simpleAgent] Skill "${skillName}" completed: ${skillMs}ms, success=${skillResult.success}`);

            pushStep({
              type: "tool_result",
              round: i + 1,
              title: "Round " + (i + 1) + " - Skill Result: " + skillName,
              content: skillResult.finalOutput.substring(0, 500),
              detail: {
                skillName,
                success: skillResult.success,
                stepResults: skillResult.stepResults.map((sr) => ({
                  step: sr.step,
                  tool: sr.tool,
                  success: sr.success,
                })),
                executionTimeMs: skillMs,
              },
              timestamp: Date.now(),
            });

            observationParts.push(`[Skill:${skillName}] ${skillResult.finalOutput}`);
            toolObservations.push(`[Skill:${skillName}] ${skillResult.finalOutput.substring(0, 500)}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[simpleAgent] Skill "${skillName}" execution error: ${msg}`);
            observationParts.push(`[Skill:${skillName}] Error - ${msg}`);
            toolObservations.push(`[Skill:${skillName}] Error - ${msg}`);
          }
        }
      }

      const invalidTools = regularCalls.filter((tc) => !tools.find((t) => t.name === tc.name));
      if (invalidTools.length > 0) {
        const errorMsg = "Tool not found: " + invalidTools.map((t) => t.name).join(", ");
        console.error("[simpleAgent] " + errorMsg);

        pushStep({
          type: "tool_call",
          round: i + 1,
          title: "Round " + (i + 1) + " - Tool Call Failed",
          content: errorMsg,
          detail: { toolName: invalidTools[0].name, error: true },
          timestamp: Date.now(),
        });

        messages.push({ role: "user", content: "Observation: Error - " + errorMsg });
        continue;
      }

      const toolCallValidator = new ToolCallValidator();

      for (const toolCall of regularCalls) {
        const tool = tools.find((t) => t.name === toolCall.name)!;

        const validation = toolCallValidator.validate(toolCall.name, toolCall.params);
        if (!validation.valid) {
          const valError = `工具调用校验失败: ${validation.errors.map(e => e.message).join("; ")}`;
          console.warn("[simpleAgent] " + valError + (validation.suggestion ? `, suggestion: ${validation.suggestion}` : ""));
          pushStep({
            type: "tool_call",
            round: i + 1,
            title: "Round " + (i + 1) + " - Validation Failed: " + toolCall.name,
            content: valError,
            detail: { toolName: toolCall.name, params: toolCall.params, validationErrors: validation.errors, suggestion: validation.suggestion },
            timestamp: Date.now(),
          });
          observationParts.push(`[${toolCall.name}] Validation Error - ${valError}${validation.suggestion ? ` Suggestion: ${validation.suggestion}` : ""}`);
          continue;
        }

        console.log("[simpleAgent] Calling tool: " + toolCall.name + ", params: " + JSON.stringify(toolCall.params).substring(0, 100));

        pushStep({
          type: "tool_call",
          round: i + 1,
          title: "Round " + (i + 1) + " - Calling Tool: " + toolCall.name,
          content: reasoning ? "Reasoning: " + reasoning + "\n\nParams: " + JSON.stringify(toolCall.params, null, 2) : "Params: " + JSON.stringify(toolCall.params, null, 2),
          detail: { toolName: toolCall.name, params: toolCall.params, reasoning, llmMs },
          timestamp: Date.now(),
        });

        const toolStartTime = Date.now();
        if (!callLimiter.canCall()) {
          const limitMsg = `工具调用次数已达上限(${callLimiter.getConfig().maxToolCalls})，停止调用`;
          console.warn("[simpleAgent] " + limitMsg);
          observationParts.push(`[${toolCall.name}] ${limitMsg}`);
          break;
        }
        const execResult = await callLimiter.executeWithLimit(toolCall.name, toolCall.params, () => Promise.resolve(tool.execute(toolCall.params)));
        if (execResult.limitReached) {
          const limitMsg = "工具调用次数已达上限，停止调用";
          console.warn("[simpleAgent] " + limitMsg);
          observationParts.push(`[${toolCall.name}] ${limitMsg}`);
          break;
        }
        const toolResult = String(execResult.result);
        const toolMs = Date.now() - toolStartTime;
        totalToolMs += toolMs;
        const cacheInfo = execResult.fromCache ? " (cached)" : "";
        console.log("[simpleAgent] Round " + (i + 1) + " tool " + toolCall.name + ": " + (toolMs / 1000).toFixed(2) + "s" + cacheInfo + ", total: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s");
        console.log("[simpleAgent] Tool result: " + toolResult.substring(0, 200) + "...");

        toolObservations.push(`[${toolCall.name}] ${toolResult.substring(0, 500)}`);

        if (toolCall.name === "hybridSearch") {
          lastSearchResults.push(toolResult);

          // 从最近一次搜索结果中收集PDF引用
          for (const r of lastHybridSearchRawResults) {
            const meta = r.metadata || {};
            if (r.documentId) {
              citations.push({
                type: "pdf",
                documentId: r.documentId,
                fileName: meta.source,
                startPage: meta.startPage,
                endPage: meta.endPage,
                text: r.text.substring(0, 200),
              });
            }
          }

          pushStep({
            type: "retrieval",
            round: i + 1,
            title: "Round " + (i + 1) + " - RAG Search Results",
            content: toolResult.substring(0, 500),
            detail: {
              query: toolCall.params.query as string,
              topK: toolCall.params.topK as number | undefined,
              resultPreview: toolResult.substring(0, 1000),
              toolMs,
            },
            timestamp: Date.now(),
          });
        } else if (toolCall.name === "marketData") {
          const dataType = toolCall.params.dataType as string;
          const endpointMap: Record<string, string> = {
            history: "/api/market/history",
            realtime: "/api/market/realtime",
            financial: "/api/market/financial",
            financialReport: "/api/market/financial_report",
          };
          citations.push({
            type: "sql",
            dataSource: `marketData(${dataType})`,
            apiEndpoint: endpointMap[dataType] || "",
            query: JSON.stringify(toolCall.params),
          });

          pushStep({
            type: "tool_result",
            round: i + 1,
            title: "Round " + (i + 1) + " - Tool Result: " + toolCall.name,
            content: toolResult.substring(0, 500),
            detail: { toolName: toolCall.name, resultPreview: toolResult.substring(0, 1000), toolMs },
            timestamp: Date.now(),
          });
        } else {
          pushStep({
            type: "tool_result",
            round: i + 1,
            title: "Round " + (i + 1) + " - Tool Result: " + toolCall.name,
            content: toolResult.substring(0, 500),
            detail: { toolName: toolCall.name, resultPreview: toolResult.substring(0, 1000), toolMs },
            timestamp: Date.now(),
          });
        }

        observationParts.push(`[${toolCall.name}] ${toolResult}`);
      }

      if (nativeToolCalls && nativeToolCalls.length > 0) {
        for (let ti = 0; ti < regularCalls.length && ti < observationParts.length; ti++) {
          const tc = nativeToolCalls[skillCalls.length + ti];
          if (tc) {
            const MAX_OBSERVATION_LENGTH = 8000;
            let obsContent = observationParts[ti];
            if (obsContent.length > MAX_OBSERVATION_LENGTH) {
              obsContent = obsContent.substring(0, MAX_OBSERVATION_LENGTH) + "\n\n[Result truncated]";
            }
            messages.push({
              role: "tool",
              content: obsContent,
              tool_call_id: tc.id,
            });
          }
        }
        if (observationParts.length > regularCalls.length) {
          const skillObsParts = observationParts.slice(0, skillCalls.length);
          const toolObsParts = observationParts.slice(skillCalls.length);
          for (const part of skillObsParts) {
            messages.push({ role: "user", content: part });
          }
        }
      } else {
        const MAX_OBSERVATION_LENGTH = 8000;
        let observationContent = `Observation:\n${observationParts.join("\n\n")}`;
        if (observationContent.length > MAX_OBSERVATION_LENGTH) {
          const truncated = observationContent.substring(0, MAX_OBSERVATION_LENGTH);
          observationContent = truncated + "\n\n[Result truncated, original length: " + observationContent.length + " chars]";
          console.log("[simpleAgent] Multi-tool result truncated: original " + observationContent.length + " chars -> " + MAX_OBSERVATION_LENGTH + " chars");
        }

        const currentToolNames = toolCallsList.map((tc) => tc.name);
        const prevSet = new Set(toolCallHistory);
        const duplicates = currentToolNames.filter((name) => prevSet.has(name));
        toolCallHistory.push(...currentToolNames);

        if (duplicates.length > 0) {
          duplicateCallCount++;
          console.log("[simpleAgent] Duplicate tool calls detected: " + duplicates.join(", ") + " (count: " + duplicateCallCount + ")");
        } else {
          duplicateCallCount = 0;
        }

        if (duplicateCallCount >= 1) {
          observationContent += "\n\n[IMPORTANT] You have already called these tools before and received results: " + duplicates.join(", ") + ". You MUST NOT call the same tools again. Instead, you MUST immediately output your final answer based on the data you have already collected. Do not call any more tools!";
          console.log("[simpleAgent] Force output: duplicate call detected, appending force-output instruction");
        }

        // 如果已获取关键数据，强制要求立即回答
        const hasFinancialData = toolObservations.some(o =>
          o.includes('[marketData]') && (o.includes('financial') || o.includes('financialReport'))
        );
        const hasHistoryData = toolObservations.some(o =>
          o.includes('[marketData]') && o.includes('history')
        );
        const hasRealtimeData = toolObservations.some(o =>
          o.includes('[marketData]') && o.includes('realtime')
        );
        const hasSuccessfulToolData = toolObservations.some(o =>
          !o.includes('Error') && !o.includes('未查询到') && !o.includes('fetch error')
        );

        // 场景1: 已获取财报数据，不需要再调hybridSearch补充
        if (hasFinancialData && iterations >= 1) {
          observationContent += "\n\n[SYSTEM CRITICAL] You have already obtained financial report data from marketData. This data is SUFFICIENT to answer the user's question. Do NOT call hybridSearch or any other tools. Output your final answer NOW based on the financial data you have.";
        }
        // 场景2: 已获取历史数据+计算工具结果，不需要再调其他工具
        else if (hasHistoryData && hasSuccessfulToolData && iterations >= 1) {
          observationContent += "\n\n[SYSTEM CRITICAL] You have already obtained stock history data and calculation results. This data is SUFFICIENT. Do NOT call any more tools. Output your final answer NOW.";
        }
        // 场景3: 已获取实时行情数据
        else if (hasRealtimeData && hasSuccessfulToolData && iterations >= 1) {
          observationContent += "\n\n[SYSTEM CRITICAL] You have already obtained realtime stock data. Output your final answer NOW.";
        }
        // 场景4: 通用 - 已有多轮工具结果
        else if (toolObservations.length >= 2 && hasSuccessfulToolData && iterations >= 2) {
          observationContent += "\n\n[SYSTEM CRITICAL] You have already obtained sufficient data from tool calls. You MUST output your final answer NOW. Do NOT call any more tools.";
        }

        messages.push({ role: "user", content: observationContent });
      }

      const roundMs = Date.now() - roundStartTime;
      const toolNames = toolCallsList.map((tc) => tc.name).join("+");
      console.log("[simpleAgent] Round " + (i + 1) + " total: " + (roundMs / 1000).toFixed(2) + "s (LLM=" + (llmMs / 1000).toFixed(2) + "s, tools=" + toolNames + "=" + (totalToolMs / 1000).toFixed(2) + "s), total: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s");

      saveCheckpoint(convId, i + 1, regularCalls.map((tc, idx) => ({
        name: tc.name,
        resultPreview: observationParts[idx]?.substring(0, 200) || "",
      })), `Round ${i + 1}: called ${toolNames}`).catch(() => {});
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[simpleAgent] Iteration error: " + errorMsg);

      const isNonRetryable = errorMsg.includes("不可重试") || errorMsg.includes("认证失败") || errorMsg.includes("401") || errorMsg.includes("403");
      if (isNonRetryable || i >= maxIterations - 1) {
        pushStep({
          type: "answer",
          round: i + 1,
          title: "Agent Error",
          content: "Agent execution error: " + errorMsg,
          timestamp: Date.now(),
        });

        await addMessage(convId, "assistant", "Agent execution error: " + errorMsg);

        const latencyMs = Date.now() - startTime;
        saveAgentLog({
          userId,
          conversationId: convId,
          query,
          answer: "Agent execution error: " + errorMsg,
          model: currentModel,
          iterations: i + 1,
          steps,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          latencyMs,
          status: "error",
          errorMessage: errorMsg,
        }).catch((e) => console.error("[simpleAgent] 保存日志失败:", e));
        if (needGenerateTitle) await generateConversationTitle(query, "Execution error: " + errorMsg, convId, model);
        return { answer: "Agent execution error: " + errorMsg, iterations, conversationId: convId, steps, citations, coarseResults: lastCoarseResults };
      }

      pushStep({
        type: "tool_call",
        round: i + 1,
        title: "Round " + (i + 1) + " - Error Recovery",
        content: "Error occurred, feeding back to LLM: " + errorMsg.substring(0, 200),
        timestamp: Date.now(),
      });

      const checkpointData = await recordError(convId, errorMsg);
      let recoveryContext = `Observation: Tool execution error - ${errorMsg}\n\n请根据此错误信息决定下一步：可以尝试其他工具、修改参数重试，或者直接基于已有信息回答用户问题。`;
      if (checkpointData && canRetry(checkpointData)) {
        recoveryContext = buildRecoveryContext(checkpointData) + "\n\n" + recoveryContext;
        console.log("[simpleAgent] Checkpoint recovery context injected, retry " + checkpointData.retryCount + "/" + 2);
      }

      messages.push({
        role: "user",
        content: recoveryContext,
      });
      console.log("[simpleAgent] Error recovery: feeding error to LLM, continuing iteration");
    }
  }

  pushStep({
    type: "answer",
    round: iterations,
    title: "Max Iterations Reached",
    content: "Agent reached max iterations without conclusion.",
    timestamp: Date.now(),
  });

  await addMessage(convId, "assistant", "Agent 超过最大迭代次数，未能得出结论。");
  if (needGenerateTitle) await generateConversationTitle(query, "超过最大迭代次数", convId, model);
  return { answer: "Agent 超过最大迭代次数，未能得出结论。", iterations, conversationId: convId, steps, citations, coarseResults: lastCoarseResults };
}
