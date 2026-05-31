import { describe, it, expect } from "vitest";
import { TOOL_NAME_ALIASES, resolveToolName } from "../tools/name-aliases";

describe("TOOL_NAME_ALIASES", () => {
  it("maps getMA to calculateMA", () => {
    expect(TOOL_NAME_ALIASES.getMA).toBe("calculateMA");
  });

  it("maps getMACD to calculateMACD", () => {
    expect(TOOL_NAME_ALIASES.getMACD).toBe("calculateMACD");
  });

  it("maps getFinancialData to getStockFinancial", () => {
    expect(TOOL_NAME_ALIASES.getFinancialData).toBe("getStockFinancial");
  });

  it("maps checkCompliance to checkTradeCompliance", () => {
    expect(TOOL_NAME_ALIASES.checkCompliance).toBe("checkTradeCompliance");
  });
});

describe("resolveToolName", () => {
  const registry = {
    has: (n: string) => ["calculateMA", "calculateMACD", "getStockFinancial"].includes(n),
  };

  it("returns name directly if in registry", () => {
    expect(resolveToolName("calculateMA", registry)).toBe("calculateMA");
  });

  it("resolves alias to canonical name", () => {
    expect(resolveToolName("getMA", registry)).toBe("calculateMA");
  });

  it("resolves another alias", () => {
    expect(resolveToolName("getMACD", registry)).toBe("calculateMACD");
  });

  it("returns original name if no alias and not in registry", () => {
    expect(resolveToolName("unknownTool", registry)).toBe("unknownTool");
  });

  it("returns original name if alias target not in registry", () => {
    const smallRegistry = { has: () => false };
    expect(resolveToolName("getMA", smallRegistry)).toBe("getMA");
  });
});
