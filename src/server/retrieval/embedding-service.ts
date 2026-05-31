export class EmbeddingService {
  private serviceUrl: string;
  private ready: boolean = false;

  constructor() {
    this.serviceUrl =
      process.env.EMBEDDING_SERVICE_URL || "http://localhost:8011";
  }

  async embed(text: string): Promise<number[] | null> {
    try {
      const response = await fetch(`${this.serviceUrl}/embedding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (Array.isArray(data)) {
        return data[0]?.embedding?.[0] || data[0]?.embedding || null;
      }
      return data.embedding || data.data?.[0]?.embedding || null;
    } catch {
      return null;
    }
  }

  async embedBatch(texts: string[]): Promise<(number[] | null)[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  isReady(): boolean {
    return this.ready;
  }

  async checkReady(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serviceUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      this.ready = response.ok;
    } catch {
      this.ready = false;
    }
    return this.ready;
  }
}

export const embeddingService = new EmbeddingService();
