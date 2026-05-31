import type { BailianMessage, BailianTool, BailianToolCall } from "@/server/llm/providers/bailian";
import { callWithFallback } from "@/server/llm/router";
import { ToolCallValidator } from "@/server/validation/tool-call-validator";
import { CallLimiter } from "@/server/validation/call-limiter";
import { ToolRegistry } from "@/server/tools/registry";

export interface ReActConfig {
  maxIterations: number;
  maxToolCalls: number;
  validationRetryLimit: number;
}

const DEFAULT_REACT_CONFIG: ReActConfig = {
  maxIterations: 5,
  maxToolCalls: 15,
  validationRetryLimit: 3,
};

export interface ReActStep {
  type: "thinking" | "tool_call" | "tool_result" | "error" | "answer";
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  error?: string;
  timestamp: number;
}

export interface ReActResult {
  answer: string;
  steps: ReActStep[];
  iterations: number;
  toolCallCount: number;
}

function convertToBailianTools(toolNames: string[]): BailianTool[] {
  return toolNames
    .map((name) => {
      const tool = ToolRegistry.get(name);
      if (!tool) return null;
      return {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as Record<string, unknown>,
        },
      };
    })
    .filter((t): t is BailianTool => t !== null);
}

export class EnhancedReActExecutor {
  private validator = new ToolCallValidator();
  private limiter: CallLimiter;
  private config: ReActConfig;

  constructor(config?: Partial<ReActConfig>) {
    this.config = { ...DEFAULT_REACT_CONFIG, ...config };
    this.limiter = new CallLimiter({
      maxToolCalls: this.config.maxToolCalls,
      validationRetryLimit: this.config.validationRetryLimit,
    });
  }

  async run(
    query: string,
    availableTools: string[],
    systemPrompt: string,
    messages: BailianMessage[],
    pushStep?: (step: ReActStep) => void
  ): Promise<ReActResult> {
    const steps: ReActStep[] = [];
    const bailianTools = convertToBailianTools(availableTools);
    let iterations = 0;

    const emit = (step: ReActStep) => {
      steps.push(step);
      pushStep?.(step);
    };

    this.limiter.reset();

    for (let i = 0; i < this.config.maxIterations; i++) {
      iterations++;

      try {
        const response = await callWithFallback(
          messages,
          undefined,
          bailianTools.length > 0,
          bailianTools.length > 0 ? bailianTools : undefined
        );

        const assistantContent = response.content ?? "";
        const toolCalls = response.toolCalls;

        messages.push({
          role: "assistant",
          content: assistantContent,
          tool_calls: toolCalls,
        });

        if (!toolCalls || toolCalls.length === 0) {
          emit({
            type: "answer",
            content: assistantContent,
            timestamp: Date.now(),
          });
          return { answer: assistantContent, steps, iterations, toolCallCount: this.limiter.getCount() };
        }

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          let toolParams: Record<string, unknown>;
          try {
            toolParams = JSON.parse(toolCall.function.arguments);
          } catch {
            toolParams = {};
          }

          emit({
            type: "tool_call",
            content: `调用 ${toolName}`,
            toolName,
            toolParams,
            timestamp: Date.now(),
          });

          const validationResult = this.validator.validate(toolName, toolParams);

          if (!validationResult.valid) {
            let corrected = false;
            for (let retry = 0; retry < this.config.validationRetryLimit; retry++) {
              const correctionPrompt = `工具调用校验失败: ${validationResult.errors.map((e) => e.message).join("; ")}\n建议: ${validationResult.suggestion || ""}\n请修正工具调用参数。`;

              messages.push({
                role: "tool",
                content: correctionPrompt,
                tool_call_id: toolCall.id,
              });

              const correctionResponse = await callWithFallback(
                messages,
                undefined,
                bailianTools.length > 0,
                bailianTools.length > 0 ? bailianTools : undefined
              );

              if (correctionResponse.toolCalls && correctionResponse.toolCalls.length > 0) {
                const correctedCall = correctionResponse.toolCalls[0];
                try {
                  const correctedParams = JSON.parse(correctedCall.function.arguments);
                  const revalidation = this.validator.validate(correctedCall.function.name, correctedParams);
                  if (revalidation.valid) {
                    toolParams = correctedParams;
                    corrected = true;
                    break;
                  }
                } catch {
                  continue;
                }
              }
            }

            if (!corrected) {
              const errorMsg = `工具调用校验失败且修正超限: ${validationResult.errors.map((e) => e.message).join("; ")}`;
              emit({
                type: "error",
                content: errorMsg,
                toolName,
                error: errorMsg,
                timestamp: Date.now(),
              });
              messages.push({
                role: "tool",
                content: `错误: ${errorMsg}`,
                tool_call_id: toolCall.id,
              });
              continue;
            }
          }

          if (!this.limiter.canCall()) {
            emit({
              type: "error",
              content: `已达到最大工具调用次数限制 (${this.config.maxToolCalls})`,
              timestamp: Date.now(),
            });
            return {
              answer: assistantContent || "工具调用次数已达上限，基于已有信息给出回答。",
              steps,
              iterations,
              toolCallCount: this.limiter.getCount(),
            };
          }

          try {
            const tool = ToolRegistry.get(toolName);
            if (!tool) {
              throw new Error(`工具 "${toolName}" 不存在`);
            }

            const { result, limitReached, fromCache } =
              await this.limiter.executeWithLimit(
                toolName,
                toolParams,
                () => Promise.resolve(tool.execute(toolParams))
              );

            if (limitReached) {
              emit({
                type: "error",
                content: "工具调用次数限制已达上限",
                timestamp: Date.now(),
              });
              break;
            }

            const resultStr =
              typeof result === "string" ? result : JSON.stringify(result, null, 2);
            const cacheNote = fromCache ? " (from cache)" : "";

            emit({
              type: "tool_result",
              content: `${toolName} 结果${cacheNote}: ${resultStr.substring(0, 200)}...`,
              toolName,
              timestamp: Date.now(),
            });

            messages.push({
              role: "tool",
              content: resultStr,
              tool_call_id: toolCall.id,
            });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            emit({
              type: "error",
              content: `工具 ${toolName} 执行失败: ${errorMsg}`,
              toolName,
              error: errorMsg,
              timestamp: Date.now(),
            });
            messages.push({
              role: "tool",
              content: `错误: 工具 ${toolName} 执行失败 - ${errorMsg}`,
              tool_call_id: toolCall.id,
            });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        emit({
          type: "error",
          content: `LLM调用失败: ${errorMsg}`,
          error: errorMsg,
          timestamp: Date.now(),
        });

        messages.push({
          role: "user",
          content: `系统错误: ${errorMsg}，请基于已有信息继续回答。`,
        });
      }
    }

    const lastAssistantMsg = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const answer = lastAssistantMsg?.content || "超过最大迭代次数，未能得出结论。";

    return { answer, steps, iterations, toolCallCount: this.limiter.getCount() };
  }
}
