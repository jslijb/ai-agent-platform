export function injectCitations(
  answer: string,
  citations: string[]
): string {
  console.log(
    `[citation-injector] 开始注入引用, 答案长度: ${answer.length}, 引用数: ${citations.length}`
  );

  if (citations.length === 0) {
    console.log("[citation-injector] 无引用，直接返回原文");
    return answer;
  }

  const sentences = splitSentences(answer);
  console.log(`[citation-injector] 答案拆分为 ${sentences.length} 个句子`);

  const injected: string[] = [];
  const citationInterval = Math.max(
    1,
    Math.floor(sentences.length / citations.length)
  );

  let citationIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    injected.push(sentences[i]);

    const shouldInject =
      (i + 1) % citationInterval === 0 &&
      citationIndex < citations.length;

    const isLastSentence =
      i === sentences.length - 1 &&
      citationIndex < citations.length;

    if (shouldInject || isLastSentence) {
      injected.push(citations[citationIndex]);
      console.log(
        `[citation-injector] 在第 ${i + 1} 句后注入引用: ${citations[citationIndex]}`
      );
      citationIndex++;
    }
  }

  while (citationIndex < citations.length) {
    injected.push(citations[citationIndex]);
    console.log(
      `[citation-injector] 追加剩余引用: ${citations[citationIndex]}`
    );
    citationIndex++;
  }

  const result = injected.join("");
  console.log(
    `[citation-injector] 引用注入完成, 结果长度: ${result.length}, 注入引用数: ${citationIndex}`
  );

  return result;
}

function splitSentences(text: string): string[] {
  const parts = text.split(/([。！？；\n])/);
  const sentences: string[] = [];

  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] || "";
    const delimiter = parts[i + 1] || "";

    if (sentence.trim() || delimiter) {
      sentences.push(sentence + delimiter);
    }
  }

  if (sentences.length === 0 && text.trim()) {
    sentences.push(text);
  }

  return sentences.filter((s) => s.trim().length > 0);
}

export function formatCitationList(citations: string[]): string {
  console.log(
    `[citation-injector] 格式化引用列表, 数量: ${citations.length}`
  );

  if (citations.length === 0) {
    return "";
  }

  const uniqueCitations = Array.from(new Set(citations));
  const formatted = uniqueCitations
    .map((citation, index) => `${index + 1}. ${citation}`)
    .join("\n");

  console.log(
    `[citation-injector] 引用列表格式化完成, 去重后: ${uniqueCitations.length} 条`
  );

  return formatted;
}
