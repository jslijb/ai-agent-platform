"""
BGE-Reranker 本地服务
使用本地 bge-reranker-base 模型提供重排序 API
替代不可用的 Docker 镜像 csdnai/bge-reranker-v2-m3
"""

import os
import sys
import json
import time
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("RerankerService")

MODEL_PATH = os.environ.get("RERANKER_MODEL_PATH", r"D:\models\modelscope\bge-reranker-base")
HOST = os.environ.get("RERANKER_HOST", "0.0.0.0")
PORT = int(os.environ.get("RERANKER_PORT", "8010"))

model = None
tokenizer = None


def load_model():
    global model, tokenizer
    if model is not None:
        return

    logger.info(f"加载 Reranker 模型: {MODEL_PATH}")
    start = time.time()

    try:
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        import torch

        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
        model.eval()

        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cuda":
            model = model.to(device)
            logger.info("使用 GPU 加速")
        else:
            logger.info("使用 CPU 运行")

        elapsed = time.time() - start
        logger.info(f"模型加载完成, 耗时: {elapsed:.1f}s, 设备: {device}")
    except ImportError as e:
        logger.error(f"缺少依赖: {e}")
        logger.error("请安装: pip install transformers torch")
        sys.exit(1)
    except Exception as e:
        logger.error(f"模型加载失败: {e}")
        sys.exit(1)


def rerank(query: str, documents: list[str], top_n: int = None) -> list[dict]:
    import torch

    load_model()

    logger.info(f"重排序请求: query='{query[:50]}...', documents={len(documents)}")
    start = time.time()

    pairs = [[query, doc] for doc in documents]

    try:
        with torch.no_grad():
            inputs = tokenizer(
                pairs,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            )
            device = next(model.parameters()).device
            inputs = {k: v.to(device) for k, v in inputs.items()}
            scores = model(**inputs).logits.squeeze(-1).float().tolist()

        if not isinstance(scores, list):
            scores = [scores]

        results = []
        for i, (doc, score) in enumerate(zip(documents, scores)):
            results.append({
                "index": i,
                "relevance_score": float(score),
                "text": doc,
            })

        results.sort(key=lambda x: x["relevance_score"], reverse=True)

        if top_n is not None:
            results = results[:top_n]

        elapsed = time.time() - start
        logger.info(f"重排序完成, 耗时: {elapsed:.2f}s, 返回 {len(results)} 条")

        return results
    except Exception as e:
        logger.error(f"重排序失败: {e}")
        return [{"index": i, "relevance_score": 0.0, "text": doc} for i, doc in enumerate(documents)]


def create_app():
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    from typing import Optional

    app = FastAPI(title="BGE-Reranker Service", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class RerankRequest(BaseModel):
        query: str
        documents: list[str]
        top_n: Optional[int] = None

    class RerankResponse(BaseModel):
        results: list[dict]

    @app.get("/health")
    async def health():
        return {"status": "up", "model": os.path.basename(MODEL_PATH)}

    @app.post("/rerank")
    async def rerank_endpoint(request: RerankRequest):
        if not request.query:
            raise HTTPException(status_code=400, detail="query 不能为空")
        if not request.documents:
            raise HTTPException(status_code=400, detail="documents 不能为空")

        results = rerank(request.query, request.documents, request.top_n)
        return {"results": results}

    @app.post("/v1/rerank")
    async def rerank_v1_endpoint(request: RerankRequest):
        if not request.query:
            raise HTTPException(status_code=400, detail="query 不能为空")
        if not request.documents:
            raise HTTPException(status_code=400, detail="documents 不能为空")

        results = rerank(request.query, request.documents, request.top_n)
        return {"results": results}

    @app.on_event("startup")
    async def startup():
        load_model()

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    logger.info(f"启动 Reranker 服务: {HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT)
