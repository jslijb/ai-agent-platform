import logging
import os
import time
import asyncio
import datetime
from contextlib import asynccontextmanager

os.environ.setdefault('FLAGS_enable_pir_api', '0')
os.environ.setdefault('FLAGS_use_mkldnn', '0')
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from data_service.providers import baostock_provider, efinance_provider, mootdx_provider, tushare_provider, tickflow_provider
from data_service.cache.local_cache import get_cache, HISTORY_TTL, FINANCIAL_TTL, REALTIME_TTL, BASIC_TTL, INDEX_TTL

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

_HISTORY_SOURCES = ["baostock", "efinance", "mootdx", "tushare"]
_REALTIME_SOURCES = ["efinance", "mootdx"]
_FINANCIAL_SOURCES = ["baostock", "efinance", "mootdx", "tushare"]
_INDEX_SOURCES = ["baostock", "efinance", "mootdx"]
_BASIC_SOURCES = ["baostock", "efinance", "mootdx", "tushare"]
_TRADE_CAL_SOURCES = ["baostock"]
_INDUSTRY_SOURCES = ["efinance", "mootdx"]
_CONCEPT_SOURCES = ["efinance", "mootdx"]
_TICK_SOURCES = ["tickflow"]
_MINUTE_SOURCES = ["efinance", "mootdx"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("数据服务启动中...")
    if not os.environ.get("CACHE_BACKEND"):
        os.environ["CACHE_BACKEND"] = "postgresql"
        logger.info("设置缓存后端: postgresql")
    try:
        from data_service.config import get_config
        config = get_config()
        logger.info("配置加载完成")
    except Exception as e:
        logger.error(f"配置加载失败: {e}")
    try:
        cache = get_cache()
        cache.clear_expired()
        stats = cache.get_stats()
        logger.info(f"本地缓存就绪: {stats}")
    except Exception as e:
        logger.error(f"缓存初始化失败: {e}")
    logger.info("数据服务已启动，监听端口 8001")
    yield
    logger.info("数据服务正在关闭...")


app = FastAPI(
    title="A股数据服务",
    description="为 TypeScript MCP 工具提供 A 股数据的 FastAPI 服务（含本地缓存）",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


class FinancialReportRequest(BaseModel):
    code: str
    report_type: str = "income"


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


def _make_response(success: bool, data=None, error: Optional[str] = None, from_cache: bool = False) -> dict:
    return {"success": success, "data": data, "error": error, "from_cache": from_cache}


def _validate_source(source: str, allowed_sources: list[str]):
    if source not in allowed_sources:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的数据源 '{source}'，当前接口支持: {allowed_sources}",
        )


def _guess_latest_quarter():
    now = datetime.datetime.now()
    year = now.year
    month = now.month
    if month <= 3:
        return year - 1, 4
    elif month <= 6:
        return year, 1
    elif month <= 9:
        return year, 2
    else:
        return year, 3


@app.get("/health")
async def health_check():
    cache = get_cache()
    stats = cache.get_stats()
    return _make_response(True, data={"status": "ok", "service": "a股数据服务", "cache_stats": stats})


@app.get("/api/cache/stats")
async def cache_stats():
    cache = get_cache()
    stats = cache.get_stats()
    return _make_response(True, data=stats)


@app.post("/api/cache/clear")
async def cache_clear():
    cache = get_cache()
    cache.clear_expired()
    return _make_response(True, data={"message": "过期缓存已清理"})


@app.post("/api/market/history")
async def market_history(req: HistoryRequest):
    logger.info(f"请求历史行情: source={req.source}, code={req.code}, start={req.start_date}, end={req.end_date}, freq={req.frequency}")
    start_time = time.time()

    try:
        _validate_source(req.source, _HISTORY_SOURCES)

        cache = get_cache()
        cache_params = {
            "source": req.source,
            "code": req.code,
            "start_date": req.start_date,
            "end_date": req.end_date,
            "frequency": req.frequency,
        }
        cached = cache.get("history", cache_params)
        if cached is not None:
            elapsed = time.time() - start_time
            logger.info(f"历史行情缓存命中: source={req.source}, code={req.code}, 耗时={elapsed:.2f}s")
            return _make_response(True, data=cached, from_cache=True)

        if req.source == "baostock":
            data = await asyncio.to_thread(
                baostock_provider.get_stock_history,
                req.code, req.start_date, req.end_date, req.frequency
            )
        elif req.source == "efinance":
            data = efinance_provider.get_stock_history(
                req.code, req.start_date, req.end_date, req.frequency
            )
        elif req.source == "mootdx":
            data = mootdx_provider.get_stock_history(
                req.code, req.start_date, req.end_date, req.frequency
            )
        elif req.source == "tushare":
            start = req.start_date.replace("-", "")
            end = req.end_date.replace("-", "")
            data = tushare_provider.get_stock_daily(req.code, start, end)

        if data:
            cache.set("history", cache_params, data, ttl=HISTORY_TTL, source=req.source)

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
    logger.info(f"请求实时行情: source={req.source}, code={req.code}")
    start_time = time.time()

    try:
        _validate_source(req.source, _REALTIME_SOURCES)

        cache = get_cache()
        cache_params = {"source": req.source, "code": req.code}
        cached = cache.get("realtime", cache_params)
        if cached is not None:
            elapsed = time.time() - start_time
            logger.info(f"实时行情缓存命中: source={req.source}, code={req.code}, 耗时={elapsed:.2f}s")
            return _make_response(True, data=cached, from_cache=True)

        if req.source == "efinance":
            data = efinance_provider.get_stock_realtime(req.code)
        elif req.source == "mootdx":
            data = mootdx_provider.get_stock_realtime(req.code)

        if data:
            cache.set("realtime", cache_params, data, ttl=REALTIME_TTL, source=req.source)

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
    logger.info(f"请求财务数据: source={req.source}, code={req.code}, year={req.year}, quarter={req.quarter}, period={req.period}, count={req.count}")
    start_time = time.time()

    try:
        _validate_source(req.source, _FINANCIAL_SOURCES)

        if req.source == "baostock":
            year = req.year
            quarter = req.quarter
            if year is None or quarter is None:
                year, quarter = _guess_latest_quarter()
                logger.info(f"baostock 未指定 year/quarter，自动推断: year={year}, quarter={quarter}")

            cache = get_cache()
            cache_params = {"source": "baostock", "code": req.code, "year": year, "quarter": quarter}
            cached = cache.get("financial", cache_params)
            if cached is not None:
                elapsed = time.time() - start_time
                logger.info(f"财务数据缓存命中: code={req.code}, year={year}, quarter={quarter}, 耗时={elapsed:.2f}s")
                return _make_response(True, data=cached, from_cache=True)

            data = await asyncio.to_thread(
                baostock_provider.get_financial_data, req.code, year, quarter
            )

            if not data and quarter > 1:
                logger.info(f"Q{quarter}无数据，尝试Q{quarter-1}")
                data = await asyncio.to_thread(
                    baostock_provider.get_financial_data, req.code, year, quarter - 1
                )
                if data:
                    quarter = quarter - 1

            if data:
                save_params = {"source": "baostock", "code": req.code, "year": year, "quarter": quarter}
                cache.set("financial", save_params, data, ttl=FINANCIAL_TTL, source="baostock")

        elif req.source == "efinance":
            cache = get_cache()
            cache_params = {"source": "efinance", "code": req.code, "count": req.count or 1}
            cached = cache.get("financial", cache_params)
            if cached is not None:
                elapsed = time.time() - start_time
                logger.info(f"财务数据缓存命中: code={req.code}, 耗时={elapsed:.2f}s")
                return _make_response(True, data=cached, from_cache=True)

            data = efinance_provider.get_financial_data(req.code, req.count or 1)

            if data:
                cache.set("financial", cache_params, data, ttl=FINANCIAL_TTL, source="efinance")

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


@app.post("/api/market/financial_report")
async def market_financial_report(req: FinancialReportRequest):
    logger.info(f"请求详细财报: code={req.code}, report_type={req.report_type}")
    start_time = time.time()

    try:
        cache = get_cache()
        cache_params = {"type": "financial_report", "code": req.code, "report_type": req.report_type}
        cached = cache.get("financial_report", cache_params)
        if cached is not None:
            elapsed = time.time() - start_time
            logger.info(f"详细财报缓存命中: code={req.code}, 耗时={elapsed:.2f}s")
            return _make_response(True, data=cached, from_cache=True)

        data = efinance_provider.get_financial_report(req.code, req.report_type)

        if data:
            cache.set("financial_report", cache_params, data, ttl=FINANCIAL_TTL, source="efinance")

        elapsed = time.time() - start_time
        logger.info(f"详细财报请求完成: code={req.code}, 耗时={elapsed:.2f}s, 记录数={len(data) if data else 0}")
        return _make_response(True, data=data)

    except Exception as e:
        logger.error(f"详细财报请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.post("/api/market/index")
async def market_index(req: IndexRequest):
    logger.info(f"请求指数数据: source={req.source}, code={req.code}, start={req.start_date}, end={req.end_date}")
    start_time = time.time()

    try:
        _validate_source(req.source, _INDEX_SOURCES)

        cache = get_cache()
        cache_params = {"source": req.source, "code": req.code, "start_date": req.start_date, "end_date": req.end_date}
        cached = cache.get("index", cache_params)
        if cached is not None:
            elapsed = time.time() - start_time
            logger.info(f"指数数据缓存命中: code={req.code}, 耗时={elapsed:.2f}s")
            return _make_response(True, data=cached, from_cache=True)

        if req.source == "baostock":
            data = await asyncio.to_thread(
                baostock_provider.get_index_history, req.code, req.start_date, req.end_date
            )
        elif req.source == "efinance":
            data = efinance_provider.get_index_history(req.code, req.start_date, req.end_date)
        elif req.source == "mootdx":
            data = mootdx_provider.get_index_history(req.code, req.start_date, req.end_date)

        if data:
            cache.set("index", cache_params, data, ttl=INDEX_TTL, source=req.source)

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
    logger.info(f"请求股票列表: source={req.source}")
    start_time = time.time()

    try:
        _validate_source(req.source, _BASIC_SOURCES)

        cache = get_cache()
        cache_params = {"source": req.source}
        cached = cache.get("basic", cache_params)
        if cached is not None:
            elapsed = time.time() - start_time
            logger.info(f"股票列表缓存命中: source={req.source}, 耗时={elapsed:.2f}s")
            return _make_response(True, data=cached, from_cache=True)

        if req.source == "baostock":
            data = await asyncio.to_thread(baostock_provider.get_stock_basic)
        elif req.source == "efinance":
            data = efinance_provider.get_stock_basic()
        elif req.source == "mootdx":
            data = mootdx_provider.get_stock_basic()
        elif req.source == "tushare":
            data = tushare_provider.get_stock_basic()

        if data:
            cache.set("basic", cache_params, data, ttl=BASIC_TTL, source=req.source)

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
    logger.info(f"请求交易日历: source={req.source}, exchange={req.exchange}, start={req.start_date}, end={req.end_date}")
    start_time = time.time()

    try:
        _validate_source(req.source, _TRADE_CAL_SOURCES)

        data = await asyncio.to_thread(
            baostock_provider.get_trade_calendar, req.start_date, req.end_date
        )

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
    logger.info(f"请求行业分类: source={req.source}, code={req.code}")
    start_time = time.time()

    try:
        _validate_source(req.source, _INDUSTRY_SOURCES)

        if req.source == "efinance":
            data = efinance_provider.get_industry(req.code)
        elif req.source == "mootdx":
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
    logger.info(f"请求概念板块: source={req.source}, code={req.code}")
    start_time = time.time()

    try:
        _validate_source(req.source, _CONCEPT_SOURCES)

        if req.source == "efinance":
            data = efinance_provider.get_concept(req.code)
        elif req.source == "mootdx":
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
    logger.info(f"请求分钟K线: source={req.source}, code={req.code}, freq={req.frequency}")
    start_time = time.time()

    try:
        _validate_source(req.source, _MINUTE_SOURCES)

        if req.source == "efinance":
            data = efinance_provider.get_minute_data(req.code, req.frequency)
        elif req.source == "mootdx":
            data = mootdx_provider.get_minute_data(req.code, req.frequency)

        elapsed = time.time() - start_time
        logger.info(f"分钟K线请求完成: source={req.source}, 耗时={elapsed:.2f}s, 记录数={len(data) if data else 0}")
        return _make_response(True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"分钟K线请求失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


# ==================== OCR / Vision 分析端点 ====================

try:
    _project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _model_base = os.path.join(_project_root, '.paddleocr_models')
    os.makedirs(_model_base, exist_ok=True)
    os.environ.setdefault('PADDLE_PDX_CACHE_HOME', _model_base)
    from paddleocr import PaddleOCR
    _ocr_engine = PaddleOCR(lang='ch', use_textline_orientation=True)
    logger.info(f"PaddleOCR引擎初始化成功 (v3.6), 模型目录: {_model_base}")
except ImportError:
    _ocr_engine = None
    logger.warning("PaddleOCR未安装，OCR端点不可用。安装: pip install paddlepaddle paddleocr")
except Exception as e:
    _ocr_engine = None
    logger.error(f"PaddleOCR初始化失败: {type(e).__name__}: {e}", exc_info=True)


class OCRRequest(BaseModel):
    image: str = Field(..., description="图片Base64编码")
    prompt: str = Field(default="", description="可选提示词")


@app.post("/api/ocr/analyze")
async def ocr_analyze(req: OCRRequest):
    if _ocr_engine is None:
        return _make_response(False, error="PaddleOCR未安装或初始化失败")

    try:
        import base64
        import tempfile
        import os

        image_bytes = base64.b64decode(req.image)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(image_bytes)
            tmp_path = f.name

        try:
            result = _ocr_engine.ocr(tmp_path)

            lines = []
            structured = []
            if result:
                for page in result:
                    rec_texts = getattr(page, 'rec_texts', None) or (page.get('rec_texts') if isinstance(page, dict) else None)
                    rec_scores = getattr(page, 'rec_scores', None) or (page.get('rec_scores') if isinstance(page, dict) else None)
                    rec_polys = getattr(page, 'rec_polys', None) or (page.get('rec_polys') if isinstance(page, dict) else None)
                    if rec_texts:
                        for i, text in enumerate(rec_texts):
                            conf = float(rec_scores[i]) if rec_scores and i < len(rec_scores) else 0.0
                            bbox = rec_polys[i].tolist() if rec_polys and i < len(rec_polys) else []
                            lines.append(text)
                            structured.append({
                                "text": text,
                                "confidence": round(conf, 4),
                                "bbox": bbox,
                            })
                    elif isinstance(page, (list, tuple)) and len(page) > 0:
                        for line_info in page:
                            if isinstance(line_info, (list, tuple)) and len(line_info) == 2:
                                bbox = line_info[0]
                                text = line_info[1][0]
                                confidence = line_info[1][1]
                                lines.append(text)
                                structured.append({
                                    "text": text,
                                    "confidence": round(confidence, 4),
                                    "bbox": bbox,
                                })

            full_text = "\n".join(lines)
            return _make_response(True, data={
                "text": full_text,
                "markdown": full_text,
                "structured": structured,
                "lineCount": len(lines),
                "engineUsed": "paddleocr_vl",
            })
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"OCR分析失败: {e}", exc_info=True)
        return _make_response(False, error=str(e))


@app.get("/api/ocr/health")
async def ocr_health():
    return _make_response(True, data={
        "available": _ocr_engine is not None,
        "engine": "paddleocr" if _ocr_engine else "none",
        "mode": "cpu",
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
