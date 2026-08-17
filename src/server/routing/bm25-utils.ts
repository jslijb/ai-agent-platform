const STOP_WORDS = new Set([
  "的", "了", "吗", "呢", "啊", "是", "在", "有", "和", "与",
  "多少", "是什么", "是多少", "请问", "一下", "什么", "如何",
  "怎么", "怎样", "哪", "哪些", "这个", "那个",
]);

export function tokenize(text: string): string[] {
  return text
    .replace(/[，。！？、；：""''（）【】《》\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

export function extractHeaderText(tableData: unknown): string {
  if (!tableData || typeof tableData !== "object") return "";
  const data = tableData as Record<string, unknown>;
  if (Array.isArray(data.headers)) {
    return (data.headers as string[]).join(" ");
  }
  if (Array.isArray(data.rows) && data.rows.length > 0) {
    const firstRow = data.rows[0];
    if (Array.isArray(firstRow)) {
      return firstRow.slice(0, 5).join(" ");
    }
  }
  if (typeof data === "object" && "header" in data) {
    return String(data.header);
  }
  return "";
}

export function computeBM25Score(
  queryTokens: string[],
  tableName: string,
  headerText: string,
  avgDL: number,
  docCount: number,
  dfMap: Map<string, number>,
  k1 = 1.2,
  b = 0.75,
): number {
  const docText = `${tableName} ${headerText}`;
  const docTokens = tokenize(docText);
  const dl = docTokens.length;

  let score = 0;
  for (const qt of queryTokens) {
    const tf = docTokens.filter((dt) => dt.includes(qt) || qt.includes(dt)).length;
    const df = dfMap.get(qt) || 1;
    const idf = Math.log((docCount - df + 0.5) / (df + 0.5) + 1);
    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * dl) / avgDL));
    score += idf * tfNorm;
  }
  return score;
}