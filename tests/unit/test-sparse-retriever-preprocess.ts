const results: Array<{ name: string; pass: boolean; detail: string }> = [];

function assert(condition: boolean, name: string, detail: string = ""): void {
  if (!condition) {
    console.error(`[FAIL] ${name}: ${detail}`);
    results.push({ name, pass: false, detail });
    return;
  }
  console.log(`[PASS] ${name}`);
  results.push({ name, pass: true, detail });
}

function preprocessForBM25(text: string): string {
  let result = text.replace(/(\d),(\d)/g, "$1$2");
  result = result.replace(/[，。、；：！？""''【】《》（）…—·\-.!,;:!?()[\]{}<>]/g, " ");
  result = result.toLowerCase();
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

function testChinesePunctuationRemoval() {
  console.log("\n=== 测试: 中文标点移除 ===");
  const input = "中国长城，立足国家战略需求。打造核心竞争力！聚焦计算产业？";
  const result = preprocessForBM25(input);
  assert(
    !result.includes("，"),
    "中文逗号已移除"
  );
  assert(
    !result.includes("。"),
    "中文句号已移除"
  );
  assert(
    !result.includes("！"),
    "中文感叹号已移除"
  );
  assert(
    !result.includes("？"),
    "中文问号已移除"
  );
  assert(
    result.includes("中国长城"),
    "正常文本保留"
  );
  assert(
    result.includes("核心竞争力"),
    "正常文本保留"
  );
}

function testEnglishPunctuationRemoval() {
  console.log("\n=== 测试: 英文标点移除 ===");
  const input = "Gree Electric, revenue growth! profit margin; market share.";
  const result = preprocessForBM25(input);
  assert(
    !result.includes(","),
    "英文逗号已移除"
  );
  assert(
    !result.includes("!"),
    "英文感叹号已移除"
  );
  assert(
    !result.includes(";"),
    "英文分号已移除"
  );
  assert(
    !result.includes("."),
    "英文句号已移除"
  );
}

function testLowerCase() {
  console.log("\n=== 测试: 英文转小写 ===");
  const input = "CHINA GREAT WALL Gree Electric WULIANGYE";
  const result = preprocessForBM25(input);
  assert(
    result.includes("china great wall"),
    "英文大写转小写"
  );
  assert(
    result.includes("gree electric"),
    "英文大写转小写"
  );
  assert(
    result.includes("wuliangye"),
    "英文大写转小写"
  );
}

function testNumberCommaRemoval() {
  console.log("\n=== 测试: 数字中的逗号移除 ===");
  const input = "营业收入825,600万元，利润302,300万元";
  const result = preprocessForBM25(input);
  assert(
    result.includes("825600"),
    "数字逗号已移除825600",
    `结果: ${result}`
  );
  assert(
    result.includes("302300"),
    "数字逗号已移除302300",
    `结果: ${result}`
  );
}

function testBracketRemoval() {
  console.log("\n=== 测试: 括号移除 ===");
  const input = "中国长城（000066）格力电器(000651)五粮液【000858】";
  const result = preprocessForBM25(input);
  assert(
    !result.includes("（"),
    "中文左括号已移除"
  );
  assert(
    !result.includes("）"),
    "中文右括号已移除"
  );
  assert(
    !result.includes("("),
    "英文左括号已移除"
  );
  assert(
    !result.includes(")"),
    "英文右括号已移除"
  );
  assert(
    !result.includes("【"),
    "中文方括号已移除"
  );
  assert(
    !result.includes("】"),
    "中文方括号已移除"
  );
  assert(
    result.includes("000066"),
    "括号内数字保留"
  );
  assert(
    result.includes("000651"),
    "括号内数字保留"
  );
}

function testWhitespaceNormalization() {
  console.log("\n=== 测试: 空白规范化 ===");
  const input = "中国长城   立足\t\t国家  战略需求";
  const result = preprocessForBM25(input);
  assert(
    !result.includes("  "),
    "连续空格已合并"
  );
  assert(
    !result.includes("\t"),
    "制表符已替换"
  );
  assert(
    !result.startsWith(" "),
    "无前导空格"
  );
  assert(
    !result.endsWith(" "),
    "无尾部空格"
  );
}

function testFinancialTextPreprocessing() {
  console.log("\n=== 测试: 金融文本完整预处理 ===");
  const input = "五粮液（000858）2025年实现营业收入825,600万元，同比增长12.5%！归属于上市公司股东的净利润302,300万元；同比增长15.8%。";
  const result = preprocessForBM25(input);
  assert(
    result.includes("五粮液"),
    "金融文本-公司名保留"
  );
  assert(
    result.includes("000858"),
    "金融文本-股票代码保留"
  );
  assert(
    result.includes("825600"),
    "金融文本-数字逗号移除"
  );
  assert(
    result.includes("12") && result.includes("5%"),
    "金融文本-百分比数字可检索(小数点作为标点移除)",
    `结果: ${result}`
  );
  assert(
    !result.includes("，"),
    "金融文本-标点已移除"
  );
  assert(
    result === result.toLowerCase() || !/[A-Z]/.test(result),
    "金融文本-英文已转小写"
  );
}

function testEmptyString() {
  console.log("\n=== 测试: 空字符串 ===");
  const result = preprocessForBM25("");
  assert(
    result === "",
    "空字符串返回空字符串"
  );
}

function testPureChineseText() {
  console.log("\n=== 测试: 纯中文文本 ===");
  const input = "格力电器空调销量全球第一";
  const result = preprocessForBM25(input);
  assert(
    result === "格力电器空调销量全球第一",
    "纯中文文本不变",
    `结果: ${result}`
  );
}

console.log("========================================");
console.log("Sparse Retriever BM25 预处理测试");
console.log("========================================");

testChinesePunctuationRemoval();
testEnglishPunctuationRemoval();
testLowerCase();
testNumberCommaRemoval();
testBracketRemoval();
testWhitespaceNormalization();
testFinancialTextPreprocessing();
testEmptyString();
testPureChineseText();

const total = results.length;
const passed = results.filter(r => r.pass).length;
const failed = total - passed;

console.log("\n========================================");
console.log(`测试结果: ${passed}/${total} PASSED, ${failed} FAILED`);
console.log("========================================");

for (const r of results) {
  const status = r.pass ? "PASS" : "FAIL";
  console.log(`  [${status}] ${r.name}${r.detail ? " - " + r.detail : ""}`);
}

if (failed > 0) {
  process.exit(1);
}
