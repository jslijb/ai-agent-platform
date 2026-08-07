import { redisGet, redisSet, redisDel } from "@/server/lib/redis";

const CHECKPOINT_TTL = 3600;
const MAX_RETRY_COUNT = 2;

interface CheckpointData {
  iteration: number;
  completedTools: Array<{ name: string; resultPreview: string }>;
  pendingStrategy: string;
  error: string | null;
  timestamp: number;
  retryCount: number;
}

function getCheckpointKey(conversationId: string): string {
  return `agent:checkpoint:${conversationId}`;
}

export async function saveCheckpoint(
  conversationId: string,
  iteration: number,
  completedTools: Array<{ name: string; resultPreview: string }>,
  pendingStrategy: string
): Promise<void> {
  const key = getCheckpointKey(conversationId);
  const existing = await loadCheckpoint(conversationId);
  const data: CheckpointData = {
    iteration,
    completedTools: [...(existing?.completedTools || []), ...completedTools],
    pendingStrategy,
    error: null,
    timestamp: Date.now(),
    retryCount: existing?.retryCount || 0,
  };

  try {
    await redisSet(key, JSON.stringify(data), CHECKPOINT_TTL);
    console.log(`[checkpoint] Saved: conv=${conversationId}, iteration=${iteration}, tools=${completedTools.length}`);
  } catch (err) {
    console.error(`[checkpoint] Save failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function loadCheckpoint(conversationId: string): Promise<CheckpointData | null> {
  const key = getCheckpointKey(conversationId);
  try {
    const data = await redisGet(key);
    if (!data) return null;
    return JSON.parse(data) as CheckpointData;
  } catch (err) {
    console.error(`[checkpoint] Load failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function recordError(
  conversationId: string,
  error: string
): Promise<CheckpointData | null> {
  const existing = await loadCheckpoint(conversationId);
  if (!existing) return null;

  existing.error = error;
  existing.retryCount = (existing.retryCount || 0) + 1;

  try {
    const key = getCheckpointKey(conversationId);
    await redisSet(key, JSON.stringify(existing), CHECKPOINT_TTL);
  } catch { /* ignore */ }

  return existing;
}

export function canRetry(checkpoint: CheckpointData | null): boolean {
  if (!checkpoint) return false;
  return (checkpoint.retryCount || 0) < MAX_RETRY_COUNT;
}

export function buildRecoveryContext(checkpoint: CheckpointData): string {
  const toolSummaries = checkpoint.completedTools
    .map((t) => `- ${t.name}: ${t.resultPreview}`)
    .join("\n");

  return `[Agent错误恢复] 上次执行在第${checkpoint.iteration}轮失败，错误: ${checkpoint.error}\n已完成工具:\n${toolSummaries}\n策略: ${checkpoint.pendingStrategy}\n已重试${checkpoint.retryCount}次。请跳过已完成的工具，基于已有结果继续回答。`;
}

export async function clearCheckpoint(conversationId: string): Promise<void> {
  const key = getCheckpointKey(conversationId);
  try {
    await redisDel(key);
  } catch { /* ignore */ }
}

export { MAX_RETRY_COUNT, CHECKPOINT_TTL };
export type { CheckpointData };
