import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isLangSmithEnabled,
  getLangSmithConfig,
  traceFunction,
  TRACE_NAMES,
  startTrace,
  endTrace,
} from "../langsmith";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.LANGSMITH_ENABLED;
  delete process.env.LANGSMITH_API_KEY;
  delete process.env.LANGSMITH_PROJECT;
  delete process.env.LANGSMITH_ENDPOINT;
});

describe("LangSmith Integration", () => {
  describe("Configuration", () => {
    it("should be disabled by default", () => {
      expect(isLangSmithEnabled()).toBe(false);
    });

    it("should be disabled when only LANGSMITH_ENABLED is set", () => {
      process.env.LANGSMITH_ENABLED = "true";
      expect(isLangSmithEnabled()).toBe(false);
    });

    it("should be enabled when both LANGSMITH_ENABLED and API_KEY are set", () => {
      process.env.LANGSMITH_ENABLED = "true";
      process.env.LANGSMITH_API_KEY = "test-key";
      expect(isLangSmithEnabled()).toBe(true);
    });

    it("should return correct config", () => {
      const config = getLangSmithConfig();
      expect(config).toHaveProperty("enabled");
      expect(config).toHaveProperty("project");
      expect(config).toHaveProperty("endpoint");
      expect(config).toHaveProperty("apiKeyConfigured");
    });

    it("should use default project name", () => {
      const config = getLangSmithConfig();
      expect(config.project).toBe("ai-agent-platform");
    });

    it("should use custom project name", () => {
      process.env.LANGSMITH_PROJECT = "custom-project";
      const config = getLangSmithConfig();
      expect(config.project).toBe("custom-project");
    });
  });

  describe("Trace Names", () => {
    it("should have all required trace names", () => {
      expect(TRACE_NAMES.AGENT_FULL).toBe("agent.full_conversation");
      expect(TRACE_NAMES.AGENT_STEP).toBe("agent.step");
      expect(TRACE_NAMES.RAG_RETRIEVAL).toBe("rag.hybrid_search");
      expect(TRACE_NAMES.LLM_CALL).toBe("llm.call");
      expect(TRACE_NAMES.TOOL_CALL).toBe("tool.call");
      expect(TRACE_NAMES.MCP_CALL).toBe("mcp.tool_call");
      expect(TRACE_NAMES.COMPLIANCE_CHECK).toBe("compliance.check");
    });

    it("should have at least 10 trace names", () => {
      expect(Object.keys(TRACE_NAMES).length).toBeGreaterThanOrEqual(10);
    });
  });

  describe("traceFunction", () => {
    it("should execute function and return result when disabled", async () => {
      const result = await traceFunction(
        { name: "test", runType: "llm" },
        async () => "hello"
      );
      expect(result.result).toBe("hello");
      expect(result.traceResult.runId).toBe("disabled");
    });

    it("should propagate errors", async () => {
      await expect(
        traceFunction({ name: "test", runType: "llm" }, async () => {
          throw new Error("test error");
        })
      ).rejects.toThrow("test error");
    });

    it("should track duration", async () => {
      const result = await traceFunction(
        { name: "test", runType: "llm" },
        async () => "done"
      );
      expect(result.traceResult.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("startTrace / endTrace", () => {
    it("should return null when disabled", async () => {
      const run = await startTrace({ name: "test", runType: "llm" });
      expect(run).toBeNull();
    });

    it("should not throw when ending null trace", async () => {
      await expect(endTrace(null, "result")).resolves.toBeUndefined();
    });
  });
});