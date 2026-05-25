interface PDFParseResult {
  success: boolean;
  text?: string;
  pageCount?: number;
  metadata?: Record<string, string>;
  error?: string;
}

interface FinancialMetrics {
  revenue?: number;
  netProfit?: number;
  roe?: number;
  debtRatio?: number;
  grossMargin?: number;
  netMargin?: number;
  eps?: number;
  bvps?: number;
  operatingCashFlow?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  extractedFields: string[];
  rawMatches: Record<string, string>;
}

interface ResearchReportParams {
  title: string;
  stockCode: string;
  data: Record<string, unknown>;
}

interface SummarizeResult {
  summary: string;
  originalLength: number;
  summaryLength: number;
  compressionRatio: number;
}

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:8001";

/**
 * 解析PDF文件
 * 通过调用 Python 数据服务（PaddleOCR / pdfplumber）进行 PDF 解析
 * @param filePath - PDF文件路径
 * @returns PDF解析结果，包含提取的文本和元数据
 */
export async function parsePDF(filePath: string): Promise<PDFParseResult> {
  console.log(`[document_analysis] 解析PDF: ${filePath}`);

  try {
    const url = `${DATA_SERVICE_URL}/api/document/parse-pdf`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[document_analysis] PDF解析HTTP错误: ${response.status} - ${errorText}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    console.log(`[document_analysis] PDF解析成功: ${filePath}, 页数=${data.pageCount || "未知"}`);
    return {
      success: true,
      text: data.text,
      pageCount: data.pageCount,
      metadata: data.metadata,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[document_analysis] PDF解析异常: ${message}`);
    return { success: false, error: message };
  }
}

const financialPatterns: [RegExp, string, (v: string) => number][] = [
  [/营业收入[：:\s]*([0-9,.]+)\s*亿?万?元?/, "revenue", (v) => parseFinancialNumber(v)],
  [/营收[：:\s]*([0-9,.]+)\s*亿?万?元?/, "revenue", (v) => parseFinancialNumber(v)],
  [/净利润[：:\s]*([0-9,.]+)\s*亿?万?元?/, "netProfit", (v) => parseFinancialNumber(v)],
  [/归母净利润[：:\s]*([0-9,.]+)\s*亿?万?元?/, "netProfit", (v) => parseFinancialNumber(v)],
  [/净资产收益率[（(]ROE[)）]?[：:\s]*([0-9.]+)\s*%?/, "roe", (v) => parseFloat(v)],
  [/ROE[：:\s]*([0-9.]+)\s*%?/, "roe", (v) => parseFloat(v)],
  [/资产负债率[：:\s]*([0-9.]+)\s*%?/, "debtRatio", (v) => parseFloat(v)],
  [/毛利率[：:\s]*([0-9.]+)\s*%?/, "grossMargin", (v) => parseFloat(v)],
  [/净利率[：:\s]*([0-9.]+)\s*%?/, "netMargin", (v) => parseFloat(v)],
  [/每股收益[（(]EPS[)）]?[：:\s]*([0-9.]+)\s*元?/, "eps", (v) => parseFloat(v)],
  [/基本每股收益[：:\s]*([0-9.]+)\s*元?/, "eps", (v) => parseFloat(v)],
  [/每股净资产[：:\s]*([0-9.]+)\s*元?/, "bvps", (v) => parseFloat(v)],
  [/经营活动现金流[：:\s]*([0-9,.]+)\s*亿?万?元?/, "operatingCashFlow", (v) => parseFinancialNumber(v)],
  [/总资产[：:\s]*([0-9,.]+)\s*亿?万?元?/, "totalAssets", (v) => parseFinancialNumber(v)],
  [/总负债[：:\s]*([0-9,.]+)\s*亿?万?元?/, "totalLiabilities", (v) => parseFinancialNumber(v)],
];

function parseFinancialNumber(value: string): number {
  const cleaned = value.replace(/,/g, "");
  return parseFloat(cleaned);
}

/**
 * 从文本中提取财务数据
 * 使用正则表达式匹配关键财务指标，包括营收、净利润、ROE、负债率等
 * @param text - 输入文本
 * @returns 提取的财务指标
 */
export function extractFinancialData(text: string): FinancialMetrics {
  console.log(`[document_analysis] 提取财务数据, 文本长度=${text.length}`);

  const result: FinancialMetrics = {
    extractedFields: [],
    rawMatches: {},
  };

  for (const [pattern, field, converter] of financialPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const rawValue = match[1];
      const convertedValue = converter(rawValue);

      if (!isNaN(convertedValue)) {
        (result as Record<string, unknown>)[field] = convertedValue;
        result.extractedFields.push(field);
        result.rawMatches[field] = rawValue;
      }
    }
  }

  console.log(`[document_analysis] 财务数据提取完成: 提取字段数=${result.extractedFields.length}, 字段=${result.extractedFields.join(", ")}`);
  return result;
}

/**
 * 生成研究报告框架
 * 返回 Markdown 格式的研报模板，包含行业分析、财务分析、估值分析等章节
 * @param params - 研报参数
 * @param params.title - 研报标题
 * @param params.stockCode - 股票代码
 * @param params.data - 研报数据
 * @returns Markdown格式的研报框架
 */
export function generateResearchReport(params: ResearchReportParams): string {
  console.log(`[document_analysis] 生成研报框架: ${params.title}, 股票=${params.stockCode}`);

  const now = new Date().toISOString().split("T")[0];
  const data = params.data || {};

  const report = `# ${params.title}

## 研究报告

**股票代码**: ${params.stockCode}
**报告日期**: ${now}

---

## 一、公司概况

### 1.1 公司简介
> [请填写公司基本信息]

### 1.2 主营业务
> [请填写主营业务描述]

### 1.3 股权结构
> [请填写股权结构信息]

---

## 二、行业分析

### 2.1 行业概况
> [请填写行业整体情况]

### 2.2 行业竞争格局
> [请填写行业竞争格局分析]

### 2.3 行业发展趋势
> [请填写行业发展趋势判断]

---

## 三、财务分析

### 3.1 营收分析
- 营业收入: ${data.revenue ?? "[待填充]"}
- 营收增速: [待填充]

### 3.2 盈利能力分析
- 净利润: ${data.netProfit ?? "[待填充]"}
- 毛利率: ${data.grossMargin ?? "[待填充]"}%
- 净利率: ${data.netMargin ?? "[待填充]"}%
- ROE: ${data.roe ?? "[待填充]"}%

### 3.3 偿债能力分析
- 资产负债率: ${data.debtRatio ?? "[待填充]"}%
- 总资产: ${data.totalAssets ?? "[待填充]"}
- 总负债: ${data.totalLiabilities ?? "[待填充]"}

### 3.4 现金流分析
- 经营活动现金流: ${data.operatingCashFlow ?? "[待填充]"}

### 3.5 每股指标
- 每股收益(EPS): ${data.eps ?? "[待填充]"}
- 每股净资产: ${data.bvps ?? "[待填充]"}

---

## 四、估值分析

### 4.1 相对估值
- PE(TTM): [待填充]
- PB: [待填充]
- PS: [待填充]

### 4.2 绝对估值
- DCF估值: [待填充]
- 合理价格区间: [待填充]

---

## 五、风险提示

1. [请填写主要风险因素1]
2. [请填写主要风险因素2]
3. [请填写主要风险因素3]

---

## 六、投资建议

### 6.1 核心观点
> [请填写核心投资观点]

### 6.2 评级
- 投资评级: [买入/增持/中性/减持/卖出]
- 目标价格: [待填充]

---

*免责声明：本报告仅供参考，不构成投资建议。投资者据此操作，风险自担。*

*报告生成时间: ${new Date().toISOString()}*
`;

  console.log(`[document_analysis] 研报框架生成完成, 长度=${report.length}`);
  return report;
}

/**
 * 文本摘要（基于句子权重的抽取式摘要）
 * 根据句子中关键词频率和位置权重，选取最重要的句子组成摘要
 * @param text - 输入文本
 * @param maxLength - 摘要最大长度（字符数）
 * @returns 摘要结果
 */
export function summarizeDocument(text: string, maxLength: number): SummarizeResult {
  console.log(`[document_analysis] 文本摘要: 原文长度=${text.length}, 最大摘要长度=${maxLength}`);

  if (text.length <= maxLength) {
    return {
      summary: text,
      originalLength: text.length,
      summaryLength: text.length,
      compressionRatio: 1,
    };
  }

  const sentences = text
    .replace(/\n+/g, "。")
    .split(/[。！？；]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  if (sentences.length === 0) {
    return {
      summary: text.substring(0, maxLength),
      originalLength: text.length,
      summaryLength: maxLength,
      compressionRatio: Number((maxLength / text.length).toFixed(4)),
    };
  }

  const wordFreq: Record<string, number> = {};
  const allWords = text.split(/\s+/).filter((w) => w.length > 1);
  for (const word of allWords) {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  }

  const maxFreq = Math.max(...Object.values(wordFreq), 1);
  for (const word of Object.keys(wordFreq)) {
    wordFreq[word] /= maxFreq;
  }

  const scoredSentences = sentences.map((sentence, index) => {
    const words = sentence.split(/\s+/).filter((w) => w.length > 1);
    let score = 0;
    for (const word of words) {
      score += wordFreq[word] || 0;
    }
    score /= Math.max(words.length, 1);

    if (index === 0) score *= 1.5;
    if (index === sentences.length - 1) score *= 1.2;
    if (index < 3) score *= 1.1;

    if (sentence.includes("关键") || sentence.includes("核心") || sentence.includes("重要") || sentence.includes("显著")) {
      score *= 1.3;
    }

    return { sentence, score, index };
  });

  scoredSentences.sort((a, b) => b.score - a.score);

  const selectedSentences: { sentence: string; index: number }[] = [];
  let currentLength = 0;

  for (const item of scoredSentences) {
    if (currentLength + item.sentence.length + 1 > maxLength) break;
    selectedSentences.push({ sentence: item.sentence, index: item.index });
    currentLength += item.sentence.length + 1;
  }

  selectedSentences.sort((a, b) => a.index - b.index);

  const summary = selectedSentences.map((s) => s.sentence).join("。") + "。";
  const compressionRatio = Number((summary.length / text.length).toFixed(4));

  console.log(`[document_analysis] 摘要完成: 原文=${text.length}字, 摘要=${summary.length}字, 压缩比=${compressionRatio}`);

  return {
    summary,
    originalLength: text.length,
    summaryLength: summary.length,
    compressionRatio,
  };
}

export type {
  PDFParseResult,
  FinancialMetrics,
  ResearchReportParams,
  SummarizeResult,
};
