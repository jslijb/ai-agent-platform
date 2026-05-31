import type { SkillVectorEntry } from "./types";
import type { EnhancedSkillDefinition } from "../agents/skills/enhanced-types";
import { embeddingService } from "./embedding-service";

export class SkillVectorRetriever {
  private index: Map<string, SkillVectorEntry> = new Map();

  async buildIndex(
    skills: EnhancedSkillDefinition[]
  ): Promise<void> {
    this.index.clear();
    const texts = skills.map(
      (s) =>
        `${s.name} ${s.description} ${s.applicableScenarios || ""} ${(s.triggerKeywords || []).join(" ")} ${(s.typicalQueries || []).join(" ")}`
    );
    const embeddings = await embeddingService.embedBatch(texts);
    for (let i = 0; i < skills.length; i++) {
      const emb = embeddings[i];
      if (emb) {
        this.index.set(skills[i].name, {
          skillId: skills[i].name,
          embedding: emb,
          metadata: {
            relatedTools: skills[i].relatedTools || [],
            applicableScenarios: skills[i].applicableScenarios || "",
            skillCategory: skills[i].skillCategory || "",
            relatedGroups: skills[i].relatedGroups || [],
          },
        });
      }
    }
    console.log(
      `[SkillVectorRetriever] 索引构建完成: ${this.index.size}/${skills.length}`
    );
  }

  async retrieve(
    query: string,
    topK: number = 5,
    candidateGroups?: string[]
  ): Promise<Array<{ skillId: string; score: number }>> {
    const queryEmb = await embeddingService.embed(query);
    if (!queryEmb) return [];

    const results: Array<{ skillId: string; score: number }> = [];
    for (const [id, entry] of Array.from(this.index.entries())) {
      if (candidateGroups && candidateGroups.length > 0) {
        const hasOverlap = entry.metadata.relatedGroups.some((g: string) =>
          candidateGroups.includes(g)
        );
        if (!hasOverlap) continue;
      }
      const score = cosineSimilarity(queryEmb, entry.embedding);
      results.push({ skillId: id, score });
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
