import { eq, and, ilike } from "drizzle-orm";
import { financialRawTables } from "../db/schema";
import { db } from "../db";
import { tokenize, extractHeaderText, computeBM25Score } from "./bm25-utils";

export interface TableMatchResult {
  id: number;
  stockCode: string;
  reportYear: number;
  reportQuarter: string | null;
  tableName: string;
  tableData: unknown;
  pageNum: number | null;
  score: number;
  matchMethod: "exact" | "ilike" | "bm25" | "semantic";
}

export interface TableSearchOptions {
  stockCode: string;
  reportYear: number;
  keyword: string;
  topK?: number;
  reportQuarter?: string;
}

export async function searchRawTables(
  options: TableSearchOptions,
): Promise<TableMatchResult[]> {
  const { stockCode, reportYear, keyword, topK = 10, reportQuarter } = options;
  const results: TableMatchResult[] = [];

  const conditions = [
    eq(financialRawTables.stockCode, stockCode),
    eq(financialRawTables.reportYear, reportYear),
  ];
  if (reportQuarter) {
    conditions.push(eq(financialRawTables.reportQuarter, reportQuarter));
  }

  const allTables = await db
    .select({
      id: financialRawTables.id,
      stockCode: financialRawTables.stockCode,
      reportYear: financialRawTables.reportYear,
      reportQuarter: financialRawTables.reportQuarter,
      tableName: financialRawTables.tableName,
      tableData: financialRawTables.tableData,
      pageNum: financialRawTables.pageNum,
    })
    .from(financialRawTables)
    .where(and(...conditions))
    .limit(200);

  if (allTables.length === 0) return [];

  const queryTokens = tokenize(keyword);
  if (queryTokens.length === 0) return [];

  const dfMap = new Map<string, number>();
  for (const qt of queryTokens) {
    let df = 0;
    for (const t of allTables) {
      const docText = `${t.tableName} ${extractHeaderText(t.tableData)}`;
      const docTokens = tokenize(docText);
      if (docTokens.some((dt) => dt.includes(qt) || qt.includes(dt))) {
        df++;
      }
    }
    dfMap.set(qt, df);
  }

  const avgDL =
    allTables.reduce((sum, t) => {
      const docText = `${t.tableName} ${extractHeaderText(t.tableData)}`;
      return sum + tokenize(docText).length;
    }, 0) / allTables.length;

  for (const t of allTables) {
    const exactMatch = t.tableName === keyword;
    const ilikeMatch = t.tableName.toLowerCase().includes(keyword.toLowerCase());

    let score = 0;
    let matchMethod: TableMatchResult["matchMethod"] = "bm25";

    if (exactMatch) {
      score = 1.0;
      matchMethod = "exact";
    } else if (ilikeMatch) {
      score = 0.8;
      matchMethod = "ilike";
    } else {
      score = computeBM25Score(queryTokens, t.tableName, extractHeaderText(t.tableData), avgDL, allTables.length, dfMap);
      matchMethod = "bm25";
      score = Math.min(score / 5, 0.7);
    }

    if (score > 0.1) {
      results.push({
        id: t.id,
        stockCode: t.stockCode,
        reportYear: t.reportYear,
        reportQuarter: t.reportQuarter,
        tableName: t.tableName,
        tableData: t.tableData,
        pageNum: t.pageNum,
        score,
        matchMethod,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

export async function queryRawTablesEnhanced(
  stockCode: string,
  reportYear: number,
  keyword: string,
  topK = 10,
): Promise<Record<string, unknown>[]> {
  const matches = await searchRawTables({
    stockCode,
    reportYear,
    keyword,
    topK,
  });

  return matches.map((m) => ({
    id: m.id,
    stock_code: m.stockCode,
    report_year: m.reportYear,
    report_quarter: m.reportQuarter,
    table_name: m.tableName,
    table_data: m.tableData,
    page_num: m.pageNum,
    _match_score: m.score,
    _match_method: m.matchMethod,
  }));
}

export { tokenize, extractHeaderText, computeBM25Score } from "./bm25-utils";