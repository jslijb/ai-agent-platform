export interface RAGRetrieveRequest {
  query: string;
  topK?: number;
  options?: Record<string, unknown>;
}

export interface RAGRetrieveResponse {
  success: boolean;
  results: Array<{
    text: string;
    documentId: string;
    score: number;
    denseScore?: number;
    sparseScore?: number;
  }>;
  latencyMs: number;
  error?: string;
}

export interface RAGEmbedRequest {
  texts: string[];
}

export interface RAGEmbedResponse {
  embeddings: number[][];
  error?: string;
}

export interface RAGRerankRequest {
  query: string;
  documents: string[];
  topK?: number;
}

export interface RAGRerankResponse {
  results: Array<{
    text: string;
    score: number;
    index?: number;
  }>;
  error?: string;
}

export interface RAGChunkRequest {
  text: string;
  options?: {
    maxChunkSize?: number;
    overlapSize?: number;
    minChunkSize?: number;
  };
}

export interface RAGChunkResponse {
  chunks: Array<{
    text: string;
    index: number;
    metadata: {
      source: string;
      heading?: string;
      tokenCount: number;
    };
  }>;
  error?: string;
}

export interface LLMChatRequest {
  messages: Array<{
    role: string;
    content: string;
  }>;
  options?: {
    requireFunctionCalling?: boolean;
    tools?: unknown[];
    temperature?: number;
    maxTokens?: number;
  };
}

export interface LLMChatResponse {
  content: string | null;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  toolCalls?: unknown[];
  error?: string;
}

export interface LLMUsageResponse {
  totalTokens: number;
  byModel: Record<string, number>;
  byDate: Record<string, number>;
}

export interface EvaluationRunRequest {
  level: 'standard' | 'full';
  milestone?: string;
  datasets?: string[];
  maxSamples?: number;
}

export interface EvaluationRunResponse {
  taskId: string;
  status: 'queued';
}

export interface EvaluationStatusResponse {
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress?: {
    current: number;
    total: number;
    phase?: string;
  };
  result?: unknown;
  error?: string;
}

export interface EvaluationResultsResponse {
  versions: Array<{
    id: number;
    timestamp: string;
    level: string;
    metrics: Record<string, number>;
  }>;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  service: string;
  details?: Record<string, boolean | string>;
}

export interface ServiceRequestContext {
  traceId: string;
  timestamp: number;
  source: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  deviceType?: DeviceType;
  stream?: boolean;
}

export interface ChatResponse {
  conversationId: string;
  message: ChatMessage;
  done: boolean;
}

export type DeviceType = "web" | "miniapp" | "app" | "bot" | "unknown";

export interface BotMessage {
  platform: BotPlatform;
  userId: string;
  content: string;
  timestamp: number;
  messageId: string;
}

export type BotPlatform = "feishu" | "dingtalk" | "wecom" | "wechat";

export interface BotResponse {
  content: string;
  stream?: AsyncIterable<string>;
}

export interface OAApprovalRequest {
  processCode: string;
  userId: string;
  formData: Record<string, unknown>;
  approvers?: string[];
}

export interface OAApprovalResponse {
  processInstanceId: string;
  status: "pending" | "approved" | "rejected";
  error?: string;
}

export interface CRMCustomerRequest {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

export interface CRMCustomerResponse {
  id: string;
  name: string;
  createdAt: string;
  error?: string;
}

export interface APIGatewayHeaders {
  "x-device-type": DeviceType;
  "x-request-id": string;
  "x-rate-limit-remaining": string;
  "x-rate-limit-reset": string;
}

export interface MCPToolRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
