import { toolGroupManager } from "../../routing/tool-group-manager";
import type { ToolGroupConfig } from "../../routing/types";
import { ToolVectorRetriever } from "../../retrieval/tool-vector-retriever";
import { EmbeddingService } from "../../retrieval/embedding-service";
import { ToolRegistry } from "../../tools/registry";

export interface GroupRouteResult {
  matchedGroups: ToolGroupConfig[];
  routeType: "group" | "full_fallback";
  mergedToolNames: string[];
}

const GROUP_KEYWORDS: Record<string, string[]> = {
  "market-data": ["股价", "行情", "K线", "实时", "交易数据", "分钟", "逐笔", "指数", "板块", "行业"],
  "fundamental-data": ["估值", "PE", "PB", "分红", "财报日", "内幕", "股东", "高管", "公司概况"],
  "technical-analysis": ["MA", "MACD", "RSI", "布林带", "KDJ", "VWAP", "夏普", "回撤", "波动率", "相关性", "技术指标", "技术分析", "均线"],
  "risk-compliance": ["合规", "风控", "VaR", "压力测试", "风险限额", "受限", "持仓限制"],
  "paper-trading": ["下单", "买入", "卖出", "模拟", "委托", "持仓", "账户"],
  "knowledge-documents": ["搜索", "检索", "PDF", "文档", "研报", "摘要", "图片", "截图", "OCR"],
};

export class GroupRouterAgent {
  private vectorRetriever = new ToolVectorRetriever();
  private vectorIndexBuilt = false;

  async buildVectorIndex(): Promise<void> {
    try {
      await this.vectorRetriever.buildIndex();
      this.vectorIndexBuilt = true;
      console.log("[GroupRouterAgent] 工具向量索引构建成功");
    } catch (err) {
      console.warn(
        `[GroupRouterAgent] 工具向量索引构建失败，降级到关键词匹配: ${err instanceof Error ? err.message : String(err)}`
      );
      this.vectorIndexBuilt = false;
    }
  }

  route(
    query: string,
    candidateGroups?: string[]
  ): GroupRouteResult {
    const lowerQuery = query.toLowerCase();
    const scoredGroups: Array<{ group: ToolGroupConfig; score: number }> = [];

    const allGroups = candidateGroups
      ? candidateGroups
          .map((id) => toolGroupManager.getGroup(id))
          .filter((g): g is ToolGroupConfig => g !== undefined)
      : toolGroupManager.getAllGroups();

    for (const group of allGroups) {
      const keywords = GROUP_KEYWORDS[group.groupId] || [];
      let score = 0;
      for (const kw of keywords) {
        if (lowerQuery.includes(kw.toLowerCase())) {
          score += 2;
        }
      }
      for (const toolName of group.tools) {
        const toolLower = toolName.toLowerCase();
        if (lowerQuery.includes(toolLower)) {
          score += 3;
        }
      }
      for (const word of group.description.toLowerCase().split(/\s+/)) {
        if (word.length >= 2 && lowerQuery.includes(word)) {
          score += 1;
        }
      }
      if (score > 0) {
        scoredGroups.push({ group, score });
      }
    }

    if (scoredGroups.length === 0) {
      return {
        matchedGroups: [],
        routeType: "full_fallback",
        mergedToolNames: [],
      };
    }

    scoredGroups.sort((a, b) => b.score - a.score);
    const matchedGroups = scoredGroups.map((sg) => sg.group);
    const mergedToolNames = matchedGroups.flatMap((g) => g.tools);

    return {
      matchedGroups,
      routeType: "group",
      mergedToolNames,
    };
  }

  async routeWithVector(
    query: string,
    candidateGroups?: string[]
  ): Promise<GroupRouteResult> {
    const keywordResult = this.route(query, candidateGroups);

    if (keywordResult.matchedGroups.length > 0) {
      try {
        const embeddingService = new EmbeddingService();
        if (await embeddingService.checkReady() && this.vectorIndexBuilt && this.vectorRetriever.isReady()) {
          const groupIds = keywordResult.matchedGroups.map((g) => g.groupId);
          const vectorResults = await this.vectorRetriever.retrieve(query, 8, groupIds);
          if (vectorResults.length > 0) {
            const refinedTools = vectorResults.map((r) => r.toolName);
            const originalTools = keywordResult.mergedToolNames;
            const mergedToolNames = Array.from(new Set([...refinedTools, ...originalTools]));
            console.log(
              `[GroupRouterAgent] 组内向量检索补充工具: 向量=${refinedTools.length}, 关键词=${originalTools.length}, 合并=${mergedToolNames.length}`
            );
            return {
              ...keywordResult,
              mergedToolNames,
            };
          }
        }
      } catch (err) {
        console.warn(
          `[GroupRouterAgent] 组内向量检索失败，降级到全量工具: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return keywordResult;
  }
}
