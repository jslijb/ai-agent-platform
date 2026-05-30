import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const results: Array<{ name: string; pass: boolean; detail: string }> = [];

function assert(condition: boolean, name: string, detail: string = ""): void {
  if (!condition) {
    console.error(`[FAIL] ${name}: ${detail}`);
    results.push({ name, pass: false, detail });
    return;
  }
  console.log(`[PASS] ${name}`);
  results.push({ name, pass: true, detail });
}

const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]*$/;

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

function testEnvVarPattern_Uppercase() {
  console.log("\n=== 测试: ENV_VAR_PATTERN 全大写匹配 ===");
  assert(ENV_VAR_PATTERN.test("DASHSCOPE_API_KEY"), "全大写+下划线匹配");
  assert(ENV_VAR_PATTERN.test("DATABASE_URL"), "全大写+下划线匹配");
  assert(ENV_VAR_PATTERN.test("A"), "单字母大写匹配");
  assert(ENV_VAR_PATTERN.test("ABC123"), "大写+数字匹配");
}

function testEnvVarPattern_NonUppercase() {
  console.log("\n=== 测试: ENV_VAR_PATTERN 非全大写不匹配 ===");
  assert(!ENV_VAR_PATTERN.test("1M"), "数字开头不匹配");
  assert(!ENV_VAR_PATTERN.test("qwen3.6-max-preview"), "小写+点号不匹配");
  assert(!ENV_VAR_PATTERN.test("tick_flow_key"), "小写+下划线不匹配");
  assert(!ENV_VAR_PATTERN.test("256K"), "数字开头不匹配");
  assert(!ENV_VAR_PATTERN.test("hello"), "全小写不匹配");
  assert(!ENV_VAR_PATTERN.test(""), "空字符串不匹配");
}

function testResolveEnvVars_WithRealEnv() {
  console.log("\n=== 测试: resolveEnvVars 环境变量解析 ===");
  process.env.TEST_CONFIG_KEY = "resolved_value";
  const config = {
    api_key: "TEST_CONFIG_KEY",
    model_name: "qwen3.6-max-preview",
    context_size: "256K",
  };
  const resolved = resolveEnvVars(config);
  assert(
    resolved.api_key === "resolved_value",
    "环境变量名被解析为实际值",
    `结果: ${resolved.api_key}`
  );
  assert(
    resolved.model_name === "qwen3.6-max-preview",
    "非环境变量名保持原值",
    `结果: ${resolved.model_name}`
  );
  assert(
    resolved.context_size === "256K",
    "数字+字母格式保持原值",
    `结果: ${resolved.context_size}`
  );
  delete process.env.TEST_CONFIG_KEY;
}

function testResolveEnvVars_NestedConfig() {
  console.log("\n=== 测试: resolveEnvVars 嵌套配置 ===");
  process.env.NESTED_TEST_KEY = "nested_value";
  const config = {
    llm: {
      bailian: {
        DASHSCOPE_API_KEY: "NESTED_TEST_KEY",
      },
      models: [
        { id: "qwen3.6-max-preview", context: "256K" },
        { id: "deepseek-v4-pro", context: "1M" },
      ],
    },
  };
  const resolved = resolveEnvVars(config);
  assert(
    resolved.llm.bailian.DASHSCOPE_API_KEY === "nested_value",
    "嵌套环境变量解析",
    `结果: ${resolved.llm.bailian.DASHSCOPE_API_KEY}`
  );
  assert(
    resolved.llm.models[0].id === "qwen3.6-max-preview",
    "数组内非环境变量保持原值"
  );
  assert(
    resolved.llm.models[0].context === "256K",
    "数组内256K保持原值"
  );
  assert(
    resolved.llm.models[1].context === "1M",
    "数组内1M保持原值"
  );
  delete process.env.NESTED_TEST_KEY;
}

function testResolveEnvVars_UnsetEnv() {
  console.log("\n=== 测试: resolveEnvVars 未设置的环境变量 ===");
  const config = {
    missing_key: "DEFINITELY_NOT_SET_ENV_VAR_XYZ123",
  };
  const resolved = resolveEnvVars(config);
  assert(
    resolved.missing_key === "",
    "未设置的环境变量返回空字符串",
    `结果: ${resolved.missing_key}`
  );
}

function testResolveEnvVars_NonStringValues() {
  console.log("\n=== 测试: resolveEnvVars 非字符串值 ===");
  const config = {
    number_val: 42,
    bool_val: true,
    null_val: null,
    empty_obj: {},
  };
  const resolved = resolveEnvVars(config);
  assert(resolved.number_val === 42, "数字值保持不变");
  assert(resolved.bool_val === true, "布尔值保持不变");
  assert(resolved.null_val === null, "null值保持不变");
  assert(typeof resolved.empty_obj === "object", "空对象保持不变");
}

function testApiKeysYaml_NoBailianModel() {
  console.log("\n=== 测试: api_keys.yaml 无 BAILIAN_MODEL ===");
  const configPath = path.resolve(process.cwd(), "config/api_keys.yaml");
  if (!fs.existsSync(configPath)) {
    console.log("  [SKIP] api_keys.yaml 不存在");
    return;
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  assert(
    !raw.includes("BAILIAN_MODEL"),
    "api_keys.yaml 不包含 BAILIAN_MODEL"
  );
}

function testApiKeysYaml_ModelsList() {
  console.log("\n=== 测试: api_keys.yaml models 列表 ===");
  const configPath = path.resolve(process.cwd(), "config/api_keys.yaml");
  if (!fs.existsSync(configPath)) {
    console.log("  [SKIP] api_keys.yaml 不存在");
    return;
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = yaml.load(raw) as Record<string, any>;
  const models = parsed?.llm?.models;
  assert(
    Array.isArray(models) && models.length > 0,
    "models 列表存在且非空",
    `模型数: ${models?.length ?? 0}`
  );
  if (models && models.length > 0) {
    assert(
      typeof models[0].id === "string" && models[0].id.length > 0,
      "第一个模型有有效id",
      `id: ${models[0].id}`
    );
    assert(
      typeof models[0].context === "string",
      "第一个模型有context字段",
      `context: ${models[0].context}`
    );
  }
}

function testApiKeysYaml_TushareTopLevel() {
  console.log("\n=== 测试: api_keys.yaml tushare 为顶层节点 ===");
  const configPath = path.resolve(process.cwd(), "config/api_keys.yaml");
  if (!fs.existsSync(configPath)) {
    console.log("  [SKIP] api_keys.yaml 不存在");
    return;
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = yaml.load(raw) as Record<string, any>;
  assert(
    parsed.tushare !== undefined,
    "tushare 是顶层节点",
    `tushare: ${JSON.stringify(parsed.tushare)}`
  );
  assert(
    parsed.tickflow !== undefined,
    "tickflow 是顶层节点",
    `tickflow: ${JSON.stringify(parsed.tickflow)}`
  );
}

function testEnvLocal_NoBailianModel() {
  console.log("\n=== 测试: .env.local 无 BAILIAN_MODEL ===");
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.log("  [SKIP] .env.local 不存在");
    return;
  }
  const content = fs.readFileSync(envPath, "utf-8");
  const hasBailianModel = content.split("\n").some(
    line => line.trim().startsWith("BAILIAN_MODEL=")
  );
  assert(
    !hasBailianModel,
    ".env.local 不包含 BAILIAN_MODEL"
  );
}

console.log("========================================");
console.log("Config 环境变量解析测试 (TypeScript)");
console.log("========================================");

testEnvVarPattern_Uppercase();
testEnvVarPattern_NonUppercase();
testResolveEnvVars_WithRealEnv();
testResolveEnvVars_NestedConfig();
testResolveEnvVars_UnsetEnv();
testResolveEnvVars_NonStringValues();
testApiKeysYaml_NoBailianModel();
testApiKeysYaml_ModelsList();
testApiKeysYaml_TushareTopLevel();
testEnvLocal_NoBailianModel();

const total = results.length;
const passed = results.filter(r => r.pass).length;
const failed = total - passed;

console.log("\n========================================");
console.log(`测试结果: ${passed}/${total} PASSED, ${failed} FAILED`);
console.log("========================================");

for (const r of results) {
  const status = r.pass ? "PASS" : "FAIL";
  console.log(`  [${status}] ${r.name}${r.detail ? " - " + r.detail : ""}`);
}

if (failed > 0) {
  process.exit(1);
}
