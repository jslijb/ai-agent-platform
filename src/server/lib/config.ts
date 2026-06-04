import fs from "fs";
import path from "path";
import yaml from "js-yaml";

let cachedConfig: Record<string, any> | null = null;
let cachedRawConfig: Record<string, any> | null = null;

const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * 查找项目根目录（包含 config/api_keys.yaml 的目录）
 * 从当前模块目录向上查找，最多 5 层
 */
function findProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const configPath = path.join(dir, "config/api_keys.yaml");
    if (fs.existsSync(configPath)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 回退到 process.cwd()
  return process.cwd();
}

function resolveEnvVars(obj: any): any {
  if (typeof obj === "string") {
    if (ENV_VAR_PATTERN.test(obj)) {
      return process.env[obj] || "";
    }
    return obj;
  }
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolveEnvVars(value);
  }
  return result;
}

export function loadConfig(): Record<string, any> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = path.resolve(findProjectRoot(), "config/api_keys.yaml");

  if (!fs.existsSync(configPath)) {
    console.warn(`[config] 配置文件不存在: ${configPath}, 使用环境变量`);
    cachedConfig = {};
    return cachedConfig;
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = yaml.load(raw) as Record<string, any>;
  cachedConfig = resolveEnvVars(parsed);

  console.log("[config] 配置加载完成");
  return cachedConfig!;
}

export function getConfigValue(
  section: string,
  key: string,
  defaultValue: string = ""
): string {
  const config = loadConfig();
  const sectionConfig = config[section];
  if (!sectionConfig) {
    return defaultValue;
  }
  return sectionConfig[key] || defaultValue;
}

export function getSection(section: string): Record<string, any> {
  const config = loadConfig();
  return config[section] || {};
}

export function reloadConfig(): Record<string, any> {
  cachedConfig = null;
  cachedRawConfig = null;
  return loadConfig();
}

export function loadRawConfig(): Record<string, any> {
  if (cachedRawConfig) {
    return cachedRawConfig;
  }

  const configPath = path.resolve(findProjectRoot(), "config/api_keys.yaml");

  if (!fs.existsSync(configPath)) {
    console.warn(`[config] 配置文件不存在: ${configPath}`);
    cachedRawConfig = {};
    return cachedRawConfig;
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = yaml.load(raw) as Record<string, any>;
  cachedRawConfig = parsed;

  console.log("[config] 原始配置加载完成(不解析环境变量)");
  return cachedRawConfig!;
}

export function getRawSection(section: string): Record<string, any> {
  const config = loadRawConfig();
  return config[section] || {};
}
