/**
 * 数据脱敏模块
 * 对敏感数据（API Key、手机号、身份证等）进行脱敏处理
 */

/** 脱敏策略：保留前 N 位和后 M 位，中间用 * 替换 */
function maskString(value: string, keepFirst: number = 2, keepLast: number = 2, maskChar: string = "*"): string {
  if (value.length <= keepFirst + keepLast) {
    return maskChar.repeat(value.length);
  }
  const first = value.slice(0, keepFirst);
  const last = value.slice(-keepLast);
  const maskedLen = value.length - keepFirst - keepLast;
  return `${first}${maskChar.repeat(maskedLen)}${last}`;
}

/** API Key 脱敏：sk-xxxx...xxxx → sk-***...*** */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.startsWith("sk-")) {
    return `sk-${maskString(apiKey.slice(3), 4, 4)}`;
  }
  return maskString(apiKey, 4, 4);
}

/** 手机号脱敏：13812345678 → 138****5678 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

/** 邮箱脱敏：user@example.com → u***@example.com */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email;
  const [local, domain] = email.split("@");
  const maskedLocal = local.length > 1 ? local[0] + "***" : "***";
  return `${maskedLocal}@${domain}`;
}

/** 身份证号脱敏：110101199001011234 → 110101****1234 */
export function maskIdCard(idCard: string): string {
  if (!idCard || idCard.length < 8) return idCard;
  return idCard.slice(0, 6) + "********" + idCard.slice(-4);
}

/** IP 地址脱敏：192.168.1.100 → 192.168.*.* */
export function maskIp(ip: string): string {
  if (!ip) return "";
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  // IPv6 简单脱敏
  if (ip.includes(":")) {
    const segments = ip.split(":");
    return segments.slice(0, 2).join(":") + ":****";
  }
  return "***";
}

/**
 * 通用对象脱敏
 * 递归遍历对象，对匹配 key 名称的值进行脱敏
 */
export function maskObject<T extends Record<string, any>>(
  obj: T,
  options?: {
    /** 需要脱敏的 key 名称模式（默认包含常见敏感字段） */
    sensitiveKeys?: string[];
    /** 自定义脱敏函数 */
    maskFn?: (value: string, key: string) => string;
  }
): T {
  const defaultSensitiveKeys = [
    "password", "passwd", "pwd",
    "api_key", "apikey", "api-key", "apiKey",
    "secret", "token", "access_token", "refresh_token",
    "private_key", "privateKey",
    "credit_card", "creditCard",
    "ssn", "id_card", "idCard",
    "phone", "mobile",
    "email",
  ];

  const sensitiveKeys = options?.sensitiveKeys || defaultSensitiveKeys;
  const maskFn = options?.maskFn || ((value: string, key: string) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes("email")) return maskEmail(value);
    if (lowerKey.includes("phone") || lowerKey.includes("mobile")) return maskPhone(value);
    if (lowerKey.includes("id_card") || lowerKey.includes("idcard") || lowerKey === "ssn") return maskIdCard(value);
    if (lowerKey.includes("ip")) return maskIp(value);
    return maskApiKey(value);
  });

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((sk) => lowerKey.includes(sk.toLowerCase()));

    if (isSensitive && typeof value === "string") {
      result[key] = maskFn(value, key);
    } else if (isSensitive && typeof value === "number") {
      result[key] = "***";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = maskObject(value, options);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "object" && item !== null ? maskObject(item, options) : item
      );
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * 日志脱敏
 * 对日志输出中的敏感信息进行替换
 */
export function sanitizeLogMessage(message: string): string {
  return message
    // API Key 模式
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***")
    .replace(/Bearer\s+[a-zA-Z0-9\-_.]+/g, "Bearer ***")
    // API Key 键值对
    .replace(/api[_-]?key[=:]\s*["']?\S+["']?/gi, "api_key=***")
    .replace(/secret[=:]\s*["']?\S+["']?/gi, "secret=***")
    .replace(/token[=:]\s*["']?\S+["']?/gi, "token=***")
    .replace(/password[=:]\s*["']?\S+["']?/gi, "password=***")
    // 手机号
    .replace(/1[3-9]\d{9}/g, (match) => maskPhone(match))
    // 邮箱
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => maskEmail(match))
    // 身份证
    .replace(/\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, (match) => maskIdCard(match));
}
