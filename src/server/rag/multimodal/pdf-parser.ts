import pdf from "pdf-parse";

export interface PDFParseResult {
  text: string;
  images: Buffer[];
  tables: Array<{
    pageNum: number;
    content: string;
    rows: string[][];
  }>;
  pageCount: number;
  pageTexts: string[];
}

interface PDFPageInfo {
  text: string;
  pageNum: number;
}

function isTableRow(line: string): boolean {
  const pipeCount = (line.match(/\|/g) || []).length;
  const tabCount = (line.match(/\t/g) || []).length;
  const hasMultipleSpaces = /\S+\s{2,}\S+\s{2,}/.test(line);
  return pipeCount >= 2 || tabCount >= 2 || hasMultipleSpaces;
}

function extractTableRows(lines: string[]): string[][] {
  const rows: string[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.includes("|")) {
      const cells = trimmed
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0 && !/^[-:]+$/.test(c));
      if (cells.length >= 2) {
        rows.push(cells);
      }
    } else if (trimmed.includes("\t")) {
      const cells = trimmed
        .split("\t")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length >= 2) {
        rows.push(cells);
      }
    } else if (/\S+\s{2,}/.test(trimmed)) {
      const cells = trimmed
        .split(/\s{2,}/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length >= 2) {
        rows.push(cells);
      }
    }
  }

  return rows;
}

function detectTablesFromPageText(
  pageText: string,
  pageNum: number
): Array<{ pageNum: number; content: string; rows: string[][] }> {
  const tables: Array<{ pageNum: number; content: string; rows: string[][] }> = [];
  const lines = pageText.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (isTableRow(lines[i])) {
      const tableLines: string[] = [];
      while (i < lines.length && (isTableRow(lines[i]) || lines[i].trim() === "")) {
        if (lines[i].trim() !== "") {
          tableLines.push(lines[i]);
        }
        i++;
      }

      if (tableLines.length >= 2) {
        const rows = extractTableRows(tableLines);
        if (rows.length >= 2) {
          const content = tableLines.join("\n");
          console.log(
            `[pdf-parser] 在第 ${pageNum} 页检测到表格, ${rows.length} 行, ${rows[0].length} 列`
          );
          tables.push({ pageNum, content, rows });
        }
      }
    } else {
      i++;
    }
  }

  return tables;
}

export async function parsePDFWithImages(
  buffer: Buffer
): Promise<PDFParseResult> {
  console.log(`[pdf-parser] 开始解析 PDF, buffer 大小: ${buffer.length} 字节`);

  try {
    const data = await pdf(buffer, {
      pagerender: function (pageData: any) {
        return pageData.getTextContent().then(function (textContent: any) {
          let lastY: number | null = null;
          let text = "";
          for (const item of textContent.items) {
            if (lastY !== item.transform[5] && lastY !== null) {
              text += "\n";
            }
            text += item.str;
            lastY = item.transform[5];
          }
          return text;
        });
      },
    });

    console.log(
      `[pdf-parser] PDF 解析完成, 页数: ${data.numpages}, 文本长度: ${data.text.length}`
    );

    const pageTexts = data.text.split(/\f/).filter((p: string) => p.trim().length > 0);
    console.log(`[pdf-parser] 分页文本数量: ${pageTexts.length}`);

    const allTables: Array<{ pageNum: number; content: string; rows: string[][] }> = [];
    for (let p = 0; p < pageTexts.length; p++) {
      const tables = detectTablesFromPageText(pageTexts[p], p + 1);
      allTables.push(...tables);
    }

    console.log(`[pdf-parser] 共检测到 ${allTables.length} 个表格`);

    const images: Buffer[] = [];

    console.log(
      `[pdf-parser] 解析结果: 文本长度 ${data.text.length}, 图片 ${images.length}, 表格 ${allTables.length}`
    );

    return {
      text: data.text,
      images,
      tables: allTables,
      pageCount: data.numpages,
      pageTexts,
    };
  } catch (error) {
    console.error("[pdf-parser] PDF 解析失败:", error);
    throw error;
  }
}
