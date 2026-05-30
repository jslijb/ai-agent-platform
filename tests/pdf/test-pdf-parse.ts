import fs from "fs";
import path from "path";

async function testPdfParse() {
  const filePath = path.resolve("data/financial_reports/2025_annual/000066_中国长城_2025年年度报告.pdf");
  const fileBuffer = fs.readFileSync(filePath);
  console.log(`文件大小: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) }).promise;
    console.log(`PDF 加载成功, 页数: ${doc.numPages}`);
    let fullText = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    console.log(`解析成功! 文本长度: ${fullText.length}`);
    console.log(`前500字符: ${fullText.substring(0, 500)}`);
  } catch (err) {
    console.error(`解析失败: ${err}`);
  }
}

testPdfParse();
