import { describe, it, expect, beforeEach } from "vitest";
import {
  createSingleAgentGraph,
  createMultiAgentRouterGraph,
  createSupervisorGraph,
  createGraph,
  LANGGRAPH_PATTERNS,
  PATTERN_DESCRIPTIONS,
} from "../langgraph-patterns";
import type { LangGraphPattern } from "../langgraph-patterns";

describe("LangGraph Patterns", () => {
  const patterns: LangGraphPattern[] = [
    LANGGRAPH_PATTERNS.SINGLE_AGENT,
    LANGGRAPH_PATTERNS.MULTI_AGENT_ROUTER,
    LANGGRAPH_PATTERNS.SUPERVISOR,
  ];

  describe("Graph Creation", () => {
    it.each(patterns)("should create %s graph", (pattern) => {
      const graph = createGraph(pattern);
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe("function");
    });

    it("should throw for unknown pattern", () => {
      expect(() => createGraph("unknown" as LangGraphPattern)).toThrow("Unknown pattern");
    });
  });

  describe("Pattern Descriptions", () => {
    it("should have descriptions for all patterns", () => {
      for (const pattern of patterns) {
        const desc = PATTERN_DESCRIPTIONS[pattern];
        expect(desc).toBeDefined();
        expect(desc.name).toBeTruthy();
        expect(desc.description).toBeTruthy();
        expect(desc.nodes.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("Single Agent Pattern", () => {
    it("should have researcher and compliance nodes", () => {
      const desc = PATTERN_DESCRIPTIONS[LANGGRAPH_PATTERNS.SINGLE_AGENT];
      expect(desc.nodes).toContain("researcher");
      expect(desc.nodes).toContain("compliance");
    });
  });

  describe("Multi Agent Router Pattern", () => {
    it("should have researcher, quant, and compliance nodes", () => {
      const desc = PATTERN_DESCRIPTIONS[LANGGRAPH_PATTERNS.MULTI_AGENT_ROUTER];
      expect(desc.nodes).toContain("researcher");
      expect(desc.nodes).toContain("quant");
      expect(desc.nodes).toContain("compliance");
    });
  });

  describe("Supervisor Pattern", () => {
    it("should have researcher, quant, synthesizer, and compliance nodes", () => {
      const desc = PATTERN_DESCRIPTIONS[LANGGRAPH_PATTERNS.SUPERVISOR];
      expect(desc.nodes).toContain("researcher");
      expect(desc.nodes).toContain("quant");
      expect(desc.nodes).toContain("synthesizer");
      expect(desc.nodes).toContain("compliance");
    });
  });

  describe("3 Patterns Coverage", () => {
    it("should have exactly 3 patterns", () => {
      expect(patterns.length).toBe(3);
    });

    it("should cover all pattern types", () => {
      expect(LANGGRAPH_PATTERNS.SINGLE_AGENT).toBe("single-agent");
      expect(LANGGRAPH_PATTERNS.MULTI_AGENT_ROUTER).toBe("multi-agent-router");
      expect(LANGGRAPH_PATTERNS.SUPERVISOR).toBe("supervisor");
    });
  });
});