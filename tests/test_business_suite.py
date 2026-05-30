import sys
import os
import json
import time
import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DATA_SERVICE_URL = "http://localhost:8001"
AGENT_URL = "http://localhost:3001"
REPORT_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(REPORT_DIR, exist_ok=True)

TEST_STOCKS = [
    {"code": "sz.000066", "short_code": "000066", "name": "中国长城", "source": "baostock"},
    {"code": "sz.000651", "short_code": "000651", "name": "格力电器", "source": "baostock"},
    {"code": "sz.000858", "short_code": "000858", "name": "五粮液", "source": "baostock"},
]

results = []


def test_data_service_health():
    print("\n" + "=" * 60)
    print("TEST 1: 数据服务健康检查")
    print("=" * 60)
    try:
        r = requests.get(f"{DATA_SERVICE_URL}/health", timeout=10)
        ok = r.status_code == 200
        print(f"  数据服务: {'PASS' if ok else 'FAIL'} (HTTP {r.status_code})")
        results.append({"test": "data_service_health", "pass": ok})
        return ok
    except Exception as e:
        print(f"  数据服务: FAIL ({e})")
        results.append({"test": "data_service_health", "pass": False, "error": str(e)})
        return False


def test_stock_history():
    print("\n" + "=" * 60)
    print("TEST 2: 历史行情数据获取")
    print("=" * 60)
    all_pass = True
    for stock in TEST_STOCKS:
        try:
            r = requests.post(
                f"{DATA_SERVICE_URL}/api/market/history",
                json={"source": stock["source"], "code": stock["code"], "frequency": "d", "start_date": "2026-04-01", "end_date": "2026-05-27"},
                timeout=30,
            )
            data = r.json()
            records = len(data.get("data", []))
            ok = data.get("success") and records > 0
            print(f"  {stock['name']}({stock['code']}): {'PASS' if ok else 'FAIL'} ({records} records)")
            results.append({"test": f"stock_history_{stock['name']}", "pass": ok, "records": records})
            if not ok:
                all_pass = False
        except Exception as e:
            print(f"  {stock['name']}: FAIL ({e})")
            results.append({"test": f"stock_history_{stock['name']}", "pass": False, "error": str(e)})
            all_pass = False
    return all_pass


def test_stock_realtime():
    print("\n" + "=" * 60)
    print("TEST 3: 实时行情数据获取（腾讯接口fallback）")
    print("=" * 60)
    all_pass = True
    for stock in TEST_STOCKS:
        try:
            r = requests.post(
                f"{DATA_SERVICE_URL}/api/market/realtime",
                json={"source": "efinance", "code": stock["short_code"]},
                timeout=20,
            )
            data = r.json()
            rt_data = data.get("data", [])
            ok = data.get("success") and len(rt_data) > 0
            name = rt_data[0].get("股票名称", rt_data[0].get("name", "?")) if rt_data else "?"
            price = rt_data[0].get("最新价", rt_data[0].get("price", "?")) if rt_data else "?"
            print(f"  {stock['name']}: {'PASS' if ok else 'FAIL'} (name={name}, price={price})")
            results.append({"test": f"stock_realtime_{stock['name']}", "pass": ok, "name": name, "price": price})
            if not ok:
                all_pass = False
        except Exception as e:
            print(f"  {stock['name']}: FAIL ({e})")
            results.append({"test": f"stock_realtime_{stock['name']}", "pass": False, "error": str(e)})
            all_pass = False
    return all_pass


def test_agent_full_chain():
    print("\n" + "=" * 60)
    print("TEST 4: Agent 完整执行链路（中国长城）")
    print("=" * 60)
    query = (
        "获取中国长城(000066)最近30天的日K线数据，"
        "计算20日移动均线MA20和14日RSI指标，"
        "同时获取实时行情，"
        "并进行交易合规检查（单只股票仓位不超过20%），"
        "最后给出完整的技术分析和合规结论"
    )
    try:
        t0 = time.time()
        r = requests.post(
            f"{AGENT_URL}/api/agent/run",
            json={"query": query, "maxIterations": 10, "userId": "test-e2e-business"},
            headers={"Content-Type": "application/json"},
            timeout=360,
        )
        elapsed = time.time() - t0
        data = r.json()
        steps = data.get("steps", [])
        tool_calls = [s for s in steps if s.get("type") == "tool_call"]
        tool_names = [s.get("detail", {}).get("toolName", "") for s in tool_calls]
        answer = data.get("answer", "")
        ok = data.get("success") and len(tool_names) >= 3 and len(answer) > 100
        print(f"  HTTP: {r.status_code} | 耗时: {elapsed:.0f}s | 迭代: {data.get('iterations', 0)} | 工具: {tool_names}")
        print(f"  答案长度: {len(answer)} chars")
        print(f"  结果: {'PASS' if ok else 'FAIL'}")
        results.append({
            "test": "agent_full_chain_china_great_wall",
            "pass": ok,
            "elapsed": round(elapsed, 1),
            "iterations": data.get("iterations"),
            "tool_chain": tool_names,
            "answer_length": len(answer),
        })
        return ok
    except Exception as e:
        print(f"  FAIL ({e})")
        results.append({"test": "agent_full_chain_china_great_wall", "pass": False, "error": str(e)})
        return False


def test_agent_simple_query():
    print("\n" + "=" * 60)
    print("TEST 5: Agent 简单查询（格力电器实时行情）")
    print("=" * 60)
    query = "查询格力电器(000651)的实时行情"
    try:
        t0 = time.time()
        r = requests.post(
            f"{AGENT_URL}/api/agent/run",
            json={"query": query, "maxIterations": 5, "userId": "test-e2e-simple"},
            headers={"Content-Type": "application/json"},
            timeout=120,
        )
        elapsed = time.time() - t0
        data = r.json()
        answer = data.get("answer", "")
        ok = data.get("success") and len(answer) > 50
        print(f"  耗时: {elapsed:.0f}s | 答案长度: {len(answer)} | 结果: {'PASS' if ok else 'FAIL'}")
        results.append({"test": "agent_simple_query_gree", "pass": ok, "elapsed": round(elapsed, 1), "answer_length": len(answer)})
        return ok
    except Exception as e:
        print(f"  FAIL ({e})")
        results.append({"test": "agent_simple_query_gree", "pass": False, "error": str(e)})
        return False


def test_agent_compliance():
    print("\n" + "=" * 60)
    print("TEST 6: Agent 合规检查（五粮液）")
    print("=" * 60)
    query = "检查五粮液(000858)的交易合规性，单只股票仓位不超过20%"
    try:
        t0 = time.time()
        r = requests.post(
            f"{AGENT_URL}/api/agent/run",
            json={"query": query, "maxIterations": 5, "userId": "test-e2e-compliance"},
            headers={"Content-Type": "application/json"},
            timeout=120,
        )
        elapsed = time.time() - t0
        data = r.json()
        answer = data.get("answer", "")
        ok = data.get("success") and len(answer) > 50
        print(f"  耗时: {elapsed:.0f}s | 答案长度: {len(answer)} | 结果: {'PASS' if ok else 'FAIL'}")
        results.append({"test": "agent_compliance_wuliangye", "pass": ok, "elapsed": round(elapsed, 1), "answer_length": len(answer)})
        return ok
    except Exception as e:
        print(f"  FAIL ({e})")
        results.append({"test": "agent_compliance_wuliangye", "pass": False, "error": str(e)})
        return False


def test_model_config():
    print("\n" + "=" * 60)
    print("TEST 7: 模型配置验证（BAILIAN_MODEL 已移除）")
    print("=" * 60)
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    yaml_path = os.path.join(os.path.dirname(__file__), "..", "config", "api_keys.yaml")

    bailian_in_env = False
    bailian_in_yaml = False

    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith("BAILIAN_MODEL="):
                bailian_in_env = True

    with open(yaml_path, "r", encoding="utf-8") as f:
        content = f.read()
        if "BAILIAN_MODEL" in content:
            bailian_in_yaml = True

    ok = not bailian_in_env and not bailian_in_yaml
    print(f"  .env.local 中 BAILIAN_MODEL: {'存在(FAIL)' if bailian_in_env else '不存在(PASS)'}")
    print(f"  api_keys.yaml 中 BAILIAN_MODEL: {'存在(FAIL)' if bailian_in_yaml else '不存在(PASS)'}")
    print(f"  结果: {'PASS' if ok else 'FAIL'}")
    results.append({"test": "model_config_no_bailian", "pass": ok, "env_has_bailian": bailian_in_env, "yaml_has_bailian": bailian_in_yaml})
    return ok


def test_models_api():
    print("\n" + "=" * 60)
    print("TEST 8: 模型列表 API（默认模型为 models 列表第一个）")
    print("=" * 60)
    try:
        r = requests.get(f"{AGENT_URL}/api/agent/models", timeout=10)
        data = r.json()
        models = data.get("models", [])
        default_model = data.get("defaultModel", "")
        ok = len(models) > 0 and default_model == models[0].get("id", "")
        print(f"  模型数: {len(models)} | 默认模型: {default_model} | 首个模型: {models[0].get('id', '?') if models else '?'}")
        print(f"  结果: {'PASS' if ok else 'FAIL'}")
        results.append({"test": "models_api", "pass": ok, "model_count": len(models), "default_model": default_model})
        return ok
    except Exception as e:
        print(f"  FAIL ({e})")
        results.append({"test": "models_api", "pass": False, "error": str(e)})
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("AI Agent Platform - 业务测试套件")
    print(f"时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"测试股票: 中国长城(000066)、格力电器(000651)、五粮液(000858)")
    print("=" * 60)

    test_data_service_health()
    test_stock_history()
    test_stock_realtime()
    test_model_config()

    agent_available = False
    try:
        r = requests.get(f"{AGENT_URL}/api/health", timeout=5)
        agent_available = r.status_code == 200
    except:
        pass

    if agent_available:
        test_models_api()
        test_agent_simple_query()
        test_agent_compliance()
        test_agent_full_chain()
    else:
        print("\n[SKIP] Agent 服务未启动，跳过 Agent 相关测试")

    total = len(results)
    passed = sum(1 for r in results if r.get("pass"))
    failed = total - passed

    print("\n" + "=" * 60)
    print(f"测试结果汇总: {passed}/{total} PASSED, {failed} FAILED")
    print("=" * 60)

    for r in results:
        status = "PASS" if r.get("pass") else "FAIL"
        print(f"  [{status}] {r['test']}")

    ts = time.strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join(REPORT_DIR, f"business_test_report_{ts}.json")
    report = {
        "test_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": total,
        "passed": passed,
        "failed": failed,
        "results": results,
    }
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n报告已保存: {report_path}")
