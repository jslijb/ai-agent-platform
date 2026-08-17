import { Annotation, StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { COMPLIANCE_REFUSAL } from "./refusal";

const AgentState = Annotation.Root({
  messages: Annotation<Record<string, unknown>[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  query: Annotation<string>,
  context: Annotation<string>,
  answer: Annotation<string>,
  agentType: Annotation<string>,
  iterations: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
});

type AgentStateType = typeof AgentState.State;

async function researcherNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const query = state.query;
  const { hybridSearch } = await import("@/server/rag/retrieval/hybrid-retriever");
  const results = await hybridSearch(query, 5);
  const context = results.map((r, i) => `[${i + 1}] ${r.text}`).join("\n\n");
  return { context, agentType: "researcher", iterations: state.iterations + 1 };
}

async function quantNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const query = state.query;
  const { ToolRegistry } = await import("@/server/tools/registry");
  const tool = ToolRegistry.get("technicalAnalysis");
  let answer = "量化分析暂无数据";
  if (tool) {
    try {
      const result = await tool.execute({ indicator: "ma", query });
      answer = typeof result === "string" ? result : JSON.stringify(result);
    } catch {
      answer = "量化分析执行失败";
    }
  }
  return { answer, agentType: "quant", iterations: state.iterations + 1 };
}

async function complianceNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { answer } = state;
  const forbidden = ["内幕交易", "操纵市场", "违规"];
  const violated = forbidden.find((f) => answer.includes(f));
  if (violated) {
    return {
      answer: COMPLIANCE_REFUSAL,
      agentType: "compliance",
      iterations: state.iterations + 1,
    };
  }
  return { agentType: "compliance", iterations: state.iterations + 1 };
}

function routeToAgent(state: AgentStateType): string {
  const query = state.query;
  if (/技术指标|MA|RSI|MACD|KDJ|布林|均线/i.test(query)) {
    return "quant";
  }
  return "researcher";
}

export function createSingleAgentGraph() {
  const graph = new StateGraph(AgentState)
    .addNode("researcher", researcherNode)
    .addNode("compliance", complianceNode)
    .addEdge(START, "researcher")
    .addEdge("researcher", "compliance")
    .addEdge("compliance", END);

  return graph.compile({ checkpointer: new MemorySaver() });
}

export function createMultiAgentRouterGraph() {
  const graph = new StateGraph(AgentState)
    .addNode("researcher", researcherNode)
    .addNode("quant", quantNode)
    .addNode("compliance", complianceNode)
    .addConditionalEdges(START, routeToAgent, { researcher: "researcher", quant: "quant" })
    .addEdge("researcher", "compliance")
    .addEdge("quant", "compliance")
    .addEdge("compliance", END);

  return graph.compile({ checkpointer: new MemorySaver() });
}

async function supervisorRouter(state: AgentStateType): Promise<string> {
  if (state.iterations >= 3) {
    return "compliance";
  }
  if (!state.context && !state.answer) {
    return routeToAgent(state);
  }
  if (state.context && !state.answer) {
    return "synthesizer";
  }
  return "compliance";
}

async function synthesizerNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { callWithFallback } = await import("@/server/llm/router");
  const messages = [
    { role: "user" as const, content: `基于以下信息回答问题：\n\n问题：${state.query}\n\n信息：${state.context}\n\n请给出专业、准确的回答。` },
  ];
  const result = await callWithFallback(messages);
  const answer = typeof result === "string" ? result : (result as { content: string }).content || "";
  return { answer, agentType: "synthesizer", iterations: state.iterations + 1 };
}

export function createSupervisorGraph() {
  const graph = new StateGraph(AgentState)
    .addNode("researcher", researcherNode)
    .addNode("quant", quantNode)
    .addNode("synthesizer", synthesizerNode)
    .addNode("compliance", complianceNode)
    .addConditionalEdges(START, supervisorRouter, {
      researcher: "researcher",
      quant: "quant",
      synthesizer: "synthesizer",
      compliance: "compliance",
    })
    .addConditionalEdges("researcher", supervisorRouter, {
      researcher: "researcher",
      quant: "quant",
      synthesizer: "synthesizer",
      compliance: "compliance",
    })
    .addConditionalEdges("quant", supervisorRouter, {
      researcher: "researcher",
      quant: "quant",
      synthesizer: "synthesizer",
      compliance: "compliance",
    })
    .addConditionalEdges("synthesizer", supervisorRouter, {
      researcher: "researcher",
      quant: "quant",
      synthesizer: "synthesizer",
      compliance: "compliance",
    })
    .addEdge("compliance", END);

  return graph.compile({ checkpointer: new MemorySaver() });
}

export const LANGGRAPH_PATTERNS = {
  SINGLE_AGENT: "single-agent",
  MULTI_AGENT_ROUTER: "multi-agent-router",
  SUPERVISOR: "supervisor",
} as const;

export type LangGraphPattern = (typeof LANGGRAPH_PATTERNS)[keyof typeof LANGGRAPH_PATTERNS];

export function createGraph(pattern: LangGraphPattern) {
  switch (pattern) {
    case LANGGRAPH_PATTERNS.SINGLE_AGENT:
      return createSingleAgentGraph();
    case LANGGRAPH_PATTERNS.MULTI_AGENT_ROUTER:
      return createMultiAgentRouterGraph();
    case LANGGRAPH_PATTERNS.SUPERVISOR:
      return createSupervisorGraph();
    default:
      throw new Error(`Unknown pattern: ${pattern}`);
  }
}

export const PATTERN_DESCRIPTIONS: Record<LangGraphPattern, { name: string; description: string; nodes: string[] }> = {
  [LANGGRAPH_PATTERNS.SINGLE_AGENT]: {
    name: "单Agent模式",
    description: "Researcher检索→Compliance合规检查→输出",
    nodes: ["researcher", "compliance"],
  },
  [LANGGRAPH_PATTERNS.MULTI_AGENT_ROUTER]: {
    name: "多Agent路由模式",
    description: "根据query类型路由到Researcher或Quant→Compliance→输出",
    nodes: ["researcher", "quant", "compliance"],
  },
  [LANGGRAPH_PATTERNS.SUPERVISOR]: {
    name: "Supervisor模式",
    description: "Supervisor动态调度Researcher/Quant/Synthesizer→Compliance→输出",
    nodes: ["researcher", "quant", "synthesizer", "compliance"],
  },
};