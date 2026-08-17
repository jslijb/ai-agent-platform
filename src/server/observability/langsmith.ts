import { RunTree, RunTreeConfig } from "langsmith";

function getEnv(key: string, fallback: string = ""): string {
  return process.env[key] || fallback;
}


export interface TraceConfig {
  name: string;
  runType: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  parentId?: string;
}

export interface TraceResult {
  runId: string;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export function isLangSmithEnabled(): boolean {
  return getEnv("LANGSMITH_ENABLED") === "true" && getEnv("LANGSMITH_API_KEY").length > 0;
}

export function createRunConfig(trace: TraceConfig): RunTreeConfig {
  return {
    name: trace.name,
    run_type: trace.runType as RunTreeConfig["run_type"],
    tags: trace.tags || [],
    extra: {
      metadata: {
        project: getEnv("LANGSMITH_PROJECT", "ai-agent-platform"),
        ...trace.metadata,
      },
    },
    ...(trace.parentId ? { parent_run_id: trace.parentId } : {}),
  };
}

export async function startTrace(trace: TraceConfig): Promise<RunTree | null> {
  if (!isLangSmithEnabled()) return null;

  try {
    const config = createRunConfig(trace);
    const run = new RunTree(config);
    await run.postRun();
    return run;
  } catch (err) {
    console.warn(`[langsmith] startTrace failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function endTrace(
  run: RunTree | null,
  output?: unknown,
  error?: string
): Promise<void> {
  if (!run) return;

  try {
    if (error) {
      run.error = error;
    }
    if (output !== undefined) {
      run.outputs = { result: output };
    }
    await run.end();
    await run.patchRun();
  } catch (err) {
    console.warn(`[langsmith] endTrace failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function traceFunction<T>(
  trace: TraceConfig,
  fn: () => Promise<T>
): Promise<{ result: T; traceResult: TraceResult }> {
  const startTime = Date.now();
  const run = await startTrace(trace);

  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    await endTrace(run, result);
    return {
      result,
      traceResult: { runId: run?.id ?? "disabled", output: result, durationMs },
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    await endTrace(run, undefined, errorMsg);
    throw err;
  }
}

export function getLangSmithConfig(): {
  enabled: boolean;
  project: string;
  endpoint: string;
  apiKeyConfigured: boolean;
} {
  return {
    enabled: isLangSmithEnabled(),
    project: getEnv("LANGSMITH_PROJECT", "ai-agent-platform"),
    endpoint: getEnv("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com"),
    apiKeyConfigured: getEnv("LANGSMITH_API_KEY").length > 0,
  };
}

export const TRACE_NAMES = {
  AGENT_FULL: "agent.full_conversation",
  AGENT_STEP: "agent.step",
  RAG_RETRIEVAL: "rag.hybrid_search",
  RAG_RERANK: "rag.rerank",
  RAG_GENERATION: "rag.generation",
  LLM_CALL: "llm.call",
  TOOL_CALL: "tool.call",
  MCP_CALL: "mcp.tool_call",
  GRAPH_QUERY: "graph.query",
  COMPLIANCE_CHECK: "compliance.check",
  CONTEXT_COMPACTION: "agent.context_compaction",
  CHECKPOINT_SAVE: "agent.checkpoint_save",
  SEMANTIC_CACHE: "cache.semantic_lookup",
} as const;

export type TraceName = (typeof TRACE_NAMES)[keyof typeof TRACE_NAMES];