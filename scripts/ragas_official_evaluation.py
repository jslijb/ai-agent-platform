#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
RAGAS 官方库评估脚本（替换自实现 RAGAS）

用业界成熟的 RAGAS 0.4.x 官方库对 V14 系统进行评估，
与之前自实现的 ragas_evaluation.py 跑同一份数据，对比结果。

四指标（与自实现一致，便于对比）：
  - Context Precision（上下文精度）
  - Context Recall（上下文召回）
  - Faithfulness（忠实度）
  - Answer Relevancy（答案相关性）

LLM：百炼 qwen-plus-2025-04-28（已验证可用，与主系统 fallback 链一致）
Embeddings：百炼 text-embedding-v3（AR 指标需要）

用法：
  conda activate bigmodel
  python scripts/ragas_official_evaluation.py [--input PATH] [--output PATH] [--limit N]
"""

import argparse
import json
import logging
import math
import os
import sys
import time
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

warnings.filterwarnings("ignore", category=DeprecationWarning)

import requests as http_requests
from langchain_openai import ChatOpenAI
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.messages import BaseMessage
from ragas import evaluate, EvaluationDataset
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.metrics import context_precision, context_recall, faithfulness, answer_relevancy
from ragas.dataset_schema import SingleTurnSample
from ragas.run_config import RunConfig


class BgeM3Embeddings(Embeddings):
    """
    bge-m3 本地服务适配器（项目原有 embedding，不得擅自更换）。

    llama.cpp 的 /embedding 接口非 OpenAI 兼容，此处实现 langchain Embeddings 接口。
    API 格式：POST /embedding，body={"input": text}，response={"embedding": [...]}
    """

    def __init__(self, service_url: str, model_name: str = "bge-m3"):
        self.service_url = service_url.rstrip("/")
        self.model_name = model_name

    def _embed_one(self, text: str) -> List[float]:
        """调用 bge-m3 本地服务获取单个文本的 embedding"""
        if not text or not text.strip():
            text = "空"
        resp = http_requests.post(
            f"{self.service_url}/embedding",
            json={"input": text},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        # 兼容 llama.cpp 多种返回格式
        if isinstance(data, list):
            return data[0].get("embedding", [{}])[0] or data[0].get("embedding", [])
        return data.get("embedding") or data.get("data", [{}])[0].get("embedding", [])

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed_one(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed_one(text)


class FallbackChatModel(BaseChatModel):
    """
    多 provider + 多模型 fallback ChatModel。

    支持不同 provider（不同 base_url + 不同 api_key），遇到 403/429/401 自动切换下一个。

    providers_config 结构（按优先级排序）：
    [
        {"name": "agnes-2.5-flash", "api_key": "...", "base_url": "https://apihub.agnes-ai.cn/v1", "model": "agnes-2.5-flash"},
        {"name": "qwen-plus-2025-01-25", "api_key": "...", "base_url": "...", "model": "..."},
        ...
    ]

    设计依据：与主系统 router fallback 逻辑一致（agnes → qwen-plus 链式切换），
    评估脚本需镜像主系统行为，确保测试与生产一致。
    """

    providers_config: list = []
    temperature: float = 0
    timeout: int = 90
    _current_idx: int = 0
    _exhausted: set = set()

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        logger.info(f"FallbackChatModel 初始化，provider 链 ({len(self.providers_config)} 个):")
        for i, p in enumerate(self.providers_config):
            logger.info(f"  [{i}] {p['name']} @ {p['base_url']}")

    @property
    def _llm_type(self) -> str:
        return "fallback-chat-multi-provider"

    def _get_current(self) -> dict:
        """获取当前 provider 配置"""
        if self._current_idx < len(self.providers_config):
            return self.providers_config[self._current_idx]
        return self.providers_config[-1] if self.providers_config else {}

    def _switch_to_next_available(self, failed_name: str, error_msg: str) -> bool:
        """切换到下一个未耗尽的 provider"""
        self._exhausted.add(failed_name)
        logger.warning(f"Provider [{failed_name}] 不可用: {error_msg[:80]}")
        logger.warning(f"已耗尽集合: {self._exhausted}")
        for idx in range(len(self.providers_config)):
            p = self.providers_config[idx]
            if p["name"] not in self._exhausted:
                self._current_idx = idx
                logger.info(f"切换到 provider [{p['name']}]（索引 {idx}）")
                return True
        logger.error(f"所有 provider 已耗尽: {[p['name'] for p in self.providers_config]}")
        return False

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        """带 fallback 的生成

        错误处理策略：
        - 403/401/quota exhausted：永久耗尽，切换下一个 provider
        - 429 rate limit：临时限流，等待后重试同一 provider（最多 3 次）
        - 其他错误：不切换，直接抛出
        """
        import time as _time

        last_error = None
        while self._current_idx < len(self.providers_config):
            provider = self._get_current()
            name = provider.get("name", "unknown")
            if name in self._exhausted:
                self._current_idx += 1
                continue

            retry_count = 0
            max_retries_429 = 3
            while retry_count < max_retries_429:
                try:
                    llm = ChatOpenAI(
                        model=provider["model"],
                        api_key=provider["api_key"],
                        base_url=provider["base_url"],
                        temperature=self.temperature,
                        timeout=self.timeout,
                    )
                    return llm._generate(messages, stop=stop, run_manager=run_manager, **kwargs)
                except Exception as e:
                    msg = str(e)
                    last_error = e
                    if "429" in msg or "rate limit" in msg.lower() or "Rate limit" in msg:
                        retry_count += 1
                        wait_sec = 5 * retry_count
                        logger.warning(f"Provider [{name}] 限流(429)，{wait_sec}s 后重试 ({retry_count}/{max_retries_429})")
                        _time.sleep(wait_sec)
                        continue
                    elif any(code in msg for code in ["403", "401", "quota", "exhausted", "PermissionDenied"]):
                        if not self._switch_to_next_available(name, msg):
                            break
                        break
                    else:
                        logger.error(f"Provider [{name}] 非额度类错误，不切换: {type(e).__name__}: {msg[:120]}")
                        raise
            else:
                logger.warning(f"Provider [{name}] 429 重试 {max_retries_429} 次仍失败，切换下一个")
                if not self._switch_to_next_available(name, f"429 重试 {max_retries_429} 次失败"):
                    break
                continue

        raise RuntimeError(f"所有 provider 已耗尽，无法完成评估。最后错误: {last_error}")

    def _stream(self, messages, stop=None, run_manager=None, **kwargs):
        """流式生成（带 fallback）"""
        import time as _time

        while self._current_idx < len(self.providers_config):
            provider = self._get_current()
            name = provider.get("name", "unknown")
            if name in self._exhausted:
                self._current_idx += 1
                continue

            retry_count = 0
            max_retries_429 = 3
            while retry_count < max_retries_429:
                try:
                    llm = ChatOpenAI(
                        model=provider["model"],
                        api_key=provider["api_key"],
                        base_url=provider["base_url"],
                        temperature=self.temperature,
                        timeout=self.timeout,
                    )
                    yield from llm._stream(messages, stop=stop, run_manager=run_manager, **kwargs)
                    return
                except Exception as e:
                    msg = str(e)
                    if "429" in msg or "rate limit" in msg.lower():
                        retry_count += 1
                        _time.sleep(5 * retry_count)
                        continue
                    elif any(code in msg for code in ["403", "401", "quota", "exhausted", "PermissionDenied"]):
                        if not self._switch_to_next_available(name, msg):
                            break
                        break
                    else:
                        raise
            else:
                if not self._switch_to_next_available(name, f"429 重试 {max_retries_429} 次失败"):
                    break
                continue

# ============================================================================
# 日志配置（运行日志 + 错误日志，永久保存，便于排错）
# ============================================================================
LOG_DIR = Path("tests/reports/evaluation/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)
_LOG_FILE = LOG_DIR / f"ragas-official-{datetime.now().strftime('%Y%m%d')}.log"
_ERR_FILE = LOG_DIR / f"ragas-official-error-{datetime.now().strftime('%Y%m%d')}.log"

_logger = logging.getLogger("ragas-official")
_logger.setLevel(logging.DEBUG)

_fh = logging.FileHandler(_LOG_FILE, encoding="utf-8")
_fh.setLevel(logging.DEBUG)
_fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S"))

_eh = logging.FileHandler(_ERR_FILE, encoding="utf-8")
_eh.setLevel(logging.ERROR)
_eh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S"))

_sh = logging.StreamHandler(sys.stdout)
_sh.setLevel(logging.INFO)
_sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] [ragas-official] %(message)s", "%Y-%m-%d %H:%M:%S"))

_logger.addHandler(_fh)
_logger.addHandler(_eh)
_logger.addHandler(_sh)

logger = _logger


# ============================================================================
# 配置（与自实现保持一致的权重和阈值，便于对比）
# ============================================================================
class Config:
    """评估配置，从环境变量读取"""

    DEFAULT_INPUT = "tests/reports/evaluation/ragas-eval-data.json"
    DEFAULT_OUTPUT_DIR = "tests/reports/evaluation"

    # 指标权重（与自实现一致：召回阶段 40% + 生成阶段 60%）
    WEIGHTS = {
        "context_precision": 0.20,
        "context_recall": 0.20,
        "faithfulness": 0.30,
        "answer_relevancy": 0.30,
    }

    # 优秀线阈值（与自实现一致，便于对比）
    THRESHOLDS = {
        "context_precision": 0.80,
        "context_recall": 0.80,
        "faithfulness": 0.85,
        "answer_relevancy": 0.80,
        "overall": 0.82,
    }

    # LLM 模型链（AGNES + 百炼多模型 fallback，与 api_keys.yaml 配置一致）
    # 遇到 403/429/401 自动切换下一个，镜像主系统 router fallback 逻辑
    # AGNES 已验证可用（2026-07-30），放在链首；百炼多个版本作为 fallback
    BAILIAN_KEY_ENV = "DASHSCOPE_API_KEY2"
    BAILIAN_FALLBACK_KEY_ENV = "DASHSCOPE_API_KEY"
    BAILIAN_URL = "https://ws-tnq834yxgaaw4e8v.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    BAILIAN_MODELS = [
        "qwen-plus-2025-07-14",
        "qwen-plus-2025-04-28",
        "qwen-plus-2025-01-25",
        "qwen-plus-2025-09-11",
        "qwen-plus-latest",
    ]
    # Embeddings 模型：项目原有 bge-m3 本地服务（不得擅自更改，违反规则第 9 条）
    # 之前擅自用百炼 text-embedding-v3 已被用户纠正，改回 bge-m3
    BGE3_SERVICE_URL = os.getenv("EMBEDDING_SERVICE_URL", "http://localhost:8011")
    BGE3_MODEL = os.getenv("EMBEDDING_MODEL", "bge-m3")

    # AGNES 配置（已验证可用，2026-07-30）
    AGNES_KEY_ENV = "AGNES_KEY"
    AGNES_URL = "https://apihub.agnes-ai.cn/v1"
    AGNES_MODEL = "agnes-2.5-flash"


def build_llm_and_embeddings():
    """构建 LLM 和 Embeddings wrapper（多 provider fallback：AGNES + 百炼）"""
    bailian_key = (
        os.getenv(Config.BAILIAN_KEY_ENV, "")
        or os.getenv(Config.BAILIAN_FALLBACK_KEY_ENV, "")
    )
    agnes_key = os.getenv(Config.AGNES_KEY_ENV, "")

    # 构造 provider 链（AGNES 在前已验证可用，百炼多版本作为 fallback）
    providers = []
    if agnes_key:
        providers.append({
            "name": f"agnes/{Config.AGNES_MODEL}",
            "api_key": agnes_key,
            "base_url": Config.AGNES_URL,
            "model": Config.AGNES_MODEL,
        })
    if bailian_key:
        for m in Config.BAILIAN_MODELS:
            providers.append({
                "name": f"dashscope/{m}",
                "api_key": bailian_key,
                "base_url": Config.BAILIAN_URL,
                "model": m,
            })

    if not providers:
        raise RuntimeError(
            f"未设置任何 LLM API Key（AGNES_KEY 或 {Config.BAILIAN_KEY_ENV}/{Config.BAILIAN_FALLBACK_KEY_ENV}）"
        )

    logger.info(f"Provider 链 ({len(providers)} 个):")
    for i, p in enumerate(providers):
        logger.info(f"  [{i}] {p['name']} @ {p['base_url']}")
    logger.info(f"Embeddings 模型: {Config.BGE3_MODEL} @ {Config.BGE3_SERVICE_URL} (bge-m3 本地服务)")

    llm = FallbackChatModel(
        providers_config=providers,
        temperature=0,
        timeout=90,
    )
    llm_wrapper = LangchainLLMWrapper(llm)

    # Embeddings 用项目原有 bge-m3 本地服务（不得擅自更换为百炼 text-embedding-v3）
    embeddings = BgeM3Embeddings(
        service_url=Config.BGE3_SERVICE_URL,
        model_name=Config.BGE3_MODEL,
    )
    emb_wrapper = LangchainEmbeddingsWrapper(embeddings)

    return llm_wrapper, emb_wrapper, bailian_key


# ============================================================================
# 数据加载与转换
# ============================================================================
def load_eval_data(input_path: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """加载评估数据（与自实现同一份输入文件）"""
    logger.info(f"加载评估数据: {input_path}")
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    items = data.get("items", [])
    logger.info(f"数据加载完成，共 {len(items)} 条")
    if limit:
        items = items[:limit]
        logger.info(f"限制评估前 {limit} 条")
    return items


def to_ragas_samples(items: List[Dict[str, Any]]) -> List[SingleTurnSample]:
    """把自实现数据格式转成 RAGAS SingleTurnSample"""
    samples = []
    for idx, item in enumerate(items):
        # RAGAS 字段映射：question→user_input, answer→response, contexts→retrieved_contexts, ground_truth→reference
        sample = SingleTurnSample(
            user_input=item.get("question", ""),
            response=item.get("answer", ""),
            retrieved_contexts=item.get("contexts", []) or ["（无检索结果）"],
            reference=item.get("ground_truth", ""),
        )
        # 附加额外字段用于报告（RAGAS sample 支持附加属性）
        samples.append(sample)
    return samples


# ============================================================================
# 评估执行
# ============================================================================
def run_evaluation(samples: List[SingleTurnSample], llm_wrapper, emb_wrapper) -> Dict[str, Any]:
    """执行 RAGAS 官方评估"""
    dataset = EvaluationDataset(samples=samples)
    metrics = [context_precision, context_recall, faithfulness, answer_relevancy]

    logger.info(f"开始 RAGAS 官方评估，共 {len(samples)} 条样本，4 个指标")
    start_time = time.time()

    # 并发配置：降并发避免 429 限流（百炼 ws 端点限流较严）
    run_config = RunConfig(max_workers=4, max_retries=2, timeout=120)
    logger.info(f"RunConfig: max_workers=4, max_retries=2, timeout=120")

    try:
        result = evaluate(
            dataset=dataset,
            metrics=metrics,
            llm=llm_wrapper,
            embeddings=emb_wrapper,
            run_config=run_config,
        )
        duration = time.time() - start_time
        logger.info(f"RAGAS 评估完成，耗时 {duration:.2f} 秒")
        return {
            "result": result,
            "duration": duration,
            "error": None,
        }
    except Exception as e:
        duration = time.time() - start_time
        logger.error(f"RAGAS 评估失败: {type(e).__name__}: {e}", exc_info=True)
        return {
            "result": None,
            "duration": duration,
            "error": str(e),
        }


# ============================================================================
# 报告生成（与自实现格式兼容，便于对比）
# ============================================================================
def _safe_num(v: Any) -> Optional[float]:
    """安全转 float，nan/None 返回 None"""
    if v is None:
        return None
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def build_report(
    eval_result: Dict[str, Any],
    items: List[Dict[str, Any]],
    output_path: str,
) -> Dict[str, Any]:
    """生成评估报告（格式与自实现 ragas_evaluation.py 兼容）"""

    result = eval_result["result"]
    duration = eval_result["duration"]
    error = eval_result["error"]

    # 从 RAGAS 结果提取每条样本的指标
    # result 对象可通过 result.scores 访问每条样本得分，或转成 pandas DataFrame
    raw_items: List[Dict[str, Any]] = []
    metrics_list = ["context_precision", "context_recall", "faithfulness", "answer_relevancy"]

    if result is not None:
        # RAGAS 0.4.x: result 有 .scores（每样本各指标原始输出）和 .to_dict()
        # 尝试多种方式提取每样本得分
        per_sample_scores: List[Dict[str, Any]] = []
        try:
            # 方式1: result.scores 是 list of dict
            if hasattr(result, "scores") and result.scores:
                per_sample_scores = result.scores
                logger.info(f"通过 result.scores 提取得分，共 {len(per_sample_scores)} 条")
        except Exception as e:
            logger.warning(f"result.scores 提取失败: {e}")

        try:
            # 方式2: 转 DataFrame
            if not per_sample_scores and hasattr(result, "to_pandas"):
                df = result.to_pandas()
                per_sample_scores = df.to_dict("records")
                logger.info(f"通过 to_pandas 提取得分，共 {len(per_sample_scores)} 条")
        except Exception as e:
            logger.warning(f"to_pandas 提取失败: {e}")

        # 逐条组装报告
        for idx, item in enumerate(items):
            scores = per_sample_scores[idx] if idx < len(per_sample_scores) else {}
            raw_item = {
                "id": item.get("id", str(idx)),
                "category": item.get("category", "未分类"),
                "query": item.get("question", ""),
                "canAnswer": item.get("canAnswer", True),
                "context_precision": _safe_num(scores.get("context_precision")),
                "context_recall": _safe_num(scores.get("context_recall")),
                "faithfulness": _safe_num(scores.get("faithfulness")),
                "answer_relevancy": _safe_num(scores.get("answer_relevancy")),
            }
            raw_items.append(raw_item)

    # 总体指标（平均值，排除 None/nan）
    overall_scores = {}
    for m in metrics_list:
        values = [d[m] for d in raw_items if d.get(m) is not None]
        overall_scores[m] = round(sum(values) / len(values), 4) if values else 0.0

    # 综合分数（加权，与自实现一致）
    overall_score = round(
        sum(overall_scores[m] * w for m, w in Config.WEIGHTS.items()), 4
    )

    # 按类别统计
    category_stats: Dict[str, Dict[str, Any]] = {}
    for d in raw_items:
        cat = d.get("category", "未分类")
        if cat not in category_stats:
            category_stats[cat] = {"count": 0, "metrics": {m: [] for m in metrics_list}}
        category_stats[cat]["count"] += 1
        for m in metrics_list:
            if d.get(m) is not None:
                category_stats[cat]["metrics"][m].append(d[m])

    for cat, stats in category_stats.items():
        for m in metrics_list:
            vals = stats["metrics"][m]
            stats["metrics"][m] = round(sum(vals) / len(vals), 4) if vals else 0.0

    # 达标判断
    thresholds = Config.THRESHOLDS
    pass_status = {
        m: "PASS" if overall_scores[m] >= thresholds[m] else "FAIL"
        for m in metrics_list
    }
    pass_status["overall"] = "PASS" if overall_score >= thresholds["overall"] else "FAIL"

    # nan 样本统计
    nan_count = sum(
        1 for d in raw_items
        if any(d.get(m) is None for m in metrics_list)
    )

    report = {
        "version": "V14-RAGAS-Official",
        "framework": f"RAGAS 官方库 (ragas==0.4.3, langchain-openai, 百炼多模型 fallback)",
        "timestamp": datetime.now().isoformat(),
        "evaluation_meta": {
            "duration_seconds": round(duration, 2),
            "llm_active_provider": "dashscope/百炼多模型 fallback",
            "llm_models_chain": Config.BAILIAN_MODELS,
            "llm_base_url": Config.BAILIAN_URL,
            "embedding_model": f"{Config.BGE3_MODEL} (bge-m3 本地服务)",
            "total_items": len(items),
            "nan_items_count": nan_count,
            "metrics_used": metrics_list,
            "weights": Config.WEIGHTS,
            "thresholds": thresholds,
            "error": error,
        },
        "overall_scores": overall_scores,
        "overall_score": overall_score,
        "weights": Config.WEIGHTS,
        "thresholds": thresholds,
        "pass_status": pass_status,
        "category_stats": category_stats,
        "raw_items": raw_items,
    }
    return report


def save_report(report: Dict[str, Any], output_path: str) -> None:
    """保存评估报告"""
    out_dir = Path(output_path).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    logger.info(f"评估报告已保存: {output_path}")


def print_summary(report: Dict[str, Any]) -> None:
    """打印评估摘要（格式与自实现一致，便于对比）"""
    print("\n" + "=" * 72)
    print("      V14 RAGAS 官方库评估结果摘要（ragas==0.4.3）")
    print("=" * 72)

    overall = report.get("overall_scores", {})
    pass_status = report.get("pass_status", {})
    thresholds = report.get("thresholds", {})

    print(f"\n【总体指标】")
    labels = {
        "context_precision": "Context Precision  (上下文精度)",
        "context_recall": "Context Recall     (上下文召回)",
        "faithfulness": "Faithfulness       (忠实度)   ",
        "answer_relevancy": "Answer Relevancy   (答案相关性)",
    }
    for m in ["context_precision", "context_recall", "faithfulness", "answer_relevancy"]:
        score = overall.get(m, 0)
        thr = thresholds.get(m, 0)
        ps = pass_status.get(m, "?")
        print(f"  {labels[m]}: {score:.4f}  (优秀线 {thr})  [{ps}]")

    print(f"\n  综合分数 (Overall Score)       : {report.get('overall_score', 0):.4f}  "
          f"(优秀线 {thresholds.get('overall', 0)})  [{pass_status.get('overall', '?')}]")

    meta = report.get("evaluation_meta", {})
    nan_count = meta.get("nan_items_count", 0)
    if nan_count > 0:
        print(f"\n  ⚠️ {nan_count} 条样本存在指标 nan（多为 AR 指标 embeddings 输入格式问题）")

    print(f"\n【权重分配】")
    weights = report.get("weights", {})
    print(f"  召回阶段 (40%): Context Precision {weights.get('context_precision',0)*100:.0f}% + "
          f"Context Recall {weights.get('context_recall',0)*100:.0f}%")
    print(f"  生成阶段 (60%): Faithfulness {weights.get('faithfulness',0)*100:.0f}% + "
          f"Answer Relevancy {weights.get('answer_relevancy',0)*100:.0f}%")

    category_stats = report.get("category_stats", {})
    if category_stats:
        print(f"\n【按类别统计】")
        print(f"  {'类别':<20} {'数量':>4} {'CP':>8} {'CR':>8} {'F':>8} {'AR':>8}")
        print(f"  {'-'*20} {'-'*4} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
        for cat, stats in sorted(category_stats.items()):
            m = stats["metrics"]
            print(
                f"  {cat:<20} {stats.get('count',0):>4} "
                f"{m.get('context_precision',0):>8.4f} "
                f"{m.get('context_recall',0):>8.4f} "
                f"{m.get('faithfulness',0):>8.4f} "
                f"{m.get('answer_relevancy',0):>8.4f}"
            )

    print(f"\n【评估元信息】")
    print(f"  评估框架: {report.get('framework','')}")
    print(f"  LLM 实际使用: {meta.get('llm_active_provider','N/A')}")
    print(f"  Embeddings: {meta.get('embedding_model','N/A')}")
    print(f"  评估条目数: {meta.get('total_items','N/A')}")
    print(f"  评估耗时: {meta.get('duration_seconds',0):.2f} 秒")
    print(f"  运行日志: {_LOG_FILE}")
    print(f"  错误日志: {_ERR_FILE}")
    print("\n" + "=" * 72)


# ============================================================================
# 主流程
# ============================================================================
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RAGAS 官方库评估脚本（V14 对比用）")
    parser.add_argument("--input", default=Config.DEFAULT_INPUT, help="输入数据文件路径")
    parser.add_argument("--output", default=None, help="输出报告文件路径")
    parser.add_argument("--limit", type=int, default=None, help="限制评估条目数")
    return parser.parse_args()


def main() -> None:
    logger.info("=== RAGAS 官方库评估脚本启动（V14 对比）===")
    args = parse_args()

    if not os.path.exists(args.input):
        logger.error(f"输入文件不存在: {args.input}")
        logger.error("请先运行: npx tsx scripts/collect-rag-data.ts")
        sys.exit(1)

    items = load_eval_data(args.input, args.limit)
    if not items:
        logger.error("无评估数据，退出")
        sys.exit(1)

    samples = to_ragas_samples(items)
    logger.info(f"转换完成，{len(samples)} 条 RAGAS 样本")

    llm_wrapper, emb_wrapper, _ = build_llm_and_embeddings()

    eval_result = run_evaluation(samples, llm_wrapper, emb_wrapper)

    # 输出路径
    if args.output:
        output_path = args.output
    else:
        output_path = os.path.join(
            Config.DEFAULT_OUTPUT_DIR, "ragas-report-v14-official.json"
        )

    report = build_report(eval_result, items, output_path)
    save_report(report, output_path)
    print_summary(report)
    logger.info(f"=== 评估完成，报告路径: {output_path} ===")


if __name__ == "__main__":
    main()
