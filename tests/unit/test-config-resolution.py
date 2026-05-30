import sys
import os
import re
import json
import time
import logging

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

results = []

_ENV_VAR_PATTERN = re.compile(r'^[A-Z][A-Z0-9_]*$')

def _resolve_env_values(data):
    if isinstance(data, dict):
        resolved = {}
        for key, value in data.items():
            resolved[key] = _resolve_env_values(value)
        return resolved
    elif isinstance(data, str):
        if _ENV_VAR_PATTERN.match(data):
            env_value = os.environ.get(data)
            if env_value is not None:
                return env_value
            return None
        return data
    elif isinstance(data, list):
        return [_resolve_env_values(item) for item in data]
    else:
        return data


def assert_test(condition, name, detail=""):
    if not condition:
        logger.error(f"[FAIL] {name}: {detail}")
        results.append({"name": name, "pass": False, "detail": detail})
    else:
        logger.info(f"[PASS] {name}")
        results.append({"name": name, "pass": True, "detail": detail})


def test_env_var_pattern():
    print("\n=== 测试: ENV_VAR_PATTERN 正则匹配 ===")
    assert_test(
        _ENV_VAR_PATTERN.match("DASHSCOPE_API_KEY") is not None,
        "全大写+下划线匹配",
        "DASHSCOPE_API_KEY"
    )
    assert_test(
        _ENV_VAR_PATTERN.match("DATABASE_URL") is not None,
        "全大写+下划线匹配",
        "DATABASE_URL"
    )
    assert_test(
        _ENV_VAR_PATTERN.match("1M") is None,
        "数字开头不匹配",
        "1M"
    )
    assert_test(
        _ENV_VAR_PATTERN.match("qwen3.6-max-preview") is None,
        "小写+点号不匹配",
        "qwen3.6-max-preview"
    )
    assert_test(
        _ENV_VAR_PATTERN.match("tick_flow_key") is None,
        "小写+下划线不匹配",
        "tick_flow_key"
    )
    assert_test(
        _ENV_VAR_PATTERN.match("256K") is None,
        "数字开头不匹配",
        "256K"
    )
    assert_test(
        _ENV_VAR_PATTERN.match("") is None,
        "空字符串不匹配"
    )


def test_resolve_env_values_basic():
    print("\n=== 测试: _resolve_env_values 基本解析 ===")
    os.environ["TEST_PY_CONFIG_KEY"] = "test_value_123"
    config = {
        "api_key": "TEST_PY_CONFIG_KEY",
        "model_name": "qwen3.6-max-preview",
        "context_size": "256K",
        "max_tokens": 4096,
    }
    resolved = _resolve_env_values(config)
    assert_test(
        resolved["api_key"] == "test_value_123",
        "环境变量名被解析为实际值",
        f"结果: {resolved['api_key']}"
    )
    assert_test(
        resolved["model_name"] == "qwen3.6-max-preview",
        "非环境变量名保持原值",
        f"结果: {resolved['model_name']}"
    )
    assert_test(
        resolved["context_size"] == "256K",
        "数字+字母格式保持原值",
        f"结果: {resolved['context_size']}"
    )
    assert_test(
        resolved["max_tokens"] == 4096,
        "数字值保持不变",
        f"结果: {resolved['max_tokens']}"
    )
    del os.environ["TEST_PY_CONFIG_KEY"]


def test_resolve_env_values_nested():
    print("\n=== 测试: _resolve_env_values 嵌套配置 ===")
    os.environ["NESTED_PY_TEST_KEY"] = "nested_py_value"
    config = {
        "llm": {
            "bailian": {
                "DASHSCOPE_API_KEY": "NESTED_PY_TEST_KEY",
            },
            "models": [
                {"id": "qwen3.6-max-preview", "context": "256K"},
                {"id": "deepseek-v4-pro", "context": "1M"},
            ],
        },
    }
    resolved = _resolve_env_values(config)
    assert_test(
        resolved["llm"]["bailian"]["DASHSCOPE_API_KEY"] == "nested_py_value",
        "嵌套环境变量解析",
        f"结果: {resolved['llm']['bailian']['DASHSCOPE_API_KEY']}"
    )
    assert_test(
        resolved["llm"]["models"][0]["id"] == "qwen3.6-max-preview",
        "数组内非环境变量保持原值"
    )
    assert_test(
        resolved["llm"]["models"][0]["context"] == "256K",
        "数组内256K保持原值"
    )
    assert_test(
        resolved["llm"]["models"][1]["context"] == "1M",
        "数组内1M保持原值"
    )
    del os.environ["NESTED_PY_TEST_KEY"]


def test_resolve_env_values_unset():
    print("\n=== 测试: _resolve_env_values 未设置的环境变量 ===")
    config = {
        "missing_key": "DEFINITELY_NOT_SET_PY_ENV_VAR_XYZ123",
    }
    resolved = _resolve_env_values(config)
    assert_test(
        resolved["missing_key"] is None,
        "未设置的环境变量返回None",
        f"结果: {resolved['missing_key']}"
    )


def test_resolve_env_values_list():
    print("\n=== 测试: _resolve_env_values 列表处理 ===")
    os.environ["LIST_TEST_KEY"] = "list_value"
    config = {
        "items": ["LIST_TEST_KEY", "1M", "qwen3.6-max-preview", 42],
    }
    resolved = _resolve_env_values(config)
    assert_test(
        resolved["items"][0] == "list_value",
        "列表中环境变量解析",
        f"结果: {resolved['items'][0]}"
    )
    assert_test(
        resolved["items"][1] == "1M",
        "列表中非环境变量保持原值"
    )
    assert_test(
        resolved["items"][3] == 42,
        "列表中数字保持不变"
    )
    del os.environ["LIST_TEST_KEY"]


def test_config_module_import():
    print("\n=== 测试: config 模块导入 ===")
    try:
        from data_service.config import get_config, get_value, get_raw_config, get_raw_value, reload_config
        assert_test(True, "config模块导入成功")
    except ImportError as e:
        assert_test(False, "config模块导入成功", str(e))
        return

    try:
        config = get_config()
        assert_test(
            isinstance(config, dict),
            "get_config返回字典",
            f"类型: {type(config)}"
        )
        assert_test(
            "llm" in config,
            "配置包含llm模块"
        )
        assert_test(
            "tushare" in config,
            "配置包含tushare顶层节点"
        )
        assert_test(
            "tickflow" in config,
            "配置包含tickflow顶层节点"
        )
    except Exception as e:
        assert_test(False, "get_config执行成功", str(e))


def test_config_no_bailian_model():
    print("\n=== 测试: 配置中无 BAILIAN_MODEL ===")
    try:
        from data_service.config import get_raw_config
        raw_config = get_raw_config()
        bailian_section = raw_config.get("llm", {}).get("bailian", {})
        assert_test(
            "BAILIAN_MODEL" not in bailian_section,
            "YAML配置中llm.bailian无BAILIAN_MODEL",
            f"bailian keys: {list(bailian_section.keys())}"
        )
    except Exception as e:
        assert_test(False, "检查BAILIAN_MODEL", str(e))


def test_env_local_no_bailian_model():
    print("\n=== 测试: .env.local 无 BAILIAN_MODEL ===")
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
    if not os.path.exists(env_path):
        print("  [SKIP] .env.local 不存在")
        return

    with open(env_path, "r", encoding="utf-8") as f:
        content = f.read()

    has_bailian_model = any(
        line.strip().startswith("BAILIAN_MODEL=")
        for line in content.split("\n")
    )
    assert_test(
        not has_bailian_model,
        ".env.local 不包含 BAILIAN_MODEL"
    )


if __name__ == "__main__":
    print("=" * 60)
    print("Config 环境变量解析测试 (Python)")
    print("=" * 60)

    test_env_var_pattern()
    test_resolve_env_values_basic()
    test_resolve_env_values_nested()
    test_resolve_env_values_unset()
    test_resolve_env_values_list()
    test_config_module_import()
    test_config_no_bailian_model()
    test_env_local_no_bailian_model()

    total = len(results)
    passed = sum(1 for r in results if r["pass"])
    failed = total - passed

    print("\n" + "=" * 60)
    print(f"测试结果: {passed}/{total} PASSED, {failed} FAILED")
    print("=" * 60)

    for r in results:
        status = "PASS" if r["pass"] else "FAIL"
        detail = f" - {r['detail']}" if r.get("detail") else ""
        print(f"  [{status}] {r['name']}{detail}")

    report_dir = os.path.join(os.path.dirname(__file__), "..", "reports")
    os.makedirs(report_dir, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join(report_dir, f"python_config_test_report_{ts}.json")
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

    if failed > 0:
        sys.exit(1)
