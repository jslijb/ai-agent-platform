import type { ToolVectorEntry } from "./types";
import { ToolRegistry } from "../tools/registry";
import { toolGroupManager } from "../routing/tool-group-manager";
import { embeddingService } from "./embedding-service";

export class ToolVectorRetriever {
  private index: Map<string, ToolVectorEntry> = new Map();

  async buildIndex(): Promise<void> {
    this.index.clear();
    const tools = ToolRegistry.list();
    const texts = tools.map(
      (t) => `${t.name} ${t.description} ${t.category || ""}`
    );
    const embeddings = await embeddingService.embedBatch(texts);
    for (let i = 0; i < tools.length; i++) {
      const emb = embeddings[i];
      if (emb) {
        const group = toolGroupManager.getGroupForTool(tools[i].name);
        this.index.set(tools[i].name, {
          toolName: tools[i].name,
          embedding: emb,
          metadata: {
            groupId: group?.groupId || tools[i].category || "",
            whenToUse: tools[i].description,
            groupResponsibility: group?.groupResponsibility || "mixed",
          },
        });
      }
    }
    console.log(
      `[ToolVectorRetriever] 索引构建完成: ${this.index.size}/${tools.length}`
    );
  }

  async retrieve(
    query: string,
    topK: number = 8,
    candidateGroups?: string[]
  ): Promise<Array<{ toolName: string; score: number }>> {
    const queryEmb = await embeddingService.embed(query);
    if (!queryEmb) return [];

    const results: Array<{ toolName: string; score: number }> = [];
    for (const [name, entry] of Array.from(this.index.entries())) {
      if (candidateGroups && candidateGroups.length > 0) {
        if (!candidateGroups.includes(entry.metadata.groupId)) continue;
      }
      const score = cosineSimilarity(queryEmb, entry.embedding);
      results.push({ toolName: name, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  isReady(): boolean {
    return this.index.size > 0;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
