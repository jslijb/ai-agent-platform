import logging
import pandas as pd
from typing import Optional

logger = logging.getLogger(__name__)


def _df_to_dict(df: pd.DataFrame) -> list[dict]:
    if df is None or df.empty:
        return []
    return df.where(df.notna(), None).to_dict(orient="records")


def get_stock_realtime(code: str) -> list[dict]:
    logger.info(f"efinance 获取实时行情: code={code}")

    try:
        import requests

        url = "https://push2.eastmoney.com/api/qt/stock/get"
        params = {
            "secid": f"1.{code}" if code.startswith("6") else f"0.{code}",
            "fields": "f43,f44,f45,f46,f47,f48,f50,f51,f52,f55,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170,f171,f292",
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
            "fltt": "2",
            "invt": "2",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://quote.eastmoney.com/",
        }

        resp = requests.get(url, params=params, headers=headers, timeout=15)
        data = resp.json()

        if data.get("data") is None:
            logger.warning(f"efinance 未查询到实时行情: code={code}")
            return []

        d = data["data"]
        result = [{
            "股票代码": d.get("f57", code),
            "股票名称": d.get("f58", ""),
            "最新价": d.get("f43"),
            "最高价": d.get("f44"),
            "最低价": d.get("f45"),
            "开盘价": d.get("f46"),
            "成交量": d.get("f47"),
            "成交额": d.get("f48"),
            "涨跌额": d.get("f169"),
            "涨跌幅": d.get("f170"),
            "换手率": d.get("f168"),
            "市盈率": d.get("f162"),
            "市净率": d.get("f167"),
            "总市值": d.get("f116"),
            "流通市值": d.get("f117"),
            "振幅": d.get("f171"),
            "量比": d.get("f50"),
        }]

        logger.info(f"efinance 获取实时行情成功: code={code}")
        return result

    except Exception as e:
        logger.warning(f"efinance 获取实时行情失败，尝试腾讯接口 fallback: {e}")

    try:
        import urllib.request

        market = "sh" if code.startswith("6") else "sz"
        url = f"http://qt.gtimg.cn/q={market}{code}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        raw = resp.read().decode("gbk")

        if not raw or "~" not in raw:
            logger.warning(f"腾讯接口未返回有效数据: code={code}")
            return []

        fields = raw.split("~")
        result = [{
            "股票代码": code,
            "股票名称": fields[1] if len(fields) > 1 else "",
            "最新价": float(fields[3]) if len(fields) > 3 and fields[3] else None,
            "最高价": float(fields[33]) if len(fields) > 33 and fields[33] else None,
            "最低价": float(fields[34]) if len(fields) > 34 and fields[34] else None,
            "开盘价": float(fields[5]) if len(fields) > 5 and fields[5] else None,
            "成交量": int(fields[6]) if len(fields) > 6 and fields[6] else None,
            "成交额": float(fields[37]) if len(fields) > 37 and fields[37] else None,
            "涨跌额": float(fields[31]) if len(fields) > 31 and fields[31] else None,
            "涨跌幅": float(fields[32]) if len(fields) > 32 and fields[32] else None,
            "换手率": float(fields[38]) if len(fields) > 38 and fields[38] else None,
            "市盈率": float(fields[39]) if len(fields) > 39 and fields[39] else None,
            "市净率": None,
            "总市值": float(fields[45]) if len(fields) > 45 and fields[45] else None,
            "流通市值": float(fields[44]) if len(fields) > 44 and fields[44] else None,
            "振幅": None,
            "量比": None,
            "price": float(fields[3]) if len(fields) > 3 and fields[3] else None,
            "close": float(fields[3]) if len(fields) > 3 and fields[3] else None,
            "changePercent": float(fields[32]) if len(fields) > 32 and fields[32] else None,
            "change_pct": float(fields[32]) if len(fields) > 32 and fields[32] else None,
            "volume": int(fields[6]) if len(fields) > 6 and fields[6] else None,
            "amount": float(fields[37]) if len(fields) > 37 and fields[37] else None,
        }]

        logger.info(f"腾讯接口获取实时行情成功: code={code}")
        return result

    except Exception as e2:
        logger.error(f"腾讯接口也获取失败: {e2}", exc_info=True)
        raise


def get_stock_history(
    code: str,
    start_date: str,
    end_date: str,
    frequency: str = "d",
) -> list[dict]:
    logger.info(f"efinance 获取历史K线: code={code}, start={start_date}, end={end_date}, freq={frequency}")

    try:
        import efinance as ef

        klt_map = {"d": 101, "w": 102, "m": 103, "5": 5, "15": 15, "30": 30, "60": 60}
        klt = klt_map.get(frequency, 101)

        beg = start_date.replace("-", "")
        end = end_date.replace("-", "")

        df = ef.stock.get_quote_history(code, beg=beg, end=end, klt=klt)

        if df is None or df.empty:
            logger.warning(f"efinance 未查询到K线数据: code={code}")
            return []

        result = _df_to_dict(df)
        logger.info(f"efinance 获取历史K线成功，共 {len(result)} 条记录")
        return result

    except ImportError:
        logger.error("efinance 未安装，请执行: pip install efinance")
        raise
    except Exception as e:
        logger.error(f"efinance 获取历史K线异常: {e}", exc_info=True)
        raise


def get_stock_basic() -> list[dict]:
    logger.info("efinance 获取股票基本信息列表")

    try:
        import efinance as ef

        df = ef.stock.get_realtime_quotes()

        if df is None or df.empty:
            logger.warning("efinance 未查询到股票基本信息")
            return []

        result = _df_to_dict(df)
        logger.info(f"efinance 获取股票基本信息成功，共 {len(result)} 条记录")
        return result

    except ImportError:
        logger.error("efinance 未安装，请执行: pip install efinance")
        raise
    except Exception as e:
        logger.error(f"efinance 获取股票基本信息异常: {e}", exc_info=True)
        raise


def get_financial_data(code: str, count: int = 1) -> list[dict]:
    logger.info(f"efinance 获取财务数据: code={code}, count={count}")

    try:
        import requests

        secid = f"1.{code}" if code.startswith("6") else f"0.{code}"
        url = "https://push2.eastmoney.com/api/qt/stock/get"
        params = {
            "secid": secid,
            "fields": "f57,f58,f162,f167,f168,f169,f170,f171,f173,f183,f184,f185,f186,f187,f188,f190,f192",
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
            "fltt": "2",
            "invt": "2",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://quote.eastmoney.com/",
        }

        resp = requests.get(url, params=params, headers=headers, timeout=15)
        data = resp.json()

        if data.get("data") is None:
            logger.warning(f"efinance 未查询到财务数据: code={code}")
            return []

        d = data["data"]
        result = [{
            "股票代码": d.get("f57", code),
            "股票名称": d.get("f58", ""),
            "市盈率": d.get("f162"),
            "市净率": d.get("f167"),
            "换手率": d.get("f168"),
            "涨跌额": d.get("f169"),
            "涨跌幅": d.get("f170"),
            "振幅": d.get("f171"),
            "ROE": d.get("f173"),
            "总市值": d.get("f116"),
            "流通市值": d.get("f117"),
            "毛利率": d.get("f186"),
            "净利率": d.get("f187"),
            "净利润": d.get("f188"),
            "营收": d.get("f183"),
            "营收同比": d.get("f185"),
        }]

        logger.info(f"efinance 获取财务数据成功，共 {len(result)} 条记录")
        return result

    except Exception as e:
        logger.error(f"efinance 获取财务数据异常: {e}", exc_info=True)
        raise


def get_index_history(code: str, start_date: str, end_date: str) -> list[dict]:
    logger.info(f"efinance 获取指数历史: code={code}, start={start_date}, end={end_date}")

    try:
        import efinance as ef

        beg = start_date.replace("-", "")
        end = end_date.replace("-", "")

        df = ef.stock.get_quote_history(code, beg=beg, end=end, klt=101)

        if df is None or df.empty:
            logger.warning(f"efinance 未查询到指数数据: code={code}")
            return []

        result = _df_to_dict(df)
        logger.info(f"efinance 获取指数历史成功，共 {len(result)} 条记录")
        return result

    except ImportError:
        logger.error("efinance 未安装，请执行: pip install efinance")
        raise
    except Exception as e:
        logger.error(f"efinance 获取指数历史异常: {e}", exc_info=True)
        raise


def get_industry(code: str) -> list[dict]:
    logger.info(f"efinance 获取行业板块: code={code}")

    try:
        import requests

        url = "https://push2.eastmoney.com/api/qt/clist/get"
        params = {
            "pn": 1,
            "pz": 200,
            "po": 1,
            "np": 1,
            "fltt": 2,
            "invt": 2,
            "fid": "f3",
            "fs": "m:90+t:2+f:!50",
            "fields": "f2,f3,f4,f12,f14",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://data.eastmoney.com/",
        }

        resp = requests.get(url, params=params, headers=headers, timeout=15)
        data = resp.json()

        if data.get("data") is None or data["data"].get("diff") is None:
            logger.warning("efinance 未查询到行业板块数据")
            return []

        items = data["data"]["diff"]
        result = []
        for item in items:
            row = {
                "板块代码": item.get("f12", ""),
                "板块名称": item.get("f14", ""),
                "涨跌幅": item.get("f3"),
                "最新价": item.get("f2"),
                "涨跌额": item.get("f4"),
            }
            result.append(row)

        if code:
            result = [r for r in result if r["板块代码"] == code or r["板块名称"] == code]

        logger.info(f"efinance 获取行业板块成功，共 {len(result)} 条记录")
        return result

    except Exception as e:
        logger.error(f"efinance 获取行业板块异常: {e}", exc_info=True)
        raise


def get_concept(code: str) -> list[dict]:
    logger.info(f"efinance 获取概念板块: code={code}")

    try:
        import requests

        url = "https://push2.eastmoney.com/api/qt/clist/get"
        params = {
            "pn": 1,
            "pz": 500,
            "po": 1,
            "np": 1,
            "fltt": 2,
            "invt": 2,
            "fid": "f3",
            "fs": "m:90+t:3+f:!50",
            "fields": "f2,f3,f4,f12,f14",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://data.eastmoney.com/",
        }

        resp = requests.get(url, params=params, headers=headers, timeout=15)
        data = resp.json()

        if data.get("data") is None or data["data"].get("diff") is None:
            logger.warning("efinance 未查询到概念板块数据")
            return []

        items = data["data"]["diff"]
        result = []
        for item in items:
            row = {
                "板块代码": item.get("f12", ""),
                "板块名称": item.get("f14", ""),
                "涨跌幅": item.get("f3"),
                "最新价": item.get("f2"),
                "涨跌额": item.get("f4"),
            }
            result.append(row)

        if code:
            result = [r for r in result if r["板块代码"] == code or r["板块名称"] == code]

        logger.info(f"efinance 获取概念板块成功，共 {len(result)} 条记录")
        return result

    except Exception as e:
        logger.error(f"efinance 获取概念板块异常: {e}", exc_info=True)
        raise


def get_financial_report(code: str, report_type: str = "income") -> list[dict]:
    logger.info(f"efinance 获取详细财报: code={code}, report_type={report_type}")

    try:
        import requests

        secid = f"1.{code}" if code.startswith("6") else f"0.{code}"

        type_map = {
            "income": "RPT_LICO_FN_CPD",
            "balance": "RPT_DMSK_FN_BALANCE",
            "cashflow": "RPT_DMSK_FN_CASHFLOW",
        }
        report_code = type_map.get(report_type, "RPT_LICO_FN_CPD")

        url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
        params = {
            "reportName": report_code,
            "columns": "ALL",
            "filter": f'(SECURITY_CODE="{code}")',
            "pageNumber": 1,
            "pageSize": 5,
            "sortColumns": "REPORT_DATE",
            "sortTypes": -1,
            "source": "HSF10",
            "client": "PC",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://data.eastmoney.com/",
        }

        resp = requests.get(url, params=params, headers=headers, timeout=30)
        data = resp.json()

        if data.get("result") is None or data["result"].get("data") is None:
            logger.warning(f"efinance 未查询到详细财报: code={code}, type={report_type}")
            return []

        items = data["result"]["data"]
        result = []
        for item in items:
            row = {}
            for k, v in item.items():
                if v is not None:
                    row[k] = v
            result.append(row)

        logger.info(f"efinance 获取详细财报成功: code={code}, type={report_type}, 共 {len(result)} 条记录")
        return result

    except Exception as e:
        logger.error(f"efinance 获取详细财报异常: {e}", exc_info=True)
        raise


def get_minute_data(code: str, frequency: str = "5") -> list[dict]:
    logger.info(f"efinance 获取分钟K线: code={code}, freq={frequency}")

    try:
        import efinance as ef

        klt_map = {"1": 1, "5": 5, "15": 15, "30": 30, "60": 60}
        klt = klt_map.get(frequency, 5)

        df = ef.stock.get_quote_history(code, klt=klt)

        if df is None or df.empty:
            logger.warning(f"efinance 未查询到分钟K线数据: code={code}")
            return []

        result = _df_to_dict(df)
        logger.info(f"efinance 获取分钟K线成功，共 {len(result)} 条记录")
        return result

    except ImportError:
        logger.error("efinance 未安装，请执行: pip install efinance")
        raise
    except Exception as e:
        logger.error(f"efinance 获取分钟K线异常: {e}", exc_info=True)
        raise
