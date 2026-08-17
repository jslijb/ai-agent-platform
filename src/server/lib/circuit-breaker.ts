import { redisHSet, redisHGetAll, redisExpire, isRedisConnected } from './redis';

const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 30000;
const FORCE_OPEN_DURATION_MS = 300000;
const HALF_OPEN_MAX_CALLS = 1;

interface CircuitState {
  failures: number;
  lastFailureTime: number;
  state: "closed" | "open" | "half-open";
  nextRetryTime: number;
}

const fallbackCircuits = new Map<string, CircuitState>();

function parseCircuitState(data: Record<string, string>): CircuitState {
  return {
    failures: parseInt(data.failures || '0', 10),
    lastFailureTime: parseInt(data.lastFailureTime || '0', 10),
    state: (data.state as CircuitState['state']) || 'closed',
    nextRetryTime: parseInt(data.nextRetryTime || '0', 10),
  };
}

async function getCircuitFromRedis(name: string): Promise<CircuitState | null> {
  if (!isRedisConnected()) return null;
  try {
    const data = await redisHGetAll(`circuit:${name}`);
    if (!data || Object.keys(data).length === 0) return null;
    return parseCircuitState(data);
  } catch {
    return null;
  }
}

async function saveCircuitToRedis(name: string, circuit: CircuitState): Promise<void> {
  if (!isRedisConnected()) return;
  try {
    const key = `circuit:${name}`;
    await redisHSet(key, 'failures', String(circuit.failures));
    await redisHSet(key, 'lastFailureTime', String(circuit.lastFailureTime));
    await redisHSet(key, 'state', circuit.state);
    await redisHSet(key, 'nextRetryTime', String(circuit.nextRetryTime));
    await redisExpire(key, 300);
  } catch (error) {
    console.error(`[circuit-breaker] Redis 保存失败: ${name}`, error);
  }
}

export async function getCircuitState(name: string): Promise<"closed" | "open" | "half-open"> {
  const redisCircuit = await getCircuitFromRedis(name);
  if (redisCircuit) {
    if (redisCircuit.state === "open" && Date.now() >= redisCircuit.nextRetryTime) {
      redisCircuit.state = "half-open";
      await saveCircuitToRedis(name, redisCircuit);
      console.log(`[circuit-breaker] ${name} 熔断器进入半开状态`);
    }
    return redisCircuit.state;
  }

  const circuit = fallbackCircuits.get(name);
  if (!circuit) return "closed";

  if (circuit.state === "open" && Date.now() >= circuit.nextRetryTime) {
    circuit.state = "half-open";
    console.log(`[circuit-breaker] ${name} 熔断器进入半开状态`);
  }

  return circuit.state;
}

export async function recordSuccess(name: string): Promise<void> {
  const redisCircuit = await getCircuitFromRedis(name);
  if (redisCircuit) {
    redisCircuit.failures = 0;
    redisCircuit.state = "closed";
    await saveCircuitToRedis(name, redisCircuit);
    console.log(`[circuit-breaker] ${name} 熔断器恢复为关闭状态`);
    return;
  }

  const circuit = fallbackCircuits.get(name);
  if (!circuit) return;
  circuit.failures = 0;
  if (circuit.state === "half-open") {
    circuit.state = "closed";
    console.log(`[circuit-breaker] ${name} 熔断器恢复为关闭状态`);
  }
}

export async function recordFailure(name: string): Promise<void> {
  const redisCircuit = await getCircuitFromRedis(name);
  if (redisCircuit) {
    redisCircuit.failures++;
    redisCircuit.lastFailureTime = Date.now();
    if (redisCircuit.failures >= FAILURE_THRESHOLD) {
      redisCircuit.state = "open";
      redisCircuit.nextRetryTime = Date.now() + OPEN_DURATION_MS;
      console.error(`[circuit-breaker] ${name} 熔断器打开，失败次数: ${redisCircuit.failures}`);
    }
    await saveCircuitToRedis(name, redisCircuit);
    return;
  }

  let circuit = fallbackCircuits.get(name);
  if (!circuit) {
    circuit = { failures: 0, lastFailureTime: 0, state: "closed", nextRetryTime: 0 };
    fallbackCircuits.set(name, circuit);
  }
  circuit.failures++;
  circuit.lastFailureTime = Date.now();
  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = "open";
    circuit.nextRetryTime = Date.now() + OPEN_DURATION_MS;
    console.error(`[circuit-breaker] ${name} 熔断器打开，失败次数: ${circuit.failures}，下次重试时间: ${new Date(circuit.nextRetryTime).toISOString()}`);
  }
}

export async function forceOpenCircuit(name: string, reason?: string): Promise<void> {
  const circuit: CircuitState = {
    failures: FAILURE_THRESHOLD,
    lastFailureTime: Date.now(),
    state: "open",
    nextRetryTime: Date.now() + FORCE_OPEN_DURATION_MS,
  };

  await saveCircuitToRedis(name, circuit);
  fallbackCircuits.set(name, circuit);
  console.error(`[circuit-breaker] ${name} 熔断器强制打开（${reason || "不可重试错误"}），下次重试时间: ${new Date(circuit.nextRetryTime).toISOString()}`);
}

export async function isCircuitOpen(name: string): Promise<boolean> {
  const state = await getCircuitState(name);
  return state === "open";
}

export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const state = await getCircuitState(name);

  if (state === "open") {
    console.warn(`[circuit-breaker] ${name} 熔断器已打开，拒绝请求`);
    throw new Error(`服务 ${name} 暂时不可用（熔断器已打开）`);
  }

  try {
    const result = await fn();
    await recordSuccess(name);
    return result;
  } catch (error) {
    await recordFailure(name);
    throw error;
  }
}
