import { cleanText, fixChunkBoundaries } from "./text-cleaner";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[TEST FAILED] ${message}`);
    process.exit(1);
  }
  console.log(`[TEST PASSED] ${message}`);
}

function testStep1_ControlChars() {
  console.log("\n=== 测试步骤1: 控制字符去除 ===");
  const input = "Hello\x00World\x01Test\x08\nKeep\tNewline\r\nTab";
  const result = cleanText(input);
  assert(!result.includes("\x00"), "移除 \\x00");
  assert(!result.includes("\x01"), "移除 \\x01");
  assert(!result.includes("\x08"), "移除 \\x08");
  assert(result.includes("\n"), "保留换行符");
  assert(!result.includes("\t"), "制表符在步骤2中合并为空格");

  const input2 = "Zero\u200BWidth\uFEFFChars\u200FEnd";
  const result2 = cleanText(input2);
  assert(!result2.includes("\u200B"), "移除零宽空格");
  assert(!result2.includes("\uFEFF"), "移除BOM");
  assert(!result2.includes("\u200F"), "移除零宽字符");
  assert(result2.includes("Zero"), "保留正常文本");
  assert(result2.includes("End"), "保留正常文本");
}

function testStep2_Whitespace() {
  console.log("\n=== 测试步骤2: 空白规范化 ===");
  const input = "Line1\r\nLine2\r\nLine3";
  const result = cleanText(input);
  assert(!result.includes("\r\n"), "CRLF转LF");
  assert(result.includes("Line1\nLine2"), "换行符统一");

  const input2 = "Too    many   \t spaces";
  const result2 = cleanText(input2);
  assert(!result2.includes("  "), "连续空格合并");
  assert(!result2.includes("\t"), "制表符合并");

  const input3 = "Para1\n\n\n\nPara2";
  const result3 = cleanText(input3);
  assert(!result3.includes("\n\n\n"), "连续空行合并");
  assert(result3.includes("Para1\n\nPara2"), "保留1个空行");

  const input4 = "  Leading and trailing  \n  Indented line  ";
  const result4 = cleanText(input4);
  assert(!result4.includes("  Leading"), "行首空白去除");
  assert(!result4.includes("trailing  "), "行尾空白去除");
}

function testStep3_MarkdownNoise() {
  console.log("\n=== 测试步骤3: Markdown噪声清理 ===");
  const input1 = "See ![screenshot](http://img.png) here";
  const result1 = cleanText(input1);
  assert(result1.includes("[图片: screenshot]"), "图片标记替换带alt");
  assert(!result1.includes("http://img.png"), "图片URL移除");

  const input2 = "Click ![  ](http://img.png) here";
  const result2 = cleanText(input2);
  assert(result2.includes("[图片]"), "图片标记替换无alt");
  assert(!result2.includes("http://"), "图片URL移除");

  const input3 = "Visit [Google](http://google.com) now";
  const result3 = cleanText(input3);
  assert(result3.includes("Google"), "链接文本保留");
  assert(!result3.includes("http://google.com"), "链接URL移除");

  const input4 = "Header\n| Name | Age |\n|---|---|\n| Tom | 20 |";
  const result4 = cleanText(input4);
  assert(!result4.includes("|---|---|"), "表格分隔行移除");
  assert(result4.includes("Name"), "表格内容保留");
  assert(result4.includes("Tom"), "表格数据保留");

  const input5 = "Above\n---\nBelow";
  const result5 = cleanText(input5);
  assert(!result5.includes("---"), "水平分隔线移除");

  const input6 = "Text<br>More<div>Content</div><p>Para</p><span>Hi</span>";
  const result6 = cleanText(input6);
  assert(!result6.includes("<br>"), "br标签移除");
  assert(!result6.includes("<div>"), "div标签移除");
  assert(!result6.includes("</div>"), "div关闭标签移除");
  assert(!result6.includes("<p>"), "p标签移除");
  assert(!result6.includes("</p>"), "p关闭标签移除");
  assert(!result6.includes("<span>"), "span标签移除");
  assert(!result6.includes("</span>"), "span关闭标签移除");
  assert(result6.includes("Text"), "标签外内容保留");
  assert(result6.includes("Content"), "标签内内容保留");
  assert(result6.includes("Para"), "标签内内容保留");
  assert(result6.includes("Hi"), "标签内内容保留");
}

function testStep4_DuplicateHeadersFooters() {
  console.log("\n=== 测试步骤4: 重复内容去重 ===");
  const header = "--- Page Header ---";
  const input = [
    header,
    "Content line 1",
    "Content line 2",
    "Content line 3",
    "Content line 4",
    "Content line 5",
    "Content line 6",
    header,
    "Content line 7",
    "Content line 8",
    "Content line 9",
    "Content line 10",
    "Content line 11",
    "Content line 12",
    header,
    "Content line 13",
    "Content line 14",
    "Content line 15",
    "Content line 16",
    "Content line 17",
    "Content line 18",
    header,
  ].join("\n");
  const result = cleanText(input);
  const headerCount = result.split(header).length - 1;
  assert(headerCount === 1, `页眉仅保留首次出现, 期望1次, 实际${headerCount}次`);
}

function testStep5_FullWidthChars() {
  console.log("\n=== 测试步骤5: 全半角统一 ===");
  const input = "数字０１２３４５６７８９字母ＡＢＣｄｅｆ标点，。！？";
  const result = cleanText(input);
  assert(result.includes("0123456789"), "全角数字转半角");
  assert(result.includes("ABC"), "全角大写字母转半角");
  assert(result.includes("def"), "全角小写字母转半角");
  assert(result.includes("，"), "全角标点保留");
  assert(result.includes("。"), "全角标点保留");
  assert(result.includes("！"), "全角标点保留");
  assert(result.includes("？"), "全角标点保留");
}

function testStep6_NFC() {
  console.log("\n=== 测试步骤6: Unicode NFC标准化 ===");
  const input = "é";
  const result = cleanText(input);
  assert(result === "é", "NFC标准化完成");
}

function testFixChunkBoundaries_LeadingPunctuation() {
  console.log("\n=== 测试fixChunkBoundaries: 开头标点修正 ===");
  const chunks = [
    { text: "这是第一个切片", index: 0, metadata: {} },
    { text: "，这是第二个切片", index: 1, metadata: {} },
    { text: "。第三个切片", index: 2, metadata: {} },
  ];
  const result = fixChunkBoundaries(chunks);
  assert(result[0].text === "这是第一个切片，", "开头标点移到上一个切片末尾");
  assert(result[1].text === "这是第二个切片。", "开头标点移到上一个切片末尾");
  assert(result[2].text === "第三个切片", "最后一个切片无开头标点");
}

function testFixChunkBoundaries_TrailingBracket() {
  console.log("\n=== 测试fixChunkBoundaries: 结尾左括号修正 ===");
  const chunks = [
    { text: "这是（", index: 0, metadata: {} },
    { text: "内容）继续", index: 1, metadata: {} },
    { text: "另一个《", index: 2, metadata: {} },
    { text: "书名》结束", index: 3, metadata: {} },
  ];
  const result = fixChunkBoundaries(chunks);
  assert(result[0].text === "这是", "结尾左括号移到下一个切片");
  assert(result[1].text === "（内容）继续", "左括号移到下一个切片开头");
  assert(result[2].text === "另一个", "结尾左括号移到下一个切片");
  assert(result[3].text === "《书名》结束", "左括号移到下一个切片开头");
}

function testFixChunkBoundaries_NoPreviousChunk() {
  console.log("\n=== 测试fixChunkBoundaries: 第一个切片开头标点 ===");
  const chunks = [
    { text: "，开头标点", index: 0, metadata: {} },
    { text: "正常内容", index: 1, metadata: {} },
  ];
  const result = fixChunkBoundaries(chunks);
  assert(result[0].text === "开头标点", "第一个切片开头标点去除");
}

function testFixChunkBoundaries_EmptyChunkFilter() {
  console.log("\n=== 测试fixChunkBoundaries: 空切片过滤 ===");
  const chunks = [
    { text: "内容A", index: 0, metadata: {} },
    { text: "，", index: 1, metadata: {} },
    { text: "内容B", index: 2, metadata: {} },
  ];
  const result = fixChunkBoundaries(chunks);
  assert(result.length === 2, "空切片被过滤");
  assert(result[0].text === "内容A，", "标点移到前一个切片");
  assert(result[0].index === 0, "重新编号index 0");
  assert(result[1].text === "内容B", "内容保留");
  assert(result[1].index === 1, "重新编号index 1");
}

function testFixChunkBoundaries_NoNextChunk() {
  console.log("\n=== 测试fixChunkBoundaries: 最后切片结尾左括号 ===");
  const chunks = [
    { text: "内容", index: 0, metadata: {} },
    { text: "最后（", index: 1, metadata: {} },
  ];
  const result = fixChunkBoundaries(chunks);
  assert(result.length === 2, "切片数量不变");
  assert(result[1].text === "最后", "最后切片结尾左括号去除");
}

console.log("========================================");
console.log("开始测试 text-cleaner 模块");
console.log("========================================");

testStep1_ControlChars();
testStep2_Whitespace();
testStep3_MarkdownNoise();
testStep4_DuplicateHeadersFooters();
testStep5_FullWidthChars();
testStep6_NFC();
testFixChunkBoundaries_LeadingPunctuation();
testFixChunkBoundaries_TrailingBracket();
testFixChunkBoundaries_NoPreviousChunk();
testFixChunkBoundaries_EmptyChunkFilter();
testFixChunkBoundaries_NoNextChunk();

console.log("\n========================================");
console.log("所有测试通过!");
console.log("========================================");
