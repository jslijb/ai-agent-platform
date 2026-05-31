import type { EnhancedToolDescription, ToolExampleCall } from "./types";

export class ToolDescriptionEnhancer {
  private descriptions: Map<string, EnhancedToolDescription> = new Map();

  load(descriptions: EnhancedToolDescription[]): void {
    for (const desc of descriptions) {
      this.descriptions.set(desc.name, desc);
    }
  }

  get(toolName: string): EnhancedToolDescription | undefined {
    return this.descriptions.get(toolName);
  }

  formatForPrompt(toolNames?: string[]): string {
    const descs = toolNames
      ? toolNames
          .map((n) => this.descriptions.get(n))
          .filter((d): d is EnhancedToolDescription => d !== undefined)
      : Array.from(this.descriptions.values());

    return descs
      .map(
        (d) =>
          `- ${d.name} [${d.groupId}]: ${d.description}\n  何时使用: ${d.whenToUse}\n  何时不使用: ${d.whenNotToUse}\n  示例: ${d.exampleCalls.map((e) => `${d.name}(${JSON.stringify(e.parameters)})`).join(", ")}`
      )
      .join("\n\n");
  }
}

export const toolDescriptionEnhancer = new ToolDescriptionEnhancer();

import { TOOL_ENHANCED_DESCRIPTIONS } from "./tool-enhanced-descriptions";
toolDescriptionEnhancer.load(TOOL_ENHANCED_DESCRIPTIONS);
