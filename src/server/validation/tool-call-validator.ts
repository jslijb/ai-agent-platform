import { ToolRegistry } from "../tools/registry";

export type ValidationErrorType =
  | "missing"
  | "invalid_type"
  | "out_of_range"
  | "unknown_tool";

export interface ValidationError {
  field: string;
  type: ValidationErrorType;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  suggestion?: string;
}

export class ToolCallValidator {
  validate(
    toolName: string,
    params: Record<string, unknown>
  ): ValidationResult {
    const errors: ValidationError[] = [];

    const tool = ToolRegistry.get(toolName);
    if (!tool) {
      errors.push({
        field: "toolName",
        type: "unknown_tool",
        message: `工具 "${toolName}" 不存在`,
      });
      return {
        valid: false,
        errors,
        suggestion: `请检查工具名是否正确。可用工具: ${ToolRegistry.listNames().slice(0, 10).join(", ")}`,
      };
    }

    const toolParams = tool.parameters as Record<
      string,
      { type?: string; description?: string; required?: boolean }
    >;

    for (const [key, schema] of Object.entries(toolParams)) {
      if (schema.required && (params[key] === undefined || params[key] === null)) {
        errors.push({
          field: key,
          type: "missing",
          message: `必填参数 "${key}" 缺失`,
        });
      }
    }

    if (errors.length > 0) {
      return {
        valid: false,
        errors,
        suggestion: `缺少必填参数: ${errors.map((e) => e.field).join(", ")}`,
      };
    }

    return { valid: true, errors: [] };
  }
}
