import fs from "fs";
import path from "path";
import { cleanText, fixChunkBoundaries } from "../src/server/rag/chunking/text-cleaner";
import { chunkDocument, chunkText } from "../src/server/rag/chunking/semantic-chunker";

const results: Array<{ suite: string; name: string; pass: boolean; detail: string }> = [];

function assert(suite: string, condition: boolean, name: string, detail: string = ""): void {
  if (!condition) {
    console.error(`[FAIL] [${suite}] ${name}: ${detail}`);
    results.push({ suite, name, pass: false, detail });
    return;
  }
  console.log(`[PASS] [${suite}] ${name}`);
  results.push({ suite, name, pass: true, detail });
}

const MAX_INPUT_CHARS = 2000;
function truncateForEmbedding(text: string): string {
  if (text.length <= MAX_INPUT_CHARS) return text;
  const sub = text.slice(0, MAX_INPUT_CHARS);
  const sentenceEnd = Math.max(sub.lastIndexOf("。"), sub.lastIndexOf("？"), sub.lastIndexOf("！"), sub.lastIndexOf("."), sub.lastIndexOf("?"), sub.lastIndexOf("!"));
  if (sentenceEnd > MAX_INPUT_CHARS * 0.5) return sub.slice(0, sentenceEnd + 1);
  const commaEnd = Math.max(sub.lastIndexOf("，"), sub.lastIndexOf("；"), sub.lastIndexOf(","), sub.lastIndexOf(";"));
  if (commaEnd > MAX_INPUT_CHARS * 0.5) return sub.slice(0, commaEnd + 1);
  return sub;
}

function preprocessForBM25(text: string): string {
  let result = text.replace(/(\d),(\d)/g, "$1$2");
  result = result.replace(/[，。、；：！？""''【】《》（）…—·\-.!,;:!?()[\]{}<>]/g, " ");
  result = result.toLowerCase();
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]*$/;
function resolveEnvVars(obj: any): any {
  if (typeof obj === "string") {
    if (ENV_VAR_PATTERN.test(obj)) return process.env[obj] || "";
    return obj;
  }
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(resolveEnvVars);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) result[key] = resolveEnvVars(value);
  return result;
}

async function runTextCleanerTests() {
  const suite = "text-cleaner";
  console.log(`\n${"=".repeat(60)}\n${suite}\n${"=".repeat(60)}`);

  const t1 = cleanText("Hello\x00World\u200BTest");
  assert(suite, !t1.includes("\x00"), "控制字符移除");
  assert(suite, !t1.includes("\u200B"), "零宽字符移除");

  const t2 = cleanText("Line1\r\n\r\n\r\nLine2");
  assert(suite, !t2.includes("\r\n"), "CRLF转换");
  assert(suite, !t2.includes("\n\n\n"), "连续空行合并");

  const t3 = cleanText("![img](http://x.com/a.png)\n---\n[link](http://x.com)\n<div>html</div>");
  assert(suite, !t3.includes("http://x.com"), "Markdown URL移除");
  assert(suite, !t3.includes("---"), "水平分隔线移除");
  assert(suite, !t3.includes("<div>"), "HTML标签移除");

  const t4 = cleanText("８２５ １２．５％");
  assert(suite, t4.includes("825"), "全角数字转半角");

  const headerPage = "Header\n" + "Content line\n".repeat(8);
  const t5 = cleanText(headerPage + headerPage + headerPage + "Body");
  assert(suite, (t5.match(/Header/g) || []).length <= 1, "重复页眉去重", `Header出现${(t5.match(/Header/g) || []).length}次`);

  const t6 = fixChunkBoundaries([
    { text: "前文", index: 0, metadata: {} },
    { text: "，后续", index: 1, metadata: {} },
    { text: "（括号", index: 2, metadata: {} },
    { text: "内容）继续", index: 3, metadata: {} },
  ]);
  assert(suite, !t6.some(c => /^[，。、；：！？）》」』】]/.test(c.text)), "开头标点修正");
  assert(suite, !t6.slice(0, -1).some(c => /[（《「『【]$/.test(c.text)), "结尾左括号修正");
}

async function runDenseRetrieverTests() {
  const suite = "dense-retriever";
  console.log(`\n${"=".repeat(60)}\n${suite}\n${"=".repeat(60)}`);

  assert(suite, truncateForEmbedding("短文本") === "短文本", "短文本不截断");
  assert(suite, truncateForEmbedding("A".repeat(2000)).length === 2000, "恰好2000不截断");

  const prefix = "X".repeat(1200);
  const sentence = "中国长城年度报告。公司实现营业收入825亿元。";
  const text = prefix + sentence + "Y".repeat(1500);
  const result = truncateForEmbedding(text);
  assert(suite, result.length <= MAX_INPUT_CHARS, "截断后不超过MAX");
  assert(suite, result.endsWith("。"), "句子边界截断", `末尾: ${result.slice(-1)}`);

  const hard = "A".repeat(3000);
  assert(suite, truncateForEmbedding(hard).length === MAX_INPUT_CHARS, "无边界硬切");
}

async function runSparseRetrieverTests() {
  const suite = "sparse-retriever";
  console.log(`\n${"=".repeat(60)}\n${suite}\n${"=".repeat(60)}`);

  const t1 = preprocessForBM25("中国长城，立足国家战略需求。");
  assert(suite, !t1.includes("，"), "中文标点移除");
  assert(suite, t1.includes("中国长城"), "正常文本保留");

  const t2 = preprocessForBM25("GREE Electric, revenue!");
  assert(suite, !t2.includes(","), "英文标点移除");
  assert(suite, t2 === t2.toLowerCase(), "英文转小写");

  const t3 = preprocessForBM25("收入825,600万元，利润302,300万元");
  assert(suite, t3.includes("825600"), "数字逗号移除");
  assert(suite, t3.includes("302300"), "数字逗号移除2");

  const t4 = preprocessForBM25("中国长城（000066）");
  assert(suite, t4.includes("000066"), "括号内数字保留");
  assert(suite, !t4.includes("（"), "括号移除");
}

async function runConfigTests() {
  const suite = "config-resolution";
  console.log(`\n${"=".repeat(60)}\n${suite}\n${"=".repeat(60)}`);

  assert(suite, ENV_VAR_PATTERN.test("DASHSCOPE_API_KEY"), "全大写匹配");
  assert(suite, !ENV_VAR_PATTERN.test("1M"), "数字开头不匹配");
  assert(suite, !ENV_VAR_PATTERN.test("qwen3.6-max-preview"), "小写不匹配");
  assert(suite, !ENV_VAR_PATTERN.test("256K"), "数字字母不匹配");

  process.env.TEST_CONFIG_KEY = "resolved";
  const resolved = resolveEnvVars({ key: "TEST_CONFIG_KEY", model: "qwen3.6-max-preview", ctx: "256K" });
  assert(suite, resolved.key === "resolved", "环境变量解析");
  assert(suite, resolved.model === "qwen3.6-max-preview", "非环境变量保持原值");
  assert(suite, resolved.ctx === "256K", "256K保持原值");
  delete process.env.TEST_CONFIG_KEY;

  const yamlPath = path.resolve(process.cwd(), "config/api_keys.yaml");
  if (fs.existsSync(yamlPath)) {
    const raw = fs.readFileSync(yamlPath, "utf-8");
    assert(suite, !raw.includes("BAILIAN_MODEL"), "YAML无BAILIAN_MODEL");
  }

  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, "utf-8");
    assert(suite, !raw.split("\n").some(l => l.trim().startsWith("BAILIAN_MODEL=")), ".env.local无BAILIAN_MODEL");
  }
}

async function runChunkerIntegrationTests() {
  const suite = "chunker-integration";
  console.log(`\n${"=".repeat(60)}\n${suite}\n${"=".repeat(60)}`);

  const dirtyText = "Hello\x00World\u200BTest   \r\n\r\n\r\nMore  \uFEFFContent";
  const result = await chunkDocument(dirtyText, "test.txt");
  assert(suite, !result.rawText.includes("\x00"), "chunkDocument经过cleanText");

  const longText = "中国长城立足国家战略需求打造核心竞争力。围绕构建以芯端为核心的自主计算产品链，聚焦计算产业与系统装备两大核心主业，做大做强主业规模，提升主业盈利能力，持续打造智算终端拳头产品，奋力向国家网信领域战略科技力量迈进。计算产业聚焦自主智算产业，推动核心技术自主可控，打造从芯片到终端的完整产业链。系统装备业务面向党政军关键领域，提供安全可靠的计算平台和解决方案。公司持续加大研发投入，在国产CPU、操作系统、数据库等关键环节取得重要突破。";
  const result2 = await chunkDocument(longText, "test.txt", { maxChunkSize: 100, minChunkSize: 10 });
  assert(suite, !result2.chunks.some(c => /^[，。、；：！？）》」』】]/.test(c.text)), "切片无开头标点");
  assert(suite, result2.chunks.every(c => c.text.trim().length > 0), "无空切片");
}

async function runAll() {
  console.log("=".repeat(60));
  console.log("AI Agent Platform - 综合测试报告");
  console.log(`时间: ${new Date().toLocaleString("zh-CN")}`);
  console.log("=".repeat(60));

  await runTextCleanerTests();
  await runDenseRetrieverTests();
  await runSparseRetrieverTests();
  await runConfigTests();
  await runChunkerIntegrationTests();

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;

  console.log("\n" + "=".repeat(60));
  console.log(`综合测试结果: ${passed}/${total} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60));

  const suites = Array.from(new Set(results.map(r => r.suite)));
  for (const suite of suites) {
    const suiteResults = results.filter(r => r.suite === suite);
    const suitePassed = suiteResults.filter(r => r.pass).length;
    console.log(`\n  [${suite}] ${suitePassed}/${suiteResults.length} PASSED`);
    for (const r of suiteResults) {
      const status = r.pass ? "PASS" : "FAIL";
      console.log(`    [${status}] ${r.name}${r.detail ? " - " + r.detail : ""}`);
    }
  }

  const reportDir = path.resolve(process.cwd(), "tests/reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportDir, `comprehensive_test_report_${ts}.json`);
  const report = {
    test_time: new Date().toISOString(),
    total,
    passed,
    failed,
    suites: suites.map(s => ({
      name: s,
      total: results.filter(r => r.suite === s).length,
      passed: results.filter(r => r.suite === s && r.pass).length,
    })),
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n报告已保存: ${reportPath}`);

  if (failed > 0) process.exit(1);
}

runAll();
