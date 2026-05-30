const FINANCIAL_SYNONYMS: Record<string, string[]> = {
  "增长": ["增长", "增加", "上升", "提升", "上涨", "下降", "减少", "下滑", "变动", "变化", "同比"],
  "下降": ["下降", "减少", "下滑", "下跌", "降低", "增长", "增加", "变动", "变化", "同比"],
  "营业收入": ["营业收入", "营收", "主营业务收入", "营业总收入", "收入"],
  "净利润": ["净利润", "归母净利润", "归属于上市公司股东的净利润", "利润", "收益"],
  "毛利率": ["毛利率", "毛利", "毛利率"],
  "现金流": ["现金流", "经营现金流", "经营活动产生的现金流量", "现金流量净额"],
  "研发": ["研发", "研发投入", "研发费用", "技术开发", "创新投入"],
  "注册地址": ["注册地址", "住所", "办公地址", "总部"],
  "亿": ["亿", "亿元", "万元", "元"],
  "占比": ["占比", "比例", "比重", "份额", "百分比"],
  "前五": ["前五", "前五大", "主要", "重要", "头部"],
};

function expandQueryWithSynonyms(query: string): string {
  const expandedTerms: string[] = [];

  for (const [key, synonyms] of Object.entries(FINANCIAL_SYNONYMS)) {
    if (query.includes(key)) {
      for (const syn of synonyms) {
        if (!query.includes(syn)) {
          expandedTerms.push(syn);
        }
      }
    }
  }

  if (expandedTerms.length === 0) {
    return query;
  }

  const expanded = query + " " + expandedTerms.join(" ");
  console.log(`[QueryExpander] 查询扩展: "${query}" → "${expanded}"`);
  return expanded;
}

export function expandQuery(query: string): string {
  return expandQueryWithSynonyms(query);
}
