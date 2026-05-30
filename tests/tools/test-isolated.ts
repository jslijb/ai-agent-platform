const BASE_URL = "http://localhost:3000";

async function testSingleQuery(query, label) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${label}] Query: ${query}`);
  console.log(`${"=".repeat(60)}`);

  const response = await fetch(`${BASE_URL}/api/agent/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
    body: JSON.stringify({ query, maxIterations: 5, userId: "test-isolated", model: "qwen3.6-max-preview" }),
    signal: AbortSignal.timeout(120000),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const steps = [];
  let answer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) currentEvent = line.substring(7).trim();
      else if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.substring(6));
          if (currentEvent === "step") steps.push(data);
          else if (currentEvent === "done") answer = data.answer || "";
          currentEvent = "";
        } catch { currentEvent = ""; }
      }
    }
  }

  console.log(`\n步骤详情:`);
  for (const step of steps) {
    const toolInfo = step.detail?.toolName ? ` [${step.detail.toolName}]` : "";
    const timeInfo = step.detail?.llmMs ? ` LLM=${(step.detail.llmMs/1000).toFixed(2)}s` : "";
    const toolTimeInfo = step.detail?.toolMs ? ` 工具=${(step.detail.toolMs/1000).toFixed(2)}s` : "";
    console.log(`  轮${step.round} | ${step.type}${toolInfo} | ${step.title}${timeInfo}${toolTimeInfo}`);
  }

  console.log(`\n答案前200字: ${answer.substring(0, 200)}`);

  const toolCallsInRound1 = steps.filter(s => s.round === 1 && s.type === "tool_call");
  console.log(`\n第1轮工具调用数: ${toolCallsInRound1.length}`);
  for (const tc of toolCallsInRound1) {
    console.log(`  - ${tc.detail?.toolName}: ${JSON.stringify(tc.detail?.params || {}).substring(0, 100)}`);
  }
}

async function main() {
  await testSingleQuery("计算招商银行的20日移动平均线MA20", "独立测试-无缓存");
  await new Promise(r => setTimeout(r, 3000));
  await testSingleQuery("计算招商银行的RSI指标", "独立测试-无缓存2");
}

main().catch(err => console.error("测试失败:", err));
