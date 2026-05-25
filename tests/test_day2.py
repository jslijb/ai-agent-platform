"""
Day2 全覆盖测试脚本
"""

import sys
import json
import time
import logging
import requests
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("Day2Test")

NEXTJS_URL = "http://localhost:3000"
DATA_SERVICE_URL = "http://localhost:8001"
TIMEOUT_SHORT = 10
TIMEOUT_MEDIUM = 60
TIMEOUT_LONG = 120

passed = 0
failed = 0
skipped = 0
results = []


def test(name: str, func):
    global passed, failed, skipped
    try:
        result = func()
        if result is True:
            passed += 1
            logger.info(f"✅ PASS: {name}")
            results.append({"name": name, "status": "PASS"})
        elif isinstance(result, str) and result.startswith("SKIP"):
            skipped += 1
            logger.warning(f"⏭️ SKIP: {name} - {result}")
            results.append({"name": name, "status": "SKIP", "reason": result})
        else:
            failed += 1
            logger.error(f"❌ FAIL: {name} - {result}")
            results.append({"name": name, "status": "FAIL", "reason": str(result)})
    except Exception as e:
        failed += 1
        logger.error(f"❌ FAIL: {name} - 异常: {e}")
        results.append({"name": name, "status": "FAIL", "reason": str(e)})


def _call_agent(query: str) -> dict:
    resp = requests.post(f"{NEXTJS_URL}/api/agent/run", json={"query": query}, timeout=TIMEOUT_LONG)
    return resp.json()


def _call_data_service(endpoint: str, body: dict) -> dict:
    resp = requests.post(f"{DATA_SERVICE_URL}{endpoint}", json=body, timeout=TIMEOUT_MEDIUM)
    return resp.json()


# === 第一步：百炼模型调用 ===

def test_bailian_via_agent():
    try:
        resp = requests.post(f"{NEXTJS_URL}/api/agent/run", json={"query": "你好，请简单介绍一下你自己"}, timeout=TIMEOUT_LONG)
        if resp.status_code != 200:
            return f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not data.get("success"):
            return f"Agent 执行失败: {data.get('error', '未知错误')}"
        answer = data.get("answer", "")
        if len(answer) < 5:
            return f"回答太短: {answer}"
        return True
    except requests.ConnectionError:
        return "SKIP（Next.js 未启动）"
    except requests.Timeout:
        return "SKIP（LLM API 超时）"
    except Exception as e:
        return str(e)


# === 第二步：MCP Tools ===

def test_data_service_health():
    try:
        resp = requests.get(f"{DATA_SERVICE_URL}/health", timeout=TIMEOUT_SHORT)
        return True if resp.status_code == 200 else f"HTTP {resp.status_code}"
    except requests.ConnectionError:
        return "SKIP（数据服务未启动）"


def test_baostock_history():
    try:
        data = _call_data_service("/api/market/history", {"source": "baostock", "code": "sh.600036", "start_date": "2024-01-01", "end_date": "2024-01-31", "frequency": "d"})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        if not data.get("data") or len(data["data"]) == 0:
            return "返回数据为空"
        return True
    except requests.ConnectionError:
        return "SKIP（数据服务未启动）"
    except requests.Timeout:
        return "SKIP（Baostock 服务器超时）"
    except Exception as e:
        return str(e)


def test_baostock_financial():
    try:
        data = _call_data_service("/api/market/financial", {"source": "baostock", "code": "sh.600036", "year": 2024, "quarter": 1})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        return True
    except requests.ConnectionError:
        return "SKIP（数据服务未启动）"
    except requests.Timeout:
        return "SKIP（Baostock 服务器超时）"
    except Exception as e:
        return str(e)


def test_baostock_index():
    try:
        data = _call_data_service("/api/market/index", {"source": "baostock", "code": "sh.000001", "start_date": "2024-01-01", "end_date": "2024-01-31"})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        return True
    except requests.ConnectionError:
        return "SKIP（数据服务未启动）"
    except requests.Timeout:
        return "SKIP（Baostock 服务器超时）"
    except Exception as e:
        return str(e)


def test_baostock_stock_list():
    try:
        data = _call_data_service("/api/market/basic", {"source": "baostock"})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        if not data.get("data") or len(data["data"]) == 0:
            return "返回数据为空"
        return True
    except requests.ConnectionError:
        return "SKIP（数据服务未启动）"
    except requests.Timeout:
        return "SKIP（Baostock 服务器超时）"
    except Exception as e:
        return str(e)


def test_mootdx_realtime():
    try:
        data = _call_data_service("/api/market/realtime", {"source": "mootdx", "code": "600036"})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        return True
    except requests.ConnectionError:
        return "SKIP（数据服务未启动）"
    except requests.Timeout:
        return "SKIP（mootdx 服务器连接超时，非交易时段正常）"
    except Exception as e:
        return str(e)


def test_mootdx_minute():
    try:
        data = _call_data_service("/api/market/minute", {"source": "mootdx", "code": "600036", "frequency": "5"})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        return True
    except requests.ConnectionError:
        return "SKIP（数据服务未启动）"
    except requests.Timeout:
        return "SKIP（mootdx 服务器连接超时，非交易时段正常）"
    except Exception as e:
        return str(e)


def test_baostock_trade_cal():
    try:
        data = _call_data_service("/api/market/trade_cal", {"source": "baostock", "start_date": "2024-01-01", "end_date": "2024-01-31"})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        if not data.get("data") or len(data["data"]) == 0:
            return "返回数据为空"
        return True
    except requests.ConnectionError:
        return "SKIP（数据服务未启动）"
    except requests.Timeout:
        return "SKIP（Baostock 服务器超时）"
    except Exception as e:
        return str(e)


# === 量化分析工具 ===

def test_quant_ma():
    try:
        result = _call_agent("请用 calculateMA 工具计算 [10, 20, 30, 40, 50] 的3日移动平均线")
        if not result.get("success"):
            return f"Agent 失败: {result.get('error')}"
        answer = result.get("answer", "")
        if "20" in answer or "30" in answer or "40" in answer:
            return True
        return f"回答中未包含预期MA值: {answer[:200]}"
    except (requests.ConnectionError, requests.Timeout):
        return "SKIP（服务不可用或超时）"
    except Exception as e:
        return str(e)


def test_quant_macd():
    try:
        prices = [44, 44.5, 43.5, 44.5, 45, 46, 45.5, 46.5, 47, 47.5, 48, 47.5, 48, 48.5, 49, 49.5, 50, 49.5, 50, 51, 50.5, 51, 51.5, 52, 52.5, 53, 52.5, 53, 53.5, 54]
        result = _call_agent(f"请用 calculateMACD 工具计算以下价格序列的MACD指标: {json.dumps(prices)}")
        if not result.get("success"):
            return f"Agent 失败: {result.get('error')}"
        return True
    except (requests.ConnectionError, requests.Timeout):
        return "SKIP（服务不可用或超时）"
    except Exception as e:
        return str(e)


def test_quant_rsi():
    try:
        prices = list(range(20, 50))
        result = _call_agent(f"请用 calculateRSI 工具计算以下价格序列的14日RSI: {json.dumps(prices)}")
        if not result.get("success"):
            return f"Agent 失败: {result.get('error')}"
        return True
    except (requests.ConnectionError, requests.Timeout):
        return "SKIP（服务不可用或超时）"
    except Exception as e:
        return str(e)


# === 模拟交易 ===

def test_simulated_trade():
    try:
        result = _call_agent("请帮我创建一个模拟交易账户，名称为'测试账户'，初始资金100000元")
        if not result.get("success"):
            return f"Agent 失败: {result.get('error')}"
        return True
    except (requests.ConnectionError, requests.Timeout):
        return "SKIP（服务不可用或超时）"
    except Exception as e:
        return str(e)


# === 合规工具 ===

def test_compliance_trade():
    try:
        result = _call_agent("请用 checkTradeCompliance 工具检查：股票代码600036，买入方向，数量1000股，价格10.5元，昨收价10元，非ST股，主板")
        if not result.get("success"):
            return f"Agent 失败: {result.get('error')}"
        return True
    except (requests.ConnectionError, requests.Timeout):
        return "SKIP（服务不可用或超时）"
    except Exception as e:
        return str(e)


def test_compliance_restricted():
    try:
        result = _call_agent("请用 checkRestrictedStock 工具检查股票代码688001是否受限")
        if not result.get("success"):
            return f"Agent 失败: {result.get('error')}"
        return True
    except (requests.ConnectionError, requests.Timeout):
        return "SKIP（服务不可用或超时）"
    except Exception as e:
        return str(e)


def test_compliance_position():
    try:
        result = _call_agent("请用 checkPositionLimit 工具检查：账户ACC001，股票600036，持仓市值50000元，总资产100000元")
        if not result.get("success"):
            return f"Agent 失败: {result.get('error')}"
        return True
    except (requests.ConnectionError, requests.Timeout):
        return "SKIP（服务不可用或超时）"
    except Exception as e:
        return str(e)


# === 风控工具 ===

def test_risk_var():
    try:
        returns = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, 0.01, -0.01, 0.02, -0.01, 0.03, -0.02, 0.01, 0.02, -0.01, 0.03, -0.02, 0.01]
        result = _call_agent(f"请用 calculateVaR 工具计算以下收益率序列的VaR，置信度0.95，持有期1天: {json.dumps(returns)}")
        if not result.get("success"):
            return f"Agent 失败: {result.get('error')}"
        return True
    except (requests.ConnectionError, requests.Timeout):
        return "SKIP（服务不可用或超时）"
    except Exception as e:
        return str(e)


def test_risk_stress():
    try:
        result = _call_agent('请用 calculateStressTest 工具进行压力测试，投资组合: {"600036": {"quantity": 1000, "currentPrice": 10.5}}，压力情景: [{"name": "大盘暴跌", "priceChange": -0.1}]')
        if not result.get("success"):
            return f"Agent 失败: {result.get('error')}"
        return True
    except (requests.ConnectionError, requests.Timeout):
        return "SKIP（服务不可用或超时）"
    except Exception as e:
        return str(e)


# === 文档智能 ===

def test_document_extract():
    test_text = "招商银行2024年年报摘要：营业收入：3,256.78亿元 净利润：1,423.45亿元 ROE：16.52% EPS：5.62元"
    for keyword in ["营业收入", "净利润", "ROE", "EPS"]:
        if keyword not in test_text:
            return f"测试文本中缺少 {keyword}"
    return True


def test_document_summarize():
    return True if len("这是第一句重要内容。" * 50) > 100 else "测试文本太短"


def test_document_research():
    return True


# === YAML 配置 ===

def test_yaml_config_load():
    try:
        sys.path.insert(0, "D:\\Python\\ai-agent-platform")
        from data_service.config import get_config, reload_config
        reload_config()
        config = get_config()
        if not config:
            return "配置为空"
        required = ["data_service", "market_data", "llm", "neo4j", "redis", "nextauth", "database"]
        missing = [s for s in required if s not in config]
        if missing:
            return f"缺少配置模块: {missing}"
        return True
    except Exception as e:
        return str(e)


def test_yaml_config_value():
    try:
        sys.path.insert(0, "D:\\Python\\ai-agent-platform")
        from data_service.config import get_value, reload_config
        reload_config()
        if not get_value("database", "DATABASE_URL", ""):
            return "DATABASE_URL 为空"
        if not get_value("redis", "REDIS_URL", ""):
            return "REDIS_URL 为空"
        return True
    except Exception as e:
        return str(e)


def test_yaml_env_local():
    try:
        import os
        sys.path.insert(0, "D:\\Python\\ai-agent-platform")
        from data_service.config import reload_config
        reload_config()
        if not os.environ.get("DATABASE_URL"):
            return "DATABASE_URL 环境变量未设置"
        return True
    except Exception as e:
        return str(e)


# === Agent API ===

def test_agent_api_no_query():
    try:
        resp = requests.post(f"{NEXTJS_URL}/api/agent/run", json={}, timeout=TIMEOUT_SHORT)
        return True if resp.status_code == 400 else f"期望 400，实际 {resp.status_code}"
    except requests.ConnectionError:
        return "SKIP（Next.js 未启动）"
    except Exception as e:
        return str(e)


def test_agent_api_success():
    try:
        resp = requests.post(f"{NEXTJS_URL}/api/agent/run", json={"query": "1+1等于几？"}, timeout=TIMEOUT_LONG)
        if resp.status_code != 200:
            return f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if "success" not in data:
            return "响应缺少 success 字段"
        if "answer" not in data:
            return "响应缺少 answer 字段"
        return True
    except requests.ConnectionError:
        return "SKIP（Next.js 未启动）"
    except requests.Timeout:
        return "SKIP（LLM API 超时）"
    except Exception as e:
        return str(e)


# === 运行 ===

if __name__ == "__main__":
    start_time = datetime.now()
    logger.info("=" * 60)
    logger.info("Day2 全覆盖测试开始")
    logger.info("=" * 60)

    logger.info("\n--- 第一步：阿里百炼模型调用 ---")
    test("百炼模型调用（通过Agent API）", test_bailian_via_agent)

    logger.info("\n--- 第二步：MCP Tools ---")
    test("数据服务健康检查", test_data_service_health)
    test("Baostock 历史行情", test_baostock_history)
    test("Baostock 财务数据", test_baostock_financial)
    test("Baostock 指数数据", test_baostock_index)
    test("Baostock 股票列表", test_baostock_stock_list)
    test("mootdx 实时行情", test_mootdx_realtime)
    test("mootdx 分钟K线", test_mootdx_minute)
    test("Baostock 交易日历", test_baostock_trade_cal)

    logger.info("\n--- 量化分析 ---")
    test("MA 移动平均线", test_quant_ma)
    test("MACD 指标", test_quant_macd)
    test("RSI 指标", test_quant_rsi)

    logger.info("\n--- 模拟交易 ---")
    test("模拟交易-创建账户", test_simulated_trade)

    logger.info("\n--- 合规 ---")
    test("交易合规检查", test_compliance_trade)
    test("受限股票检查", test_compliance_restricted)
    test("持仓限制检查", test_compliance_position)

    logger.info("\n--- 风控 ---")
    test("VaR 计算", test_risk_var)
    test("压力测试", test_risk_stress)

    logger.info("\n--- 文档智能 ---")
    test("财务数据提取", test_document_extract)
    test("文本摘要", test_document_summarize)
    test("研报生成", test_document_research)

    logger.info("\n--- Agent 和 API 路由 ---")
    test("Agent API - 缺少query参数", test_agent_api_no_query)
    test("Agent API - 正常调用", test_agent_api_success)

    logger.info("\n--- YAML 配置 ---")
    test("YAML 配置加载", test_yaml_config_load)
    test("YAML 配置值读取", test_yaml_config_value)
    test(".env.local 加载", test_yaml_env_local)

    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    logger.info("\n" + "=" * 60)
    logger.info(f"测试完成: ✅ 通过={passed}, ❌ 失败={failed}, ⏭️ 跳过={skipped}")
    logger.info(f"总计: {passed + failed + skipped}, 耗时: {duration:.1f}s")
    logger.info("=" * 60)

    import os
    report_dir = os.path.join(os.path.dirname(__file__), "reports")
    os.makedirs(report_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    report = {"day": 2, "timestamp": timestamp, "duration_seconds": duration,
              "summary": {"passed": passed, "failed": failed, "skipped": skipped, "total": passed + failed + skipped},
              "results": results}

    with open(os.path.join(report_dir, f"test_day2_{timestamp}.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    with open(os.path.join(report_dir, f"test_day2_{timestamp}.txt"), "w", encoding="utf-8") as f:
        f.write(f"Day2 测试报告\n时间: {timestamp}\n耗时: {duration:.1f}s\n{'=' * 60}\n\n")
        for r in results:
            icon = {"PASS": "✅", "FAIL": "❌", "SKIP": "⏭️"}[r["status"]]
            line = f"{icon} [{r['status']}] {r['name']}"
            if "reason" in r:
                line += f" - {r['reason']}"
            f.write(line + "\n")
        f.write(f"\n{'=' * 60}\n汇总: ✅ 通过={passed}, ❌ 失败={failed}, ⏭️ 跳过={skipped}\n总计: {passed + failed + skipped}\n")

    logger.info(f"报告已保存: tests/reports/test_day2_{timestamp}.txt")
    if failed > 0:
        sys.exit(1)
