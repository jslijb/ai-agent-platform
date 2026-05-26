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
        logger.error(f"efinance 获取实时行情异常: {e}", exc_info=True)
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
