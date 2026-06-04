/**
 * RAG + Agent 全面测评脚本
 * 
 * 测评范围：1 tool / 2 tools / 3+ tools，各5个query
 * 数据：中国长城(000066)、五粮液(000858)、格力电器(000651)
 * 403自动切换模型机制
 * 按指定格式输出测评报告
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.MAIN_SERVICE_URL || 'http://localhost:3000';
const MAX_ROUNDS = 5;
const REQUEST_TIMEOUT = 300000; // 5 minutes per query

// ═══════════════════════════════════════════════════════════════
// 模型管理：403 自动切换
// ═══════════════════════════════════════════════════════════════

const MODEL_PRIORITY = [
  'qwen3.7-max-2026-05-20',
  'qwen3.7-plus',
  'qwen3.7-plus-2026-05-26',
  'qwen3.6-plus-2026-04-02',
  'qwen3.5-plus-2026-04-20',
  'qwen3.6-27b',
  'kimi-k2.6',
  'qwen3.7-max-preview',
];

const exhaustedModels = new Set<string>();
let currentModelIndex = 0;

function getCurrentModel(): string {
  while (currentModelIndex < MODEL_PRIORITY.length) {
    const model = MODEL_PRIORITY[currentModelIndex];
    if (!exhaustedModels.has(model)) return model;
    currentModelIndex++;
  }
  return MODEL_PRIORITY[0]; // fallback to first
}

function markModelExhausted(model: string) {
  exhaustedModels.add(model);
  console.log(`  ⚠️ 模型 ${model} 额度用尽(403)，切换到下一个模型`);
  currentModelIndex++;
}

// ═══════════════════════════════════════════════════════════════
// HTTP 请求工具
// ═══════════════════════════════════════════════════════════════

function request(url: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<{ status: number; data: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      timeout: REQUEST_TIMEOUT,
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let data: unknown;
        try { data = JSON.parse(body); } catch { data = body; }
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(', ');
        }
        resolve({ status: res.statusCode || 0, data, headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// 测评 Query 设计
// ═══════════════════════════════════════════════════════════════

interface EvalQuery {
  id: string;
  query: string;
  expectedTools: string[];
  category: string; // '1-tool' | '2-tools' | '3+-tools'
  description: string;
}

const evalQueries: EvalQuery[] = [
  // ──── 1 Tool Queries (5个) ────
  {
    id: '1T-01',
    query: '格力电器的最新股价是多少？',
    expectedTools: ['getStockRealtime'],
    category: '1-tool',
    description: '单工具：实时行情查询',
  },
  {
    id: '1T-02',
    query: '五粮液2025年年报中的营业收入是多少？',
    expectedTools: ['hybridSearch'],
    category: '1-tool',
    description: '单工具：RAG检索财报数据',
  },
  {
    id: '1T-03',
    query: '中国长城的ROE是多少？',
    expectedTools: ['getStockFinancial'],
    category: '1-tool',
    description: '单工具：财务指标查询',
  },
  {
    id: '1T-04',
    query: '格力电器2025年利润表中净利润是多少？',
    expectedTools: ['getFinancialReport'],
    category: '1-tool',
    description: '单工具：财报表格查询（利润表）',
  },
  {
    id: '1T-05',
    query: '买入10000股五粮液是否合规？',
    expectedTools: ['checkTradeCompliance'],
    category: '1-tool',
    description: '单工具：合规检查',
  },

  // ──── 2 Tools Queries (5个) ────
  {
    id: '2T-01',
    query: '五粮液近一年的MA20和RSI14分别是多少？',
    expectedTools: ['getStockHistory', 'calculateMA'],
    category: '2-tools',
    description: '2工具：获取历史数据+计算技术指标',
  },
  {
    id: '2T-02',
    query: '格力电器2025年年报中的净利润，和当前市值对比，市盈率大概是多少？',
    expectedTools: ['getFinancialReport', 'getStockRealtime'],
    category: '2-tools',
    description: '2工具：财报利润+实时股价计算PE',
  },
  {
    id: '2T-03',
    query: '中国长城的营收增长率和净利润增长率分别是多少？从利润表中获取数据计算。',
    expectedTools: ['getFinancialReport', 'getStockFinancial'],
    category: '2-tools',
    description: '2工具：利润表+财务指标计算增长率',
  },
  {
    id: '2T-04',
    query: '五粮液和格力电器，哪只股票的波动率更大？',
    expectedTools: ['getStockHistory', 'calculateVolatility'],
    category: '2-tools',
    description: '2工具：历史数据+波动率计算',
  },
  {
    id: '2T-05',
    query: '格力电器2025年利润表中的营业利润和利润总额分别是多少？两者差额说明什么？',
    expectedTools: ['getFinancialReport', 'hybridSearch'],
    category: '2-tools',
    description: '2工具：利润表数据+RAG解读',
  },

  // ──── 3+ Tools Queries (5个) ────
  {
    id: '3T-01',
    query: '五粮液近一年的MACD和布林带指标如何？当前是否处于超买或超卖状态？',
    expectedTools: ['getStockHistory', 'calculateMACD', 'calculateBollinger'],
    category: '3+-tools',
    description: '3工具：历史数据+MACD+布林带综合分析',
  },
  {
    id: '3T-02',
    query: '格力电器2025年利润表中营业收入减去营业成本后的毛利润是多少？毛利率是多少？和五粮液对比如何？',
    expectedTools: ['getFinancialReport', 'getStockFinancial', 'hybridSearch'],
    category: '3+-tools',
    description: '3+工具：利润表计算毛利润+财务指标+RAG对比',
  },
  {
    id: '3T-03',
    query: '中国长城的VaR和最大回撤分别是多少？是否在风险限额内？',
    expectedTools: ['getStockHistory', 'calculateVaR', 'checkRiskLimits'],
    category: '3+-tools',
    description: '3工具：历史数据+VaR+风险限额检查',
  },
  {
    id: '3T-04',
    query: '五粮液和格力电器的相关系数是多少？如果同时持有这两只股票各50万，压力测试结果如何？',
    expectedTools: ['getStockHistory', 'calculateCorrelation', 'calculateStressTest'],
    category: '3+-tools',
    description: '3工具：历史数据+相关系数+压力测试',
  },
  {
    id: '3T-05',
    query: '格力电器2025年利润表中营业总收入、营业总成本、营业利润、利润总额、净利润分别是多少？计算营业利润率(营业利润/营业总收入)、利润总额率(利润总额/营业总收入)、净利润率(净利润/营业总收入)。',
    expectedTools: ['getFinancialReport'],
    category: '3+-tools',
    description: '3+工具：利润表完整链条分析+利润率计算',
  },
];

// ═══════════════════════════════════════════════════════════════
// Agent 调用
// ═══════════════════════════════════════════════════════════════

interface StepInfo {
  round: number;
  type: string;
  title: string;
  content: string;
  detail?: Record<string, unknown>;
  timestamp: number;
}

interface AgentResponse {
  success: boolean;
  answer: string;
  iterations: number;
  conversationId: string;
  steps: StepInfo[];
  error?: string;
}

async function callAgent(query: string, model?: string): Promise<AgentResponse> {
  const selectedModel = model || getCurrentModel();
  console.log(`  🤖 调用 Agent (model: ${selectedModel})...`);

  try {
    const res = await request(`${BASE_URL}/api/agent/run`, {
      method: 'POST',
      body: {
        query,
        maxIterations: MAX_ROUNDS,
        model: selectedModel,
        userId: 'eval-user',
      },
    });

    if (res.status === 304 || res.status === 403) {
      markModelExhausted(selectedModel);
      return callAgent(query); // 用下一个模型重试
    }

    const data = res.data as Record<string, unknown>;
    if (!data.success) {
      return {
        success: false,
        answer: data.error as string || 'Unknown error',
        iterations: data.iterations as number || 0,
        conversationId: '',
        steps: [],
        error: data.error as string,
      };
    }

    return {
      success: true,
      answer: data.answer as string,
      iterations: data.iterations as number,
      conversationId: data.conversationId as string,
      steps: (data.steps as StepInfo[]) || [],
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'timeout') {
      return {
        success: false,
        answer: 'Agent 超时',
        iterations: MAX_ROUNDS,
        conversationId: '',
        steps: [],
        error: 'timeout',
      };
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
// 报告生成
// ═══════════════════════════════════════════════════════════════

interface RoundReport {
  roundNumber: number;
  steps: Array<{ description: string; durationSec: number }>;
  totalDurationSec: number;
}

interface QueryReport {
  queryId: string;
  query: string;
  category: string;
  rounds: RoundReport[];
  answer: string;
  success: boolean;
  totalDurationSec: number;
  modelUsed: string;
  fixHistory: string[];
}

function formatRoundStep(step: StepInfo, stepIndex: number): { description: string; durationSec: number } {
  const typeMap: Record<string, string> = {
    'thinking': 'LLM 推理',
    'tool_call': '调用工具',
    'tool_result': '工具返回结果',
    'reflection': '反思判断',
    'retrieval': 'RAG 检索',
    'answer': '生成答案',
  };

  let description = '';
  const actionType = typeMap[step.type] || step.type;

  if (step.type === 'tool_call' || step.type === 'tool_result') {
    const detail = step.detail || {};
    const toolName = detail.toolName || detail.name || '';
    const params = detail.params || detail.parameters || {};
    const paramsStr = Object.keys(params).length > 0
      ? Object.entries(params).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
      : '';
    description = `步骤${stepIndex + 1}, ${actionType}: ${toolName}(${paramsStr})`;

    if (step.type === 'tool_result') {
      const result = detail.result || step.content || '';
      const resultPreview = typeof result === 'string'
        ? result.substring(0, 100)
        : JSON.stringify(result).substring(0, 100);
      description += ` → ${resultPreview}`;
    }
  } else if (step.type === 'thinking') {
    const content = step.content || '';
    const preview = content.substring(0, 80).replace(/\n/g, ' ');
    description = `步骤${stepIndex + 1}, ${actionType}: ${preview}`;
  } else if (step.type === 'answer') {
    const content = step.content || '';
    const preview = content.substring(0, 100).replace(/\n/g, ' ');
    description = `步骤${stepIndex + 1}, ${actionType}: ${preview}`;
  } else {
    const content = (step.content || '').substring(0, 80).replace(/\n/g, ' ');
    description = `步骤${stepIndex + 1}, ${actionType}: ${content}`;
  }

  return { description, durationSec: 0 };
}

function buildQueryReport(report: QueryReport): string {
  let output = '';
  output += `# ${report.query}\n`;
  output += `> ID: ${report.queryId} | 类别: ${report.category} | 模型: ${report.modelUsed} | 总耗时: ${report.totalDurationSec.toFixed(1)}s | ${report.success ? '✅ 成功' : '❌ 失败'}\n\n`;

  if (report.fixHistory.length > 0) {
    output += `### 修复记录\n`;
    for (const fix of report.fixHistory) {
      output += `- ${fix}\n`;
    }
    output += '\n';
  }

  for (const round of report.rounds) {
    output += `## 第${round.roundNumber}轮\n`;
    for (const step of round.steps) {
      output += `- ${step.description}, 耗时${step.durationSec.toFixed(1)}秒\n`;
    }
    output += `第${round.roundNumber}轮结束，总耗时${round.totalDurationSec.toFixed(1)}秒\n\n`;
  }

  output += `### 最终答案\n${report.answer}\n\n`;
  output += '---\n\n';
  return output;
}

// ═══════════════════════════════════════════════════════════════
// 主测评流程
// ═══════════════════════════════════════════════════════════════

async function runEvaluation() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  RAG + Agent 全面测评                                            ║');
  console.log('║  数据: 中国长城(000066) / 五粮液(000858) / 格力电器(000651)       ║');
  console.log('║  Query: 1-tool×5 + 2-tools×5 + 3+-tools×5 = 20 个               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // 检查服务可用性
  console.log('⏳ 检查服务可用性...');
  try {
    const healthRes = await request(`${BASE_URL}/api/health`);
    if (healthRes.status > 503) {
      console.error('❌ 主服务不可达，请先启动 Docker 容器');
      process.exit(1);
    }
    console.log('  ✅ 主服务可达');
  } catch {
    console.error('❌ 主服务不可达，请先启动 Docker 容器');
    process.exit(1);
  }

  const allReports: QueryReport[] = [];
  let passCount = 0;
  let failCount = 0;

  for (const eq of evalQueries) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📋 [${eq.category}] ${eq.id}: ${eq.description}`);
    console.log(`   Query: ${eq.query}`);
    console.log(`   期望工具: ${eq.expectedTools.join(', ')}`);
    console.log(`${'═'.repeat(60)}`);

    const queryStartTime = Date.now();
    const fixHistory: string[] = [];
    let attemptCount = 0;
    let result: AgentResponse | null = null;

    while (attemptCount < 3) {
      attemptCount++;
      if (attemptCount > 1) {
        console.log(`  🔄 第 ${attemptCount} 次尝试...`);
      }

      result = await callAgent(eq.query);

      if (!result.success) {
        const errorMsg = result.error || result.answer;
        console.log(`  ❌ Agent 失败: ${errorMsg}`);

        if (errorMsg.includes('304') || errorMsg.includes('403') || errorMsg.includes('quota') || errorMsg.includes('limit')) {
          markModelExhausted(getCurrentModel());
          fixHistory.push(`第${attemptCount}次: 模型额度用尽，切换模型`);
          continue;
        }

        if (attemptCount >= 3) {
          fixHistory.push(`第${attemptCount}次: Agent 失败 - ${errorMsg}`);
          break;
        }
        fixHistory.push(`第${attemptCount}次: Agent 失败 - ${errorMsg}，重试`);
        continue;
      }

      // 检查是否跑满5轮没有答案
      if (result.iterations >= MAX_ROUNDS && (!result.answer || result.answer.length < 10)) {
        console.log(`  ⚠️ 跑满 ${MAX_ROUNDS} 轮，答案不完整`);
        fixHistory.push(`第${attemptCount}次: 跑满${MAX_ROUNDS}轮无有效答案`);

        if (attemptCount >= 3) break;
        continue;
      }

      // 成功
      break;
    }

    if (!result) {
      result = { success: false, answer: '无响应', iterations: 0, conversationId: '', steps: [], error: 'no response' };
    }

    const totalDurationSec = (Date.now() - queryStartTime) / 1000;

    // 解析步骤，按轮次分组（过滤掉 round=0 的"收到查询"步骤）
    const validSteps = result.steps.filter(s => s.round > 0);
    const rounds: RoundReport[] = [];
    let currentRound: RoundReport | null = null;
    let stepIndex = 0;

    for (const step of validSteps) {
      if (!currentRound || currentRound.roundNumber !== step.round) {
        if (currentRound) {
          rounds.push(currentRound);
        }
        currentRound = { roundNumber: step.round, steps: [], totalDurationSec: 0 };
        stepIndex = 0;
      }

      const formatted = formatRoundStep(step, stepIndex);
      currentRound.steps.push(formatted);
      stepIndex++;
    }
    if (currentRound) {
      rounds.push(currentRound);
    }

    // 计算每轮耗时（基于时间戳差值）
    for (let i = 0; i < rounds.length; i++) {
      const roundSteps = validSteps.filter(s => s.round === rounds[i].roundNumber);
      if (roundSteps.length >= 2) {
        const firstTs = roundSteps[0].timestamp;
        const lastTs = roundSteps[roundSteps.length - 1].timestamp;
        rounds[i].totalDurationSec = (lastTs - firstTs) / 1000;
        // 分配每个步骤的耗时（均匀分配）
        const perStep = rounds[i].totalDurationSec / roundSteps.length;
        for (let j = 0; j < rounds[i].steps.length; j++) {
          rounds[i].steps[j].durationSec = Number(perStep.toFixed(1));
        }
      } else if (roundSteps.length === 1) {
        rounds[i].totalDurationSec = totalDurationSec / validSteps.length;
        rounds[i].steps[0].durationSec = Number(rounds[i].totalDurationSec.toFixed(1));
      }
    }

    const report: QueryReport = {
      queryId: eq.id,
      query: eq.query,
      category: eq.category,
      rounds,
      answer: result.answer,
      success: result.success,
      totalDurationSec,
      modelUsed: getCurrentModel(),
      fixHistory,
    };

    allReports.push(report);

    if (result.success && result.answer.length > 10) {
      passCount++;
      console.log(`  ✅ 成功 (${result.iterations} 轮, ${totalDurationSec.toFixed(1)}s)`);
    } else {
      failCount++;
      console.log(`  ❌ 失败 (${totalDurationSec.toFixed(1)}s)`);
    }

    // 简短输出答案
    const answerPreview = result.answer.substring(0, 200).replace(/\n/g, ' ');
    console.log(`  💬 ${answerPreview}...`);
  }

  // ═══════════════════════════════════════════════════════════════
  // 生成完整报告
  // ═══════════════════════════════════════════════════════════════

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

  let fullReport = '';
  fullReport += `# RAG + Agent 全面测评报告\n\n`;
  fullReport += `**测评时间**: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`;
  fullReport += `**测评数据**: 中国长城(000066) / 五粮液(000858) / 格力电器(000651)\n`;
  fullReport += `**数据范围**: 25年报 + 26年1季度报 + 近一年交易数据\n`;
  fullReport += `**模型优先级**: ${MODEL_PRIORITY.join(' → ')}\n`;
  fullReport += `**额度用尽模型**: ${exhaustedModels.size > 0 ? [...exhaustedModels].join(', ') : '无'}\n\n`;
  fullReport += `---\n\n`;

  // 汇总统计
  fullReport += `## 测评汇总\n\n`;
  fullReport += `| 指标 | 数值 |\n|---|---|\n`;
  fullReport += `| 总测试数 | ${allReports.length} |\n`;
  fullReport += `| 通过 | ${passCount} |\n`;
  fullReport += `| 失败 | ${failCount} |\n`;
  fullReport += `| 通过率 | ${((passCount / allReports.length) * 100).toFixed(1)}% |\n`;

  const avgDuration = allReports.reduce((sum, r) => sum + r.totalDurationSec, 0) / allReports.length;
  fullReport += `| 平均耗时 | ${avgDuration.toFixed(1)}s |\n`;

  const avgRounds = allReports.filter(r => r.success).reduce((sum, r) => sum + r.rounds.length, 0) / Math.max(passCount, 1);
  fullReport += `| 平均轮次 | ${avgRounds.toFixed(1)} |\n\n`;

  // 分类统计
  for (const cat of ['1-tool', '2-tools', '3+-tools']) {
    const catReports = allReports.filter(r => r.category === cat);
    const catPass = catReports.filter(r => r.success).length;
    const catAvg = catReports.reduce((sum, r) => sum + r.totalDurationSec, 0) / Math.max(catReports.length, 1);
    fullReport += `| ${cat} | ${catPass}/${catReports.length} 通过, 平均${catAvg.toFixed(1)}s |\n`;
  }

  fullReport += `\n---\n\n`;

  // 逐个 query 报告
  fullReport += `## 详细测评结果\n\n`;
  for (const report of allReports) {
    fullReport += buildQueryReport(report);
  }

  // 修复记录汇总
  const allFixes = allReports.filter(r => r.fixHistory.length > 0);
  if (allFixes.length > 0) {
    fullReport += `## 修复记录汇总\n\n`;
    for (const report of allFixes) {
      fullReport += `### ${report.queryId}: ${report.query}\n`;
      for (const fix of report.fixHistory) {
        fullReport += `- ${fix}\n`;
      }
      fullReport += '\n';
    }
  }

  fullReport += `\n---\n\n*本报告由测评脚本自动生成*\n`;

  // 保存报告
  const reportDir = path.resolve(__dirname, '..', 'specs', 'microservice-upgrade');
  const reportPath = path.join(reportDir, `agent-eval-report-${timestamp}.md`);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, fullReport, 'utf-8');

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log(`║  测评完成: ${passCount} 通过, ${failCount} 失败, 共 ${allReports.length} 项${' '.repeat(Math.max(0, 20 - String(allReports.length).length - String(passCount).length - String(failCount).length))}║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`\n📄 测评报告已生成: ${reportPath}`);

  if (exhaustedModels.size > 0) {
    console.log(`\n⚠️ 额度用尽的模型: ${[...exhaustedModels].join(', ')}`);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

runEvaluation().catch((err) => {
  console.error('测评运行失败:', err);
  process.exit(1);
});
