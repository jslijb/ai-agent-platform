import { callBailianWithCache } from "@/server/llm/cache";
import type { BailianMessage } from "@/server/llm/providers/bailian";

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  temperature?: number;
  maxIterations?: number;
}

export interface AgentRunResult {
  answer: string;
  iterations: number;
  agentName: string;
}

export abstract class BaseAgent {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get description(): string {
    return this.config.description;
  }

  protected async callLLM(messages: BailianMessage[]): Promise<string> {
    const response = await callBailianWithCache(
      messages,
      undefined,
      this.config.temperature ?? 0
    );
    return response.content ?? "";
  }

  protected buildSystemPrompt(): string {
    return this.config.systemPrompt;
  }

  abstract run(query: string, context?: string): Promise<AgentRunResult>;
}
