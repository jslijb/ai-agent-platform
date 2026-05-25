import logging
import pandas as pd
from typing import Optional

logger = logging.getLogger(__name__)


def _df_to_dict(df: pd.DataFrame) -> list[dict]:
    """将 DataFrame 转换为字典列表，处理 NaN 值"""
    if df is None or df.empty:
        return []
    return df.where(df.notna(), None).to_dict(orient="records")


def get_stock_history(
    code: str,
    start_date: str,
    end_date: str,
    frequency: str = "d",
) -> list[dict]:
    """获取股票历史K线数据

    Args:
        code: 股票代码，如 '600036'
        start_date: 开始日期，格式 'YYYY-MM-DD'
        end_date: 结束日期，格式 'YYYY-MM-DD'
        frequency: 频率，'d'=日K, 'w'=周K, 'm'=月K, '5'=5分钟, '15'=15分钟, '30'=30分钟, '60'=60分钟

    Returns:
        K线数据字典列表
    """
    logger.info(f"efinance 获取历史K线: code={code}, start={start_date}, end={end_date}, freq={frequency}")

    try:
        import efinance as ef

        klt_map = {"d": 101, "w": 102, "m": 103, "5": 5, "15": 15, "30": 30, "60": 60}
        klt = klt_map.get(frequency, 101)

        df = ef.stock.get_quote_history(code, klt=klt)

        if df is None or df.empty:
            logger.warning(f"efinance 未查询到K线数据: code={code}")
            return []

        if "日期" in df.columns:
            df["日期"] = df["日期"].astype(str)
            df = df[(df["日期"] >= start_date) & (df["日期"] <= end_date)]

        result = _df_to_dict(df)
        logger.info(f"efinance 获取历史K线成功，共 {len(result)} 条记录")
        return result

    except ImportError:
        logger.error("efinance 未安装，请执行: pip install efinance")
        raise
    except Exception as e:
        logger.error(f"efinance 获取历史K线异常: {e}", exc_info=True)
        raise


def get_stock_realtime(code: str) -> list[dict]:
    """获取股票实时行情

    Args:
        code: 股票代码，如 '600036'

    Returns:
        实时行情数据字典列表
    """
    logger.info(f"efinance 获取实时行情: code={code}")

    try:
        import efinance as ef

        df = ef.stock.get_realtime_quotes()

        if df is None or df.empty:
            logger.warning("efinance 未查询到实时行情数据")
            return []

        if "股票代码" in df.columns:
            df = df[df["股票代码"] == code]

        if df.empty:
            logger.warning(f"efinance 未找到股票: code={code}")
            return []

        result = _df_to_dict(df)
        logger.info(f"efinance 获取实时行情成功: code={code}")
        return result

    except ImportError:
        logger.error("efinance 未安装，请执行: pip install efinance")
        raise
    except Exception as e:
        logger.error(f"efinance 获取实时行情异常: {e}", exc_info=True)
        raise


def get_stock_basic() -> list[dict]:
    """获取沪深A股基本信息列表

    Returns:
        股票基本信息字典列表
    """
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


def get_minute_data(code: str, frequency: str = "5") -> list[dict]:
    """获取分钟K线数据

    Args:
        code: 股票代码，如 '600036'
        frequency: 频率，'5'=5分钟, '15'=15分钟, '30'=30分钟, '60'=60分钟

    Returns:
        分钟K线数据字典列表
    """
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
