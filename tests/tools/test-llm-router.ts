import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { callWithFallback } from "../../src/server/llm/router";

async function main() {
  console.log("测试 callWithFallback 降级链...");
  console.log("DASHSCOPE_API_KEY:", process.env.DASHSCOPE_API_KEY ? "已设置" : "未设置");
  console.log("模型降级链由 api_keys.yaml 的 llm.models 列表驱动");

  try {
    const result = await callWithFallback([
      { role: "user", content: "请用一句话介绍五粮液" },
    ]);
    console.log(`\n✅ 调用成功! 使用的模型: ${result.model}`);
    console.log(`内容: ${result.content.substring(0, 100)}...`);
    if (result.usage) {
      console.log(`Token: ${result.usage.total_tokens}`);
    }
  } catch (error) {
    console.error(`\n❌ 调用失败:`, error);
  }

  process.exit(0);
}

main().catch(console.error);
