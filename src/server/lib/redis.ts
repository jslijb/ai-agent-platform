let redisClient: any = null;
let isConnected = false;

function getRedisUrl(): string {
  return process.env.REDIS_URL || "redis://localhost:6379";
}

export async function getRedis(): Promise<any> {
  if (redisClient && isConnected) {
    return redisClient;
  }

  try {
    const { createClient } = await import("redis");
    redisClient = createClient({ url: getRedisUrl() });

    redisClient.on("error", (err: Error) => {
      console.error("[redis] 连接错误:", err);
      isConnected = false;
    });

    redisClient.on("connect", () => {
      console.log("[redis] 连接成功");
      isConnected = true;
    });

    await redisClient.connect();
    console.log("[redis] Redis 客户端初始化完成");
    return redisClient;
  } catch (error) {
    console.error("[redis] Redis 初始化失败:", error);
    console.warn("[redis] 将使用内存缓存作为降级方案");
    return null;
  }
}

export async function redisGet(key: string): Promise<string | null> {
  try {
    const client = await getRedis();
    if (!client) return null;
    return await client.get(key);
  } catch (error) {
    console.error(`[redis] GET ${key} 失败:`, error);
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  try {
    const client = await getRedis();
    if (!client) return;
    if (ttlSeconds) {
      await client.setEx(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  } catch (error) {
    console.error(`[redis] SET ${key} 失败:`, error);
  }
}

export async function redisDel(key: string): Promise<void> {
  try {
    const client = await getRedis();
    if (!client) return;
    await client.del(key);
  } catch (error) {
    console.error(`[redis] DEL ${key} 失败:`, error);
  }
}

export function isRedisConnected(): boolean {
  return isConnected;
}
