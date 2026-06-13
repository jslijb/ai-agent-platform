/**
 * API Key 加密存储模块
 * 使用 AES-256-GCM 加密 API Key，密钥从环境变量读取
 *
 * 使用方式：
 * 1. 设置环境变量 ENCRYPTION_KEY（32 字节 base64 编码）
 * 2. 首次使用时运行：node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * 3. 在 api_keys.yaml 中使用 enc: 前缀标记加密值
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/** 获取加密密钥（从环境变量） */
function getEncryptionKey(): Buffer | null {
  const keyB64 = process.env.ENCRYPTION_KEY;
  if (!keyB64) return null;
  try {
    const key = Buffer.from(keyB64, "base64");
    if (key.length !== KEY_LENGTH) {
      console.error("[crypto] ENCRYPTION_KEY 长度不正确，需要 32 字节 base64 编码");
      return null;
    }
    return key;
  } catch {
    console.error("[crypto] ENCRYPTION_KEY 格式错误，需要 base64 编码");
    return null;
  }
}

/**
 * 加密 API Key
 * @returns 加密后的字符串（base64 编码：iv + tag + ciphertext）
 */
export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    console.warn("[crypto] ENCRYPTION_KEY 未设置，无法加密，返回明文");
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const tag = cipher.getAuthTag();

  // 格式：iv(16) + tag(16) + ciphertext → base64
  const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, "base64")]);
  return `enc:${combined.toString("base64")}`;
}

/**
 * 解密 API Key
 * 支持 enc: 前缀的加密值和明文值
 */
export function decryptApiKey(encrypted: string): string {
  // 非 enc: 前缀，视为明文
  if (!encrypted.startsWith("enc:")) {
    return encrypted;
  }

  const key = getEncryptionKey();
  if (!key) {
    console.error("[crypto] ENCRYPTION_KEY 未设置，无法解密 enc: 值");
    return "";
  }

  try {
    const combined = Buffer.from(encrypted.slice(4), "base64");

    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext, undefined, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("[crypto] 解密失败:", err instanceof Error ? err.message : String(err));
    return "";
  }
}

/**
 * 检查值是否已加密
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith("enc:");
}

/**
 * 生成新的加密密钥（用于初始化）
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString("base64");
}
