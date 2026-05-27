export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokenCount = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 0x4e00 && code <= 0x9fff) {
      tokenCount += 0.5;
    } else {
      tokenCount += 0.25;
    }
  }

  return Math.ceil(tokenCount);
}
