const nodejieba = require("nodejieba");
const fs = require("fs");

const inputPath = process.argv[2];
const outputPath = process.argv[3];

try {
  const inputData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const texts = inputData.texts;

  const results = texts.map((text) => {
    const tokens = nodejieba.cut(text);
    return tokens.filter((token) => token.trim().length > 0);
  });

  fs.writeFileSync(outputPath, JSON.stringify({ success: true, results }), "utf-8");
  process.exit(0);
} catch (error) {
  try {
    fs.writeFileSync(outputPath, JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), "utf-8");
  } catch (writeErr) {
    console.error("Failed to write error output:", writeErr);
  }
  process.exit(1);
}
