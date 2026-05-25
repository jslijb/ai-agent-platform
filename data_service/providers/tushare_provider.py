import logging
import requests
import pandas as pd
from typing import Optional

from data_service.config import get_value

logger = logging.getLogger(__name__)

TUSHARE_API_URL = "http://api.tushare.pro"


def _get_token() -> str:
    """从配置获取 Tushare API Token"""
    token = get_value("tushare", "TUSHARE_TOKEN")
    if not token:
        logger.error("TUSHARE_TOKEN 未配置，请在环境变量中设置")
        raise ValueError("TUSHARE_TOKEN 未配置")
    return token


def _call_api(api_name: str, params: dict, fields: Optional[str] = None) -> list[dict]:
    """调用 Tushare REST API

    Args:
        api_name: 接口名称
        params: 请求参数
        fields: 返回字段

    Returns:
        数据字典列表
    """
    token = _get_token()
    payload = {
        "api_name": api_name,
        "token": token,
        "params": params,
    }
    if fields:
        payload["fields"] = fields

    logger.info(f"调用 Tushare API: {api_name}, params={params}")

    try:
        response = requests.post(TUSHARE_API_URL, json=payload, timeout=30)
        response.raise_for_status()
        result = response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Tushare API 请求失败: {e}", exc_info=True)
        raise ConnectionError(f"Tushare API 请求失败: {e}")

    if result.get("code") != 0:
        error_msg = result.get("msg", "未知错误")
        logger.error(f"Tushare API 返回错误: code={result.get('code')}, msg={error_msg}")
        raise RuntimeError(f"Tushare API 错误: {error_msg}")

    data = result.get("data", {})
    fields_list = data.get("fields", [])
    items = data.get("items", [])

    if not items:
        logger.warning(f"Tushare API 无数据返回: api={api_name}, params={params}")
        return []

    df = pd.DataFrame(items, columns=fields_list)
    df = df.where(df.notna(), None)
    records = df.to_dict(orient="records")
    logger.info(f"Tushare API 调用成功: api={api_name}, 共 {len(records)} 条记录")
    return records


def get_stock_daily(
    ts_code: str,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """获取股票日线行情

    Args:
        ts_code: 股票代码，如 '600000.SH'
        start_date: 开始日期，格式 'YYYYMMDD'
        end_date: 结束日期，格式 'YYYYMMDD'

    Returns:
        日线行情字典列表
    """
    logger.info(f"获取日线行情: ts_code={ts_code}, start={start_date}, end={end_date}")
    return _call_api(
        "daily",
        {"ts_code": ts_code, "start_date": start_date, "end_date": end_date},
    )


def get_stock_min(
    ts_code: str,
    freq: str = "5min",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict]:
    """获取股票分钟线数据

    Args:
        ts_code: 股票代码，如 '600000.SH'
        freq: 频率，1/5/15/30/60min
        start_date: 开始日期时间，格式 'YYYY-MM-DD HH:MM:SS'
        end_date: 结束日期时间，格式 'YYYY-MM-DD HH:MM:SS'

    Returns:
        分钟线数据字典列表
    """
    logger.info(f"获取分钟线: ts_code={ts_code}, freq={freq}")
    params = {"ts_code": ts_code, "freq": freq}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    return _call_api("stk_mins", params)


def get_financial_indicator(
    ts_code: str,
    period: str,
) -> list[dict]:
    """获取财务指标数据

    Args:
        ts_code: 股票代码，如 '600000.SH'
        period: 报告期，格式 'YYYYMMDD'，如 '20240331'

    Returns:
        财务指标字典列表
    """
    logger.info(f"获取财务指标: ts_code={ts_code}, period={period}")
    return _call_api(
        "fina_indicator",
        {"ts_code": ts_code, "period": period},
    )


def get_stock_basic() -> list[dict]:
    """获取股票列表基本信息

    Returns:
        股票基本信息字典列表
    """
    logger.info("获取股票基本信息列表")
    return _call_api("stock_basic", {"list_status": "L"})


def get_trade_cal(
    exchange: str = "SSE",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict]:
    """获取交易日历

    Args:
        exchange: 交易所代码，SSE=上交所, SZSE=深交所
        start_date: 开始日期，格式 'YYYYMMDD'
        end_date: 结束日期，格式 'YYYYMMDD'

    Returns:
        交易日历字典列表
    """
    logger.info(f"获取交易日历: exchange={exchange}, start={start_date}, end={end_date}")
    params = {"exchange": exchange}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    return _call_api("trade_cal", params)
