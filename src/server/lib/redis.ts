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
    const { createClient } = await import(/* webpackIgnore: true */ "redis");
    redisClient = createClient({
      url: getRedisUrl(),
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 10) return new Error("Redis 重连超过10次，放弃");
          return Math.min(retries * 200, 3000);
        },
        connectTimeout: 5000,
      },
      commands: {
        maxPoolSize: 10,
      },
    });

    redisClient.on("error", (err: Error) => {
      console.error("[redis] 连接错误:", err);
      isConnected = false;
    });

    redisClient.on("connect", () => {
      console.log("[redis] 连接成功");
      isConnected = true;
    });

    redisClient.on("reconnecting", () => {
      console.log("[redis] 正在重连...");
    });

    await redisClient.connect();
    console.log("[redis] Redis 客户端初始化完成(pool=10)");
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

export async function redisIncr(key: string): Promise<number> {
  try {
    const client = await getRedis();
    if (!client) return 0;
    return await client.incr(key);
  } catch (error) {
    console.error(`[redis] INCR ${key} 失败:`, error);
    return 0;
  }
}

export async function redisExpire(key: string, ttlSeconds: number): Promise<void> {
  try {
    const client = await getRedis();
    if (!client) return;
    await client.expire(key, ttlSeconds);
  } catch (error) {
    console.error(`[redis] EXPIRE ${key} 失败:`, error);
  }
}

export async function redisTtl(key: string): Promise<number> {
  try {
    const client = await getRedis();
    if (!client) return -1;
    return await client.ttl(key);
  } catch (error) {
    console.error(`[redis] TTL ${key} 失败:`, error);
    return -1;
  }
}

export async function redisHSet(key: string, field: string, value: string): Promise<void> {
  try {
    const client = await getRedis();
    if (!client) return;
    await client.hSet(key, field, value);
  } catch (error) {
    console.error(`[redis] HSET ${key} ${field} 失败:`, error);
  }
}

export async function redisHGet(key: string, field: string): Promise<string | null> {
  try {
    const client = await getRedis();
    if (!client) return null;
    return await client.hGet(key, field);
  } catch (error) {
    console.error(`[redis] HGET ${key} ${field} 失败:`, error);
    return null;
  }
}

export async function redisHGetAll(key: string): Promise<Record<string, string>> {
  try {
    const client = await getRedis();
    if (!client) return {};
    return await client.hGetAll(key);
  } catch (error) {
    console.error(`[redis] HGETALL ${key} 失败:`, error);
    return {};
  }
}

export function isRedisConnected(): boolean {
  return isConnected;
}
