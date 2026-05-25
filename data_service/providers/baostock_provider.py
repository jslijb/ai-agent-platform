import logging
import baostock as bs
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
        code: 股票代码，如 'sh.600000'
        start_date: 开始日期，格式 'YYYY-MM-DD'
        end_date: 结束日期，格式 'YYYY-MM-DD'
        frequency: 频率，'d'=日K, 'w'=周K, 'm'=月K, '5'=5分钟, '15'=15分钟, '30'=30分钟, '60'=60分钟

    Returns:
        K线数据字典列表
    """
    logger.info(f"获取历史K线: code={code}, start={start_date}, end={end_date}, freq={frequency}")
    lg = bs.login()
    if lg.error_code != "0":
        logger.error(f"baostock 登录失败: {lg.error_msg}")
        raise ConnectionError(f"baostock 登录失败: {lg.error_msg}")

    try:
        rs = bs.query_history_k_data_plus(
            code,
            "date,code,open,high,low,close,preclose,volume,amount,turn,pctChg",
            start_date=start_date,
            end_date=end_date,
            frequency=frequency,
            adjustflag="3",
        )

        if rs.error_code != "0":
            logger.error(f"查询历史K线失败: {rs.error_msg}")
            raise RuntimeError(f"查询历史K线失败: {rs.error_msg}")

        data_list = []
        while rs.error_code == "0" and rs.next():
            data_list.append(rs.get_row_data())

        if not data_list:
            logger.warning(f"未查询到K线数据: code={code}")
            return []

        df = pd.DataFrame(data_list, columns=rs.fields)
        result = _df_to_dict(df)
        logger.info(f"获取历史K线成功，共 {len(result)} 条记录")
        return result

    except Exception as e:
        logger.error(f"获取历史K线异常: {e}", exc_info=True)
        raise
    finally:
        bs.logout()
        logger.debug("baostock 已登出")


def get_stock_realtime(code: str) -> list[dict]:
    """获取股票实时行情（通过最新日K线模拟）

    Args:
        code: 股票代码，如 'sh.600000'

    Returns:
        最新日K数据字典列表
    """
    logger.info(f"获取实时行情(日K模拟): code={code}")
    lg = bs.login()
    if lg.error_code != "0":
        logger.error(f"baostock 登录失败: {lg.error_msg}")
        raise ConnectionError(f"baostock 登录失败: {lg.error_msg}")

    try:
        rs = bs.query_history_k_data_plus(
            code,
            "date,code,open,high,low,close,preclose,volume,amount,turn,pctChg",
            start_date="2024-01-01",
            end_date="2099-12-31",
            frequency="d",
            adjustflag="3",
        )

        if rs.error_code != "0":
            logger.error(f"查询实时行情失败: {rs.error_msg}")
            raise RuntimeError(f"查询实时行情失败: {rs.error_msg}")

        data_list = []
        while rs.error_code == "0" and rs.next():
            data_list.append(rs.get_row_data())

        if not data_list:
            logger.warning(f"未查询到实时行情数据: code={code}")
            return []

        df = pd.DataFrame(data_list, columns=rs.fields)
        latest = df.iloc[[-1]]
        result = _df_to_dict(latest)
        logger.info(f"获取实时行情成功: code={code}, date={result[0].get('date') if result else 'N/A'}")
        return result

    except Exception as e:
        logger.error(f"获取实时行情异常: {e}", exc_info=True)
        raise
    finally:
        bs.logout()
        logger.debug("baostock 已登出")


def get_financial_data(code: str, year: int, quarter: int) -> list[dict]:
    """获取股票财务数据

    Args:
        code: 股票代码，如 'sh.600000'
        year: 年份，如 2024
        quarter: 季度，1-4

    Returns:
        财务数据字典列表
    """
    logger.info(f"获取财务数据: code={code}, year={year}, quarter={quarter}")
    lg = bs.login()
    if lg.error_code != "0":
        logger.error(f"baostock 登录失败: {lg.error_msg}")
        raise ConnectionError(f"baostock 登录失败: {lg.error_msg}")

    try:
        rs = bs.query_profit_data(
            code=code,
            year=year,
            quarter=quarter,
        )

        if rs.error_code != "0":
            logger.error(f"查询财务数据失败: {rs.error_msg}")
            raise RuntimeError(f"查询财务数据失败: {rs.error_msg}")

        data_list = []
        while rs.error_code == "0" and rs.next():
            data_list.append(rs.get_row_data())

        if not data_list:
            logger.warning(f"未查询到财务数据: code={code}, year={year}, quarter={quarter}")
            return []

        df = pd.DataFrame(data_list, columns=rs.fields)
        result = _df_to_dict(df)
        logger.info(f"获取财务数据成功，共 {len(result)} 条记录")
        return result

    except Exception as e:
        logger.error(f"获取财务数据异常: {e}", exc_info=True)
        raise
    finally:
        bs.logout()
        logger.debug("baostock 已登出")


def get_index_history(code: str, start_date: str, end_date: str) -> list[dict]:
    """获取指数历史数据

    Args:
        code: 指数代码，如 'sh.000001'（上证指数）
        start_date: 开始日期，格式 'YYYY-MM-DD'
        end_date: 结束日期，格式 'YYYY-MM-DD'

    Returns:
        指数数据字典列表
    """
    logger.info(f"获取指数历史: code={code}, start={start_date}, end={end_date}")
    lg = bs.login()
    if lg.error_code != "0":
        logger.error(f"baostock 登录失败: {lg.error_msg}")
        raise ConnectionError(f"baostock 登录失败: {lg.error_msg}")

    try:
        rs = bs.query_history_k_data_plus(
            code,
            "date,code,open,high,low,close,preclose,volume,amount",
            start_date=start_date,
            end_date=end_date,
            frequency="d",
        )

        if rs.error_code != "0":
            logger.error(f"查询指数历史失败: {rs.error_msg}")
            raise RuntimeError(f"查询指数历史失败: {rs.error_msg}")

        data_list = []
        while rs.error_code == "0" and rs.next():
            data_list.append(rs.get_row_data())

        if not data_list:
            logger.warning(f"未查询到指数数据: code={code}")
            return []

        df = pd.DataFrame(data_list, columns=rs.fields)
        result = _df_to_dict(df)
        logger.info(f"获取指数历史成功，共 {len(result)} 条记录")
        return result

    except Exception as e:
        logger.error(f"获取指数历史异常: {e}", exc_info=True)
        raise
    finally:
        bs.logout()
        logger.debug("baostock 已登出")


def get_trade_calendar(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict]:
    """获取交易日历

    Args:
        start_date: 开始日期，格式 'YYYY-MM-DD'，可选
        end_date: 结束日期，格式 'YYYY-MM-DD'，可选

    Returns:
        交易日历字典列表，包含 calendar_date 和 is_trading_day 字段
    """
    logger.info(f"获取交易日历: start={start_date}, end={end_date}")
    lg = bs.login()
    if lg.error_code != "0":
        logger.error(f"baostock 登录失败: {lg.error_msg}")
        raise ConnectionError(f"baostock 登录失败: {lg.error_msg}")

    try:
        rs = bs.query_trade_dates(
            start_date=start_date.replace("-", "") if start_date else "1990-01-01".replace("-", ""),
            end_date=end_date.replace("-", "") if end_date else "2099-12-31".replace("-", ""),
        )

        if rs.error_code != "0":
            logger.error(f"查询交易日历失败: {rs.error_msg}")
            raise RuntimeError(f"查询交易日历失败: {rs.error_msg}")

        data_list = []
        while rs.error_code == "0" and rs.next():
            data_list.append(rs.get_row_data())

        if not data_list:
            logger.warning("未查询到交易日历数据")
            return []

        df = pd.DataFrame(data_list, columns=rs.fields)

        if "is_trading_day" in df.columns:
            df = df[df["is_trading_day"] == "1"]

        result = _df_to_dict(df)
        logger.info(f"获取交易日历成功，共 {len(result)} 条记录")
        return result

    except Exception as e:
        logger.error(f"获取交易日历异常: {e}", exc_info=True)
        raise
    finally:
        bs.logout()
        logger.debug("baostock 已登出")


def get_stock_basic() -> list[dict]:
    """获取沪深A股基本信息列表

    Returns:
        股票基本信息字典列表
    """
    logger.info("获取股票基本信息列表")
    lg = bs.login()
    if lg.error_code != "0":
        logger.error(f"baostock 登录失败: {lg.error_msg}")
        raise ConnectionError(f"baostock 登录失败: {lg.error_msg}")

    try:
        rs = bs.query_stock_basic()

        if rs.error_code != "0":
            logger.error(f"查询股票基本信息失败: {rs.error_msg}")
            raise RuntimeError(f"查询股票基本信息失败: {rs.error_msg}")

        data_list = []
        while rs.error_code == "0" and rs.next():
            data_list.append(rs.get_row_data())

        if not data_list:
            logger.warning("未查询到股票基本信息")
            return []

        df = pd.DataFrame(data_list, columns=rs.fields)
        result = _df_to_dict(df)
        logger.info(f"获取股票基本信息成功，共 {len(result)} 条记录")
        return result

    except Exception as e:
        logger.error(f"获取股票基本信息异常: {e}", exc_info=True)
        raise
    finally:
        bs.logout()
        logger.debug("baostock 已登出")
