import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data_service.providers import baostock_provider, mootdx_provider, efinance_provider, tushare_provider, tickflow_provider

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

_HISTORY_SOURCES = ["baostock", "mootdx", "efinance", "tushare"]
_REALTIME_SOURCES = ["mootdx", "efinance"]
_FINANCIAL_SOURCES = ["baostock", "mootdx", "tushare"]
_INDEX_SOURCES = ["baostock", "mootdx"]
_BASIC_SOURCES = ["baostock", "mootdx", "efinance", "tushare"]
_TRADE_CAL_SOURCES = ["baostock"]
_INDUSTRY_SOURCES = ["mootdx"]
_CONCEPT_SOURCES = ["mootdx"]
_TICK_SOURCES = ["tickflow"]
_MINUTE_SOURCES = ["mootdx", "efinance"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("数据服务启动中...")
    try:
        from data_service.config import get_config
        config = get_config()
        logger.info("配置加载完成")
    except Exception as e:
        logger.error(f"配置加载失败: {e}")
    logger.info("数据服务已启动，监听端口 8001")
    yield
    logger.info("数据服务正在关闭...")


app = FastAPI(
    title="A股数据服务",
    description="为 TypeScript MCP 工具提供 A 股数据的 FastAPI 服务",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HistoryRequest(BaseModel):
    source: str
    code: str
    start_date: str
    end_date: str
    frequency: str = "d"


class RealtimeRequest(BaseModel):
    source: str
    code: str


class FinancialRequest(BaseModel):
    source: str
    code: str
    year: Optional[int] = None
    quarter: Optional[int] = None
    period: Optional[str] = None
    count: Optional[int] = 1


class IndexRequest(BaseModel):
    source: str
    code: str
    start_date: str
    end_date: str


class BasicRequest(BaseModel):
    source: str


class TradeCalRequest(BaseModel):
    source: str
    exchange: Optional[str] = "SSE"
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class IndustryRequest(BaseModel):
    source: str
    code: str


class ConceptRequest(BaseModel):
    source: str
    code: str


class TickRequest(BaseModel):
    source: str
    code: str
    date: str


class MinuteRequest(BaseModel):
    source: str
    code: str
    frequency: str = "5"


def _make_response(success: bool, data=None, error: Optional[str] = None) -> dict:
    """构造统一响应格式"""
    return {"success": success, "data": data, "error": error}


def _validate_source(source: str, allowed_sources: list[str]):
    """验证数据源是否支持"""
    if source not in allowed_sources:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的数据源 '{source}'，当前接口支持: {allowed_sources}",
        )


@app.get("/health")
async def health_check():
    """健康检查接口"""
    return _make_response(True, data={"status": "ok", "service": "a股数据服务"})


@app.post("/api/market/history")
async def market_history(req: HistoryRequest):
    """历史行情接口"""
    logger.info(f"请求历史行情: source={req.source}, code={req.code}, start={req.start_date}, end={req.end_date}, freq={req.frequency}")
    start_time = time.time()

    try:
        _validate_source(req.source, _HISTORY_SOURCES)

        if req.source == "baostock":
            data = baostock_provider.get_stock_history(
                req.code, req.start_date, req.end_date, req.frequency
            )
        elif req.source == "mootdx":
            data = mootdx_provider.get_stock_history(
                req.code, req.start_date, req.end_date, req.frequency
            )
        elif req.source == "efinance":
            data = efinance_provider.get_stock_history(
                req.code, req.start_date, req.end_date, req.frequency
            )
        elif req.source == "tushare":
            start = req.start_date.replace("-", "")
            end = req.end_date.replace("-", "")
            data = tushare_provider.get_stock_daily(req.code, start, end)

        elapsed = time.time() - start_time
        logger.info(f"历史行情请求完成: source={req.source}, 耗时={elapsed:.2f}s, 记录数={len(data) if data else 0}")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"历史行情请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.post("/api/market/realtime")
async def market_realtime(req: RealtimeRequest):
    """实时行情接口"""
    logger.info(f"请求实时行情: source={req.source}, code={req.code}")
    start_time = time.time()

    try:
        _validate_source(req.source, _REALTIME_SOURCES)

        if req.source == "mootdx":
            data = mootdx_provider.get_stock_realtime(req.code)
        elif req.source == "efinance":
            data = efinance_provider.get_stock_realtime(req.code)

        elapsed = time.time() - start_time
        logger.info(f"实时行情请求完成: source={req.source}, 耗时={elapsed:.2f}s")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"实时行情请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.post("/api/market/financial")
async def market_financial(req: FinancialRequest):
    """财务数据接口"""
    logger.info(f"请求财务数据: source={req.source}, code={req.code}, year={req.year}, quarter={req.quarter}, period={req.period}, count={req.count}")
    start_time = time.time()

    try:
        _validate_source(req.source, _FINANCIAL_SOURCES)

        if req.source == "baostock":
            if req.year is None or req.quarter is None:
                return _make_response(False, error="baostock 数据源需要 year 和 quarter 参数")
            data = baostock_provider.get_financial_data(req.code, req.year, req.quarter)
        elif req.source == "mootdx":
            data = mootdx_provider.get_financial_data(req.code, req.count or 1)
        elif req.source == "tushare":
            if req.period is None:
                return _make_response(False, error="tushare 数据源需要 period 参数")
            data = tushare_provider.get_financial_indicator(req.code, req.period)

        elapsed = time.time() - start_time
        logger.info(f"财务数据请求完成: source={req.source}, 耗时={elapsed:.2f}s, 记录数={len(data) if data else 0}")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"财务数据请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.post("/api/market/index")
async def market_index(req: IndexRequest):
    """指数数据接口"""
    logger.info(f"请求指数数据: source={req.source}, code={req.code}, start={req.start_date}, end={req.end_date}")
    start_time = time.time()

    try:
        _validate_source(req.source, _INDEX_SOURCES)

        if req.source == "baostock":
            data = baostock_provider.get_index_history(req.code, req.start_date, req.end_date)
        elif req.source == "mootdx":
            data = mootdx_provider.get_index_history(req.code, req.start_date, req.end_date)

        elapsed = time.time() - start_time
        logger.info(f"指数数据请求完成: source={req.source}, 耗时={elapsed:.2f}s, 记录数={len(data) if data else 0}")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"指数数据请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.post("/api/market/basic")
async def market_basic(req: BasicRequest):
    """股票列表接口"""
    logger.info(f"请求股票列表: source={req.source}")
    start_time = time.time()

    try:
        _validate_source(req.source, _BASIC_SOURCES)

        if req.source == "baostock":
            data = baostock_provider.get_stock_basic()
        elif req.source == "mootdx":
            data = mootdx_provider.get_stock_basic()
        elif req.source == "efinance":
            data = efinance_provider.get_stock_basic()
        elif req.source == "tushare":
            data = tushare_provider.get_stock_basic()

        elapsed = time.time() - start_time
        logger.info(f"股票列表请求完成: source={req.source}, 耗时={elapsed:.2f}s, 记录数={len(data) if data else 0}")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"股票列表请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.post("/api/market/trade_cal")
async def market_trade_cal(req: TradeCalRequest):
    """交易日历接口"""
    logger.info(f"请求交易日历: source={req.source}, exchange={req.exchange}, start={req.start_date}, end={req.end_date}")
    start_time = time.time()

    try:
        _validate_source(req.source, _TRADE_CAL_SOURCES)

        data = baostock_provider.get_trade_calendar(req.start_date, req.end_date)

        elapsed = time.time() - start_time
        logger.info(f"交易日历请求完成: source={req.source}, 耗时={elapsed:.2f}s, 记录数={len(data) if data else 0}")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"交易日历请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.post("/api/market/industry")
async def market_industry(req: IndustryRequest):
    """行业分类接口"""
    logger.info(f"请求行业分类: source={req.source}, code={req.code}")
    start_time = time.time()

    try:
        _validate_source(req.source, _INDUSTRY_SOURCES)

        data = mootdx_provider.get_concept(req.code)

        elapsed = time.time() - start_time
        logger.info(f"行业分类请求完成: source={req.source}, 耗时={elapsed:.2f}s")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"行业分类请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.post("/api/market/concept")
async def market_concept(req: ConceptRequest):
    """概念板块接口"""
    logger.info(f"请求概念板块: source={req.source}, code={req.code}")
    start_time = time.time()

    try:
        _validate_source(req.source, _CONCEPT_SOURCES)

        data = mootdx_provider.get_concept(req.code)

        elapsed = time.time() - start_time
        logger.info(f"概念板块请求完成: source={req.source}, 耗时={elapsed:.2f}s")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"概念板块请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.post("/api/market/tick")
async def market_tick(req: TickRequest):
    """逐笔数据接口"""
    logger.info(f"请求逐笔数据: source={req.source}, code={req.code}, date={req.date}")
    start_time = time.time()

    try:
        _validate_source(req.source, _TICK_SOURCES)

        data = tickflow_provider.get_tick_data(req.code, req.date)

        elapsed = time.time() - start_time
        logger.info(f"逐笔数据请求完成: source={req.source}, 耗时={elapsed:.2f}s")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"逐笔数据请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.post("/api/market/minute")
async def market_minute(req: MinuteRequest):
    """分钟K线数据接口"""
    logger.info(f"请求分钟K线: source={req.source}, code={req.code}, freq={req.frequency}")
    start_time = time.time()

    try:
        _validate_source(req.source, _MINUTE_SOURCES)

        if req.source == "mootdx":
            data = mootdx_provider.get_minute_data(req.code, req.frequency)
        elif req.source == "efinance":
            data = efinance_provider.get_minute_data(req.code, req.frequency)

        elapsed = time.time() - start_time
        logger.info(f"分钟K线请求完成: source={req.source}, 耗时={elapsed:.2f}s, 记录数={len(data) if data else 0}")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"分钟K线请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
