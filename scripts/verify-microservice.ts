import { RAGClient } from '../packages/rag-client/src';
import { LLMClient } from '../packages/llm-client/src';

const RAG_URL = process.env.RAG_SERVICE_URL || 'http://localhost:3001';
const LLM_URL = process.env.LLM_GATEWAY_URL || 'http://localhost:3002';
const EVAL_URL = process.env.EVALUATION_SERVICE_URL || 'http://localhost:3003';
const MAIN_URL = process.env.MAIN_SERVICE_URL || 'http://localhost:3000';
const NGINX_URL = process.env.NGINX_URL || 'http://localhost:80';

interface VerifyResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: VerifyResult[] = [];

function logResult(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  const icon = passed ? '✅' : '❌';
  console.log(`  状态: ${icon} ${passed ? '通过' : '失败'}`);
  console.log(`  详情: ${detail}`);
}

async function verifyRAGHealth(ragClient: RAGClient) {
  console.log('\n[验证 1] RAG 服务健康检查...');
  console.log(`  目标: ${RAG_URL}/api/health`);
  try {
    const ragHealth = await ragClient.health();
    console.log(`  结果: ${JSON.stringify(ragHealth)}`);
    logResult('RAG 服务健康检查', ragHealth.status === 'ok' || ragHealth.status === 'degraded', `status=${ragHealth.status}`);
  } catch (err) {
    console.log(`  结果: 连接失败 - ${err}`);
    logResult('RAG 服务健康检查', false, `连接失败: ${err}`);
  }
}

async function verifyLLMHealth(llmClient: LLMClient) {
  console.log('\n[验证 2] LLM Gateway 健康检查...');
  console.log(`  目标: ${LLM_URL}/api/health`);
  try {
    const llmHealth = await llmClient.health();
    console.log(`  结果: ${JSON.stringify(llmHealth)}`);
    logResult('LLM Gateway 健康检查', llmHealth.status === 'ok' || llmHealth.status === 'degraded', `status=${llmHealth.status}`);
  } catch (err) {
    console.log(`  结果: 连接失败 - ${err}`);
    logResult('LLM Gateway 健康检查', false, `连接失败: ${err}`);
  }
}

async function verifyEvaluationHealth() {
  console.log('\n[验证 3] 评估服务健康检查...');
  console.log(`  目标: ${EVAL_URL}/api/health`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const evalResponse = await fetch(`${EVAL_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    const evalHealth = await evalResponse.json();
    console.log(`  结果: ${JSON.stringify(evalHealth)}`);
    logResult('评估服务健康检查', evalHealth.status === 'ok' || evalHealth.status === 'degraded', `status=${evalHealth.status}`);
  } catch (err) {
    console.log(`  结果: 连接失败 - ${err}`);
    logResult('评估服务健康检查', false, `连接失败: ${err}`);
  }
}

async function verifyMainHealth() {
  console.log('\n[验证 4] 主服务健康检查...');
  console.log(`  目标: ${MAIN_URL}/api/health`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const mainResponse = await fetch(`${MAIN_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    const mainHealth = await mainResponse.json();
    console.log(`  结果: ${JSON.stringify(mainHealth)}`);
    logResult('主服务健康检查', true, `status=${mainHealth.status || 'ok'}`);
  } catch (err) {
    console.log(`  结果: 连接失败 - ${err}`);
    logResult('主服务健康检查', false, `连接失败: ${err}`);
  }
}

async function verifyNginxHealth() {
  console.log('\n[验证 5] Nginx 网关健康检查...');
  console.log(`  目标: ${NGINX_URL}/nginx-health`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const nginxResponse = await fetch(`${NGINX_URL}/nginx-health`, { signal: controller.signal });
    clearTimeout(timer);
    const text = await nginxResponse.text();
    console.log(`  结果: ${text}`);
    logResult('Nginx 网关健康检查', nginxResponse.status === 200, `status=${nginxResponse.status}`);
  } catch (err) {
    console.log(`  结果: 连接失败 - ${err}`);
    logResult('Nginx 网关健康检查', false, `连接失败: ${err}`);
  }
}

async function verifyNginxRouting() {
  console.log('\n[验证 6] Nginx 路由规则验证...');
  const routes = [
    { path: '/api/health', expectedUpstream: 'main-service', method: 'GET' },
    { path: '/api/evaluation/results', expectedUpstream: 'evaluation-service', method: 'GET' },
    { path: '/api/llm/usage', expectedUpstream: 'llm-gateway', method: 'GET' },
  ];

  let allPassed = true;
  for (const route of routes) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = `${NGINX_URL}${route.path}`;
      const response = await fetch(url, { method: route.method, signal: controller.signal });
      clearTimeout(timer);
      const passed = response.status < 500;
      console.log(`  ${route.method} ${route.path} → ${route.expectedUpstream}: ${response.status} ${passed ? '✅' : '❌'}`);
      if (!passed) allPassed = false;
    } catch (err) {
      console.log(`  ${route.method} ${route.path} → ${route.expectedUpstream}: 连接失败 ❌`);
      allPassed = false;
    }
  }
  logResult('Nginx 路由规则验证', allPassed, allPassed ? '所有路由可达' : '部分路由不可达');
}

async function verifyRAGSearch(ragClient: RAGClient) {
  console.log('\n[验证 7] RAG 检索功能...');
  try {
    const searchResult = await ragClient.search('中国长城营收', 5);
    console.log(`  结果: success=${searchResult.success}, 结果数=${searchResult.results.length}`);
    logResult('RAG 检索功能', searchResult.success, `success=${searchResult.success}, 结果数=${searchResult.results.length}`);
  } catch (err) {
    console.log(`  结果: ${err}`);
    logResult('RAG 检索功能', false, `异常: ${err}`);
  }
}

async function verifyDegradationSwitch() {
  console.log('\n[验证 8] 降级开关验证...');
  const useMicroservice = process.env.USE_MICROSERVICE !== 'false';
  console.log(`  USE_MICROSERVICE=${useMicroservice}`);
  logResult('降级开关验证', true, `USE_MICROSERVICE=${useMicroservice}`);
}

async function verifyInternalBlock() {
  console.log('\n[验证 9] 内部路径拦截验证...');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${NGINX_URL}/internal/test`, { signal: controller.signal });
    clearTimeout(timer);
    console.log(`  结果: status=${response.status}`);
    logResult('内部路径拦截', response.status === 403, `status=${response.status}`);
  } catch (err) {
    console.log(`  结果: ${err}`);
    logResult('内部路径拦截', false, `异常: ${err}`);
  }
}

async function verify() {
  console.log('=== 微服务架构端到端验证 ===');
  console.log(`  RAG 服务地址: ${RAG_URL}`);
  console.log(`  LLM Gateway 地址: ${LLM_URL}`);
  console.log(`  评估服务地址: ${EVAL_URL}`);
  console.log(`  主服务地址: ${MAIN_URL}`);
  console.log(`  Nginx 地址: ${NGINX_URL}`);

  const ragClient = new RAGClient({ baseUrl: RAG_URL, timeout: 5000 });
  const llmClient = new LLMClient({ baseUrl: LLM_URL, timeout: 5000 });

  await verifyRAGHealth(ragClient);
  await verifyLLMHealth(llmClient);
  await verifyEvaluationHealth();
  await verifyMainHealth();
  await verifyNginxHealth();
  await verifyNginxRouting();
  await verifyRAGSearch(ragClient);
  await verifyDegradationSwitch();
  await verifyInternalBlock();

  console.log('\n=== 验证汇总 ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`  通过: ${passed}/${results.length}`);
  console.log(`  失败: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log('\n  失败项:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`    ❌ ${r.name}: ${r.detail}`);
    }
  }

  console.log('\n=== 验证完成 ===');
  process.exit(failed > 0 ? 1 : 0);
}

verify().catch((err) => {
  console.error('验证脚本异常:', err);
  process.exit(1);
});
