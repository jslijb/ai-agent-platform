export type EntityType =
  | "Company"
  | "Indicator"
  | "Amount"
  | "Product"
  | "Location"
  | "Regulation"
  | "Article"
  | "Authority"
  | "Entity";

const AMOUNT_PATTERN = /^[\-−]?[0-9,]*[.][0-9]+%?(元|万元|亿元|万亿)?$/;
const AMOUNT_INT_PATTERN = /^[\-−]?[0-9,]+(元|万元|亿元|万亿)$/;

const INDICATOR_KEYWORDS: Set<string> = new Set([
  "营业收入", "营收", "主营收入", "总收入", "营业总收入", "主营业务收入",
  "营业成本", "主营成本", "营业总成本",
  "营业利润", "利润总额", "净利润", "净利", "归母净利润", "归母净利",
  "归属于母公司股东的净利润", "归属于母公司净利润", "归属母公司净利润",
  "每股收益", "基本每股收益", "EPS", "每股盈利",
  "每股净资产", "BPS", "每股权益",
  "毛利率", "销售毛利率", "毛利",
  "净利率", "销售净利率", "净利润率",
  "研发费用", "研发投入", "研发支出",
  "ROE", "净资产收益率", "总资产收益率", "ROA",
  "资产负债率", "流动比率", "速动比率",
  "总资产", "净资产", "所有者权益",
  "经营活动产生的现金流量净额", "投资活动产生的现金流量净额", "筹资活动产生的现金流量净额",
  "管理费用", "销售费用", "财务费用",
  "同比", "环比", "同比增长", "同比下降",
  "股息率", "市盈率", "市净率", "PE", "PB",
]);

const PRODUCT_KEYWORDS: Set<string> = new Set([
  "第八代五粮液", "五粮液", "TOSOT", "格力空调",
]);

const LOCATION_KEYWORDS: Set<string> = new Set([
  "宜宾", "珠海", "深圳", "北京", "上海", "广州", "成都", "杭州",
  "四川省", "广东省", "浙江省", "江苏省", "湖北省", "湖南省",
  "中国", "全国", "东部片区", "南部片区", "西部片区", "北部片区", "中部片区",
]);

interface CompanyAlias {
  shortName: string;
  fullName: string;
  aliases: string[];
}

let companyAliasMap: Map<string, string> = new Map();

export function loadCompanyAliases(companies: CompanyAlias[]): void {
  companyAliasMap.clear();
  for (const company of companies) {
    for (const alias of company.aliases) {
      companyAliasMap.set(alias, company.shortName);
    }
    if (!company.aliases.includes(company.shortName)) {
      companyAliasMap.set(company.shortName, company.shortName);
    }
    if (company.fullName && !company.aliases.includes(company.fullName)) {
      companyAliasMap.set(company.fullName, company.shortName);
    }
  }
  console.log(`[entity-classifier] 加载公司别名: ${companyAliasMap.size} 条`);
}

export function isAmount(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (AMOUNT_PATTERN.test(trimmed)) return true;
  if (AMOUNT_INT_PATTERN.test(trimmed)) return true;
  if (/^[\-−]?[0-9,]*[.][0-9]+%$/.test(trimmed)) return true;
  if (/^[\-−]?[0-9,]*[.][0-9]*元$/.test(trimmed)) return true;
  if (/^[\-−]?[0-9,]+$/.test(trimmed)) return true;
  return false;
}

export function isIndicator(text: string): boolean {
  return INDICATOR_KEYWORDS.has(text.trim());
}

const COMPANY_SUFFIXES = [
  "股份有限公司", "有限责任公司", "集团有限公司", "集团股份有限公司",
  "有限公司", "集团公司", "集团", "公司",
];

function isCompany(text: string): boolean {
  const trimmed = text.trim();
  if (companyAliasMap.has(trimmed)) return true;
  for (const suffix of COMPANY_SUFFIXES) {
    if (trimmed.endsWith(suffix) && trimmed.length > suffix.length) return true;
  }
  return false;
}

function isProduct(text: string): boolean {
  if (PRODUCT_KEYWORDS.has(text.trim())) return true;
  return false;
}

function isLocation(text: string): boolean {
  return LOCATION_KEYWORDS.has(text.trim());
}

export function classifyEntity(text: string): EntityType {
  const trimmed = text.trim();

  if (isAmount(trimmed)) return "Amount";
  if (isRegulation(trimmed)) return "Regulation";
  if (isArticle(trimmed)) return "Article";
  if (isAuthority(trimmed)) return "Authority";
  if (isCompany(trimmed)) return "Company";
  if (isIndicator(trimmed)) return "Indicator";
  if (isProduct(trimmed)) return "Product";
  if (isLocation(trimmed)) return "Location";

  return "Entity";
}

// ===== R034 法规类实体识别 =====

/** 法规标题特征：以法规性后缀结尾（办法/规定/条例/指引/细则/规则/意见/法/大全/汇编） */
const REGULATION_SUFFIX_RE =
  /(办法|条例|规定|指引|细则|规则|指导意见|实施意见|管理办法|暂行办法|实施细则|证券法|基金法|期货法|大全|汇编)$/;

/** 条款引用特征：「第X条」「第X章」 */
const ARTICLE_RE = /^第[一二三四五六七八九十百零\d]+条$/;

/** 监管机构特征 */
const AUTHORITY_KEYWORDS = [
  "中国证监会", "证监会", "证券监督管理机构", "中国证券业协会", "证券业协会",
  "中国人民银行", "国务院", "期货交易所", "证券交易所", "中国期货业协会",
];

export function isRegulation(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > 60) return false;
  return REGULATION_SUFFIX_RE.test(t);
}

export function isArticle(text: string): boolean {
  return ARTICLE_RE.test(text.trim());
}

export function isAuthority(text: string): boolean {
  const t = text.trim();
  return AUTHORITY_KEYWORDS.some((k) => t === k || t.includes(k)) && t.length <= 30;
}

export function normalizeEntity(text: string): string {
  const trimmed = text.trim();
  const canonical = companyAliasMap.get(trimmed);
  if (canonical) return canonical;
  return trimmed;
}

export function getCompanyAliasMap(): Map<string, string> {
  return companyAliasMap;
}