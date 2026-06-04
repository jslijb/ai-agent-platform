/**
 * RAG + Agent 端到端测评脚本
 *
 * 20个测试查询（5个/类别，从简单到复杂）：
 *   - 1个tool (5 queries)
 *   - 2个tools (5 queries)
 *   - 3个tools (5 queries)
 *   - 3+个tools (5 queries)
 *
 * 运行方式: npx tsx scripts/rag-agent-eval.ts
 */

import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════════════════════

const API_URL = process.env.AGENT_API_URL || 'http://localhost:3000/api/agent/run';
const MAX_ITERATIONS = 5;
const QUERY_TIMEOUT_MS = 120_000; // 120秒超时
const REPORT_DIR = path.resolve(__dirname, '..', 'evaluation-reports');

// ═══════════════════════════════════════════════════════════════
// 测评查询定义
// ═══════════════════════════════════════════════════════════════

interface EvalQuery {
  id: string;
  query: string;
  expectedTools: string[];
  category: string;
  description: string;
}

const evalQueries: EvalQuery[] = [
  // ──── 1个tool (5 queries) ────
  {
    id: 'Q1',
    query: '五粮液最新的股价是多少？',
    expectedTools: ['getStockRealtime'],
    category: '1个tool',
    description: '单工具：实时股价查询',
  },
  {
    id: 'Q2',
    query: '格力电器今天的涨跌幅是多少？',
    expectedTools: ['getStockRealtime'],
    category: '1个tool',
    description: '单工具：实时涨跌幅查询',
  },
  {
    id: 'Q3',
    query: '中国长城2025年净利润是多少？',
    expectedTools: ['getStockFinancial'],
    category: '1个tool',
    description: '单工具：财务指标查询',
  },
  {
    id: 'Q4',
    query: '五粮液的RSI指标是多少？',
    expectedTools: ['calculateRSI'],
    category: '1个tool',
    description: '单工具：技术指标计算',
  },
  {
    id: 'Q5',
    query: '搜索五粮液2025年报中的营收数据',
    expectedTools: ['hybridSearch'],
    category: '1个tool',
    description: '单工具：RAG混合检索',
  },

  // ──── 2个tools (5 queries) ────
  {
    id: 'Q6',
    query: '五粮液的MA20均线和当前股价对比',
    expectedTools: ['getStockHistory', 'calculateMA'],
    category: '2个tools',
    description: '2工具：历史数据+MA均线',
  },
  {
    id: 'Q7',
    query: '格力电器的MACD和RSI指标',
    expectedTools: ['calculateMACD', 'calculateRSI'],
    category: '2个tools',
    description: '2工具：MACD+RSI技术指标',
  },
  {
    id: 'Q8',
    query: '中国长城的资产负债率是多少？是否健康？',
    expectedTools: ['getStockFinancial', 'hybridSearch'],
    category: '2个tools',
    description: '2工具：财务指标+RAG解读',
  },
  {
    id: 'Q9',
    query: '五粮液2025年营收同比增长率是多少？',
    expectedTools: ['getStockFinancial', 'hybridSearch'],
    category: '2个tools',
    description: '2工具：财务指标+RAG检索同比数据',
  },
  {
    id: 'Q10',
    query: '格力电器的PE和PB估值',
    expectedTools: ['getStockRealtime', 'getStockFinancial'],
    category: '2个tools',
    description: '2工具：实时行情+财务估值',
  },

  // ──── 3个tools (5 queries) ────
  {
    id: 'Q11',
    query: '五粮液的技术面分析：MA、MACD、RSI',
    expectedTools: ['getStockHistory', 'calculateMA', 'calculateMACD', 'calculateRSI'],
    category: '3个tools',
    description: '3+工具：历史数据+MA+MACD+RSI综合技术分析',
  },
  {
    id: 'Q12',
    query: '格力电器和五粮液的估值对比',
    expectedTools: ['getStockRealtime', 'getStockFinancial'],
    category: '3个tools',
    description: '3+工具：两家公司实时行情+财务指标对比',
  },
  {
    id: 'Q13',
    query: '中国长城的偿债能力分析',
    expectedTools: ['getStockFinancial', 'hybridSearch', 'calculateVolatility'],
    category: '3个tools',
    description: '3工具：财务指标+RAG检索+波动率',
  },
  {
    id: 'Q14',
    query: '五粮液2025年利润表中的营业利润是多少？计算营业利润率',
    expectedTools: ['getStockFinancial', 'hybridSearch', 'getStockRealtime'],
    category: '3个tools',
    description: '3工具：财务指标+RAG检索+实时行情',
  },
  {
    id: 'Q15',
    query: '格力电器2025年毛利率是多少？与行业对比',
    expectedTools: ['getStockFinancial', 'hybridSearch', 'getStockRealtime'],
    category: '3个tools',
    description: '3工具：财务指标+RAG行业对比+实时行情',
  },

  // ──── 3+个tools (5 queries) ────
  {
    id: 'Q16',
    query: '五粮液综合诊断：技术面+基本面+估值',
    expectedTools: ['getStockHistory', 'calculateMA', 'calculateMACD', 'calculateRSI', 'getStockFinancial', 'getStockRealtime'],
    category: '3+个tools',
    description: '6+工具：技术面+基本面+估值综合诊断',
  },
  {
    id: 'Q17',
    query: '格力电器和五粮液全面对比分析',
    expectedTools: ['getStockRealtime', 'getStockFinancial', 'getStockHistory', 'calculateMA', 'calculateRSI', 'calculateMACD', 'hybridSearch'],
    category: '3+个tools',
    description: '8+工具：两家公司全面对比',
  },
  {
    id: 'Q18',
    query: '中国长城投资风险评估：VaR、压力测试、合规检查',
    expectedTools: ['getStockHistory', 'calculateVaR', 'calculateStressTest', 'checkTradeCompliance', 'hybridSearch'],
    category: '3+个tools',
    description: '5+工具：VaR+压力测试+合规检查',
  },
  {
    id: 'Q19',
    query: '五粮液2025年报利润表中：营业收入、营业成本、净利润分别是多少？计算毛利率和净利率',
    expectedTools: ['getStockFinancial', 'hybridSearch', 'getStockRealtime'],
    category: '3+个tools',
    description: '3+工具：财务指标+RAG检索+计算',
  },
  {
    id: 'Q20',
    query: '对比五粮液、格力电器、中国长城三家公司的ROE、毛利率、净利率，给出投资建议',
    expectedTools: ['getStockFinancial', 'getStockRealtime', 'hybridSearch', 'getStockHistory', 'calculateVolatility'],
    category: '3+个tools',
    description: '10+工具：三家公司全面对比+投资建议',
  },
];

// ═══════════════════════════════════════════════════════════════
// Agent API 响应类型
// ═══════════════════════════════════════════════════════════════

interface AgentStep {
  tool: string;
  action: string;
  executionTimeMs: number;
  success: boolean;
}

interface AgentResponse {
  answer: string;
  iterations: number;
  steps: AgentStep[];
  executionTimeMs: number;
}

interface AgentErrorResponse {
  success: boolean;
  error: string;
  answer?: string;
  iterations?: number;
}

// ═══════════════════════════════════════════════════════════════
// HTTP 请求（使用 Node.js fetch API）
// ═══════════════════════════════════════════════════════════════

async function callAgentApi(query: string): Promise<AgentResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        maxIterations: MAX_ITERATIONS,
        userId: 'eval-user',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok || data.success === false) {
      const errorMsg = (data.error as string) || `HTTP ${response.status}`;
      return {
        answer: '',
        iterations: (data.iterations as number) || 0,
        steps: [],
        executionTimeMs: 0,
        error: errorMsg,
      } as AgentResponse & { error: string };
    }

    // 解析正常响应
    return {
      answer: (data.answer as string) || '',
      iterations: (data.iterations as number) || 0,
      steps: parseSteps(data.steps as unknown[]),
      executionTimeMs: (data.executionTimeMs as number) || 0,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        answer: '',
        iterations: MAX_ITERATIONS,
        steps: [],
        executionTimeMs: QUERY_TIMEOUT_MS,
        error: '查询超时（120秒）',
      } as AgentResponse & { error: string };
    }
    return {
      answer: '',
      iterations: 0,
      steps: [],
      executionTimeMs: 0,
      error: err instanceof Error ? err.message : String(err),
    } as AgentResponse & { error: string };
  }
}

function parseSteps(rawSteps: unknown[] | undefined): AgentStep[] {
  if (!Array.isArray(rawSteps)) return [];

  return rawSteps.map((step: unknown) => {
    const s = step as Record<string, unknown>;
    // 兼容两种格式：新格式 {tool, action, executionTimeMs} 和旧格式 {type, title, content, detail, timestamp}
    if (s.tool) {
      return {
        tool: String(s.tool || ''),
        action: String(s.action || s.description || ''),
        executionTimeMs: Number(s.executionTimeMs || 0),
        success: s.success !== false,
      };
    }

    // 旧格式转换
    const detail = (s.detail || {}) as Record<string, unknown>;
    const type = String(s.type || '');
    const toolName = String(detail.toolName || detail.name || type);
    let action = '';

    if (type === 'tool_call') {
      const params = (detail.params || detail.parameters || {}) as Record<string, unknown>;
      const paramsStr = Object.keys(params).length > 0
        ? Object.entries(params).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
        : '';
      action = `调用 ${toolName}(${paramsStr})`;
    } else if (type === 'tool_result') {
      const result = detail.result || s.content || '';
      const preview = typeof result === 'string'
        ? result.substring(0, 80)
        : JSON.stringify(result).substring(0, 80);
      action = `${toolName} 返回: ${preview}`;
    } else if (type === 'thinking') {
      action = `LLM推理: ${String(s.content || '').substring(0, 60).replace(/\n/g, ' ')}`;
    } else if (type === 'answer') {
      action = `生成答案: ${String(s.content || '').substring(0, 60).replace(/\n/g, ' ')}`;
    } else {
      action = String(s.title || s.content || '').substring(0, 80).replace(/\n/g, ' ');
    }

    return {
      tool: toolName,
      action,
      executionTimeMs: 0,
      success: true,
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// 测评结果类型
// ═══════════════════════════════════════════════════════════════

interface QueryResult {
  id: string;
  query: string;
  category: string;
  description: string;
  expectedTools: string[];
  success: boolean;
  error: string;
  answer: string;
  iterations: number;
  steps: AgentStep[];
  executionTimeMs: number;
  totalDurationMs: number;
  toolsUsed: string[];
  toolsMatched: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 主测评流程
// ═══════════════════════════════════════════════════════════════

async function runEvaluation(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          RAG + Agent 端到端测评                                  ║');
  console.log('║          20个测试查询 · 4个难度类别 · 最多5轮/查询                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  // 检查服务可用性
  console.log('⏳ 检查服务可用性...');
  try {
    const healthRes = await fetch(API_URL.replace('/api/agent/run', '/api/health'), {
      signal: AbortSignal.timeout(5000),
    });
    if (healthRes.status > 503) {
      console.error('❌ 主服务不可达，请先启动服务');
      process.exit(1);
    }
    console.log('  ✅ 主服务可达');
  } catch {
    console.error('❌ 主服务不可达，请先启动服务（http://localhost:3000）');
    process.exit(1);
  }

  console.log('');
  console.log(`📊 测评配置:`);
  console.log(`   API地址: ${API_URL}`);
  console.log(`   最大迭代轮次: ${MAX_ITERATIONS}`);
  console.log(`   查询超时: ${QUERY_TIMEOUT_MS / 1000}秒`);
  console.log(`   测试查询数: ${evalQueries.length}`);
  console.log('');

  const results: QueryResult[] = [];
  let passCount = 0;
  let failCount = 0;
  const categoryStats: Record<string, { pass: number; fail: number; totalMs: number; count: number }> = {};

  for (let i = 0; i < evalQueries.length; i++) {
    const eq = evalQueries[i];
    console.log(`${'═'.repeat(70)}`);
    console.log(`📋 [${i + 1}/${evalQueries.length}] ${eq.id} (${eq.category})`);
    console.log(`   查询: ${eq.query}`);
    console.log(`   期望工具: ${eq.expectedTools.join(', ')}`);
    console.log(`${'═'.repeat(70)}`);

    const startTime = Date.now();
    const response = await callAgentApi(eq.query);
    const totalDurationMs = Date.now() - startTime;

    const hasError = 'error' in response && (response as Record<string, unknown>).error;
    const errorMsg = hasError ? String((response as Record<string, unknown>).error) : '';
    const success = !hasError && response.answer.length > 0;

    // 提取使用的工具
    const toolsUsed = [...new Set(
      response.steps
        .filter(s => s.tool && s.tool !== 'thinking' && s.tool !== 'answer' && s.tool !== 'reflection')
        .map(s => s.tool)
    )];

    // 检查工具匹配度
    const matchedTools = eq.expectedTools.filter(t => toolsUsed.includes(t));
    const toolsMatched = matchedTools.length > 0;

    const result: QueryResult = {
      id: eq.id,
      query: eq.query,
      category: eq.category,
      description: eq.description,
      expectedTools: eq.expectedTools,
      success,
      error: errorMsg,
      answer: response.answer,
      iterations: response.iterations,
      steps: response.steps,
      executionTimeMs: response.executionTimeMs,
      totalDurationMs,
      toolsUsed,
      toolsMatched,
    };

    results.push(result);

    // 更新分类统计
    if (!categoryStats[eq.category]) {
      categoryStats[eq.category] = { pass: 0, fail: 0, totalMs: 0, count: 0 };
    }
    categoryStats[eq.category].count++;
    categoryStats[eq.category].totalMs += totalDurationMs;
    if (success) {
      passCount++;
      categoryStats[eq.category].pass++;
    } else {
      failCount++;
      categoryStats[eq.category].fail++;
    }

    // 实时输出步骤
    console.log('');
    if (response.steps.length > 0) {
      console.log(`  📝 执行步骤 (${response.steps.length}步, ${response.iterations}轮):`);
      for (let si = 0; si < response.steps.length; si++) {
        const step = response.steps[si];
        const statusIcon = step.success ? '✓' : '✗';
        const timeStr = step.executionTimeMs > 0 ? `${step.executionTimeMs}ms` : '-';
        console.log(`    ${statusIcon} 步骤${si + 1}: 工具=${step.tool}, 动作=${step.action.substring(0, 60)}, 耗时=${timeStr}`);
      }
    }

    console.log('');
    if (success) {
      console.log(`  ✅ 成功 | ${response.iterations}轮 | ${totalDurationMs}ms | 使用工具: [${toolsUsed.join(', ')}]`);
      const answerPreview = response.answer.substring(0, 150).replace(/\n/g, ' ');
      console.log(`  💬 ${answerPreview}${response.answer.length > 150 ? '...' : ''}`);
    } else {
      console.log(`  ❌ 失败 | ${totalDurationMs}ms | 错误: ${errorMsg || '无有效答案'}`);
      if (response.answer) {
        console.log(`  💬 ${response.answer.substring(0, 100).replace(/\n/g, ' ')}`);
      }
    }

    // 工具匹配情况
    if (toolsMatched) {
      console.log(`  🔧 工具匹配: ${matchedTools.length}/${eq.expectedTools.length} (匹配: ${matchedTools.join(', ')})`);
    } else {
      console.log(`  ⚠️ 工具未匹配: 期望[${eq.expectedTools.join(', ')}], 实际[${toolsUsed.join(', ')}]`);
    }

    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════
  // 生成报告
  // ═══════════════════════════════════════════════════════════════

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  let report = '';
  report += `# RAG + Agent 端到端测评报告\n\n`;
  report += `**测评时间**: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`;
  report += `**API地址**: ${API_URL}\n`;
  report += `**最大迭代轮次**: ${MAX_ITERATIONS}\n`;
  report += `**查询超时**: ${QUERY_TIMEOUT_MS / 1000}秒\n`;
  report += `**测试查询数**: ${evalQueries.length}\n\n`;
  report += `---\n\n`;

  // 汇总统计
  report += `## 测评汇总\n\n`;
  report += `| 指标 | 数值 |\n|---|---|\n`;
  report += `| 总测试数 | ${results.length} |\n`;
  report += `| 通过 | ${passCount} |\n`;
  report += `| 失败 | ${failCount} |\n`;
  report += `| 通过率 | ${((passCount / results.length) * 100).toFixed(1)}% |\n`;

  const avgDuration = results.reduce((sum, r) => sum + r.totalDurationMs, 0) / results.length;
  report += `| 平均耗时 | ${(avgDuration / 1000).toFixed(1)}秒 |\n`;

  const avgIterations = results.filter(r => r.success).reduce((sum, r) => sum + r.iterations, 0) / Math.max(passCount, 1);
  report += `| 平均迭代轮次 | ${avgIterations.toFixed(1)} |\n`;

  const toolMatchCount = results.filter(r => r.toolsMatched).length;
  report += `| 工具匹配率 | ${((toolMatchCount / results.length) * 100).toFixed(1)}% |\n\n`;

  // 分类统计
  report += `## 分类统计\n\n`;
  report += `| 类别 | 通过/总数 | 通过率 | 平均耗时 |\n|---|---|---|---|\n`;
  for (const [cat, stats] of Object.entries(categoryStats)) {
    const rate = ((stats.pass / stats.count) * 100).toFixed(1);
    const avgMs = (stats.totalMs / stats.count / 1000).toFixed(1);
    report += `| ${cat} | ${stats.pass}/${stats.count} | ${rate}% | ${avgMs}秒 |\n`;
  }
  report += `\n---\n\n`;

  // 逐条详细结果
  report += `## 详细测评结果\n\n`;

  for (const r of results) {
    const statusIcon = r.success ? '✅' : '❌';
    report += `### ${statusIcon} ${r.id}: ${r.query}\n\n`;
    report += `- **类别**: ${r.category}\n`;
    report += `- **描述**: ${r.description}\n`;
    report += `- **状态**: ${r.success ? '成功' : '失败'}\n`;
    report += `- **迭代轮次**: ${r.iterations}\n`;
    report += `- **总耗时**: ${(r.totalDurationMs / 1000).toFixed(1)}秒\n`;
    report += `- **期望工具**: ${r.expectedTools.join(', ')}\n`;
    report += `- **实际使用工具**: ${r.toolsUsed.length > 0 ? r.toolsUsed.join(', ') : '无'}\n`;
    report += `- **工具匹配**: ${r.toolsMatched ? '是' : '否'}\n`;

    if (r.error) {
      report += `- **错误**: ${r.error}\n`;
    }

    report += `\n#### 执行步骤\n\n`;
    if (r.steps.length > 0) {
      report += `| 步骤 | 工具 | 动作 | 耗时 | 状态 |\n|---|---|---|---|---|\n`;
      for (let i = 0; i < r.steps.length; i++) {
        const step = r.steps[i];
        const timeStr = step.executionTimeMs > 0 ? `${step.executionTimeMs}ms` : '-';
        const statusStr = step.success ? '✓' : '✗';
        const actionStr = step.action.substring(0, 80).replace(/\|/g, '\\|');
        report += `| ${i + 1} | ${step.tool} | ${actionStr} | ${timeStr} | ${statusStr} |\n`;
      }
    } else {
      report += `*无执行步骤记录*\n`;
    }

    report += `\n#### 最终答案\n\n`;
    if (r.answer) {
      report += `${r.answer}\n\n`;
    } else {
      report += `*无答案*\n\n`;
    }

    report += `---\n\n`;
  }

  // 失败查询汇总
  const failedResults = results.filter(r => !r.success);
  if (failedResults.length > 0) {
    report += `## 失败查询汇总\n\n`;
    for (const r of failedResults) {
      report += `- **${r.id}**: ${r.query} — ${r.error || '无有效答案'}\n`;
    }
    report += `\n---\n\n`;
  }

  // 工具匹配详情
  report += `## 工具匹配详情\n\n`;
  report += `| 查询ID | 期望工具 | 实际工具 | 匹配 |\n|---|---|---|---|\n`;
  for (const r of results) {
    const expected = r.expectedTools.join(', ');
    const actual = r.toolsUsed.join(', ') || '无';
    const match = r.toolsMatched ? '✓' : '✗';
    report += `| ${r.id} | ${expected} | ${actual} | ${match} |\n`;
  }
  report += `\n---\n\n`;

  report += `*本报告由 rag-agent-eval.ts 自动生成*\n`;

  // 保存报告
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    console.log(`📁 创建报告目录: ${REPORT_DIR}`);
  }

  const reportFileName = `eval-report-${dateStr}.md`;
  const reportPath = path.join(REPORT_DIR, reportFileName);
  fs.writeFileSync(reportPath, report, 'utf-8');

  // ═══════════════════════════════════════════════════════════════
  // 控制台输出汇总
  // ═══════════════════════════════════════════════════════════════

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    测评汇总                                      ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  总测试数:  ${results.length}                                                   ║`);
  console.log(`║  通过:      ${passCount}                                                   ║`);
  console.log(`║  失败:      ${failCount}                                                   ║`);
  console.log(`║  通过率:    ${((passCount / results.length) * 100).toFixed(1)}%                                               ║`);
  console.log(`║  平均耗时:  ${(avgDuration / 1000).toFixed(1)}秒                                              ║`);
  console.log(`║  工具匹配:  ${toolMatchCount}/${results.length} (${((toolMatchCount / results.length) * 100).toFixed(1)}%)                                      ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');

  for (const [cat, stats] of Object.entries(categoryStats)) {
    const rate = ((stats.pass / stats.count) * 100).toFixed(1);
    const avgMs = (stats.totalMs / stats.count / 1000).toFixed(1);
    console.log(`║  ${cat}: ${stats.pass}/${stats.count} 通过 (${rate}%), 平均${avgMs}秒`);
  }

  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`\n📄 测评报告已生成: ${reportPath}`);

  process.exit(failCount > 0 ? 1 : 0);
}

runEvaluation().catch((err) => {
  console.error('测评运行失败:', err);
  process.exit(1);
});
