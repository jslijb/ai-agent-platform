/**
 * 统一用户友好错误消息模块
 * 将技术性错误信息转换为中文用户可理解的提示
 */

/** 错误码 → 用户友好消息映射 */
const ERROR_MESSAGES: Record<string, string> = {
  // 通用错误
  "UNKNOWN_ERROR": "服务暂时异常，请稍后重试",
  "INVALID_REQUEST": "请求参数有误，请检查后重试",
  "RATE_LIMITED": "请求过于频繁，请稍后再试",
  "UNAUTHORIZED": "请先登录后再操作",
  "FORBIDDEN": "您没有权限执行此操作",

  // RAG / 检索相关
  "RAG_SERVICE_UNAVAILABLE": "检索服务暂时不可用，请稍后重试",
  "RAG_SEARCH_FAILED": "检索服务异常，无法获取相关文档",
  "RAG_NO_RESULTS": "未找到相关文档，请尝试换个关键词",
  "RAG_SERVICE_ERROR": "检索服务出现错误，请稍后重试",

  // LLM / 模型相关
  "LLM_SERVICE_UNAVAILABLE": "AI 模型服务暂时不可用，请稍后重试",
  "LLM_CALL_FAILED": "AI 模型调用失败，请稍后重试",
  "LLM_ALL_MODELS_FAILED": "所有 AI 模型均不可用，请稍后重试",
  "LLM_TIMEOUT": "AI 模型响应超时，请稍后重试",
  "LLM_RATE_LIMITED": "AI 模型调用已达上限，请稍后重试",
  "LLM_QUOTA_EXCEEDED": "AI 模型额度已用完，请联系管理员",

  // 评估相关
  "EVALUATION_SERVICE_UNAVAILABLE": "评估服务暂时不可用，请稍后重试",
  "EVALUATION_TASK_FAILED": "评估任务执行失败，请稍后重试",

  // 数据服务相关
  "DATA_SERVICE_UNAVAILABLE": "数据服务暂时不可用，请稍后重试",
  "DATA_FETCH_FAILED": "数据获取失败，请稍后重试",

  // 数据库相关
  "DATABASE_UNAVAILABLE": "数据库连接异常，请稍后重试",
  "DATABASE_QUERY_FAILED": "数据查询失败，请稍后重试",

  // 文档相关
  "DOCUMENT_UPLOAD_FAILED": "文档上传失败，请检查文件格式后重试",
  "DOCUMENT_PARSE_FAILED": "文档解析失败，请检查文件是否损坏",
  "DOCUMENT_NOT_FOUND": "文档不存在或已被删除",

  // 嵌入服务相关
  "EMBEDDING_SERVICE_UNAVAILABLE": "向量化服务暂时不可用，请稍后重试",

  // 图谱相关
  "GRAPH_SERVICE_UNAVAILABLE": "知识图谱服务暂时不可用，请稍后重试",
};

/** 从技术错误信息推断错误码 */
function inferErrorCode(error: string): string {
  const lower = error.toLowerCase();

  // RAG 相关
  if (lower.includes("rag")) {
    if (lower.includes("unavailable") || lower.includes("econnrefused") || lower.includes("timeout")) {
      return "RAG_SERVICE_UNAVAILABLE";
    }
    if (lower.includes("business error") || lower.includes("failed")) {
      return "RAG_SEARCH_FAILED";
    }
    return "RAG_SERVICE_ERROR";
  }

  // LLM 相关
  if (lower.includes("llm") || lower.includes("model") || lower.includes("qwen")) {
    if (lower.includes("unavailable") || lower.includes("econnrefused") || lower.includes("timeout")) {
      return "LLM_SERVICE_UNAVAILABLE";
    }
    if (lower.includes("all models") || lower.includes("all fallback")) {
      return "LLM_ALL_MODELS_FAILED";
    }
    if (lower.includes("429") || lower.includes("rate limit")) {
      return "LLM_RATE_LIMITED";
    }
    if (lower.includes("quota") || lower.includes("额度")) {
      return "LLM_QUOTA_EXCEEDED";
    }
    return "LLM_CALL_FAILED";
  }

  // 评估相关
  if (lower.includes("evaluation") || lower.includes("eval")) {
    if (lower.includes("unavailable") || lower.includes("econnrefused")) {
      return "EVALUATION_SERVICE_UNAVAILABLE";
    }
    return "EVALUATION_TASK_FAILED";
  }

  // 数据服务相关
  if (lower.includes("data service") || lower.includes("data-service")) {
    return "DATA_SERVICE_UNAVAILABLE";
  }

  // 数据库相关
  if (lower.includes("database") || lower.includes("postgres") || lower.includes("sql") || lower.includes("drizzle")) {
    if (lower.includes("connect") || lower.includes("econnrefused")) {
      return "DATABASE_UNAVAILABLE";
    }
    return "DATABASE_QUERY_FAILED";
  }

  // 嵌入服务
  if (lower.includes("embedding") || lower.includes("vectorize")) {
    return "EMBEDDING_SERVICE_UNAVAILABLE";
  }

  // 图谱
  if (lower.includes("neo4j") || lower.includes("graph")) {
    return "GRAPH_SERVICE_UNAVAILABLE";
  }

  return "UNKNOWN_ERROR";
}

/**
 * 获取用户友好的错误消息
 * @param errorCode 错误码，或技术错误信息（自动推断）
 * @param fallback 当无法匹配时的默认消息
 */
export function getUserMessage(errorCode: string, fallback?: string): string {
  // 先尝试直接匹配错误码
  if (ERROR_MESSAGES[errorCode]) {
    return ERROR_MESSAGES[errorCode];
  }

  // 尝试从技术错误信息推断
  const inferredCode = inferErrorCode(errorCode);
  if (ERROR_MESSAGES[inferredCode]) {
    return ERROR_MESSAGES[inferredCode];
  }

  return fallback || ERROR_MESSAGES["UNKNOWN_ERROR"];
}

/**
 * 格式化 API 错误响应
 * 返回给前端的统一错误格式
 */
export function formatErrorResponse(
  error: unknown,
  options?: { statusCode?: number; fallbackMessage?: string }
): { success: false; answer: string; error: string; errorCode: string } {
  const technicalMessage = error instanceof Error ? error.message : String(error);
  const userMessage = getUserMessage(technicalMessage, options?.fallbackMessage);
  const errorCode = inferErrorCode(technicalMessage);

  return {
    success: false,
    answer: "",
    error: userMessage,
    errorCode,
  };
}

/**
 * 脱敏技术错误信息（用于日志）
 * 移除可能包含敏感信息的细节
 */
export function sanitizeTechnicalError(message: string): string {
  return message
    .replace(/api[_-]?key[=:]\s*\S+/gi, "api_key=***")
    .replace(/token[=:]\s*\S+/gi, "token=***")
    .replace(/password[=:]\s*\S+/gi, "password=***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/sk-[a-zA-Z0-9]+/g, "sk-***");
}
