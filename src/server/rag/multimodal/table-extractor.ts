import { parsePDFWithImages } from "./pdf-parser";

export interface TableResult {
  pageNum: number;
  html: string;
  markdown: string;
  rows: string[][];
}

function rowsToMarkdown(rows: string[][]): string {
  if (rows.length === 0) return "";

  const header = rows[0];
  const separator = header.map(() => "---");
  const lines: string[] = [];

  lines.push("| " + header.join(" | ") + " |");
  lines.push("| " + separator.join(" | ") + " |");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    while (row.length < header.length) {
      row.push("");
    }
    lines.push("| " + row.slice(0, header.length).join(" | ") + " |");
  }

  return lines.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowsToHtml(rows: string[][]): string {
  if (rows.length === 0) return "";

  const lines: string[] = [];
  lines.push("<table>");
  lines.push("  <thead>");
  lines.push("    <tr>");

  const header = rows[0];
  for (const cell of header) {
    lines.push(`      <th>${escapeHtml(cell)}</th>`);
  }
  lines.push("    </tr>");
  lines.push("  </thead>");

  if (rows.length > 1) {
    lines.push("  <tbody>");
    for (let i = 1; i < rows.length; i++) {
      lines.push("    <tr>");
      const row = rows[i];
      const maxCols = header.length;
      for (let j = 0; j < maxCols; j++) {
        const cell = j < row.length ? row[j] : "";
        lines.push(`      <td>${escapeHtml(cell)}</td>`);
      }
      lines.push("    </tr>");
    }
    lines.push("  </tbody>");
  }

  lines.push("</table>");
  return lines.join("\n");
}

export async function extractTablesFromPDF(
  buffer: Buffer
): Promise<TableResult[]> {
  console.log(`[table-extractor] 开始从 PDF 提取表格, buffer 大小: ${buffer.length} 字节`);

  try {
    const parseResult = await parsePDFWithImages(buffer);

    console.log(
      `[table-extractor] PDF 解析完成, 检测到 ${parseResult.tables.length} 个表格`
    );

    const results: TableResult[] = [];

    for (const table of parseResult.tables) {
      const markdown = rowsToMarkdown(table.rows);
      const html = rowsToHtml(table.rows);

      console.log(
        `[table-extractor] 第 ${table.pageNum} 页表格: ${table.rows.length} 行 x ${table.rows[0]?.length ?? 0} 列`
      );

      results.push({
        pageNum: table.pageNum,
        html,
        markdown,
        rows: table.rows,
      });
    }

    console.log(`[table-extractor] 表格提取完成, 共 ${results.length} 个表格`);
    return results;
  } catch (error) {
    console.error("[table-extractor] 表格提取失败:", error);
    throw error;
  }
}

export { rowsToMarkdown, rowsToHtml };
