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
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    const result = JSON.stringify({ success: true, text: fullText, pages: doc.numPages });
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
