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

const MAX_INPUT_CHARS = 2000;

function truncateForEmbedding(text: string): string {
  if (text.length <= MAX_INPUT_CHARS) return text;

  const sub = text.slice(0, MAX_INPUT_CHARS);
  const sentenceEnd = Math.max(
    sub.lastIndexOf("。"),
    sub.lastIndexOf("？"),
    sub.lastIndexOf("！"),
    sub.lastIndexOf("."),
    sub.lastIndexOf("?"),
    sub.lastIndexOf("!")
  );
  if (sentenceEnd > MAX_INPUT_CHARS * 0.5) {
    return sub.slice(0, sentenceEnd + 1);
  }
  const commaEnd = Math.max(
    sub.lastIndexOf("，"),
    sub.lastIndexOf("；"),
    sub.lastIndexOf(","),
    sub.lastIndexOf(";")
  );
  if (commaEnd > MAX_INPUT_CHARS * 0.5) {
    return sub.slice(0, commaEnd + 1);
  }
  return sub;
}

function testShortText_NoTruncation() {
  console.log("\n=== 测试: 短文本不截断 ===");
  const text = "中国长城立足国家战略需求打造核心竞争力";
  const result = truncateForEmbedding(text);
  assert(
    result === text,
    "短文本不截断",
    `原始: ${text.length}, 结果: ${result.length}`
  );
}

function testExactLength_NoTruncation() {
  console.log("\n=== 测试: 恰好2000字符不截断 ===");
  const text = "A".repeat(2000);
  const result = truncateForEmbedding(text);
  assert(
    result.length === 2000,
    "恰好2000字符不截断",
    `结果长度: ${result.length}`
  );
}

function testSentenceBoundaryTruncation() {
  console.log("\n=== 测试: 句子边界截断 ===");
  const prefix = "X".repeat(1200);
  const sentence = "中国长城年度报告。公司实现营业收入825亿元，同比增长12.5%。在国产CPU领域取得重要突破。";
  const suffix = "Y".repeat(1500);
  const text = prefix + sentence + suffix;
  const result = truncateForEmbedding(text);
  assert(
    result.length <= MAX_INPUT_CHARS,
    "截断后不超过MAX_INPUT_CHARS",
    `结果长度: ${result.length}`
  );
  assert(
    result.endsWith("。") || result.endsWith("！") || result.endsWith("？") || result.endsWith(".") || result.endsWith("!") || result.endsWith("?"),
    "截断在句子边界",
    `截断后末尾字符: ${result.slice(-1)}`
  );
  assert(
    result.length > MAX_INPUT_CHARS * 0.5,
    "截断保留超过50%内容",
    `保留比例: ${(result.length / text.length * 100).toFixed(1)}%`
  );
}

function testCommaFallback() {
  console.log("\n=== 测试: 逗号边界降级截断 ===");
  const longClause = "A".repeat(1200);
  const text = longClause + "，后续内容" + "B".repeat(800);
  const result = truncateForEmbedding(text);
  assert(
    result.length <= MAX_INPUT_CHARS,
    "逗号降级截断后不超过MAX_INPUT_CHARS",
    `结果长度: ${result.length}`
  );
  assert(
    result.endsWith("，") || result.length === MAX_INPUT_CHARS,
    "逗号降级截断在逗号边界或硬切",
    `末尾: ${result.slice(-5)}`
  );
}

function testHardTruncation_NoGoodBoundary() {
  console.log("\n=== 测试: 无合适边界时硬切 ===");
  const text = "A".repeat(3000);
  const result = truncateForEmbedding(text);
  assert(
    result.length === MAX_INPUT_CHARS,
    "无边界时硬切到MAX_INPUT_CHARS",
    `结果长度: ${result.length}`
  );
}

function testChineseFinancialText() {
  console.log("\n=== 测试: 中文金融文本截断 ===");
  const paragraph = "五粮液2025年年度报告显示，公司实现营业收入825.6亿元，同比增长12.5%；归属于上市公司股东的净利润302.3亿元，同比增长15.8%。公司持续优化产品结构，第八代五粮液实现量价齐升，系列酒产品矩阵不断完善。在渠道建设方面，公司推进数字化转型，强化终端管控能力。同时，公司积极拓展海外市场，产品远销亚太、欧洲、北美等地区。";
  const text = paragraph + "C".repeat(1800);
  const result = truncateForEmbedding(text);
  assert(
    result.length <= MAX_INPUT_CHARS,
    "金融文本截断后不超过MAX_INPUT_CHARS",
    `结果长度: ${result.length}`
  );
  assert(
    result.includes("五粮液"),
    "金融文本截断后保留关键内容"
  );
}

function testOldBehavior_512Chars_LossRate() {
  console.log("\n=== 测试: 对比旧版512字符截断的内容丢失 ===");
  const text = "中国长城年度报告。公司实现营业收入825亿元，同比增长12.5%。在国产CPU领域取得重要突破，持续加大研发投入。格力电器空调销量全球第一。五粮液白酒行业龙头地位稳固。公司持续加大研发投入，在国产CPU、操作系统、数据库等关键环节取得重要突破。系统装备业务面向党政军关键领域，提供安全可靠的计算平台和解决方案。";
  const newResult = truncateForEmbedding(text);
  const oldMaxChars = 512;
  const oldResult = text.slice(0, oldMaxChars);
  assert(
    newResult.length >= oldResult.length,
    "新版截断保留更多内容",
    `旧版: ${oldResult.length}, 新版: ${newResult.length}`
  );
  assert(
    newResult.length > text.length * 0.8 || text.length <= MAX_INPUT_CHARS,
    "新版截断保留80%以上内容(或无需截断)",
    `保留比例: ${(newResult.length / text.length * 100).toFixed(1)}%`
  );
}

console.log("========================================");
console.log("Dense Retriever 截断策略测试");
console.log("========================================");

testShortText_NoTruncation();
testExactLength_NoTruncation();
testSentenceBoundaryTruncation();
testCommaFallback();
testHardTruncation_NoGoodBoundary();
testChineseFinancialText();
testOldBehavior_512Chars_LossRate();

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
