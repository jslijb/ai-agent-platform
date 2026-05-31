import type { RegisteredTool } from "../agents/skills/types";
import { TOOL_NAME_ALIASES, resolveToolName } from "./name-aliases";

class ToolRegistryClass {
  private tools: Map<string, RegisteredTool> = new Map();
  private nameAliases: Map<string, string> = new Map(
    Object.entries(TOOL_NAME_ALIASES)
  );

  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] 工具 "${tool.name}" 已注册，跳过重复注册`);
      return;
    }
    this.tools.set(tool.name, tool);
    const categoryInfo = tool.category ? ` [${tool.category}]` : "";
    console.log(`[ToolRegistry] 注册工具: ${tool.name}${categoryInfo}`);
  }

  registerAlias(oldName: string, newName: string): void {
    this.nameAliases.set(oldName, newName);
  }

  get(name: string): RegisteredTool | undefined {
    const direct = this.tools.get(name);
    if (direct) return direct;
    const alias = this.nameAliases.get(name);
    if (alias) {
      const resolved = this.tools.get(alias);
      if (resolved) {
        console.warn(
          `[ToolRegistry] 工具名 "${name}" 已废弃，请使用 "${alias}"`
        );
      }
      return resolved;
    }
    return undefined;
  }

  list(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  listByGroup(groupId: string): RegisteredTool[] {
    return Array.from(this.tools.values()).filter(
      (t) => t.category === groupId
    );
  }

  has(name: string): boolean {
    if (this.tools.has(name)) return true;
    const alias = this.nameAliases.get(name);
    return alias !== undefined && this.tools.has(alias);
  }

  size(): number {
    return this.tools.size;
  }

  getDescriptions(): string {
    return Array.from(this.tools.values())
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");
  }

  getEnhancedDescriptions(toolNames?: string[]): string {
    const tools = toolNames
      ? toolNames
          .map((n) => this.get(n))
          .filter((t): t is RegisteredTool => t !== undefined)
      : this.list();
    return tools
      .map(
        (t) =>
          `- ${t.name}${t.category ? ` [${t.category}]` : ""}: ${t.description}`
      )
      .join("\n");
  }

  resolveName(name: string): string {
    return resolveToolName(name, this);
  }
}

export const ToolRegistry = new ToolRegistryClass();
