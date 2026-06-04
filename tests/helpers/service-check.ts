import { beforeAll, describe } from "vitest";

/**
 * 检查服务是否可达
 * @param url 服务健康检查 URL
 * @param timeoutMs 超时时间（毫秒）
 * @returns true 如果服务可达
 */
export async function isServiceAvailable(
  url: string,
  timeoutMs = 3000
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

/**
 * 检查多个服务是否可达
 * @param services 服务列表 [{name, url}]
 * @returns 可达的服务名集合
 */
export async function checkServices(
  services: { name: string; url: string }[]
): Promise<Set<string>> {
  const available = new Set<string>();
  await Promise.all(
    services.map(async (svc) => {
      if (await isServiceAvailable(svc.url)) {
        available.add(svc.name);
      }
    })
  );
  return available;
}

/** 常用服务地址 */
export const SERVICE_URLS = {
  "data-service": "http://localhost:8001/health",
  "embedding": "http://localhost:8011/health",
  "reranker": "http://localhost:8010/health",
  "rag-service": "http://localhost:3001/health",
  "main-service": "http://localhost:3000/api/health",
  "llm-gateway": "http://localhost:3002/health",
  "evaluation-service": "http://localhost:3003/health",
} as const;

export type ServiceName = keyof typeof SERVICE_URLS;

/**
 * 在 describe 块中跳过不可达服务的测试
 * 用法: describeWhenServices(["data-service", "rag-service"], "测试名称", () => { ... })
 */
export function describeWhenServices(
  requiredServices: ServiceName[],
  name: string,
  fn: () => void
) {
  describe(name, () => {
    let availableServices: Set<string>;

    beforeAll(async () => {
      const services = requiredServices.map((name) => ({
        name,
        url: SERVICE_URLS[name],
      }));
      availableServices = await checkServices(services);
    });

    fn();

    // 如果需要的服务不可达，跳过整个 describe
    // 注意：vitest 不支持动态 skip describe，所以我们在每个 it 中检查
  });
}

/**
 * 创建一个检查服务可达性的 beforeAll hook
 * 返回一个函数，用于在 it 块中判断是否应该跳过
 */
export function useServiceCheck(requiredServices: ServiceName[]) {
  let available = false;

  beforeAll(async () => {
    const services = requiredServices.map((name) => ({
      name,
      url: SERVICE_URLS[name],
    }));
    const result = await checkServices(services);
    available = requiredServices.every((name) => result.has(name));
  });

  return () => available;
}
