import logging
import requests
from typing import Optional

from data_service.config import get_value

logger = logging.getLogger(__name__)

TICKFLOW_API_BASE = "https://api.tickflow.com/v1"


def _get_api_key() -> str:
    """从配置获取 TickFlow API Key"""
    api_key = get_value("tickflow", "TICKFLOW_API_KEY")
    if not api_key:
        logger.error("TICKFLOW_API_KEY 未配置，请在环境变量中设置")
        raise ValueError("TICKFLOW_API_KEY 未配置")
    return api_key


def _call_api(endpoint: str, params: dict) -> dict:
    """调用 TickFlow REST API

    Args:
        endpoint: API 端点路径
        params: 请求参数

    Returns:
        API 响应数据
    """
    api_key = _get_api_key()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    url = f"{TICKFLOW_API_BASE}/{endpoint}"

    logger.info(f"调用 TickFlow API: endpoint={endpoint}, params={params}")

    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        result = response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"TickFlow API 请求失败: {e}", exc_info=True)
        raise ConnectionError(f"TickFlow API 请求失败: {e}")

    if isinstance(result, dict) and result.get("code") != 0:
        error_msg = result.get("message", "未知错误")
        logger.error(f"TickFlow API 返回错误: {error_msg}")
        raise RuntimeError(f"TickFlow API 错误: {error_msg}")

    logger.info(f"TickFlow API 调用成功: endpoint={endpoint}")
    return result


def get_tick_data(code: str, date: str) -> list[dict]:
    """获取逐笔数据

    Args:
        code: 股票代码，如 '600000'
        date: 日期，格式 'YYYY-MM-DD'

    Returns:
        逐笔数据字典列表
    """
    logger.info(f"获取逐笔数据: code={code}, date={date}")
    result = _call_api(
        "tick",
        {"code": code, "date": date},
    )

    if isinstance(result, dict) and "data" in result:
        data = result["data"]
        return data if isinstance(data, list) else [data]
    elif isinstance(result, list):
        return result
    else:
        logger.warning(f"TickFlow 逐笔数据格式异常: {type(result)}")
        return []


def get_order_book(code: str, date: str) -> list[dict]:
    """获取委托队列数据

    Args:
        code: 股票代码，如 '600000'
        date: 日期，格式 'YYYY-MM-DD'

    Returns:
        委托队列字典列表
    """
    logger.info(f"获取委托队列: code={code}, date={date}")
    result = _call_api(
        "order_book",
        {"code": code, "date": date},
    )

    if isinstance(result, dict) and "data" in result:
        data = result["data"]
        return data if isinstance(data, list) else [data]
    elif isinstance(result, list):
        return result
    else:
        logger.warning(f"TickFlow 委托队列数据格式异常: {type(result)}")
        return []
