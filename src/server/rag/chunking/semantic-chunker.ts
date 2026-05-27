export interface ChunkOptions {
  maxChunkSize?: number;
  overlapSize?: number;
  minChunkSize?: number;
}

export interface ChunkResult {
  text: string;
  index: number;
  metadata: {
    source: string;
    heading?: string;
    tokenCount: number;
  };
}

const DEFAULT_MAX_CHUNK_SIZE = 512;
const DEFAULT_OVERLAP_SIZE = 64;
const DEFAULT_MIN_CHUNK_SIZE = 50;

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 1.5);
}

export async function parsePDFWithMinerU(
  fileBuffer: Buffer,
  fileName: string
): Promise<string> {
  const apiKey = process.env.MINERU_API_KEY;
  if (!apiKey) {
    console.error("[semantic-chunker] MINERU_API_KEY 环境变量未设置");
    throw new Error("MINERU_API_KEY 环境变量未设置");
  }

  console.log(`[semantic-chunker] 开始解析 PDF: ${fileName}, 大小: ${fileBuffer.length} bytes`);

  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: "application/pdf" });
    formData.append("file", blob, fileName);

    const response = await fetch(
      "https://mineru.net/api/v4/file-urls/batch",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[semantic-chunker] MinerU API 请求失败: ${response.status} ${errorText}`);
      throw new Error(`MinerU API 请求失败: ${response.status}`);
    }

    const result = (await response.json()) as {
      data?: {
        batchId?: string;
        url?: string;
      }[];
    };

    const batchId = result.data?.[0]?.batchId;
    if (!batchId) {
      console.error("[semantic-chunker] MinerU API 未返回 batchId");
      throw new Error("MinerU API 未返回 batchId");
    }

    console.log(`[semantic-chunker] PDF 上传成功, batchId: ${batchId}, 开始轮询结果...`);

    const maxPollAttempts = 60;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const statusResponse = await fetch(
        `https://mineru.net/api/v4/file-urls/batch/${batchId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!statusResponse.ok) {
        console.warn(`[semantic-chunker] 轮询状态失败: ${statusResponse.status}, 继续重试...`);
        continue;
      }

      const statusResult = (await statusResponse.json()) as {
        data?: {
          status?: string;
          fullZipUrl?: string;
          markdownUrl?: string;
          url?: string;
        }[];
      };

      const item = statusResult.data?.[0];
      if (!item) continue;

      if (item.status === "done" || item.status === "completed") {
        const contentUrl = item.markdownUrl || item.url || item.fullZipUrl;
        if (!contentUrl) {
          console.error("[semantic-chunker] MinerU 解析完成但未返回内容 URL");
          throw new Error("MinerU 解析完成但未返回内容 URL");
        }

        console.log("[semantic-chunker] PDF 解析完成, 下载 Markdown 内容...");
        const contentResponse = await fetch(contentUrl);
        if (!contentResponse.ok) {
          throw new Error(`下载 Markdown 内容失败: ${contentResponse.status}`);
        }

        const markdown = await contentResponse.text();
        console.log(`[semantic-chunker] Markdown 内容获取成功, 长度: ${markdown.length}`);
        return markdown;
      }

      if (item.status === "failed" || item.status === "error") {
        console.error("[semantic-chunker] MinerU 解析失败");
        throw new Error("MinerU PDF 解析失败");
      }

      console.log(`[semantic-chunker] 轮询中 (${attempt + 1}/${maxPollAttempts}), 状态: ${item.status}`);
    }

    console.error("[semantic-chunker] MinerU 解析超时");
    throw new Error("MinerU PDF 解析超时");
  } catch (error) {
    console.error("[semantic-chunker] PDF 解析异常:", error);
    throw error;
  }
}

function splitByHeadings(markdown: string): Array<{ heading: string; content: string; level: number }> {
  const lines = markdown.split("\n");
  const sections: Array<{ heading: string; content: string; level: number }> = [];
  let currentHeading = "";
  let currentContent: string[] = [];
  let currentLevel = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (currentContent.length > 0 || currentHeading) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join("\n").trim(),
          level: currentLevel,
        });
      }
      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0 || currentHeading) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join("\n").trim(),
      level: currentLevel,
    });
  }

  return sections;
}

function splitByParagraphs(
  text: string,
  maxChunkSize: number,
  overlapSize: number,
  minChunkSize: number,
  source: string,
  heading: string | undefined,
  startIndex: number
): ChunkResult[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: ChunkResult[] = [];
  let currentChunk = "";
  let chunkIndex = startIndex;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    if (currentChunk.length + trimmedPara.length + 1 <= maxChunkSize) {
      currentChunk = currentChunk ? currentChunk + "\n\n" + trimmedPara : trimmedPara;
    } else {
      if (currentChunk.length >= minChunkSize) {
        chunks.push({
          text: currentChunk,
          index: chunkIndex++,
          metadata: {
            source,
            heading,
            tokenCount: estimateTokenCount(currentChunk),
          },
        });
      }

      if (trimmedPara.length > maxChunkSize) {
        const subChunks = splitLongText(trimmedPara, maxChunkSize, overlapSize);
        for (const sub of subChunks) {
          if (sub.length >= minChunkSize) {
            chunks.push({
              text: sub,
              index: chunkIndex++,
              metadata: {
                source,
                heading,
                tokenCount: estimateTokenCount(sub),
              },
            });
          }
        }
        currentChunk = "";
      } else {
        if (currentChunk.length > 0 && currentChunk.length < minChunkSize) {
          currentChunk = currentChunk + "\n\n" + trimmedPara;
        } else {
          currentChunk = trimmedPara;
        }
      }
    }
  }

  if (currentChunk.trim().length >= minChunkSize) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      metadata: {
        source,
        heading,
        tokenCount: estimateTokenCount(currentChunk.trim()),
      },
    });
  }

  return chunks;
}

function splitLongText(
  text: string,
  maxChunkSize: number,
  overlapSize: number
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);

    if (end < text.length) {
      const lastSentenceEnd = text.lastIndexOf("。", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastSentenceEnd, lastNewline);

      if (breakPoint > start) {
        end = breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlapSize;

    if (start >= text.length) break;
    if (start < 0) start = 0;
  }

  return chunks.filter((c) => c.length > 0);
}

export async function chunkMarkdown(
  markdown: string,
  options?: ChunkOptions
): Promise<ChunkResult[]> {
  const maxChunkSize = options?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const overlapSize = options?.overlapSize ?? DEFAULT_OVERLAP_SIZE;
  const minChunkSize = options?.minChunkSize ?? DEFAULT_MIN_CHUNK_SIZE;

  console.log(`[semantic-chunker] 开始 Markdown 切分, 文本长度: ${markdown.length}`);

  const sections = splitByHeadings(markdown);
  const allChunks: ChunkResult[] = [];
  let globalIndex = 0;

  for (const section of sections) {
    const heading = section.heading || undefined;

    if (section.content.length <= maxChunkSize) {
      if (section.content.length >= minChunkSize) {
        allChunks.push({
          text: section.content,
          index: globalIndex++,
          metadata: {
            source: "markdown",
            heading,
            tokenCount: estimateTokenCount(section.content),
          },
        });
      }
    } else {
      const subChunks = splitByParagraphs(
        section.content,
        maxChunkSize,
        overlapSize,
        minChunkSize,
        "markdown",
        heading,
        globalIndex
      );
      globalIndex += subChunks.length;
      allChunks.push(...subChunks);
    }
  }

  console.log(`[semantic-chunker] Markdown 切分完成, 共 ${allChunks.length} 个 chunk`);
  return allChunks;
}

export async function chunkText(
  text: string,
  options?: ChunkOptions
): Promise<ChunkResult[]> {
  const maxChunkSize = options?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const overlapSize = options?.overlapSize ?? DEFAULT_OVERLAP_SIZE;
  const minChunkSize = options?.minChunkSize ?? DEFAULT_MIN_CHUNK_SIZE;

  console.log(`[semantic-chunker] 开始纯文本切分, 文本长度: ${text.length}`);

  const chunks: ChunkResult[] = [];

  if (text.length <= maxChunkSize) {
    if (text.length >= minChunkSize) {
      chunks.push({
        text,
        index: 0,
        metadata: {
          source: "text",
          tokenCount: estimateTokenCount(text),
        },
      });
    }
  } else {
    const subChunks = splitLongText(text, maxChunkSize, overlapSize);
    for (let i = 0; i < subChunks.length; i++) {
      if (subChunks[i].length >= minChunkSize) {
        chunks.push({
          text: subChunks[i],
          index: i,
          metadata: {
            source: "text",
            tokenCount: estimateTokenCount(subChunks[i]),
          },
        });
      }
    }
  }

  console.log(`[semantic-chunker] 纯文本切分完成, 共 ${chunks.length} 个 chunk`);
  return chunks;
}

export async function chunkDocument(
  content: string | Buffer,
  fileName: string,
  options?: ChunkOptions
): Promise<ChunkResult[]> {
  console.log(`[semantic-chunker] 开始处理文档: ${fileName}`);

  const ext = fileName.toLowerCase().split(".").pop();

  if (ext === "pdf") {
    if (typeof content === "string") {
      console.error("[semantic-chunker] PDF 文件需要 Buffer 类型输入");
      throw new Error("PDF 文件需要 Buffer 类型输入");
    }

    const markdown = await parsePDFWithMinerU(content, fileName);
    const chunks = await chunkMarkdown(markdown, options);
    return chunks.map((chunk) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        source: fileName,
      },
    }));
  }

  if (ext === "md" || ext === "markdown") {
    const text = typeof content === "string" ? content : content.toString("utf-8");
    const chunks = await chunkMarkdown(text, options);
    return chunks.map((chunk) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        source: fileName,
      },
    }));
  }

  const text = typeof content === "string" ? content : content.toString("utf-8");
  const chunks = await chunkText(text, options);
  return chunks.map((chunk) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      source: fileName,
    },
  }));
}
