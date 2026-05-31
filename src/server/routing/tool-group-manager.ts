import type { ToolGroupConfig, ValidationResult } from "./types";
import { TOOL_GROUP_CONFIGS } from "./group-configs";

export class ToolGroupManager {
  private groups: Map<string, ToolGroupConfig> = new Map();
  private toolToGroup: Map<string, string> = new Map();

  loadGroups(configs: ToolGroupConfig[] = TOOL_GROUP_CONFIGS): void {
    this.groups.clear();
    this.toolToGroup.clear();
    for (const config of configs) {
      this.groups.set(config.groupId, config);
      for (const toolName of config.tools) {
        this.toolToGroup.set(toolName, config.groupId);
      }
    }
  }

  getGroup(groupId: string): ToolGroupConfig | undefined {
    return this.groups.get(groupId);
  }

  getGroupForTool(toolName: string): ToolGroupConfig | undefined {
    const groupId = this.toolToGroup.get(toolName);
    if (!groupId) return undefined;
    return this.groups.get(groupId);
  }

  getToolsInGroup(groupId: string): string[] {
    return this.groups.get(groupId)?.tools || [];
  }

  getGroupsForTools(toolNames: string[]): ToolGroupConfig[] {
    const groupIds = new Set<string>();
    for (const name of toolNames) {
      const gid = this.toolToGroup.get(name);
      if (gid) groupIds.add(gid);
    }
    return Array.from(groupIds)
      .map((id) => this.groups.get(id)!)
      .filter(Boolean);
  }

  getAllGroups(): ToolGroupConfig[] {
    return Array.from(this.groups.values()).sort(
      (a, b) => a.priority - b.priority
    );
  }

  validateConfig(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const toolCounts = new Map<string, number>();

    for (const [tool, group] of Array.from(this.toolToGroup.entries())) {
      const count = (toolCounts.get(tool) || 0) + 1;
      toolCounts.set(tool, count);
      if (count > 1) {
        errors.push(
          `工具 "${tool}" 属于多个分组: 至少出现在 "${group}" 和其他分组中`
        );
      }
    }

    for (const group of Array.from(this.groups.values())) {
      if (group.tools.length < 5) {
        warnings.push(
          `分组 "${group.groupId}" 工具数(${group.tools.length})少于5个`
        );
      }
      if (group.tools.length > 12) {
        warnings.push(
          `分组 "${group.groupId}" 工具数(${group.tools.length})超过12个`
        );
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

export const toolGroupManager = new ToolGroupManager();
toolGroupManager.loadGroups();
