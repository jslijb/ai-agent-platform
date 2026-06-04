import json
import time
import logging
import urllib.request
import urllib.error
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

DATA_SERVICE_URL = "http://localhost:8001"

STOCKS = [
    {"code": "000858", "bs_code": "sz.000858", "name": "五粮液"},
    {"code": "000066", "bs_code": "sz.000066", "name": "中国长城"},
    {"code": "000651", "bs_code": "sz.000651", "name": "格力电器"},
]

INDEX_CODES = [
    {"code": "sh.000001", "name": "上证指数"},
    {"code": "sz.399001", "name": "深证成指"},
    {"code": "sz.399006", "name": "创业板指"},
]

START_DATE = "2025-05-29"
END_DATE = "2026-05-29"

results = {"pass": 0, "fail": 0, "warn": 0, "details": []}


def record(name, status, detail):
    icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    logger.info(f"{icon} [{status}] {name}: {detail}")
    results[status.lower()] += 1
    results["details"].append({"name": name, "status": status, "detail": detail})


def post(endpoint, payload, timeout=120):
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{DATA_SERVICE_URL}{endpoint}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            if body.get("success"):
                return body
            else:
                return {"success": False, "error": body.get("error", "未知错误")}
    except urllib.error.URLError as e:
        return {"success": False, "error": f"连接失败: {e.reason}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def cache_history(stock):
    for source in ["efinance", "mootdx", "baostock"]:
        code = stock["bs_code"] if source == "baostock" else stock["code"]
        payload = {
            "source": source,
            "code": code,
            "start_date": START_DATE,
            "end_date": END_DATE,
            "frequency": "d",
        }
        result = post("/api/market/history", payload, timeout=120)
        if result.get("success"):
            records = len(result.get("data", []))
            from_cache = result.get("from_cache", False)
            record(
                f"历史行情 {stock['name']} ({source})",
                "PASS",
                f"{records} 条记录 {'(缓存命中)' if from_cache else '(新获取)'}",
            )
        else:
            record(
                f"历史行情 {stock['name']} ({source})",
                "FAIL",
                result.get("error", "未知"),
            )


def cache_realtime(stock):
    for source in ["efinance", "mootdx"]:
        payload = {"source": source, "code": stock["code"]}
        result = post("/api/market/realtime", payload)
        if result.get("success"):
            record(f"实时行情 {stock['name']} ({source})", "PASS", "获取成功")
        else:
            record(f"实时行情 {stock['name']} ({source})", "WARN", result.get("error", "未知"))


def cache_financial(stock):
    for source in ["efinance", "baostock"]:
        payload = {
            "source": source,
            "code": stock["bs_code"] if source == "baostock" else stock["code"],
            "year": 2025,
            "quarter": 3,
            "count": 4,
        }
        result = post("/api/market/financial", payload, timeout=60)
        if result.get("success"):
            records = len(result.get("data", []))
            record(
                f"财务数据 {stock['name']} ({source})",
                "PASS",
                f"{records} 条记录",
            )
        else:
            record(
                f"财务数据 {stock['name']} ({source})",
                "WARN",
                result.get("error", "未知"),
            )


def cache_financial_report(stock):
    for report_type in ["income", "balance", "cashflow"]:
        payload = {"code": stock["code"], "report_type": report_type}
        result = post("/api/market/financial_report", payload, timeout=60)
        if result.get("success"):
            records = len(result.get("data", []))
            record(
                f"财报 {stock['name']} ({report_type})",
                "PASS",
                f"{records} 条记录",
            )
        else:
            record(
                f"财报 {stock['name']} ({report_type})",
                "WARN",
                result.get("error", "未知"),
            )


def cache_index(idx):
    for source in ["efinance", "mootdx", "baostock"]:
        payload = {
            "source": source,
            "code": idx["code"],
            "start_date": START_DATE,
            "end_date": END_DATE,
        }
        result = post("/api/market/index", payload, timeout=60)
        if result.get("success"):
            records = len(result.get("data", []))
            record(
                f"指数 {idx['name']} ({source})",
                "PASS",
                f"{records} 条记录",
            )
        else:
            record(
                f"指数 {idx['name']} ({source})",
                "WARN",
                result.get("error", "未知"),
            )


def cache_industry(stock):
    for source in ["efinance", "mootdx"]:
        payload = {"source": source, "code": stock["code"]}
        result = post("/api/market/industry", payload)
        if result.get("success"):
            record(f"行业分类 {stock['name']} ({source})", "PASS", "获取成功")
        else:
            record(f"行业分类 {stock['name']} ({source})", "WARN", result.get("error", "未知"))


def cache_concept(stock):
    for source in ["efinance", "mootdx"]:
        payload = {"source": source, "code": stock["code"]}
        result = post("/api/market/concept", payload)
        if result.get("success"):
            record(f"概念板块 {stock['name']} ({source})", "PASS", "获取成功")
        else:
            record(f"概念板块 {stock['name']} ({source})", "WARN", result.get("error", "未知"))


def cache_minute(stock):
    for freq in ["5", "15", "30", "60"]:
        payload = {"source": "efinance", "code": stock["code"], "frequency": freq}
        result = post("/api/market/minute", payload, timeout=30)
        if result.get("success"):
            records = len(result.get("data", []))
            record(
                f"分钟K线 {stock['name']} ({freq}min)",
                "PASS",
                f"{records} 条记录",
            )
        else:
            record(
                f"分钟K线 {stock['name']} ({freq}min)",
                "WARN",
                result.get("error", "未知"),
            )


def cache_basic():
    for source in ["efinance", "mootdx", "baostock"]:
        payload = {"source": source}
        result = post("/api/market/basic", payload, timeout=120)
        if result.get("success"):
            records = len(result.get("data", []))
            record(f"股票列表 ({source})", "PASS", f"{records} 条记录")
        else:
            record(f"股票列表 ({source})", "WARN", result.get("error", "未知"))


def cache_trade_cal():
    payload = {"source": "baostock", "start_date": START_DATE, "end_date": END_DATE}
    result = post("/api/market/trade_cal", payload, timeout=60)
    if result.get("success"):
        records = len(result.get("data", []))
        record("交易日历", "PASS", f"{records} 条记录")
    else:
        record("交易日历", "WARN", result.get("error", "未知"))


def main():
    logger.info("=" * 60)
    logger.info("  数据缓存预热 - 3只股票 1年行情")
    logger.info(f"  股票: 五粮液(000858), 中国长城(000066), 格力电器(000651)")
    logger.info(f"  时间范围: {START_DATE} ~ {END_DATE}")
    logger.info("=" * 60)

    health_resp = None
    try:
        req = urllib.request.Request(f"{DATA_SERVICE_URL}/health", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            health_resp = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logger.error(f"数据服务不可用 ({e})，请先启动: python -m data_service.main")
        return
    if not health_resp or not health_resp.get("success"):
        logger.error("数据服务不可用，请先启动: python -m data_service.main")
        return
    logger.info(f"数据服务状态: {health_resp.get('data', {}).get('status')}")

    start_time = time.time()

    logger.info("\n===== 1. 历史行情 (日K) =====")
    for stock in STOCKS:
        cache_history(stock)

    logger.info("\n===== 2. 实时行情 =====")
    for stock in STOCKS:
        cache_realtime(stock)

    logger.info("\n===== 3. 财务数据 =====")
    for stock in STOCKS:
        cache_financial(stock)

    logger.info("\n===== 4. 详细财报 =====")
    for stock in STOCKS:
        cache_financial_report(stock)

    logger.info("\n===== 5. 指数数据 =====")
    for idx in INDEX_CODES:
        cache_index(idx)

    logger.info("\n===== 6. 行业分类 =====")
    for stock in STOCKS:
        cache_industry(stock)

    logger.info("\n===== 7. 概念板块 =====")
    for stock in STOCKS:
        cache_concept(stock)

    logger.info("\n===== 8. 分钟K线 =====")
    for stock in STOCKS:
        cache_minute(stock)

    logger.info("\n===== 9. 股票列表 =====")
    cache_basic()

    logger.info("\n===== 10. 交易日历 =====")
    cache_trade_cal()

    elapsed = time.time() - start_time

    logger.info("\n" + "=" * 60)
    logger.info("  缓存预热完成")
    logger.info(f"  耗时: {elapsed:.1f}s")
    logger.info(f"  ✅ PASS: {results['pass']} | ❌ FAIL: {results['fail']} | ⚠️ WARN: {results['warn']}")
    logger.info("=" * 60)

    if results["fail"] > 0:
        logger.info("\n--- 失败项 ---")
        for d in results["details"]:
            if d["status"] == "FAIL":
                logger.info(f"  ❌ {d['name']}: {d['detail']}")

    report_dir = Path(__file__).parent.parent / "tests" / "reports" / "test"
    report_dir.mkdir(exist_ok=True)
    report_path = report_dir / f"cache-warmup-{int(time.time())}.json"
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "stocks": [s["name"] for s in STOCKS],
        "date_range": f"{START_DATE} ~ {END_DATE}",
        "elapsed_seconds": round(elapsed, 1),
        "summary": {
            "total": results["pass"] + results["fail"] + results["warn"],
            "pass": results["pass"],
            "fail": results["fail"],
            "warn": results["warn"],
        },
        "details": results["details"],
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(f"\n测试报告已保存: {report_path}")


if __name__ == "__main__":
    main()
