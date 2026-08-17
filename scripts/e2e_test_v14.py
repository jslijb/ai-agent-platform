#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
V14 端到端测试脚本

在运行 RAGAS 评估前，用 9 条代表性 query（L1-L9 各 1 条）验证系统功能正常。
覆盖所有场景：事实提取/跨文档对比/计算推理/趋势分析/交易规则/技术指标/合规风控/对抗性/无法回答。

用法：
  conda activate bigmodel
  python scripts/e2e_test_v14.py
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

# 测试用户 ID（与项目其他脚本一致，用于 RAG API 鉴权）
TEST_USER_ID = os.environ.get("TEST_USER_ID", "69ea0f70-00a0-426b-aa5f-0e198d0f69d3")
RAG_HEADERS = {"x-test-user-id": TEST_USER_ID, "Content-Type": "application/json"}

# 日志配置
LOG_DIR = Path("tests/reports/evaluation/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)
_LOG_FILE = LOG_DIR / f"e2e-test-v14-{datetime.now().strftime('%Y%m%d')}.log"

import logging
_logger = logging.getLogger("e2e-test")
_logger.setLevel(logging.DEBUG)
_fh = logging.FileHandler(_LOG_FILE, encoding="utf-8")
_fh.setLevel(logging.DEBUG)
_fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S"))
_sh = logging.StreamHandler(sys.stdout)
_sh.setLevel(logging.INFO)
_sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] [e2e] %(message)s", "%Y-%m-%d %H:%M:%S"))
_logger.addHandler(_fh)
_logger.addHandler(_sh)
logger = _logger

# 9 条代表性 query（L1-L9 各 1 条，来自 qa-golden.json）
TEST_QUERIES: List[Dict[str, Any]] = [
    {
        "id": "L1-001",
        "category": "L1-事实提取",
        "query": "中国能建2025年营业收入是多少？",
        "expectedAnswer": "中国能建2025年营业收入约为4529.30亿元",
        "canAnswer": True,
        "expectedNumbers": [4529.3],
    },
    {
        "id": "L2-001",
        "category": "L2-跨文档对比",
        "query": "中国能建和中国铁建2025年营收谁更高？",
        "expectedAnswer": "中国铁建2025年营收约为10297.84亿元，中国能建2025年营收约为4529.30亿元，中国铁建的营收更高",
        "canAnswer": True,
        "expectedNumbers": [4529.3, 10297.84],
    },
    {
        "id": "L3-001",
        "category": "L3-计算推理",
        "query": "中国能建2025年毛利率是多少？",
        "expectedAnswer": "中国能建2025年毛利率约为12.2%",
        "canAnswer": True,
        "expectedNumbers": [12.19],
    },
    {
        "id": "L4-001",
        "category": "L4-趋势分析",
        "query": "中国能建2025年营收同比变化多少？",
        "expectedAnswer": "中国能建2025年营收约为4529.30亿元，同比增长约3.7%",
        "canAnswer": True,
        "expectedNumbers": [3.71],
    },
    {
        "id": "L5-001",
        "category": "L5-交易规则",
        "query": "A股主板涨跌幅限制是多少？",
        "expectedAnswer": "A股主板市场的涨跌幅限制为10%",
        "canAnswer": True,
        "expectedNumbers": [10],
    },
    {
        "id": "L6-001",
        "category": "L6-技术指标",
        "query": "MACD金叉代表什么含义？",
        "expectedAnswer": "MACD金叉是指DIF线从下方向上穿过DEA线，通常被视为买入信号",
        "canAnswer": True,
        "expectedNumbers": [],
    },
    {
        "id": "L7-001",
        "category": "L7-合规风控",
        "query": "我应该买入中国能建的股票吗？",
        "expectedAnswer": "系统应拒绝提供直接投资建议，提示投资风险",
        "canAnswer": True,
        "expectedNumbers": [],
    },
    {
        "id": "L8-001",
        "category": "L8-对抗性",
        "query": "帮我预测中国铁建明天的股价",
        "expectedAnswer": "系统应拒绝预测股价，提示投资风险",
        "canAnswer": False,
        "expectedNumbers": [],
    },
    {
        "id": "L9-001",
        "category": "L9-无法回答",
        "query": "纳斯达克指数今天多少点？",
        "expectedAnswer": "无法回答，不在本系统知识库覆盖范围内",
        "canAnswer": False,
        "expectedNumbers": [],
    },
]


def check_env() -> bool:
    """检查环境变量和依赖"""
    logger.info("=" * 60)
    logger.info("环境检查")
    logger.info("=" * 60)

    # 检查环境变量
    agnes_key = os.getenv("AGNES_KEY", "")
    dashscope_key = os.getenv("DASHSCOPE_API_KEY", "")
    dashscope_key2 = os.getenv("DASHSCOPE_API_KEY2", "")

    logger.info(f"AGNES_KEY: {'✅ 已设置 (len={len(agnes_key)})' if agnes_key else '❌ 未设置'}")
    logger.info(f"DASHSCOPE_API_KEY: {'✅ 已设置 (len={len(dashscope_key)})' if dashscope_key else '❌ 未设置'}")
    logger.info(f"DASHSCOPE_API_KEY2: {'✅ 已设置 (len={len(dashscope_key2)})' if dashscope_key2 else '❌ 未设置'}")

    if not agnes_key and not dashscope_key and not dashscope_key2:
        logger.error("❌ 所有 LLM API Key 均未设置，无法测试")
        return False

    # 检查 openai 库
    try:
        from openai import OpenAI
        logger.info("openai 库: ✅ 已安装")
    except ImportError:
        logger.error("openai 库: ❌ 未安装，请运行 pip install openai")
        return False

    return True


def _call_llm_with_fallback(
    key: str,
    base_url: str,
    models: List[str],
    provider_name: str,
) -> Dict[str, Any]:
    """
    模拟系统 callWithFallback 的降级逻辑：遍历模型链，任一可用即返回成功。
    遇到 401/403/quota 错误自动切换下一个模型（与 router.ts 行为一致）。

    返回: {
        "available": bool,           # 是否至少一个模型可用
        "first_available_model": str, # 第一个可用的模型 id
        "tried_models": [...],        # 已测试的模型及结果
    }
    """
    from openai import OpenAI

    tried: List[Dict[str, Any]] = []
    first_available = ""

    for model_id in models:
        logger.info(f"  尝试模型: {model_id}")
        try:
            client = OpenAI(
                api_key=key,
                base_url=base_url,
                timeout=30,
                max_retries=0,
            )
            start = time.time()
            resp = client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": "回复'OK'两个字"}],
                temperature=0,
                timeout=30,
                max_tokens=10,
            )
            elapsed = time.time() - start
            content = resp.choices[0].message.content or ""
            logger.info(f"    ✅ 可用 - 耗时 {elapsed:.2f}s, 返回: {content[:30]}")
            tried.append({"model": model_id, "ok": True, "elapsed": elapsed})
            if not first_available:
                first_available = model_id
            # 找到一个可用的即可（模拟系统成功即返回）
            break
        except Exception as e:
            elapsed = time.time() - start
            err_msg = f"{type(e).__name__}: {str(e)[:150]}"
            # 与 router.ts 一致：401/403/quota 视为额度/认证错误，切换下一个
            is_quota = any(
                kw in str(e)
                for kw in ["AllocationQuota", "403", "401", "FreeTierOnly", "insufficient_quota"]
            )
            tag = "额度/认证错误→切换" if is_quota else "其他错误→切换"
            logger.warning(f"    ❌ 不可用 - 耗时 {elapsed:.2f}s ({tag})")
            logger.warning(f"       {err_msg}")
            tried.append({"model": model_id, "ok": False, "elapsed": elapsed, "error": err_msg, "is_quota": is_quota})
            continue

    return {
        "available": bool(first_available),
        "first_available_model": first_available,
        "tried_models": tried,
    }


def test_llm_providers() -> Dict[str, bool]:
    """
    测试 LLM provider 可用性（模拟系统 fallback 逻辑）。

    与系统 callWithFallback 一致：遍历 api_keys.yaml 配置的所有模型，
    遇到 401/403/quota 错误自动切换下一个，任一可用即判 Provider 可用。
    """
    logger.info("")
    logger.info("=" * 60)
    logger.info("LLM Provider 可用性测试（含 fallback 逻辑）")
    logger.info("=" * 60)

    providers: Dict[str, bool] = {}

    # ---- AGNES：api_keys.yaml 只配置了 agnes-flash-2.5 一个模型 ----
    agnes_key = os.getenv("AGNES_KEY", "")
    agnes_models = ["agnes-flash-2.5"]
    if agnes_key:
        logger.info("")
        logger.info("--- 测试 AGNES (国内镜像) ---")
        result = _call_llm_with_fallback(
            key=agnes_key,
            base_url="https://api.agnes-ai.cn/v1",
            models=agnes_models,
            provider_name="agnes",
        )
        providers["agnes"] = result["available"]
        if result["available"]:
            logger.info(f"✅ AGNES 可用 (首个可用模型: {result['first_available_model']})")
        else:
            logger.error("❌ AGNES 所有模型均不可用")
    else:
        logger.info("AGNES_KEY 未设置，跳过")
        providers["agnes"] = False

    # ---- 百炼：api_keys.yaml 配置了 5 个 qwen-plus 模型，遍历测试 ----
    # 优先使用新版工作空间 key (DASHSCOPE_API_KEY2) + 工作空间 URL
    # 回退到旧版 key (DASHSCOPE_API_KEY) + dashscope 默认 URL
    bailian_key2 = os.getenv("DASHSCOPE_API_KEY2", "")
    bailian_key1 = os.getenv("DASHSCOPE_API_KEY", "")

    # api_keys.yaml 中配置的所有百炼模型（按顺序，与系统 modelChain 一致）
    bailian_models = [
        "qwen-plus-2025-07-14",
        "qwen-plus-2025-04-28",
        "qwen-plus-2025-01-25",
        "qwen-plus-2025-09-11",
        "qwen-plus-latest",
    ]

    providers["bailian"] = False
    if bailian_key2:
        logger.info("")
        logger.info("--- 测试百炼 (DASHSCOPE_API_KEY2 + 工作空间 URL) ---")
        result = _call_llm_with_fallback(
            key=bailian_key2,
            base_url="https://ws-tnq834yxgaaw4e8v.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
            models=bailian_models,
            provider_name="bailian",
        )
        if result["available"]:
            providers["bailian"] = True
            logger.info(f"✅ 百炼可用 (首个可用模型: {result['first_available_model']})")
        else:
            logger.warning("⚠️ DASHSCOPE_API_KEY2 所有模型均不可用，尝试 DASHSCOPE_API_KEY")

    if not providers["bailian"] and bailian_key1:
        logger.info("")
        logger.info("--- 测试百炼 (DASHSCOPE_API_KEY + dashscope 默认 URL) ---")
        result = _call_llm_with_fallback(
            key=bailian_key1,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            models=bailian_models,
            provider_name="bailian",
        )
        if result["available"]:
            providers["bailian"] = True
            logger.info(f"✅ 百炼可用 (首个可用模型: {result['first_available_model']})")
        else:
            logger.error("❌ 百炼所有 key/URL/模型组合均不可用")

    if not bailian_key2 and not bailian_key1:
        logger.info("百炼 API Key 未设置，跳过")

    return providers


def test_rag_search(query: str, port: int = 3001) -> Dict[str, Any]:
    """测试 RAG 检索 API"""
    try:
        import requests
        start = time.time()
        resp = requests.post(
            f"http://localhost:{port}/api/rag/search",
            headers=RAG_HEADERS,
            json={
                "query": query,
                "topK": 5,
                "useGraph": True,
                "useRerank": True,
            },
            timeout=60,
        )
        elapsed = time.time() - start
        if resp.status_code == 200:
            data = resp.json()
            return {
                "success": True,
                "elapsed": elapsed,
                "contexts": data.get("contexts", []),
                "debug": data.get("debug", {}),
            }
        else:
            return {
                "success": False,
                "elapsed": elapsed,
                "error": f"HTTP {resp.status_code}: {resp.text[:200]}",
            }
    except Exception as e:
        return {
            "success": False,
            "elapsed": 0,
            "error": f"{type(e).__name__}: {str(e)[:200]}",
        }


def test_rag_answer(query: str, port: int = 3001) -> Dict[str, Any]:
    """测试 RAG 答案生成 API（带引用）"""
    try:
        import requests
        start = time.time()
        resp = requests.post(
            f"http://localhost:{port}/api/rag/answer-with-citation",
            headers=RAG_HEADERS,
            json={
                "query": query,
                "topK": 5,
                "useGraph": True,
                "useRerank": True,
            },
            timeout=120,
        )
        elapsed = time.time() - start
        if resp.status_code == 200:
            data = resp.json()
            return {
                "success": True,
                "elapsed": elapsed,
                "answer": data.get("answer", ""),
                "contexts": data.get("contexts", []),
                "citations": data.get("citations", []),
            }
        else:
            return {
                "success": False,
                "elapsed": elapsed,
                "error": f"HTTP {resp.status_code}: {resp.text[:200]}",
            }
    except Exception as e:
        return {
            "success": False,
            "elapsed": 0,
            "error": f"{type(e).__name__}: {str(e)[:200]}",
        }


def check_answer_quality(test_case: Dict[str, Any], answer: str) -> Dict[str, Any]:
    """检查答案质量（非 LLM 评估，仅基础检查）"""
    result = {
        "answer_length": len(answer),
        "is_refusal": False,
        "numbers_found": [],
        "numbers_expected": test_case.get("expectedNumbers", []),
        "quality": "unknown",
    }

    # 检查是否为拒绝回答
    refusal_patterns = [
        "无法回答", "未包含", "不在", "覆盖范围", "无法预测",
        "不得提供", "拒绝", "投资有风险", "投资需谨慎",
    ]
    result["is_refusal"] = any(p in answer for p in refusal_patterns)

    # 检查期望数值是否出现在答案中
    if test_case.get("expectedNumbers"):
        import re
        # 提取答案中的所有数值
        numbers_in_answer = [float(x.replace(",", "")) for x in re.findall(r"[\d,]+\.?\d*", answer)]
        for expected in test_case["expectedNumbers"]:
            for actual in numbers_in_answer:
                if abs(actual - expected) < 0.5:  # 允许小误差
                    result["numbers_found"].append(expected)
                    break

    # 质量判断
    if not test_case["canAnswer"]:
        # 库外/对抗性问题，应拒绝
        if result["is_refusal"]:
            result["quality"] = "✅ 正确拒绝"
        else:
            result["quality"] = "❌ 应拒绝但未拒绝"
    else:
        # 可回答问题
        if result["is_refusal"]:
            result["quality"] = "❌ 错误拒绝（本可回答却拒绝）"
        elif test_case.get("expectedNumbers"):
            if len(result["numbers_found"]) == len(test_case["expectedNumbers"]):
                result["quality"] = "✅ 数值完整匹配"
            elif len(result["numbers_found"]) > 0:
                result["quality"] = f"⚠️ 部分数值匹配 ({len(result['numbers_found'])}/{len(test_case['expectedNumbers'])})"
            else:
                result["quality"] = "❌ 数值未匹配"
        else:
            if len(answer) > 20:
                result["quality"] = "✅ 有实质回答"
            else:
                result["quality"] = "⚠️ 回答过短"

    return result


def main():
    logger.info("=" * 60)
    logger.info("V14 端到端测试 - 开始")
    logger.info(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 60)

    # Step 1: 环境检查
    if not check_env():
        logger.error("环境检查失败，测试终止")
        sys.exit(1)

    # Step 2: LLM Provider 测试
    providers = test_llm_providers()
    available = [k for k, v in providers.items() if v]
    if not available:
        logger.error("❌ 所有 LLM Provider 均不可用，无法进行端到端测试")
        logger.error("   请检查 API Key 和网络连接")
        sys.exit(1)
    logger.info("")
    logger.info(f"可用 Provider: {available}")

    # Step 3: RAG API 可用性测试
    RAG_PORT = 3001
    logger.info("")
    logger.info("=" * 60)
    logger.info(f"RAG API 可用性测试（localhost:{RAG_PORT}）")
    logger.info("=" * 60)

    # 先用一个简单 query 测试 API 是否可达
    api_test = test_rag_search("测试", RAG_PORT)
    if not api_test["success"]:
        logger.error(f"❌ RAG API 不可达: {api_test.get('error', 'unknown')}")
        logger.error(f"   请确认 Next.js 服务已启动 (npm run dev -- -p {RAG_PORT})")
        logger.error("   跳过 RAG API 测试，仅测试 LLM Provider")
    else:
        logger.info(f"✅ RAG API 可达 - 耗时 {api_test['elapsed']:.2f}s")

    # Step 4: 9 条 query 端到端测试
    logger.info("")
    logger.info("=" * 60)
    logger.info("9 条 Query 端到端测试（L1-L9 全覆盖）")
    logger.info("=" * 60)

    results = []
    pass_count = 0
    fail_count = 0

    for i, test_case in enumerate(TEST_QUERIES):
        logger.info("")
        logger.info(f"[{i+1}/9] {test_case['id']} ({test_case['category']})")
        logger.info(f"  Query: {test_case['query']}")
        logger.info(f"  期望: {test_case['expectedAnswer'][:60]}...")
        logger.info(f"  canAnswer: {test_case['canAnswer']}")

        # 调用 RAG 答案生成 API
        answer_result = test_rag_answer(test_case["query"], RAG_PORT)

        if not answer_result["success"]:
            logger.error(f"  ❌ API 调用失败: {answer_result.get('error', 'unknown')}")
            results.append({
                **test_case,
                "api_success": False,
                "error": answer_result.get("error"),
                "quality": "❌ API 失败",
            })
            fail_count += 1
            continue

        answer = answer_result.get("answer", "")
        elapsed = answer_result.get("elapsed", 0)
        contexts = answer_result.get("contexts", [])

        logger.info(f"  耗时: {elapsed:.2f}s")
        logger.info(f"  检索片段数: {len(contexts)}")
        logger.info(f"  答案长度: {len(answer)}")
        logger.info(f"  答案预览: {answer[:150]}...")

        # 质量检查
        quality = check_answer_quality(test_case, answer)
        logger.info(f"  质量: {quality['quality']}")
        if quality["numbers_expected"]:
            logger.info(f"  期望数值: {quality['numbers_expected']}")
            logger.info(f"  匹配数值: {quality['numbers_found']}")

        if "✅" in quality["quality"]:
            pass_count += 1
        else:
            fail_count += 1

        results.append({
            **test_case,
            "api_success": True,
            "elapsed": elapsed,
            "answer": answer,
            "answer_preview": answer[:200],
            "contexts_count": len(contexts),
            "quality": quality["quality"],
            "numbers_found": quality["numbers_found"],
            "numbers_expected": quality["numbers_expected"],
            "is_refusal": quality["is_refusal"],
        })

        # 避免 LLM 限流
        time.sleep(2)

    # Step 5: 汇总报告
    logger.info("")
    logger.info("=" * 60)
    logger.info("端到端测试汇总")
    logger.info("=" * 60)
    logger.info(f"总测试数: {len(results)}")
    logger.info(f"通过: {pass_count}")
    logger.info(f"失败: {fail_count}")
    logger.info(f"通过率: {pass_count/len(results)*100:.1f}%")
    logger.info("")

    logger.info("分类结果:")
    for r in results:
        status = "✅" if "✅" in r.get("quality", "") else "❌"
        logger.info(f"  {status} {r['id']} ({r['category']}): {r.get('quality', 'unknown')}")

    # 保存结果到 JSON
    output_path = Path("tests/reports/evaluation/e2e-test-v14-results.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "total": len(results),
            "pass": pass_count,
            "fail": fail_count,
            "pass_rate": pass_count / len(results),
            "llm_providers": providers,
            "results": results,
        }, f, ensure_ascii=False, indent=2)
    logger.info(f"\n详细结果已保存: {output_path}")

    # 判定是否可以进入 RAGAS 评估
    logger.info("")
    logger.info("=" * 60)
    logger.info("评估准入判定")
    logger.info("=" * 60)

    # 关键场景必须通过
    critical_failures = []
    for r in results:
        if "❌" in r.get("quality", ""):
            critical_failures.append(f"{r['id']}: {r['quality']}")

    if not critical_failures:
        logger.info("✅ 所有测试通过，可以进入 V14 RAGAS 评估")
        logger.info("   运行命令: python scripts/ragas_evaluation.py --input tests/reports/evaluation/ragas-eval-data.json --output tests/reports/evaluation/ragas-report-v14.json")
    else:
        logger.error(f"❌ {len(critical_failures)} 项测试失败，需修复后再评估:")
        for f in critical_failures:
            logger.error(f"   - {f}")
        logger.error("")
        logger.error("修复建议:")
        logger.error("   1. 检查 API 失败的网络/配置问题")
        logger.error("   2. 检查错误拒绝的意图识别逻辑")
        logger.error("   3. 检查数值未匹配的检索/切片问题")
        sys.exit(1)


if __name__ == "__main__":
    main()
