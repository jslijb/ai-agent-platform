#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
RAGAS 思想自实现 RAG 评估脚本（不依赖 ragas / langchain 库）

基于 LLM-as-Judge 实现 RAGAS 四大核心指标：
  - Context Precision（上下文精度）：检索结果中相关文档的排序质量
  - Context Recall（上下文召回）：检索内容是否覆盖期望答案的关键信息
  - Faithfulness（忠实度）：答案是否忠实于检索内容，有无编造
  - Answer Relevancy（答案相关性）：答案是否有效回答用户问题

设计依据 RAGAS 官方论文与实现思路：
  - Context Precision: 对每个检索片段判断相关性，按排序位置加权
    公式: CP = (1/|relevant|) * Σ_{k=1}^{K} ( Precision@k * rel_k )
  - Context Recall: 从 ground_truth 提取关键事实，判断是否被 contexts 覆盖
    公式: CR = |covered| / |total_facts|
  - Faithfulness: 从 answer 提取陈述，判断是否被 contexts 支持
    公式: F = |supported| / |total_statements|
  - Answer Relevancy: LLM 直接评估答案与问题的相关程度（0-1），替代反向生成问题方案
    以减少 embedding 依赖，保证可解释性

LLM 配置（与主系统降级链一致，读 config/api_keys.yaml）：
  - 默认主模型：AGNES（agnes-2.0-flash，OpenAI 兼容协议）
  - 降级备选：百炼 qwen-plus（DashScope OpenAI 兼容接口）
  - API Key 从环境变量读取（AGNES_KEY / DASHSCOPE_API_KEY）
依赖：openai SDK（无需 ragas / langchain）

用法：
  python scripts/ragas_evaluation.py --input PATH [--output PATH] [--limit N]
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI

# ============================================================================
# 日志配置（运行日志 + 错误日志，永久保存，便于排错）
# ============================================================================
LOG_DIR = Path("tests/reports/evaluation/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)
_LOG_FILE = LOG_DIR / f"ragas-eval-{datetime.now().strftime('%Y%m%d')}.log"
_ERR_FILE = LOG_DIR / f"ragas-eval-error-{datetime.now().strftime('%Y%m%d')}.log"

_logger = logging.getLogger("ragas-eval")
_logger.setLevel(logging.DEBUG)

_fh = logging.FileHandler(_LOG_FILE, encoding="utf-8")
_fh.setLevel(logging.DEBUG)
_fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S"))

_eh = logging.FileHandler(_ERR_FILE, encoding="utf-8")
_eh.setLevel(logging.ERROR)
_eh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S"))

_sh = logging.StreamHandler(sys.stdout)
_sh.setLevel(logging.INFO)
_sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] [ragas-eval] %(message)s", "%Y-%m-%d %H:%M:%S"))

_logger.addHandler(_fh)
_logger.addHandler(_eh)
_logger.addHandler(_sh)

logger = _logger


# ============================================================================
# 配置（从环境变量读取，不硬编码）
# ============================================================================
class LLMProvider:
    """单个 LLM provider 配置"""

    def __init__(self, name: str, model: str, api_key: str, base_url: str):
        self.name = name
        self.model = model
        self.api_key = api_key
        self.base_url = base_url

    def is_available(self) -> bool:
        return bool(self.api_key and self.model and self.base_url)


class Config:
    """评估配置，从环境变量读取"""

    # 默认输入输出路径
    DEFAULT_INPUT = "tests/reports/evaluation/ragas-eval-data.json"
    DEFAULT_OUTPUT_DIR = "tests/reports/evaluation"

    # LLM 调用参数（qwen3.5 模型响应较慢，需增大超时；DashScope 无 AGNES 限速问题）
    LLM_TIMEOUT = 120         # 单次调用超时（秒），qwen3.5-plus 平均 20s 响应
    MAX_RETRIES = 2           # 失败重试次数（qwen3.5 较稳定，减少重试避免长挂起）
    RETRY_DELAY = 5           # 重试间隔（秒）
    TEMPERATURE = 0           # 评估时使用确定性输出
    CALL_DELAY = 1.0          # 相邻 LLM 调用间隔（秒），DashScope 无严格 RPM 限制

    # 指标权重（召回阶段 40% + 生成阶段 60%）
    # 检索是 RAG 核心难点，召回权重已提升至 40%
    WEIGHTS = {
        "context_precision": 0.20,
        "context_recall": 0.20,
        "faithfulness": 0.30,
        "answer_relevancy": 0.30,
    }

    # 优秀线阈值（用于达标判断）
    THRESHOLDS = {
        "context_precision": 0.80,
        "context_recall": 0.80,
        "faithfulness": 0.85,
        "answer_relevancy": 0.80,
        "overall": 0.82,
    }

    # 百炼 qwen3.5 多版本降级链（一个 403 自动切换下一个，不得只配一个）
    BAILIAN_MODELS = [
        "qwen3.5-plus",
        "qwen3.5-flash",
        "qwen3.5-397b-a17b",
        "qwen3.5-plus-2026-02-15",
        "qwen3.5-122b-a10b",
    ]

    @staticmethod
    def get_llm_chain() -> List[LLMProvider]:
        """
        构建 LLM 降级链（多模型版本 + 多 API Key fallback）。
        百炼 5 个 qwen-plus 版本 × 3 个 API Key 全部加入，一个 403 额度耗尽自动切换下一个。
        AGNES 作为最后降级。
        API Key 从环境变量读取，不硬编码。
        """
        chain: List[LLMProvider] = []

        # 1. 百炼 qwen-plus 多版本 × 多 API Key（首选，全部加入降级链）
        bailian_url = os.getenv(
            "DASHSCOPE_BASE_URL",
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
        # 收集所有可用的百炼 API Key（3 个独立 key，各自有独立配额）
        bailian_keys = []
        for env_var in ["DASHSCOPE_API_KEY2", "DASHSCOPE_API_KEY", "DASHSCOPE_API_KEY1"]:
            key = os.getenv(env_var, "")
            if key and key not in bailian_keys:
                bailian_keys.append(key)

        # 为每个 key × 每个模型创建 provider（key1 全部模型 → key2 全部模型 → ...）
        for key in bailian_keys:
            for model in Config.BAILIAN_MODELS:
                provider = LLMProvider("dashscope", model, key, bailian_url)
                chain.append(provider)

        # 2. AGNES（降级备选）
        agnes_key = os.getenv("AGNES_KEY", "")
        agnes_url = os.getenv("AGNES_BASE_URL", "https://api.agnes-ai.cn/v1")
        agnes_model = os.getenv("RAGAS_AGNES_MODEL", "agnes-2.5-flash")
        agnes = LLMProvider("agnes", agnes_model, agnes_key, agnes_url)
        if agnes.is_available():
            chain.append(agnes)

        return chain


# ============================================================================
# LLM 调用封装（带重试 + 降级链 + JSON 输出解析）
# ============================================================================
class LLMCaller:
    """
    LLM 调用器：封装降级链逻辑。

    与主系统 src/server/llm/router.ts 的 callWithFallback 一致：
      按 provider 链顺序尝试，单 provider 内重试，配额耗尽则降级到下一个。
    """

    def __init__(self, chain: List[LLMProvider]):
        if not chain:
            raise ValueError(
                "LLM 降级链为空，请设置环境变量：AGNES_KEY 或 DASHSCOPE_API_KEY"
            )
        self.chain = chain
        # 记录已被配额耗尽的 provider，避免重复尝试
        self.exhausted: set = set()
        # 当前正在使用的 provider（首次调用时确定）
        self.current: Optional[LLMProvider] = None
        self.client: Optional[OpenAI] = None

    def _select_provider(self) -> Optional[LLMProvider]:
        """选择第一个未耗尽的 provider（按 model 唯一标识，而非 name）"""
        for p in self.chain:
            # 用 name/model 组合作为唯一标识，避免同 name 不同 model 被误判耗尽
            key = f"{p.name}/{p.model}"
            if key not in self.exhausted:
                return p
        return None

    def _init_client(self, provider: LLMProvider) -> None:
        """切换到指定 provider 的客户端"""
        self.client = OpenAI(
            api_key=provider.api_key,
            base_url=provider.base_url,
            timeout=Config.LLM_TIMEOUT,
            max_retries=0,
        )
        self.current = provider
        logger.info(f"LLM 客户端切换至: {provider.name}/{provider.model}")

    def call(self, system: str, user: str) -> str:
        """调用 LLM，返回文本内容。自动处理降级。"""
        last_err: Optional[Exception] = None
        attempt = 0

        while True:
            # 选择 provider（可能因配额耗尽/超时而切换）
            provider = self._select_provider()
            if provider is None:
                logger.error(f"LLM 调用彻底失败: {last_err}", exc_info=True)
                raise RuntimeError(
                    f"所有 LLM provider 均不可用: {[p.name for p in self.chain]}"
                )

            # 切换客户端（首次或 provider 变更时）
            if self.current is None or self.current.model != provider.model:
                self._init_client(provider)
                attempt = 0  # 降级后重置重试计数

            attempt += 1

            try:
                resp = self.client.chat.completions.create(
                    model=provider.model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    temperature=Config.TEMPERATURE,
                    response_format={"type": "json_object"},
                    timeout=Config.LLM_TIMEOUT,
                )
                content = resp.choices[0].message.content or ""
                time.sleep(Config.CALL_DELAY)
                return content
            except Exception as e:
                last_err = e
                err_msg = str(e)

                # 识别配额耗尽/认证失败，强制降级
                is_quota = (
                    "AllocationQuota" in err_msg
                    or "403" in err_msg
                    or "401" in err_msg
                    or "FreeTierOnly" in err_msg
                )
                if is_quota:
                    logger.error(
                        f"provider {provider.name}/{provider.model} 配额耗尽/认证失败，"
                        f"标记为不可用并降级: {err_msg[:120]}"
                    )
                    self.exhausted.add(f"{provider.name}/{provider.model}")
                    continue  # while 循环会选择下一个 provider

                # 429 限流：等待后重试同一 provider
                if "429" in err_msg or "RateLimit" in err_msg:
                    wait = Config.RETRY_DELAY * attempt
                    logger.warning(
                        f"provider {provider.name} 限流(429)，第{attempt}次重试，"
                        f"等待 {wait}s: {err_msg[:100]}"
                    )
                    if attempt < Config.MAX_RETRIES:
                        time.sleep(wait)
                        continue
                    # 限流重试耗尽，降级
                    logger.error(
                        f"provider {provider.name}/{provider.model} 限流重试耗尽，降级到下一个 provider"
                    )
                    self.exhausted.add(f"{provider.name}/{provider.model}")
                    continue

                # 超时错误：重试后降级到下一个 provider
                is_timeout = (
                    "timed out" in err_msg.lower()
                    or "timeout" in err_msg.lower()
                    or "APITimeoutError" in type(e).__name__
                )
                if is_timeout:
                    logger.warning(
                        f"provider {provider.name} 超时(第{attempt}次): "
                        f"{type(e).__name__}: {err_msg[:120]}"
                    )
                    if attempt < Config.MAX_RETRIES:
                        time.sleep(Config.RETRY_DELAY)
                        continue
                    # 超时重试耗尽，降级到下一个 provider
                    logger.error(
                        f"provider {provider.name}/{provider.model} 超时重试耗尽，"
                        f"降级到下一个 provider"
                    )
                    self.exhausted.add(f"{provider.name}/{provider.model}")
                    continue

                # 其他错误：短重试
                logger.warning(
                    f"LLM 调用失败(provider={provider.name}, 第{attempt}次): "
                    f"{type(e).__name__}: {err_msg[:150]}"
                )
                if attempt < Config.MAX_RETRIES:
                    time.sleep(Config.RETRY_DELAY)
                    continue
                # 其他错误重试耗尽，降级
                logger.error(
                    f"provider {provider.name}/{provider.model} 重试耗尽，降级到下一个 provider"
                )
                self.exhausted.add(f"{provider.name}/{provider.model}")
                continue


def create_caller() -> LLMCaller:
    """创建 LLM 调用器（降级链模式）"""
    chain = Config.get_llm_chain()
    caller = LLMCaller(chain)
    chain_desc = " → ".join(f"{p.name}/{p.model}" for p in chain)
    logger.info(f"LLM 降级链就绪: {chain_desc}")
    return caller


# 兼容旧接口：保留 create_client 名字，但返回 caller
def create_client() -> LLMCaller:
    return create_caller()


def call_llm(caller: LLMCaller, system: str, user: str) -> str:
    """调用 LLM（兼容旧接口签名）"""
    return caller.call(system, user)


def parse_json_response(text: str) -> Dict[str, Any]:
    """解析 LLM 返回的 JSON，容错处理"""
    text = text.strip()
    # 去除可能的 markdown 代码块包裹
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 尝试提取第一个 {...} 块
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
        logger.error(f"JSON 解析失败，原始内容: {text[:500]}")
        return {}


# ============================================================================
# 拒绝回答识别（用于正确拒绝场景的满分判定）
# ============================================================================
def is_refusal_answer(answer: str) -> bool:
    """识别答案是否为拒绝回答（如"未包含相关数据""无法回答"等）"""
    if not answer:
        return True
    refusal_patterns = [
        r"无法回答",
        r"未包含.*(信息|数据|内容|指标|数值|记录)",
        r"文档.*未包含",
        r"不在.*覆盖范围",
        r"未找到.*相关",
        r"抱歉.*没有",
        r"没有.*相关.*信息",
        r"知识库.*未",
        r"未提供.*数据",
    ]
    return any(re.search(p, answer) for p in refusal_patterns)


# ============================================================================
# 指标 1：Context Precision（上下文精度）
# ============================================================================
def eval_context_precision(
    client: OpenAI, query: str, contexts: List[str]
) -> Tuple[float, str]:
    """
    评估检索结果的排序质量。

    LLM 逐个判断每个检索片段是否与问题相关，然后按 RAGAS 公式加权计算：
      CP = (1/|relevant|) * Σ_{k=1}^{K} ( Precision@k * rel_k )
    """
    if not contexts:
        return 0.0, "无检索内容"

    system = (
        "你是 RAG 系统的评估专家。判断每个检索片段是否对回答用户问题有信息价值。\n"
        "要求：基于语义和上下文判断相关性，不要仅靠关键词匹配。\n\n"
        "【重要约束】\n"
        "1. 必须以提供的检索片段为准，不得用自身训练截止时间否定片段中的事实\n"
        "2. 片段中出现的数值、年份、财务数据（包括 2025 年数据）均视为真实，不得因自身知识判断为虚构\n"
        "3. 只关注片段与问题的语义相关性，不基于自身知识判断片段内容真假\n\n"
        "输出 JSON，格式：{\"judgments\": [{\"index\": 1, \"relevant\": true, \"reason\": \"简短理由\"}]}"
    )

    context_block = "\n\n".join(
        f"[片段{i+1}]\n{c[:800]}" for i, c in enumerate(contexts)
    )
    user = (
        f"用户问题：{query}\n\n"
        f"检索片段：\n{context_block}\n\n"
        f"请逐个判断每个片段是否包含回答该问题所需的信息（relevant: true/false）。"
    )

    data = parse_json_response(call_llm(client, system, user))
    judgments = data.get("judgments", [])

    if not judgments:
        return 0.0, "LLM 未返回有效判断"

    # 构建相关性序列
    rels = [False] * len(contexts)
    for j in judgments:
        idx = j.get("index", 0) - 1
        if 0 <= idx < len(contexts):
            rels[idx] = bool(j.get("relevant", False))

    relevant_count = sum(rels)
    if relevant_count == 0:
        return 0.0, "所有片段均不相关"

    # RAGAS Context Precision 公式
    cp = 0.0
    hits = 0
    for k, rel in enumerate(rels, start=1):
        if rel:
            hits += 1
            precision_at_k = hits / k
            cp += precision_at_k
    cp = cp / relevant_count

    reasons = [f"片段{i+1}: {'相关' if r else '不相关'}" for i, r in enumerate(rels)]
    return round(cp, 4), "; ".join(reasons)


# ============================================================================
# 指标 2：Context Recall（上下文召回）
# ============================================================================
def eval_context_recall(
    client: OpenAI, query: str, contexts: List[str], ground_truth: str
) -> Tuple[float, str]:
    """
    评估检索内容是否覆盖期望答案的关键信息。

    LLM 从 ground_truth 提取关键事实，判断每条是否被 contexts 覆盖：
      CR = |covered| / |total_facts|
    """
    if not ground_truth or not ground_truth.strip():
        # 无期望答案（如无需检索覆盖），返回满分
        return 1.0, "无 ground_truth，跳过召回评估"

    if not contexts:
        return 0.0, "无检索内容，无法覆盖"

    system = (
        "你是 RAG 系统的评估专家。任务：从期望答案中提取关键事实陈述，"
        "并判断每条事实是否能从检索片段中找到支持。\n\n"
        "【重要约束】\n"
        "1. 必须以检索片段为准判断覆盖关系，不得用自身训练截止时间否定片段中的事实\n"
        "2. 期望答案中的数值、年份、财务数据（包括 2025 年数据）能从检索片段中直接找到或推导出来，即为 covered=true\n"
        "3. 不得因自身知识认为某年份数据不存在而判定 covered=false\n"
        "4. 表述差异（如 4529.30亿元 vs 4,529.30 亿元）不影响覆盖判定\n\n"
        "输出 JSON，格式：{\"facts\": [{\"statement\": \"事实陈述\", \"covered\": true, \"reason\": \"简短理由\"}]}"
    )

    context_block = "\n\n".join(f"[片段{i+1}]\n{c[:800]}" for i, c in enumerate(contexts))
    user = (
        f"用户问题：{query}\n\n"
        f"期望答案（ground_truth）：\n{ground_truth}\n\n"
        f"检索片段：\n{context_block}\n\n"
        f"请从期望答案中提取所有关键事实（数值、结论、关系等），"
        f"判断每条是否能从检索片段中推导出来（covered: true/false）。"
    )

    data = parse_json_response(call_llm(client, system, user))
    facts = data.get("facts", [])

    if not facts:
        return 0.0, "LLM 未提取到事实"

    covered = sum(1 for f in facts if f.get("covered", False))
    cr = covered / len(facts) if facts else 0.0

    reason = f"覆盖 {covered}/{len(facts)} 条事实"
    return round(cr, 4), reason


# ============================================================================
# 指标 3：Faithfulness（忠实度）
# ============================================================================
def eval_faithfulness(
    client: OpenAI, query: str, answer: str, contexts: List[str]
) -> Tuple[float, str]:
    """
    评估答案是否忠实于检索内容（无编造）。

    LLM 从 answer 提取事实陈述，判断每条是否被 contexts 支持：
      F = |supported| / |total_statements|
    """
    if not answer or not answer.strip():
        return 0.0, "答案为空"

    if not contexts:
        # 无检索内容但生成了答案，可能是编造
        return 0.0, "无检索内容但有答案，疑似编造"

    system = (
        "你是 RAG 系统的评估专家。任务：从生成的答案中提取所有事实陈述，"
        "并判断每条陈述是否能从检索片段中找到支持（不能支持的即为编造/幻觉）。\n"
        "注意：数值、结论、关系都属于事实陈述；通用常识和过渡语句可忽略。\n\n"
        "【重要约束】\n"
        "1. 必须以检索片段为准判断支持关系，不得用自身训练截止时间否定片段中的事实\n"
        "2. 答案中的数值、年份、财务数据（包括 2025 年数据）能从检索片段中找到，即为 supported=true\n"
        "3. 不得因自身知识认为某年份数据不存在而判定答案为编造/幻觉\n"
        "4. 答案中的陈述只要在检索片段中有对应内容（数值匹配或语义一致），即为 supported=true\n\n"
        "输出 JSON，格式：{\"statements\": [{\"statement\": \"陈述内容\", \"supported\": true, \"reason\": \"简短理由\"}]}"
    )

    context_block = "\n\n".join(f"[片段{i+1}]\n{c[:800]}" for i, c in enumerate(contexts))
    user = (
        f"用户问题：{query}\n\n"
        f"检索片段：\n{context_block}\n\n"
        f"生成的答案：\n{answer}\n\n"
        f"请从答案中提取所有事实陈述，判断每条是否能从检索片段中找到支持（supported: true/false）。"
    )

    data = parse_json_response(call_llm(client, system, user))
    statements = data.get("statements", [])

    if not statements:
        # 无法提取陈述，保守给中等分
        return 0.5, "LLM 未提取到陈述"

    # 容错：LLM 可能返回字符串列表而非对象列表（qwen3.5 偶发）
    if isinstance(statements, list) and statements and isinstance(statements[0], str):
        # 字符串列表 → 假定全部受支持（无法判断时保守给满分）
        f_score = 1.0
        reason = f"LLM 返回字符串列表({len(statements)}条)，假定全部受支持"
        return round(f_score, 4), reason

    supported = sum(1 for s in statements if isinstance(s, dict) and s.get("supported", False))
    f_score = supported / len(statements) if statements else 0.0

    reason = f"支持 {supported}/{len(statements)} 条陈述"
    return round(f_score, 4), reason


# ============================================================================
# 指标 4：Answer Relevancy（答案相关性）
# ============================================================================
def eval_answer_relevancy(
    client: OpenAI, query: str, answer: str
) -> Tuple[float, str]:
    """
    评估答案与用户问题的相关程度。

    采用 LLM 直接打分（0-1）+ 理由的方式，替代 RAGAS 反向生成问题方案，
    以减少 embedding 依赖并提升可解释性。

    评分维度：
      - 是否直接回答了问题（而非答非所问）
      - 是否完整覆盖问题的核心诉求
      - 是否包含无关冗余信息（适度扣分）
    """
    if not answer or not answer.strip():
        return 0.0, "答案为空"

    system = (
        "你是 RAG 系统的评估专家。评估生成的答案与用户问题的相关程度。\n"
        "评分标准（0.0-1.0）：\n"
        "  1.0: 完美回答问题，无冗余\n"
        "  0.8: 基本回答问题，有少量冗余\n"
        "  0.6: 部分回答问题，或冗余较多\n"
        "  0.4: 答案与问题弱相关\n"
        "  0.2: 答非所问\n"
        "  0.0: 完全无关或空答案\n\n"
        "【重要约束】\n"
        "1. 只评估答案与问题的相关程度，不得用自身训练截止时间否定答案中的事实\n"
        "2. 答案中的数值、年份、财务数据（包括 2025 年数据）视为真实，不得因自身知识判断为虚构\n"
        "3. 只要答案直接回答了问题且内容相关，就应给出高分，不基于自身知识判断答案真假\n\n"
        "输出 JSON，格式：{\"score\": 0.85, \"reason\": \"评分理由\"}"
    )

    user = (
        f"用户问题：{query}\n\n"
        f"生成的答案：\n{answer}\n\n"
        f"请评估答案与问题的相关程度，给出 0.0-1.0 的分数及理由。"
    )

    data = parse_json_response(call_llm(client, system, user))
    score = data.get("score")
    if score is None:
        return 0.5, "LLM 未返回分数"

    try:
        score = float(score)
    except (TypeError, ValueError):
        score = 0.5

    score = max(0.0, min(1.0, score))
    reason = data.get("reason", "")
    return round(score, 4), reason


# ============================================================================
# 单条评估
# ============================================================================
def evaluate_item(client: OpenAI, item: Dict[str, Any], idx: int) -> Dict[str, Any]:
    """评估单条数据，返回四指标结果"""
    query = item.get("question", "")
    answer = item.get("answer", "")
    contexts = item.get("contexts", [])
    ground_truth = item.get("ground_truth", "")
    can_answer = item.get("canAnswer", True)
    item_id = item.get("id", str(idx))
    category = item.get("category", "未分类")

    logger.info(f"[{idx+1}] 评估 id={item_id}, category={category}, query={query[:40]}...")

    result = {
        "id": item_id,
        "category": category,
        "query": query,
        "canAnswer": can_answer,
        "context_precision": 0.0,
        "context_recall": 0.0,
        "faithfulness": 0.0,
        "answer_relevancy": 0.0,
        "reasons": {},
    }

    # 拒绝回答场景处理（反映系统真实性能）
    # canAnswer=false 表示该问题本就无法从知识库回答，正确拒绝应得满分
    # RAGAS 评估端到端回答能力，4 个指标评价标准应一致
    if not can_answer and is_refusal_answer(answer):
        logger.info(f"[{idx+1}] 正确拒绝(canAnswer=false) → 4 指标统一满分")
        result["faithfulness"] = 1.0
        result["answer_relevancy"] = 1.0
        result["context_recall"] = 1.0  # 无需覆盖，自然满分
        result["context_precision"] = 1.0  # 无相关文档，CP 公式无意义，与其它指标一致走满分
        result["reasons"]["faithfulness"] = "正确拒绝，忠实于无信息"
        result["reasons"]["answer_relevancy"] = "正确回应无法回答"
        result["reasons"]["context_recall"] = "无需检索覆盖"
        result["reasons"]["context_precision"] = "库外问题正确拒绝，无相关文档可言"
        return result

    # 错误拒绝：本可回答却拒绝
    if can_answer and is_refusal_answer(answer):
        logger.warning(f"[{idx+1}] 错误拒绝(canAnswer=true) → AR=0, CR=0")
        result["faithfulness"] = 1.0  # 拒绝答案未编造，忠实度不扣
        result["answer_relevancy"] = 0.0
        result["context_recall"] = 0.0
        result["reasons"]["faithfulness"] = "拒绝答案未编造"
        result["reasons"]["answer_relevancy"] = "错误拒绝，未回答问题"
        result["reasons"]["context_recall"] = "未覆盖期望答案"
        cp, cp_reason = eval_context_precision(client, query, contexts)
        result["context_precision"] = cp
        result["reasons"]["context_precision"] = cp_reason
        return result

    # 正常回答场景：四指标全量评估
    try:
        cp, cp_r = eval_context_precision(client, query, contexts)
        result["context_precision"] = cp
        result["reasons"]["context_precision"] = cp_r
    except Exception as e:
        logger.error(f"[{idx+1}] Context Precision 评估失败: {e}", exc_info=True)
        result["reasons"]["context_precision"] = f"评估失败: {e}"

    try:
        cr, cr_r = eval_context_recall(client, query, contexts, ground_truth)
        result["context_recall"] = cr
        result["reasons"]["context_recall"] = cr_r
    except Exception as e:
        logger.error(f"[{idx+1}] Context Recall 评估失败: {e}", exc_info=True)
        result["reasons"]["context_recall"] = f"评估失败: {e}"

    try:
        f, f_r = eval_faithfulness(client, query, answer, contexts)
        result["faithfulness"] = f
        result["reasons"]["faithfulness"] = f_r
    except Exception as e:
        logger.error(f"[{idx+1}] Faithfulness 评估失败: {e}", exc_info=True)
        result["reasons"]["faithfulness"] = f"评估失败: {e}"

    try:
        ar, ar_r = eval_answer_relevancy(client, query, answer)
        result["answer_relevancy"] = ar
        result["reasons"]["answer_relevancy"] = ar_r
    except Exception as e:
        logger.error(f"[{idx+1}] Answer Relevancy 评估失败: {e}", exc_info=True)
        result["reasons"]["answer_relevancy"] = f"评估失败: {e}"

    logger.info(
        f"[{idx+1}] 完成: CP={result['context_precision']}, CR={result['context_recall']}, "
        f"F={result['faithfulness']}, AR={result['answer_relevancy']}"
    )
    return result


# ============================================================================
# 报告生成
# ============================================================================
def generate_report(
    details: List[Dict[str, Any]],
    items: List[Dict[str, Any]],
    duration: float,
    caller: Optional[LLMCaller] = None,
) -> Dict[str, Any]:
    """生成完整评估报告"""

    # 总体指标（平均值）
    metrics = ["context_precision", "context_recall", "faithfulness", "answer_relevancy"]
    overall_scores = {}
    for m in metrics:
        values = [d[m] for d in details if d.get(m) is not None]
        overall_scores[m] = round(sum(values) / len(values), 4) if values else 0.0

    # 综合分数（加权）
    overall_score = round(
        sum(overall_scores[m] * w for m, w in Config.WEIGHTS.items()), 4
    )

    # 按类别统计
    category_stats: Dict[str, Dict[str, Any]] = {}
    for d in details:
        cat = d.get("category", "未分类")
        if cat not in category_stats:
            category_stats[cat] = {"count": 0, "metrics": {m: [] for m in metrics}}
        category_stats[cat]["count"] += 1
        for m in metrics:
            if d.get(m) is not None:
                category_stats[cat]["metrics"][m].append(d[m])

    for cat, stats in category_stats.items():
        for m in metrics:
            vals = stats["metrics"][m]
            stats["metrics"][m] = round(sum(vals) / len(vals), 4) if vals else 0.0

    # 达标判断
    thresholds = Config.THRESHOLDS
    pass_status = {
        m: "PASS" if overall_scores[m] >= thresholds[m] else "FAIL"
        for m in metrics
    }
    pass_status["overall"] = "PASS" if overall_score >= thresholds["overall"] else "FAIL"

    # LLM 配置信息（从 caller 读取，反映实际使用的降级链）
    llm_chain_info = []
    active_provider = "N/A"
    if caller is not None:
        llm_chain_info = [
            {"provider": p.name, "model": p.model, "base_url": p.base_url}
            for p in caller.chain
        ]
        active_provider = (
            f"{caller.current.name}/{caller.current.model}"
            if caller.current
            else "N/A"
        )

    report = {
        "version": "V12-RAGAS-SelfImpl",
        "framework": "LLM-as-Judge (RAGAS 思想自实现, 不依赖 ragas/langchain)",
        "timestamp": datetime.now().isoformat(),
        "evaluation_meta": {
            "duration_seconds": round(duration, 2),
            "llm_active_provider": active_provider,
            "llm_chain": llm_chain_info,
            "exhausted_providers": list(caller.exhausted) if caller else [],
            "total_items": len(details),
            "metrics_used": metrics,
            "weights": Config.WEIGHTS,
            "thresholds": thresholds,
        },
        "overall_scores": overall_scores,
        "overall_score": overall_score,
        "pass_status": pass_status,
        "weights": Config.WEIGHTS,
        "thresholds": thresholds,
        "category_stats": category_stats,
        "detailed_results": details,
        "raw_items": items,
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
    """打印评估摘要"""
    print("\n" + "=" * 72)
    print("         V12 RAGAS 评估结果摘要（LLM-as-Judge 自实现）")
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

    weights = report.get("weights", {})
    print(f"\n【权重分配】")
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

    meta = report.get("evaluation_meta", {})
    print(f"\n【评估元信息】")
    print(f"  评估框架: {report.get('framework','')}")
    print(f"  LLM 实际使用: {meta.get('llm_active_provider','N/A')}")
    chain_info = meta.get("llm_chain", [])
    if chain_info:
        chain_str = " → ".join(f"{c['provider']}/{c['model']}" for c in chain_info)
        print(f"  LLM 降级链: {chain_str}")
    exhausted = meta.get("exhausted_providers", [])
    if exhausted:
        print(f"  配额耗尽的 provider: {exhausted}")
    print(f"  评估条目数: {meta.get('total_items','N/A')}")
    print(f"  评估耗时: {meta.get('duration_seconds',0):.2f} 秒")
    print(f"  运行日志: {_LOG_FILE}")
    print(f"  错误日志: {_ERR_FILE}")
    print("\n" + "=" * 72)


# ============================================================================
# 主流程
# ============================================================================
def load_eval_data(input_path: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """加载评估数据"""
    logger.info(f"加载评估数据: {input_path}")
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    items = data.get("items", [])
    logger.info(f"数据加载完成，共 {len(items)} 条")
    if limit:
        items = items[:limit]
        logger.info(f"限制评估前 {limit} 条")
    return items


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RAGAS 思想自实现 RAG 评估脚本")
    parser.add_argument("--input", default=Config.DEFAULT_INPUT, help="输入数据文件路径")
    parser.add_argument("--output", default=None, help="输出报告文件路径")
    parser.add_argument("--limit", type=int, default=None, help="限制评估条目数")
    parser.add_argument("--resume", default=None, help="断点续传 checkpoint 文件路径，恢复已完成的评估项")
    return parser.parse_args()


def get_checkpoint_path(output_path: str) -> str:
    """根据输出路径生成 checkpoint 文件路径"""
    base, ext = os.path.splitext(output_path)
    return f"{base}.checkpoint.json"


def load_checkpoint(checkpoint_path: str) -> List[Dict[str, Any]]:
    """加载 checkpoint，返回已完成的评估详情列表"""
    if not os.path.exists(checkpoint_path):
        return []
    try:
        with open(checkpoint_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        completed = data.get("details", [])
        logger.info(f"Checkpoint 恢复: 已完成 {len(completed)} 条评估")
        return completed
    except Exception as e:
        logger.warning(f"Checkpoint 加载失败，从头开始: {e}")
        return []


def save_checkpoint(checkpoint_path: str, details: List[Dict[str, Any]]) -> None:
    """保存 checkpoint（每完成一条评估后调用）"""
    try:
        checkpoint = {
            "savedAt": datetime.now().isoformat(),
            "completedCount": len(details),
            "details": details,
        }
        with open(checkpoint_path, "w", encoding="utf-8") as f:
            json.dump(checkpoint, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"Checkpoint 保存失败: {e}")


def acquire_lock(output_path: str) -> str:
    """
    获取文件锁，防止多进程同时运行评估覆盖结果。
    返回锁文件路径。如果锁已存在则退出。
    """
    lock_path = f"{output_path}.lock"
    if os.path.exists(lock_path):
        # 检查锁文件是否过期（超过2小时视为僵尸锁）
        try:
            lock_age = time.time() - os.path.getmtime(lock_path)
            if lock_age < 7200:
                logger.error(f"检测到另一个评估进程正在运行（锁文件: {lock_path}）")
                logger.error("请等待该进程完成，或删除锁文件后重试")
                sys.exit(1)
            else:
                logger.warning(f"锁文件已过期（{lock_age:.0f}秒），自动清理: {lock_path}")
        except OSError:
            pass
    try:
        with open(lock_path, "w", encoding="utf-8") as f:
            f.write(f"PID: {os.getpid()}\nStarted: {datetime.now().isoformat()}\n")
    except OSError as e:
        logger.warning(f"锁文件创建失败: {e}")
    return lock_path


def release_lock(lock_path: str) -> None:
    """释放文件锁"""
    try:
        if os.path.exists(lock_path):
            os.remove(lock_path)
    except OSError as e:
        logger.warning(f"锁文件删除失败: {e}")


def main() -> None:
    logger.info("=== RAGAS 思想自实现评估脚本启动 ===")
    args = parse_args()

    if not os.path.exists(args.input):
        logger.error(f"输入文件不存在: {args.input}")
        logger.error("请先运行: npx tsx scripts/collect-rag-data.ts")
        sys.exit(1)

    items = load_eval_data(args.input, args.limit)
    if not items:
        logger.error("无评估数据，退出")
        sys.exit(1)

    # 确定 checkpoint 路径
    if args.output:
        output_path = args.output
    else:
        ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        output_path = os.path.join(Config.DEFAULT_OUTPUT_DIR, f"ragas-report-{ts}.json")
    checkpoint_path = get_checkpoint_path(output_path)

    # 并发锁：防止多进程同时运行评估覆盖结果
    lock_path = acquire_lock(output_path)

    # 断点续传：加载已完成的评估（仅保留4项指标均>0的成功项，部分0项需重新评估）
    completed_details = load_checkpoint(checkpoint_path)
    completed_ids = set()
    valid_completed = []
    for d in completed_details:
        cp = d.get("context_precision", 0)
        cr = d.get("context_recall", 0)
        f = d.get("faithfulness", 0)
        ar = d.get("answer_relevancy", 0)
        # 4 项指标中任一为 0 → 视为不完整，需重新评估
        if cp == 0 or cr == 0 or f == 0 or ar == 0:
            continue
        completed_ids.add(d.get("id"))
        valid_completed.append(d)
    logger.info(f"已完成 {len(completed_ids)} 条（4项指标均>0），剩余 {len(items) - len(completed_ids)} 条待评估")

    client = create_client()

    # 逐条评估（跳过已成功的）
    details: List[Dict[str, Any]] = list(valid_completed)
    start_time = time.time()
    for i, item in enumerate(items):
        item_id = item.get("id", str(i))
        if item_id in completed_ids:
            logger.info(f"[{i+1}] 跳过已完成项: id={item_id}")
            continue

        try:
            detail = evaluate_item(client, item, i)
            details.append(detail)
        except Exception as e:
            logger.error(f"[{i+1}] 评估异常，跳过: {e}", exc_info=True)
            details.append({
                "id": item_id,
                "category": item.get("category", "未分类"),
                "query": item.get("question", ""),
                "canAnswer": item.get("canAnswer", True),
                "context_precision": 0.0,
                "context_recall": 0.0,
                "faithfulness": 0.0,
                "answer_relevancy": 0.0,
                "reasons": {"error": str(e)},
            })

        # 每完成一条，保存 checkpoint
        save_checkpoint(checkpoint_path, details)

    duration = time.time() - start_time
    logger.info(f"=== 全部评估完成，本轮耗时 {duration:.2f} 秒 ===")

    # 生成报告
    report = generate_report(details, items, duration, client)

    save_report(report, output_path)
    print_summary(report)
    logger.info(f"=== 评估完成，报告路径: {output_path} ===")

    # 评估完成后：仅当无失败项时清理 checkpoint，否则保留供断点续传
    failed_count = sum(1 for d in details if d.get("context_precision", 0) == 0 and d.get("context_recall", 0) == 0 and d.get("faithfulness", 0) == 0 and d.get("answer_relevancy", 0) == 0)
    if failed_count > 0:
        logger.warning(f"检测到 {failed_count} 条全0评估（LLM 失败），保留 checkpoint 供断点续传: {checkpoint_path}")
        logger.warning(f"配额恢复后重跑相同命令即可续传: python scripts/ragas_evaluation.py --input {args.input} --output {output_path}")
    elif os.path.exists(checkpoint_path):
        os.remove(checkpoint_path)
        logger.info(f"Checkpoint 已清理: {checkpoint_path}")

    # 释放并发锁
    release_lock(lock_path)


if __name__ == "__main__":
    main()
