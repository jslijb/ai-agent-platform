interface CircuitState {
  failures: number;
  lastFailureTime: number;
  state: "closed" | "open" | "half-open";
  nextRetryTime: number;
}

const circuits = new Map<string, CircuitState>();

const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 30000;
const HALF_OPEN_MAX_CALLS = 1;

export function getCircuitState(name: string): "closed" | "open" | "half-open" {
  const circuit = circuits.get(name);
  if (!circuit) return "closed";

  if (circuit.state === "open") {
    if (Date.now() >= circuit.nextRetryTime) {
      circuit.state = "half-open";
      console.log(`[circuit-breaker] ${name} 熔断器进入半开状态`);
    }
  }

  return circuits.get(name)?.state ?? "closed";
}

export function recordSuccess(name: string): void {
  const circuit = circuits.get(name);
  if (!circuit) return;

  circuit.failures = 0;
  if (circuit.state === "half-open") {
    circuit.state = "closed";
    console.log(`[circuit-breaker] ${name} 熔断器恢复为关闭状态`);
  }
}

export function recordFailure(name: string): void {
  let circuit = circuits.get(name);
  if (!circuit) {
    circuit = { failures: 0, lastFailureTime: 0, state: "closed", nextRetryTime: 0 };
    circuits.set(name, circuit);
  }

  circuit.failures++;
  circuit.lastFailureTime = Date.now();

  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = "open";
    circuit.nextRetryTime = Date.now() + OPEN_DURATION_MS;
    console.error(`[circuit-breaker] ${name} 熔断器打开，失败次数: ${circuit.failures}，下次重试时间: ${new Date(circuit.nextRetryTime).toISOString()}`);
  }
}

export function isCircuitOpen(name: string): boolean {
  const state = getCircuitState(name);
  return state === "open";
}

export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const state = getCircuitState(name);

  if (state === "open") {
    console.warn(`[circuit-breaker] ${name} 熔断器已打开，拒绝请求`);
    throw new Error(`服务 ${name} 暂时不可用（熔断器已打开）`);
  }

  try {
    const result = await fn();
    recordSuccess(name);
    return result;
  } catch (error) {
    recordFailure(name);
    throw error;
  }
}
