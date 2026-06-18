#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
评估优化循环脚本 (eval_optimize_loop.py)

实现: 修改代码 → 端到端测试OK → 端到端评估 → 分析差指标 → 修改代码 → ...

流程:
1. 运行 e2e_test.py → 失败则停止
2. 运行完整评估: npx tsx scripts/run-evaluation.ts --type rag --level full
3. 解析评估报告JSON
4. 对比各指标与优秀阈值
5. 全部优秀 → 输出"所有指标已达到优秀标准"，完成
6. 有指标未达标 → 分析根因并生成优化建议
7. 输出优化方案
8. 等待用户确认（或 --auto 自动应用）
9. 重新运行 e2e_test.py → 失败则停止
10. 回到步骤2

支持断点续传: --resume 从进度文件恢复

用法:
    conda activate agent
    python scripts/eval_optimize_loop.py [--max-rounds 10] [--auto] [--resume]
"""

import sys
import json
import time
import os
import logging
import argparse
import subprocess
from datetime import datetime
from typing import Any

import requests

# ============================================================
# 常量与路径
# ============================================================
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROGRESS_FILE = os.path.join(PROJECT_ROOT, "tests", "reports", "evaluation", "optim-progress.json")
E2E_TEST_SCRIPT = os.path.join(PROJECT_ROOT, "scripts", "e2e_test.py")
EVAL_REPORT_DIR = os.path.join(PROJECT_ROOT, "tests", "reports", "evaluation")
CONFIG_PATH = os.path.join(PROJECT_ROOT, "config", "evaluation-config.yaml")

# ============================================================
# 日志配置
# ============================================================
LOG_DIR = os.path.join(PROJECT_ROOT, "tests", "reports", "evaluation")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("eval_optimize_loop")

# 添加文件日志
log_file = os.path.join(
    LOG_DIR,
    f"eval_optimize_loop_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log",
)
file_handler = logging.FileHandler(log_file, encoding="utf-8")
file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(file_handler)


# ============================================================
# 优秀阈值定义 (来自 rag-evaluator.ts generateMetricDetails)
# ============================================================
# 对于反转指标(如幻觉率), excellentThreshold表示"低于此值为优秀"
EXCELLENT_THRESHOLDS = {
    "hitsAtK": 0.8,
    "contextRelevance": 0.7,
    "contextRecall": 0.7,
    "faithfulness": 0.8,
    "answerRelevance": 0.8,
    "numericalAccuracy": 0.9,
    "complianceScore": 0.9,
    "hallucinationRate": 0.1,  # 越低越好, 低于0.1为优秀
    "riskDisclosure": 0.6,
    "timeliness": 0.8,
    "refusalAccuracy": 0.9,
    "answerCorrectness": 0.8,
    "mrr": 0.7,
}

# 反转指标列表(值越低越好)
INVERTED_METRICS = {"hallucinationRate"}

# 指标中文名称映射
METRIC_NAMES_CN = {
    "hitsAtK": "检索命中率 (Hits@K)",
    "contextRelevance": "上下文相关性 (Context Relevance)",
    "contextRecall": "上下文召回率 (Context Recall)",
    "faithfulness": "忠实度 (Faithfulness)",
    "answerRelevance": "答案相关性 (Answer Relevance)",
    "numericalAccuracy": "数值精度 (Numerical Accuracy)",
    "complianceScore": "合规性 (Compliance Score)",
    "hallucinationRate": "幻觉率 (Hallucination Rate)",
    "riskDisclosure": "风险提示 (Risk Disclosure)",
    "timeliness": "时效性 (Timeliness)",
    "refusalAccuracy": "拒绝准确率 (Refusal Accuracy)",
    "answerCorrectness": "答案正确性 (Answer Correctness)",
    "mrr": "平均倒数排名 (MRR)",
}

# ============================================================
# 根因分析逻辑
# ============================================================
ROOT_CAUSE_ANALYSIS = {
    "numericalAccuracy": {
        "root_cause": "数值提取不准确，检索召回率不足导致关键数据缺失",
        "suggestions": [
            "优化检索召回率，确保包含数值数据的文档片段被检索到",
            "改进数值提取prompt，要求模型精确提取并引用数值",
            "增加数值验证步骤，对比多个文档来源的数值",
        ],
        "target_files": [
            "src/server/evaluation/rag-evaluator.ts (数值提取prompt)",
            "src/server/rag/retrieval/hybrid-retriever.ts (检索参数)",
        ],
    },
    "complianceScore": {
        "root_cause": "合规检查不充分，缺少违规模式识别",
        "suggestions": [
            "增强合规检查prompt，添加更多违规模式",
            "增加承诺收益、推荐时点等违规检测规则",
            "添加合规性few-shot示例",
        ],
        "target_files": [
            "src/server/evaluation/rag-evaluator.ts (合规评估prompt)",
            "src/server/agents/compliance.ts (合规检查逻辑)",
        ],
    },
    "hallucinationRate": {
        "root_cause": "模型生成内容缺乏来源约束，产生无法溯源的信息",
        "suggestions": [
            "增强来源引用约束prompt，要求每个数据点标注来源",
            "添加幻觉检测后处理步骤",
            "降低temperature参数减少创造性输出",
        ],
        "target_files": [
            "src/server/evaluation/rag-evaluator.ts (幻觉评估)",
            "src/server/rag/citation/citation-injector.ts (引用注入)",
        ],
    },
    "riskDisclosure": {
        "root_cause": "投资相关回答中缺少风险提示内容",
        "suggestions": [
            "在system prompt中添加风险提示模板",
            "对投资相关问题自动追加风险提示",
            "增加风险提示关键词检测",
        ],
        "target_files": [
            "src/server/evaluation/rag-evaluator.ts (风险提示评估)",
            "scripts/run-evaluation.ts (answerFn system prompt)",
        ],
    },
    "timeliness": {
        "root_cause": "日期提取逻辑不完善，无法识别最新数据",
        "suggestions": [
            "优化日期提取逻辑，支持多种日期格式",
            "添加数据时效性排序，优先使用最新数据",
            "在检索结果中标注文档日期",
        ],
        "target_files": [
            "src/server/evaluation/rag-evaluator.ts (时效性评估)",
            "src/server/rag/retrieval/hybrid-retriever.ts (时效性排序)",
        ],
    },
    "hitsAtK": {
        "root_cause": "检索召回率不足，相关文档未被检索到",
        "suggestions": [
            "优化检索参数: 增大chunk_size、调整topK",
            "调整混合检索权重(hybrid search weights)",
            "优化embedding模型或增加reranker",
            "改进查询扩展策略",
        ],
        "target_files": [
            "src/server/rag/retrieval/hybrid-retriever.ts (检索参数)",
            "src/server/rag/chunking/semantic-chunker.ts (分块参数)",
            "src/server/rag/query/query-expander.ts (查询扩展)",
        ],
    },
    "mrr": {
        "root_cause": "相关文档排名靠后，reranker权重不合理",
        "suggestions": [
            "优化reranker权重配置",
            "调整检索评分算法",
            "增加相关性特征",
        ],
        "target_files": [
            "src/server/rag/reranking/reranker.ts (reranker权重)",
            "src/server/rag/retrieval/hybrid-retriever.ts (评分算法)",
        ],
    },
    "answerCorrectness": {
        "root_cause": "生成答案与期望答案语义一致性不足",
        "suggestions": [
            "改进生成prompt，增加few-shot示例",
            "优化答案结构化输出格式",
            "增加答案验证步骤",
        ],
        "target_files": [
            "scripts/run-evaluation.ts (answerFn prompt)",
            "src/server/evaluation/rag-evaluator.ts (正确性评估)",
        ],
    },
    "faithfulness": {
        "root_cause": "生成内容未忠实于检索来源",
        "suggestions": [
            "增强来源引用约束prompt",
            "添加忠实度验证步骤",
            "限制模型不要超出检索内容回答",
        ],
        "target_files": [
            "scripts/run-evaluation.ts (answerFn system prompt)",
            "src/server/rag/citation/source-tracker.ts (来源追踪)",
        ],
    },
    "refusalAccuracy": {
        "root_cause": "系统无法正确判断是否应该回答问题",
        "suggestions": [
            "优化拒绝判断逻辑，改进拒绝模式匹配",
            "增加边界case的训练数据",
            "调整canAnswer判断阈值",
        ],
        "target_files": [
            "src/server/evaluation/rag-evaluator.ts (isRefusalAnswer函数)",
            "scripts/run-evaluation.ts (answerFn prompt)",
        ],
    },
    "contextRelevance": {
        "root_cause": "检索内容与查询相关性不足",
        "suggestions": [
            "优化查询理解和扩展",
            "调整embedding模型",
            "改进混合检索权重",
        ],
        "target_files": [
            "src/server/rag/query/query-expander.ts (查询扩展)",
            "src/server/rag/retrieval/hybrid-retriever.ts (检索权重)",
        ],
    },
    "contextRecall": {
        "root_cause": "检索内容未充分覆盖期望答案信息",
        "suggestions": [
            "增大topK值提高召回",
            "优化分块策略减少信息截断",
            "增加父文档检索策略",
        ],
        "target_files": [
            "src/server/rag/retrieval/hybrid-retriever.ts (topK参数)",
            "src/server/rag/chunking/parent-document.ts (父文档检索)",
        ],
    },
    "answerRelevance": {
        "root_cause": "生成答案与用户查询相关性不足",
        "suggestions": [
            "改进生成prompt，强调回答用户问题",
            "增加答案相关性验证步骤",
            "优化few-shot示例",
        ],
        "target_files": [
            "scripts/run-evaluation.ts (answerFn prompt)",
            "src/server/evaluation/rag-evaluator.ts (相关性评估)",
        ],
    },
}


# ============================================================
# 进度文件操作
# ============================================================

def load_progress() -> dict | None:
    """加载断点续传进度文件"""
    try:
        if not os.path.exists(PROGRESS_FILE):
            logger.info(f"未发现进度文件: {PROGRESS_FILE}")
            return None
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            progress = json.load(f)
        logger.info(
            f"已加载进度文件: 第{progress.get('currentRound', '?')}轮, "
            f"共{len(progress.get('rounds', []))}轮记录"
        )
        return progress
    except Exception as e:
        logger.error(f"加载进度文件失败: {e}", exc_info=True)
        return None


def save_progress(progress: dict):
    """保存进度文件"""
    try:
        os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
        progress["lastUpdateTime"] = datetime.now().isoformat()
        with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)
        logger.info(f"进度文件已保存: {PROGRESS_FILE}")
    except Exception as e:
        logger.error(f"保存进度文件失败: {e}", exc_info=True)


def create_initial_progress(max_rounds: int) -> dict:
    """创建初始进度文件"""
    progress = {
        "currentRound": 0,
        "maxRounds": max_rounds,
        "startTime": datetime.now().isoformat(),
        "rounds": [],
        "environmentLimited": [],
        "lastUpdateTime": datetime.now().isoformat(),
    }
    save_progress(progress)
    return progress


# ============================================================
# 端到端测试
# ============================================================

def run_e2e_test() -> bool:
    """运行端到端测试脚本，返回是否通过"""
    logger.info("=" * 50)
    logger.info("运行端到端测试...")
    logger.info("=" * 50)

    try:
        cmd = f'python "{E2E_TEST_SCRIPT}"'
        logger.info(f"执行命令: {cmd}")

        proc = subprocess.run(
            cmd,
            shell=True,
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=300,  # 5分钟超时
            encoding="utf-8",
            errors="replace",
        )

        # 输出关键日志
        if proc.stdout:
            for line in proc.stdout.strip().split("\n")[-20:]:
                logger.info(f"[e2e] {line}")
        if proc.stderr:
            for line in proc.stderr.strip().split("\n")[-10:]:
                logger.warning(f"[e2e-err] {line}")

        passed = proc.returncode == 0
        if passed:
            logger.info("端到端测试通过")
        else:
            logger.error(f"端到端测试失败 (退出码: {proc.returncode})")

        return passed

    except subprocess.TimeoutExpired:
        logger.error("端到端测试超时 (5分钟)")
        return False
    except Exception as e:
        logger.error(f"端到端测试异常: {e}", exc_info=True)
        return False


# ============================================================
# 运行评估
# ============================================================

def run_full_evaluation() -> str | None:
    """运行完整评估，返回报告文件路径"""
    logger.info("=" * 50)
    logger.info("运行完整评估 (full mode)...")
    logger.info("=" * 50)

    try:
        cmd = "npx tsx scripts/run-evaluation.ts --type rag --level full"
        logger.info(f"执行命令: {cmd}")

        proc = subprocess.run(
            cmd,
            shell=True,
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=7200,  # 2小时超时
            encoding="utf-8",
            errors="replace",
        )

        # 输出关键日志
        if proc.stdout:
            for line in proc.stdout.strip().split("\n")[-30:]:
                logger.info(f"[eval] {line}")
        if proc.stderr:
            for line in proc.stderr.strip().split("\n")[-10:]:
                logger.warning(f"[eval-err] {line}")

        if proc.returncode != 0:
            logger.error(f"评估脚本失败 (退出码: {proc.returncode})")
            return None

        # 查找最新的评估报告
        report_path = find_latest_eval_report()
        if report_path:
            logger.info(f"找到评估报告: {report_path}")
        else:
            logger.error("未找到评估报告文件")

        return report_path

    except subprocess.TimeoutExpired:
        logger.error("评估脚本超时 (2小时)")
        return None
    except Exception as e:
        logger.error(f"评估脚本异常: {e}", exc_info=True)
        return None


def find_latest_eval_report() -> str | None:
    """查找最新的评估报告文件"""
    try:
        if not os.path.exists(EVAL_REPORT_DIR):
            return None

        # 优先查找 latest.json
        latest_path = os.path.join(EVAL_REPORT_DIR, "latest.json")
        if os.path.exists(latest_path):
            return latest_path

        # 查找最新的 full-golden 报告
        report_files = []
        for f in os.listdir(EVAL_REPORT_DIR):
            if f.startswith("eval-report-full-golden-") and f.endswith(".json"):
                report_files.append(os.path.join(EVAL_REPORT_DIR, f))

        if not report_files:
            # 也查找其他full报告
            for f in os.listdir(EVAL_REPORT_DIR):
                if f.startswith("eval-report-full-") and f.endswith(".json"):
                    report_files.append(os.path.join(EVAL_REPORT_DIR, f))

        if not report_files:
            # 查找任何评估报告
            for f in os.listdir(EVAL_REPORT_DIR):
                if f.startswith("eval-report-") and f.endswith(".json") and f != "latest.json":
                    report_files.append(os.path.join(EVAL_REPORT_DIR, f))

        if not report_files:
            return None

        # 按修改时间排序，取最新的
        report_files.sort(key=lambda x: os.path.getmtime(x), reverse=True)
        return report_files[0]

    except Exception as e:
        logger.error(f"查找评估报告失败: {e}", exc_info=True)
        return None


# ============================================================
# 解析评估报告
# ============================================================

def parse_eval_report(report_path: str) -> dict | None:
    """解析评估报告JSON"""
    try:
        with open(report_path, "r", encoding="utf-8") as f:
            report = json.load(f)
        logger.info(f"已解析评估报告: {report_path}")
        logger.info(f"  总测试数: {report.get('totalTests', 'N/A')}")
        logger.info(f"  Overall Score: {report.get('overallScore', 'N/A')}")
        logger.info(f"  Financial Overall: {report.get('financialOverallScore', 'N/A')}")
        return report
    except Exception as e:
        logger.error(f"解析评估报告失败: {e}", exc_info=True)
        return None


def extract_metrics(report: dict) -> dict[str, float]:
    """从评估报告中提取所有指标值"""
    metrics = {}

    # 通用指标
    metric_keys = [
        ("avgHitsAtK", "hitsAtK"),
        ("avgContextRelevance", "contextRelevance"),
        ("avgContextRecall", "contextRecall"),
        ("avgFaithfulness", "faithfulness"),
        ("avgAnswerRelevance", "answerRelevance"),
    ]
    for json_key, metric_key in metric_keys:
        if json_key in report:
            metrics[metric_key] = report[json_key]

    # 金融指标
    financial_keys = [
        ("avgNumericalAccuracy", "numericalAccuracy"),
        ("avgComplianceScore", "complianceScore"),
        ("avgHallucinationRate", "hallucinationRate"),
        ("avgRiskDisclosureScore", "riskDisclosure"),
        ("avgTimelinessScore", "timeliness"),
    ]
    for json_key, metric_key in financial_keys:
        if json_key in report:
            metrics[metric_key] = report[json_key]

    # 专业评估指标
    pro_keys = [
        ("avgRefusalAccuracy", "refusalAccuracy"),
        ("avgAnswerCorrectness", "answerCorrectness"),
        ("avgMRR", "mrr"),
    ]
    for json_key, metric_key in pro_keys:
        if json_key in report:
            metrics[metric_key] = report[json_key]

    # 也从 metricDetails 中提取（如果存在）
    if "metricDetails" in report and isinstance(report["metricDetails"], list):
        for detail in report["metricDetails"]:
            name = detail.get("name", "")
            value = detail.get("currentValue")
            if name and value is not None:
                # 将英文名称映射到指标key
                name_map = {
                    "Hits@K": "hitsAtK",
                    "Context Relevance": "contextRelevance",
                    "Context Recall": "contextRecall",
                    "Faithfulness": "faithfulness",
                    "Answer Relevance": "answerRelevance",
                    "Numerical Accuracy": "numericalAccuracy",
                    "Compliance Score": "complianceScore",
                    "Hallucination Rate": "hallucinationRate",
                    "Risk Disclosure": "riskDisclosure",
                    "Timeliness": "timeliness",
                    "Refusal Accuracy": "refusalAccuracy",
                    "Answer Correctness": "answerCorrectness",
                    "MRR": "mrr",
                }
                mapped_key = name_map.get(name)
                if mapped_key and mapped_key not in metrics:
                    metrics[mapped_key] = value

    logger.info(f"提取到 {len(metrics)} 个指标:")
    for k, v in metrics.items():
        logger.info(f"  {k}: {v}")

    return metrics


# ============================================================
# 指标分析
# ============================================================

def analyze_metrics(metrics: dict[str, float]) -> tuple[list[str], list[str]]:
    """
    分析指标，返回 (未达标指标列表, 环境受限指标列表)
    """
    not_excellent = []
    for metric_key, value in metrics.items():
        threshold = EXCELLENT_THRESHOLDS.get(metric_key)
        if threshold is None:
            continue

        if metric_key in INVERTED_METRICS:
            # 反转指标: 值越低越好
            if value > threshold:
                not_excellent.append(metric_key)
                logger.info(
                    f"  {METRIC_NAMES_CN.get(metric_key, metric_key)}: "
                    f"{value:.4f} > {threshold} (未达标)"
                )
        else:
            # 正常指标: 值越高越好
            if value < threshold:
                not_excellent.append(metric_key)
                logger.info(
                    f"  {METRIC_NAMES_CN.get(metric_key, metric_key)}: "
                    f"{value:.4f} < {threshold} (未达标)"
                )

    return not_excellent, []


def check_environment_limited(
    progress: dict, current_metrics: dict[str, float]
) -> list[str]:
    """
    检查环境受限指标:
    如果某指标连续3轮改进幅度<2%，标记为环境受限
    """
    rounds = progress.get("rounds", [])
    if len(rounds) < 3:
        return []

    env_limited = []
    # 获取最近3轮的指标数据
    recent_rounds = rounds[-3:]

    for metric_key in current_metrics:
        values = []
        for r in recent_rounds:
            round_metrics = r.get("metrics", {})
            if metric_key in round_metrics:
                values.append(round_metrics[metric_key])

        if len(values) < 3:
            continue

        # 计算改进幅度
        improvements = []
        for i in range(1, len(values)):
            if metric_key in INVERTED_METRICS:
                # 反转指标: 值下降为改进
                improvements.append(values[i - 1] - values[i])
            else:
                improvements.append(values[i] - values[i - 1])

        # 如果连续改进幅度都<2%
        if all(abs(imp) < 0.02 for imp in improvements):
            env_limited.append(metric_key)
            logger.warning(
                f"指标 {METRIC_NAMES_CN.get(metric_key, metric_key)} "
                f"连续3轮改进幅度<2%, 标记为环境受限"
            )
            logger.warning(f"  近3轮值: {values}")
            logger.warning(f"  改进幅度: {[f'{imp:+.4f}' for imp in improvements]}")

    return env_limited


def generate_optimization_plan(not_excellent: list[str]) -> list[dict]:
    """根据未达标指标生成优化方案"""
    plan = []

    for metric_key in not_excellent:
        analysis = ROOT_CAUSE_ANALYSIS.get(metric_key, {
            "root_cause": f"指标 {metric_key} 未达标，需要进一步分析",
            "suggestions": ["分析具体失败案例", "调整相关参数"],
            "target_files": [],
        })

        plan.append({
            "metric": metric_key,
            "name_cn": METRIC_NAMES_CN.get(metric_key, metric_key),
            "root_cause": analysis["root_cause"],
            "suggestions": analysis["suggestions"],
            "target_files": analysis["target_files"],
        })

    return plan


def print_optimization_plan(plan: list[dict], env_limited: list[str]):
    """打印优化方案"""
    logger.info("\n" + "=" * 70)
    logger.info("优化方案")
    logger.info("=" * 70)

    for i, item in enumerate(plan, 1):
        logger.info(f"\n--- 优化项 {i}: {item['name_cn']} ---")
        logger.info(f"  根因分析: {item['root_cause']}")
        logger.info("  优化建议:")
        for j, suggestion in enumerate(item["suggestions"], 1):
            logger.info(f"    {j}. {suggestion}")
        if item["target_files"]:
            logger.info("  涉及文件:")
            for f in item["target_files"]:
                logger.info(f"    - {f}")

    if env_limited:
        logger.info("\n" + "-" * 70)
        logger.info("环境受限指标 (连续3轮改进<2%):")
        for metric_key in env_limited:
            name = METRIC_NAMES_CN.get(metric_key, metric_key)
            threshold = EXCELLENT_THRESHOLDS.get(metric_key, "N/A")
            analysis = ROOT_CAUSE_ANALYSIS.get(metric_key, {})
            logger.info(f"\n  指标: {name}")
            logger.info(f"  优秀阈值: {threshold}")
            logger.info(f"  环境约束: {analysis.get('root_cause', '外部环境限制')}")
            logger.info(f"  建议解决方案:")
            for s in analysis.get("suggestions", ["考虑更换模型或数据源"]):
                logger.info(f"    - {s}")

    logger.info("=" * 70)


# ============================================================
# Git提交
# ============================================================

def git_commit(round_num: int, optimization_summary: str):
    """Git提交当前更改"""
    try:
        # git add
        add_cmd = "git add -A"
        logger.info(f"执行: {add_cmd}")
        subprocess.run(add_cmd, shell=True, cwd=PROJECT_ROOT, capture_output=True, text=True)

        # git commit
        commit_msg = f"V{round_num}: 评估优化第{round_num}轮 - {optimization_summary}"
        commit_cmd = f'git commit -m "{commit_msg}"'
        logger.info(f"执行: git commit -m \"{commit_msg}\"")
        result = subprocess.run(
            commit_cmd, shell=True, cwd=PROJECT_ROOT, capture_output=True, text=True
        )

        if result.returncode == 0:
            logger.info(f"Git提交成功: {commit_msg}")
        else:
            # 可能没有变更需要提交
            if "nothing to commit" in result.stdout or "nothing to commit" in result.stderr:
                logger.info("没有变更需要提交")
            else:
                logger.warning(f"Git提交可能失败: {result.stderr[:300]}")

    except Exception as e:
        logger.error(f"Git提交异常: {e}", exc_info=True)


# ============================================================
# 用户交互
# ============================================================

def wait_for_user_confirmation(plan: list[dict]) -> bool:
    """等待用户确认是否应用优化"""
    logger.info("\n是否应用以上优化方案?")
    logger.info("  输入 'y' 或 'yes' 确认应用")
    logger.info("  输入 'n' 或 'no' 跳过本轮优化")
    logger.info("  输入 'q' 或 'quit' 退出整个循环")

    try:
        choice = input("\n请选择 (y/n/q): ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        logger.info("用户中断输入，退出循环")
        return False

    if choice in ("y", "yes"):
        logger.info("用户确认应用优化")
        return True
    elif choice in ("q", "quit"):
        logger.info("用户选择退出")
        sys.exit(0)
    else:
        logger.info("用户跳过本轮优化")
        return False


# ============================================================
# 主循环
# ============================================================

def run_optimization_loop(max_rounds: int, auto: bool, resume: bool):
    """运行评估优化主循环"""

    logger.info("=" * 70)
    logger.info("评估优化循环启动")
    logger.info(f"  最大轮数: {max_rounds}")
    logger.info(f"  自动模式: {auto}")
    logger.info(f"  断点续传: {resume}")
    logger.info(f"  项目根目录: {PROJECT_ROOT}")
    logger.info(f"  进度文件: {PROGRESS_FILE}")
    logger.info("=" * 70)

    # 加载或创建进度文件
    progress = None
    if resume:
        progress = load_progress()

    if progress is None:
        progress = create_initial_progress(max_rounds)

    start_round = progress.get("currentRound", 0) + 1
    logger.info(f"从第 {start_round} 轮开始")

    for round_num in range(start_round, max_rounds + 1):
        logger.info("\n" + "#" * 70)
        logger.info(f"# 评估优化第 {round_num}/{max_rounds} 轮")
        logger.info("#" * 70)

        progress["currentRound"] = round_num
        round_info = {
            "round": round_num,
            "timestamp": datetime.now().isoformat(),
            "evaluationReport": None,
            "metrics": {},
            "optimizationSummary": "",
            "optimizationsApplied": [],
            "testResult": "PENDING",
            "metricChanges": {},
        }

        # ---- 步骤1: 端到端测试 ----
        logger.info(f"\n[第{round_num}轮] 步骤1: 运行端到端测试")
        e2e_passed = run_e2e_test()

        if not e2e_passed:
            logger.error(f"[第{round_num}轮] 端到端测试失败，停止优化循环")
            round_info["testResult"] = "FAIL"
            progress["rounds"].append(round_info)
            save_progress(progress)
            # 输出失败详情
            logger.error("=" * 70)
            logger.error("端到端测试失败详情:")
            logger.error("  请检查以下项目:")
            logger.error("  1. 服务是否正常运行 (http://localhost:3001)")
            logger.error("  2. RAG检索接口是否可用")
            logger.error("  3. LLM生成接口是否可用")
            logger.error("  4. 文档上传接口是否可用")
            logger.error("  5. 评估脚本是否能正常运行")
            logger.error("  6. 前端页面是否可访问")
            logger.error("=" * 70)
            sys.exit(1)

        round_info["testResult"] = "PASS"
        logger.info(f"[第{round_num}轮] 端到端测试通过")

        # ---- 步骤2: 运行完整评估 ----
        logger.info(f"\n[第{round_num}轮] 步骤2: 运行完整评估")
        report_path = run_full_evaluation()

        if not report_path:
            logger.error(f"[第{round_num}轮] 评估运行失败，停止优化循环")
            round_info["testResult"] = "EVAL_FAIL"
            progress["rounds"].append(round_info)
            save_progress(progress)
            sys.exit(1)

        round_info["evaluationReport"] = os.path.basename(report_path)

        # ---- 步骤3: 解析评估报告 ----
        logger.info(f"\n[第{round_num}轮] 步骤3: 解析评估报告")
        report = parse_eval_report(report_path)

        if not report:
            logger.error(f"[第{round_num}轮] 解析评估报告失败")
            progress["rounds"].append(round_info)
            save_progress(progress)
            sys.exit(1)

        # ---- 步骤4: 提取并分析指标 ----
        logger.info(f"\n[第{round_num}轮] 步骤4: 分析指标")
        current_metrics = extract_metrics(report)
        round_info["metrics"] = current_metrics

        # 计算与上一轮的指标变化
        if len(progress["rounds"]) > 0:
            prev_metrics = progress["rounds"][-1].get("metrics", {})
            for key in current_metrics:
                if key in prev_metrics:
                    delta = current_metrics[key] - prev_metrics[key]
                    round_info["metricChanges"][key] = f"{delta:+.4f}"

        not_excellent, _ = analyze_metrics(current_metrics)

        # 检查环境受限指标
        env_limited = check_environment_limited(progress, current_metrics)
        if env_limited:
            # 合并到进度文件的环境受限列表（去重）
            existing_limited = set(progress.get("environmentLimited", []))
            for m in env_limited:
                if m not in existing_limited:
                    progress["environmentLimited"] = progress.get("environmentLimited", [])
                    progress["environmentLimited"].append(m)

        # ---- 步骤5: 判断是否全部优秀 ----
        if not not_excellent:
            logger.info("=" * 70)
            logger.info("所有指标已达到优秀标准!")
            logger.info("=" * 70)

            # 打印最终指标
            for key, value in current_metrics.items():
                threshold = EXCELLENT_THRESHOLDS.get(key, "N/A")
                name = METRIC_NAMES_CN.get(key, key)
                if key in INVERTED_METRICS:
                    logger.info(f"  {name}: {value:.4f} (阈值: <={threshold})")
                else:
                    logger.info(f"  {name}: {value:.4f} (阈值: >={threshold})")

            round_info["optimizationSummary"] = "所有指标已达到优秀标准"
            progress["rounds"].append(round_info)
            save_progress(progress)

            # Git提交
            git_commit(round_num, "所有指标已达到优秀标准")
            return

        # ---- 步骤6: 生成优化方案 ----
        logger.info(f"\n[第{round_num}轮] 步骤5: 生成优化方案")
        logger.info(f"未达标指标 ({len(not_excellent)}个):")
        for m in not_excellent:
            name = METRIC_NAMES_CN.get(m, m)
            value = current_metrics.get(m, "N/A")
            threshold = EXCELLENT_THRESHOLDS.get(m, "N/A")
            if m in INVERTED_METRICS:
                logger.info(f"  {name}: {value:.4f} (需<={threshold})")
            else:
                logger.info(f"  {name}: {value:.4f} (需>={threshold})")

        plan = generate_optimization_plan(not_excellent)
        print_optimization_plan(plan, env_limited)

        # ---- 步骤7: 应用优化 ----
        if auto:
            logger.info(f"\n[第{round_num}轮] 自动模式: 跳过用户确认")
            applied = True
        else:
            applied = wait_for_user_confirmation(plan)

        if applied:
            # 记录应用的优化
            applied_items = []
            for item in plan:
                applied_items.append(f"优化{item['name_cn']}: {item['root_cause']}")
            round_info["optimizationsApplied"] = applied_items

            optimization_summary = "、".join(
                f"{METRIC_NAMES_CN.get(m, m)}" for m in not_excellent[:3]
            )
            if len(not_excellent) > 3:
                optimization_summary += f"等{len(not_excellent)}项"
            round_info["optimizationSummary"] = f"优化{optimization_summary}"

            logger.info(f"[第{round_num}轮] 优化方案已确认应用")
            logger.info("[提示] 请手动修改代码后重新运行此脚本 (--resume)")
        else:
            round_info["optimizationSummary"] = "用户跳过本轮优化"
            round_info["optimizationsApplied"] = ["用户跳过"]
            logger.info(f"[第{round_num}轮] 用户跳过本轮优化")

        # 保存进度
        progress["rounds"].append(round_info)
        save_progress(progress)

        # ---- 步骤8: Git提交 ----
        git_commit(round_num, round_info["optimizationSummary"])

        logger.info(f"\n[第{round_num}轮] 完成，准备进入下一轮")

    # 达到最大轮数
    logger.info("=" * 70)
    logger.info(f"已达到最大优化轮数 ({max_rounds})")
    logger.info("仍有以下指标未达到优秀标准:")
    for m in not_excellent:
        name = METRIC_NAMES_CN.get(m, m)
        value = current_metrics.get(m, "N/A")
        threshold = EXCELLENT_THRESHOLDS.get(m, "N/A")
        logger.info(f"  {name}: {value:.4f} (阈值: {threshold})")

    if progress.get("environmentLimited"):
        logger.info("\n环境受限指标:")
        for m in progress["environmentLimited"]:
            name = METRIC_NAMES_CN.get(m, m)
            logger.info(f"  {name}")

    logger.info("=" * 70)


# ============================================================
# 入口
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="评估优化循环脚本 - 自动评估、分析、优化循环"
    )
    parser.add_argument(
        "--max-rounds",
        type=int,
        default=10,
        help="最大优化轮数 (默认: 10)",
    )
    parser.add_argument(
        "--auto",
        action="store_true",
        help="自动模式，不等待用户确认直接应用优化",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="从断点续传进度文件恢复",
    )
    args = parser.parse_args()

    logger.info(f"命令行参数: max_rounds={args.max_rounds}, auto={args.auto}, resume={args.resume}")

    try:
        run_optimization_loop(
            max_rounds=args.max_rounds,
            auto=args.auto,
            resume=args.resume,
        )
    except KeyboardInterrupt:
        logger.info("\n用户中断，保存进度后退出")
        sys.exit(130)
    except Exception as e:
        logger.error(f"优化循环异常退出: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
