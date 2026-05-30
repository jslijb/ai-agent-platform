export function cleanText(text: string): string {
  const originalLength = text.length;
  let result = text;

  result = step1_removeControlChars(result);
  result = step2_normalizeWhitespace(result);
  result = step3_cleanMarkdownNoise(result);
  result = step4_removeDuplicateHeadersFooters(result);
  result = step5_normalizeFullWidthChars(result);
  result = step6_normalizeNFC(result);

  console.log(`[text-cleaner] 清洗完成: 原始长度 ${originalLength}, 清洗后长度 ${result.length}, 减少 ${originalLength - result.length} 字符`);
  return result;
}

export function fixChunkBoundaries<T extends { text: string; index: number; metadata: Record<string, unknown> }>(
  chunks: T[]
): T[] {
  const inputCount = chunks.length;
  const fixed = chunks.map((c) => ({ ...c, text: c.text }));

  const leadingPunctuation = /^[，。、；：！？）》」』】\\,]/;
  const trailingLeftBracket = /[（《「『【\\(]$/;

  for (let i = 0; i < fixed.length; i++) {
    const match = fixed[i].text.match(leadingPunctuation);
    if (match) {
      const punct = match[0];
      fixed[i].text = fixed[i].text.slice(match[0].length);
      if (i > 0) {
        fixed[i - 1].text += punct;
      }
    }
  }

  for (let i = 0; i < fixed.length; i++) {
    const match = fixed[i].text.match(trailingLeftBracket);
    if (match) {
      const bracket = match[0];
      fixed[i].text = fixed[i].text.slice(0, -bracket.length);
      if (i < fixed.length - 1) {
        fixed[i + 1].text = bracket + fixed[i + 1].text;
      }
    }
  }

  const filtered = fixed.filter((c) => c.text.trim().length > 0);

  const result = filtered.map((c, idx) => ({
    ...c,
    index: idx,
  }));

  console.log(`[text-cleaner] 边界修正完成: 输入 ${inputCount} 个切片, 输出 ${result.length} 个切片, 移除 ${inputCount - result.length} 个空切片`);
  return result;
}

function step1_removeControlChars(text: string): string {
  let removed = 0;
  const result = text.replace(/[\x00\x01-\x08\x0B\x0C\x0E-\x1F\u200B-\u200F\uFEFF]/g, () => {
    removed++;
    return "";
  });
  console.log(`[text-cleaner] 步骤1-控制字符去除: 移除 ${removed} 个控制字符`);
  return result;
}

function step2_normalizeWhitespace(text: string): string {
  let result = text.replace(/\r\n/g, "\n");

  result = result.replace(/[ \t]+/g, " ");

  result = result.replace(/\n{3,}/g, "\n\n");

  result = result
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  console.log(`[text-cleaner] 步骤2-空白规范化: 完成`);
  return result;
}

function step3_cleanMarkdownNoise(text: string): string {
  let noiseCount = 0;
  let result = text;

  result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt) => {
    noiseCount++;
    return alt.trim() ? `[图片: ${alt.trim()}]` : "[图片]";
  });

  result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, (_match, linkText) => {
    noiseCount++;
    return linkText;
  });

  result = result.replace(/^\|[\s:|-]+\|$/gm, (match) => {
    if (/^[\s|:-]+$/.test(match)) {
      noiseCount++;
      return "";
    }
    return match;
  });

  result = result.replace(/^[-*_]{3,}\s*$/gm, () => {
    noiseCount++;
    return "";
  });

  result = result.replace(/<\/?(?:br|div|p|span)>/gi, () => {
    noiseCount++;
    return "";
  });

  result = result.replace(/\n{3,}/g, "\n\n");

  console.log(`[text-cleaner] 步骤3-Markdown噪声清理: 移除 ${noiseCount} 处噪声`);
  return result;
}

function step4_removeDuplicateHeadersFooters(text: string): string {
  const lines = text.split("\n");
  const linePositions = new Map<string, number[]>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0) continue;
    const positions = linePositions.get(trimmed) || [];
    positions.push(i);
    linePositions.set(trimmed, positions);
  }

  const duplicateLines = new Set<number>();
  let removedCount = 0;

  for (const [, positions] of Array.from(linePositions)) {
    if (positions.length >= 3) {
      let hasWideSpacing = false;
      for (let i = 1; i < positions.length; i++) {
        if (positions[i] - positions[i - 1] > 5) {
          hasWideSpacing = true;
          break;
        }
      }
      if (hasWideSpacing) {
        for (let i = 1; i < positions.length; i++) {
          duplicateLines.add(positions[i]);
          removedCount++;
        }
      }
    }
  }

  const result = lines.filter((_, idx) => !duplicateLines.has(idx)).join("\n");
  console.log(`[text-cleaner] 步骤4-重复内容去重: 移除 ${removedCount} 行重复页眉页脚`);
  return result;
}

function step5_normalizeFullWidthChars(text: string): string {
  let converted = 0;
  const result = text.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (char) => {
    converted++;
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
  });
  console.log(`[text-cleaner] 步骤5-全半角统一: 转换 ${converted} 个全角字符`);
  return result;
}

function step6_normalizeNFC(text: string): string {
  const result = text.normalize("NFC");
  console.log(`[text-cleaner] 步骤6-Unicode NFC标准化: 完成`);
  return result;
}
