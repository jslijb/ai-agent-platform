const fs = require("fs");

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  const fileName = process.argv[4];

  try {
    const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");
    const fileBuffer = fs.readFileSync(inputPath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) }).promise;
    let fullText = "";
    const pageTexts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(" ");
      // 插入页码标记，用于后续chunking时提取页码信息
      fullText += `\n[PAGE_${i}]\n` + pageText + "\n";
      pageTexts.push({ page: i, text: pageText });
    }
    const result = JSON.stringify({
      success: true,
      text: fullText,
      pages: doc.numPages,
      pageTexts: pageTexts,
    });
    fs.writeFileSync(outputPath, result, "utf-8");
  } catch (error) {
    const result = JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    fs.writeFileSync(outputPath, result, "utf-8");
  }
}

main();
