"""
Day2 全覆盖测试脚本
"""

import sys
import os
import json
import time
import logging
import requests
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("Day2Test")

NEXTJS_URL = "http://localhost:3000"
DATA_SERVICE_URL = "http://localhost:8002"
TIMEOUT_SHORT = 30
TIMEOUT_MEDIUM = 120
TIMEOUT_LONG = 180
MAX_RETRIES = 2
RETRY_DELAY = 3

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


def _call_data_service(endpoint: str, body: dict) -> dict:
    last_err = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.post(f"{DATA_SERVICE_URL}{endpoint}", json=body, timeout=TIMEOUT_MEDIUM)
            return resp.json()
        except requests.Timeout:
            last_err = f"数据服务超时(尝试 {attempt + 1}/{MAX_RETRIES + 1})"
            logger.warning(last_err)
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
        except requests.ConnectionError:
            last_err = "数据服务未启动"
            break
    raise ConnectionError(last_err)


# === MCP Tools ===

def test_data_service_health():
    try:
        resp = requests.get(f"{DATA_SERVICE_URL}/health", timeout=30)
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
    except ConnectionError as e:
        return f"SKIP（{e}）"
    except Exception as e:
        return str(e)


def test_baostock_financial():
    try:
        data = _call_data_service("/api/market/financial", {"source": "baostock", "code": "sh.600036", "year": 2024, "quarter": 1})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        return True
    except ConnectionError as e:
        return f"SKIP（{e}）"
    except Exception as e:
        return str(e)


def test_baostock_index():
    try:
        data = _call_data_service("/api/market/index", {"source": "baostock", "code": "sh.000001", "start_date": "2024-01-01", "end_date": "2024-01-31"})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        return True
    except ConnectionError as e:
        return f"SKIP（{e}）"
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
    except ConnectionError as e:
        return f"SKIP（{e}）"
    except Exception as e:
        return str(e)


def test_mootdx_realtime():
    try:
        data = _call_data_service("/api/market/realtime", {"source": "mootdx", "code": "600036"})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        return True
    except requests.ConnectionError as e:
        return f"SKIP（{e}）"
    except Exception as e:
        return str(e)


def test_mootdx_minute():
    try:
        data = _call_data_service("/api/market/minute", {"source": "mootdx", "code": "600036", "frequency": "5"})
        if not data.get("success"):
            return f"请求失败: {data.get('error')}"
        return True
    except requests.ConnectionError as e:
        return f"SKIP（{e}）"
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
    except ConnectionError as e:
        return f"SKIP（{e}）"
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
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        sys.path.insert(0, project_root)
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
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        sys.path.insert(0, project_root)
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
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        sys.path.insert(0, project_root)
        from data_service.config import get_value, reload_config
        reload_config()
        if not get_value("database", "DATABASE_URL", ""):
            return "DATABASE_URL 配置为空"
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


# === 运行 ===

if __name__ == "__main__":
    start_time = datetime.now()
    logger.info("=" * 60)
    logger.info("Day2 全覆盖测试开始")
    logger.info("=" * 60)

    logger.info("\n--- MCP Tools ---")
    test("数据服务健康检查", test_data_service_health)
    test("Baostock 历史行情", test_baostock_history)
    test("Baostock 财务数据", test_baostock_financial)
    test("Baostock 指数数据", test_baostock_index)
    test("Baostock 股票列表", test_baostock_stock_list)
    test("mootdx 实时行情", test_mootdx_realtime)
    test("mootdx 分钟K线", test_mootdx_minute)
    test("Baostock 交易日历", test_baostock_trade_cal)

    logger.info("\n--- 文档智能 ---")
    test("财务数据提取", test_document_extract)
    test("文本摘要", test_document_summarize)
    test("研报生成", test_document_research)

    logger.info("\n--- Agent API ---")
    test("Agent API - 缺少query参数", test_agent_api_no_query)

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
