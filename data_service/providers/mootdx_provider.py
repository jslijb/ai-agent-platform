import logging
import datetime
import pandas as pd
from typing import Optional

logger = logging.getLogger(__name__)

_client = None
_client_available = False

_CONNECT_TIMEOUT = 10
_REQUEST_TIMEOUT = 15

_DEFAULT_HOSTS = [
    ("119.147.212.81", 7709),
    ("112.74.214.43", 7727),
    ("221.231.141.60", 7709),
    ("101.227.73.20", 7709),
    ("101.227.77.254", 7709),
    ("14.215.128.18", 7709),
    ("59.173.18.140", 7709),
    ("180.153.18.170", 7709),
    ("47.103.48.45", 7709),
    ("112.74.214.43", 7721),
]


def _is_trading_time() -> bool:
    now = datetime.datetime.now()
    weekday = now.weekday()
    if weekday >= 5:
        return False
    current_time = now.time()
    morning_start = datetime.time(9, 15)
    morning_end = datetime.time(11, 35)
    afternoon_start = datetime.time(13, 0)
    afternoon_end = datetime.time(15, 5)
    if morning_start <= current_time <= morning_end:
        return True
    if afternoon_start <= current_time <= afternoon_end:
        return True
    return False


def _reset_client():
    global _client, _client_available
    _client = None
    _client_available = False


def _get_client():
    global _client, _client_available

    if _client is not None and _client_available:
        return _client

    from mootdx.quotes import Quotes

    try:
        _client = Quotes.factory(
            market="std",
            bestip=True,
            timeout=_CONNECT_TIMEOUT,
            heartbeat=True,
        )
        _client_available = True
        logger.info("mootdx 客户端初始化成功（bestip + heartbeat 模式）")
        return _client
    except Exception as e:
        logger.warning(f"mootdx bestip 模式失败: {e}")

    for host, port in _DEFAULT_HOSTS:
        try:
            _client = Quotes.factory(
                market="std",
                bestip=False,
                host=host,
                port=port,
                timeout=_CONNECT_TIMEOUT,
                heartbeat=True,
            )
            _client_available = True
            logger.info(f"mootdx 客户端初始化成功（服务器: {host}:{port}）")
            return _client
        except Exception as e:
            logger.debug(f"mootdx 连接 {host}:{port} 失败: {e}")
            continue

    try:
        _client = Quotes.factory(market="std", timeout=_CONNECT_TIMEOUT)
        _client_available = True
        logger.info("mootdx 客户端初始化成功（默认模式）")
        return _client
    except Exception as e:
        logger.warning(f"mootdx 默认模式也失败: {e}")

    _client_available = False
    error_msg = "mootdx 客户端初始化失败：所有服务器均不可用（可能是非交易时段服务器维护）"
    logger.error(error_msg)
    raise ConnectionError(error_msg)


def _safe_request(func, *args, **kwargs):
    try:
        result = func(*args, **kwargs)
        return result
    except Exception as e:
        error_str = str(e).lower()
        if any(kw in error_str for kw in ["timeout", "timed out", "连接超时", "connection"]):
            logger.warning(f"mootdx 请求超时，重置客户端: {e}")
            _reset_client()
            try:
                new_client = _get_client()
                kwargs["client"] = new_client
                return func(*args, **kwargs)
            except Exception as e2:
                logger.error(f"mootdx 重试后仍然失败: {e2}")
                raise ConnectionError(f"mootdx 请求超时且重试失败: {e2}") from e2
        raise


def _df_to_dict(df: pd.DataFrame) -> list[dict]:
    if df is None or df.empty:
        return []
    return df.where(df.notna(), None).to_dict(orient="records")


_FREQUENCY_MAP = {
    "d": 9,
    "w": 5,
    "m": 6,
    "1": 8,
    "5": 0,
    "15": 1,
    "30": 2,
    "60": 3,
}


def get_stock_history(
    code: str,
    start_date: str,
    end_date: str,
    frequency: str = "d",
) -> list[dict]:
    logger.info(f"mootdx 获取历史K线: code={code}, start={start_date}, end={end_date}, freq={frequency}")

    client = _get_client()
    freq_code = _FREQUENCY_MAP.get(frequency, 9)

    try:
        df = _safe_request(client.bars, symbol=code, frequency=freq_code, offset=800)

        if df is None or df.empty:
            logger.warning(f"mootdx 未查询到K线数据: code={code}")
            return []

        if "datetime" in df.columns:
            df["datetime"] = df["datetime"].astype(str)
            df = df[(df["datetime"] >= start_date) & (df["datetime"] <= end_date)]
        elif "date" in df.columns:
            df["date"] = df["date"].astype(str)
            df = df[(df["date"] >= start_date) & (df["date"] <= end_date)]

        result = _df_to_dict(df)
        logger.info(f"mootdx 获取历史K线成功，共 {len(result)} 条记录")
        return result

    except ConnectionError as e:
        logger.error(f"mootdx 获取历史K线连接失败: {e}")
        raise
    except Exception as e:
        logger.error(f"mootdx 获取历史K线异常: {e}", exc_info=True)
        raise


def get_stock_realtime(code: str) -> list[dict]:
    logger.info(f"mootdx 获取实时行情: code={code}")

    client = _get_client()

    try:
        df = _safe_request(client.quotes, symbol=code)

        if df is None or df.empty:
            logger.warning(f"mootdx 未查询到实时行情: code={code}")
            return []

        result = _df_to_dict(df)
        logger.info(f"mootdx 获取实时行情成功: code={code}")
        return result

    except ConnectionError as e:
        logger.error(f"mootdx 获取实时行情连接失败: {e}")
        raise
    except Exception as e:
        logger.error(f"mootdx 获取实时行情异常: {e}", exc_info=True)
        raise


def get_financial_data(code: str, count: int = 1) -> list[dict]:
    logger.info(f"mootdx 获取财务数据: code={code}, count={count}")

    client = _get_client()

    try:
        df = _safe_request(client.finance, symbol=code)

        if df is None or df.empty:
            logger.warning(f"mootdx 未查询到财务数据: code={code}")
            return []

        result = _df_to_dict(df.head(count))
        logger.info(f"mootdx 获取财务数据成功，共 {len(result)} 条记录")
        return result

    except ConnectionError as e:
        logger.error(f"mootdx 获取财务数据连接失败: {e}")
        raise
    except Exception as e:
        logger.error(f"mootdx 获取财务数据异常: {e}", exc_info=True)
        raise


def get_index_history(code: str, start_date: str, end_date: str) -> list[dict]:
    logger.info(f"mootdx 获取指数历史: code={code}, start={start_date}, end={end_date}")

    client = _get_client()

    try:
        df = _safe_request(client.bars, symbol=code, frequency=9, offset=800)

        if df is None or df.empty:
            logger.warning(f"mootdx 未查询到指数数据: code={code}")
            return []

        if "datetime" in df.columns:
            df["datetime"] = df["datetime"].astype(str)
            df = df[(df["datetime"] >= start_date) & (df["datetime"] <= end_date)]
        elif "date" in df.columns:
            df["date"] = df["date"].astype(str)
            df = df[(df["date"] >= start_date) & (df["date"] <= end_date)]

        result = _df_to_dict(df)
        logger.info(f"mootdx 获取指数历史成功，共 {len(result)} 条记录")
        return result

    except ConnectionError as e:
        logger.error(f"mootdx 获取指数历史连接失败: {e}")
        raise
    except Exception as e:
        logger.error(f"mootdx 获取指数历史异常: {e}", exc_info=True)
        raise


def get_stock_basic() -> list[dict]:
    logger.info("mootdx 获取股票基本信息列表")

    client = _get_client()

    try:
        df = _safe_request(client.stocks, market=1)

        if df is None or df.empty:
            df = _safe_request(client.stocks, market=0)

        if df is None or df.empty:
            logger.warning("mootdx 未查询到股票基本信息")
            return []

        result = _df_to_dict(df)
        logger.info(f"mootdx 获取股票基本信息成功，共 {len(result)} 条记录")
        return result

    except ConnectionError as e:
        logger.error(f"mootdx 获取股票基本信息连接失败: {e}")
        raise
    except Exception as e:
        logger.error(f"mootdx 获取股票基本信息异常: {e}", exc_info=True)
        raise


def get_minute_data(code: str, frequency: str = "5") -> list[dict]:
    logger.info(f"mootdx 获取分钟K线: code={code}, freq={frequency}")

    client = _get_client()
    freq_code = _FREQUENCY_MAP.get(frequency, 0)

    try:
        df = _safe_request(client.bars, symbol=code, frequency=freq_code, offset=800)

        if df is None or df.empty:
            logger.warning(f"mootdx 未查询到分钟K线数据: code={code}")
            return []

        result = _df_to_dict(df)
        logger.info(f"mootdx 获取分钟K线成功，共 {len(result)} 条记录")
        return result

    except ConnectionError as e:
        logger.error(f"mootdx 获取分钟K线连接失败: {e}")
        raise
    except Exception as e:
        logger.error(f"mootdx 获取分钟K线异常: {e}", exc_info=True)
        raise


def get_concept(code: str) -> list[dict]:
    logger.info(f"mootdx 获取概念板块: code={code}")

    client = _get_client()

    try:
        df = _safe_request(client.block, market=1)

        if df is None or df.empty:
            logger.warning("mootdx 未查询到板块数据")
            return []

        result = _df_to_dict(df)
        logger.info(f"mootdx 获取板块数据成功，共 {len(result)} 条记录")
        return result

    except ConnectionError as e:
        logger.error(f"mootdx 获取概念板块连接失败: {e}")
        raise
    except Exception as e:
        logger.error(f"mootdx 获取概念板块异常: {e}", exc_info=True)
        raise
