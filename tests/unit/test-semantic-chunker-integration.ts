import { cleanText, fixChunkBoundaries } from "../../src/server/rag/chunking/text-cleaner";
import { chunkDocument, chunkText, chunkMarkdown } from "../../src/server/rag/chunking/semantic-chunker";

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

async function testChunkDocument_StringInput_CallsCleanText() {
  console.log("\n=== 测试: chunkDocument 字符串输入调用 cleanText ===");
  const dirtyText = "Hello\x00World\u200BTest   \r\n\r\n\r\nMore  \uFEFFContent";
  const result = await chunkDocument(dirtyText, "test.txt");
  assert(
    !result.rawText.includes("\x00"),
    "chunkDocument字符串输入经过cleanText处理-控制字符已移除"
  );
  assert(
    !result.rawText.includes("\u200B"),
    "chunkDocument字符串输入经过cleanText处理-零宽字符已移除"
  );
  assert(
    !result.rawText.includes("\r\n"),
    "chunkDocument字符串输入经过cleanText处理-CRLF已转换"
  );
}

async function testChunkDocument_FixChunkBoundaries() {
  console.log("\n=== 测试: chunkDocument 切片后调用 fixChunkBoundaries ===");
  const longText = "中国长城立足国家战略需求打造核心竞争力。围绕构建以芯端为核心的自主计算产品链，聚焦计算产业与系统装备两大核心主业，做大做强主业规模，提升主业盈利能力，持续打造智算终端拳头产品，奋力向国家网信领域战略科技力量迈进。计算产业聚焦自主智算产业，推动核心技术自主可控，打造从芯片到终端的完整产业链。系统装备业务面向党政军关键领域，提供安全可靠的计算平台和解决方案。公司持续加大研发投入，在国产CPU、操作系统、数据库等关键环节取得重要突破。";
  const result = await chunkDocument(longText, "test.txt", { maxChunkSize: 100, minChunkSize: 10 });
  const hasLeadingPunct = result.chunks.some(c => /^[，。、；：！？）》」』】]/.test(c.text));
  assert(
    !hasLeadingPunct,
    "chunkDocument切片无开头标点",
    `切片: ${result.chunks.map(c => c.text.slice(0, 20)).join(" | ")}`
  );
  assert(
    result.chunks.length > 0,
    "chunkDocument返回了切片结果",
    `切片数: ${result.chunks.length}`
  );
  assert(
    result.chunks.every(c => c.text.trim().length > 0),
    "chunkDocument无空切片"
  );
}

async function testChunkDocument_MarkdownIntegration() {
  console.log("\n=== 测试: chunkDocument Markdown文件集成cleanText ===");
  const md = `# 中国长城年度报告

![公司logo](http://example.com/logo.png)

## 计算产业

中国长城立足国家战略需求打造核心竞争力。围绕构建以芯端为核心的自主计算产品链。

---

## 系统装备

聚焦计算产业与系统装备两大核心主业。

[点击查看详情](http://example.com/detail)

<div>HTML标签内容</div>

### 研发投入

公司持续加大研发投入，在国产CPU、操作系统等关键环节取得重要突破。`;
  const result = await chunkDocument(md, "test.md");
  assert(
    !result.rawText.includes("http://example.com"),
    "Markdown清洗-URL已移除"
  );
  assert(
    !result.rawText.includes("---"),
    "Markdown清洗-水平分隔线已移除"
  );
  assert(
    !result.rawText.includes("<div>"),
    "Markdown清洗-HTML标签已移除"
  );
  assert(
    result.rawText.includes("中国长城"),
    "Markdown清洗-正常内容保留"
  );
}

async function testChunkText_LongText_NoLeadingPunctuation() {
  console.log("\n=== 测试: chunkText 长文本切片无开头标点 ===");
  const text = "格力电器是全球领先的家电企业，专注于空调、生活电器和工业装备领域。公司拥有格力、TOSOT、晶弘三大品牌，产品远销160多个国家和地区。格力电器坚持自主创新，累计申请专利超过10万项，拥有33项国际领先技术。在空调领域，格力连续多年位居全球销量第一，市场占有率超过30%。公司积极拓展新能源和智能装备业务，打造多元化产业布局。格力电器秉承让世界爱上中国造的理念，致力于为全球消费者提供优质产品和服务。";
  const result = await chunkText(text, { maxChunkSize: 80, minChunkSize: 10 });
  const hasLeadingPunct = result.some(c => /^[，。、；：！？）》」』】]/.test(c.text));
  assert(
    !hasLeadingPunct,
    "chunkText长文本切片无开头标点",
    `切片数: ${result.length}`
  );
}

async function testCleanText_WithFinancialData() {
  console.log("\n=== 测试: cleanText 金融数据清洗 ===");
  const financialText = `五粮液\uFEFF2025年年度报告\n\n\n\n\n一、公司概况\n\n五粮液是中国白酒行业龙头企业，\u200B主营五粮液酒及其系列酒产品。\n\n![五粮液logo](http://img.example.com/logo.png)\n\n公司2025年实现营业收入８２５亿元，同比增长１２．５％。\n\n---\n\n<div>分页符</div>\n\n二、经营分析\n\n[查看详细数据](http://data.example.com/detail)\n\n公司持续优化产品结构，提升品牌价值。`;
  const cleaned = cleanText(financialText);
  assert(
    !cleaned.includes("\uFEFF"),
    "金融数据清洗-BOM已移除"
  );
  assert(
    !cleaned.includes("\u200B"),
    "金融数据清洗-零宽字符已移除"
  );
  assert(
    !cleaned.includes("\n\n\n"),
    "金融数据清洗-连续空行已合并",
    `清洗后文本中三连换行: ${cleaned.indexOf("\n\n\n")}`
  );
  assert(
    cleaned.includes("825"),
    "金融数据清洗-全角数字转半角"
  );
  assert(
    cleaned.includes("12") && cleaned.includes("5"),
    "金融数据清洗-全角数字已转半角(全角句号不转换)",
    `清洗后: ${cleaned.slice(cleaned.indexOf("12"), cleaned.indexOf("12") + 10)}`
  );
  assert(
    !cleaned.includes("http://img.example.com"),
    "金融数据清洗-图片URL已移除"
  );
  assert(
    !cleaned.includes("http://data.example.com"),
    "金融数据清洗-链接URL已移除"
  );
  assert(
    !cleaned.includes("<div>"),
    "金融数据清洗-HTML标签已移除"
  );
  assert(
    !cleaned.includes("---"),
    "金融数据清洗-水平分隔线已移除"
  );
  assert(
    cleaned.includes("五粮液"),
    "金融数据清洗-正常内容保留"
  );
  assert(
    cleaned.includes("经营分析"),
    "金融数据清洗-正常内容保留"
  );
}

async function testFixChunkBoundaries_FinancialScenario() {
  console.log("\n=== 测试: fixChunkBoundaries 金融场景 ===");
  const chunks = [
    { text: "中国长城立足国家战略需求打造核心竞争力，围绕构建以", index: 0, metadata: {} },
    { text: "，芯端为核心的自主计算产品链，聚焦计算产业", index: 1, metadata: {} },
    { text: "与系统装备两大核心主业。做大做强主业规模", index: 2, metadata: {} },
    { text: "，提升主业盈利能力，持续打造智算终端拳头产品", index: 3, metadata: {} },
    { text: "（格力电器", index: 4, metadata: {} },
    { text: "合作项目）继续推进中", index: 5, metadata: {} },
  ];
  const fixed = fixChunkBoundaries(chunks);
  const hasLeadingPunct = fixed.some(c => /^[，。、；：！？）》」』】]/.test(c.text));
  assert(
    !hasLeadingPunct,
    "金融场景-无开头标点",
    `切片: ${fixed.map(c => c.text.slice(0, 15)).join(" | ")}`
  );
  const hasTrailingLeftBracket = fixed.slice(0, -1).some(c => /[（《「『【]$/.test(c.text));
  assert(
    !hasTrailingLeftBracket,
    "金融场景-无结尾左括号"
  );
}

async function runAll() {
  console.log("========================================");
  console.log("语义切片集成测试");
  console.log("========================================");

  await testChunkDocument_StringInput_CallsCleanText();
  await testChunkDocument_FixChunkBoundaries();
  await testChunkDocument_MarkdownIntegration();
  await testChunkText_LongText_NoLeadingPunctuation();
  await testCleanText_WithFinancialData();
  await testFixChunkBoundaries_FinancialScenario();

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
}

runAll();
