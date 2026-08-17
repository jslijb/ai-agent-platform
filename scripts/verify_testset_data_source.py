#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
verify_testset_data_source.py
验证测试集 expectedAnswer 与知识库文档的一致性。

依据 spec: .trae/specs/v11-rag-architecture-fix/spec.md
执行四项验证：
  1. 数值一致性验证（L1-L4，70条）：expectedAnswer 数值 vs dataSource.originalText
     - 同时以 calculationMethod 作为补充来源（L2 跨文档对比 / L3 计算推理 的中间值记录于此）
     - 允许四舍五入误差 ≤ 0.1，支持 千元/万元/百万元/元 → 亿元 的单位换算
  2. canAnswer 核对（所有 canAnswer=true 的 query）：调用 /api/rag/search 检查知识库是否有数据
  3. dataSource 完整性检查：L1-L4 必须非 null 且含 documentName/documentId/page/originalText
  4. calculationMethod 检查：L1-L4 必须有；L3-计算推理 必须含计算公式（"=" 和 "×" 或 "/"）

退出码：
  0 = 验证通过
  1 = 验证失败（数值不一致 / dataSource 不完整 / calculationMethod 缺失 / L3 公式不符合）
  2 = 环境错误（文件缺失 / 服务不可用 / 依赖缺失）

使用：
  conda activate bigmodel
  python scripts/verify_testset_data_source.py
"""

import json
import re
import sys
import time
import logging
from pathlib import Path
from datetime import datetime

try:
    import requests
except ImportError:
    print("[FATAL] 需要 requests 库: pip install requests")
    sys.exit(2)


# ==================== 配置 ====================
BASE_URL = "http://localhost:3000"
HEADERS = {"x-test-user-id": "69ea0f70-00a0-426b-aa5f-0e198d0f69d3"}
SCRIPT_DIR = Path(__file__).parent
QA_PATH = SCRIPT_DIR / "qa-golden.json"
LOG_DIR = SCRIPT_DIR.parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
TS = datetime.now().strftime("%Y%m%d_%H%M%S")
RUN_LOG_PATH = LOG_DIR / f"verify_testset_{TS}.log"
ERROR_LOG_PATH = LOG_DIR / f"verify_testset_error_{TS}.log"
# 复用已有检索缓存，避免重复请求
SEARCH_CACHE_PATH = SCRIPT_DIR / "_search_cache.json"
REQUEST_DELAY = 1.2
NUMERIC_TOLERANCE = 0.1

# 过滤的年份（不参与一致性比对）
YEAR_NUMBERS = {2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027}

# 单位换算因子（转换为亿元）：原始 / 百万元 / 万元 / 千元 / 元
UNIT_FACTORS = [1.0, 1e-2, 1e-4, 1e-5, 1e-8]

# 数值变体生成阈值：仅对大数（>1000）生成换算变体，避免小数误匹配
VARIANT_THRESHOLD = 1000.0


# ==================== 日志配置 ====================
def setup_logging():
    """配置日志：控制台 + 运行日志文件 + 错误日志文件."""
    logger = logging.getLogger("verify_testset")
    logger.setLevel(logging.DEBUG)
    logger.handlers = []

    fmt_file = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

    # 控制台：INFO 级别
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(ch)

    # 运行日志文件：DEBUG 级别（全量）
    fh = logging.FileHandler(RUN_LOG_PATH, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt_file)
    logger.addHandler(fh)

    # 错误日志文件：ERROR+ 级别
    eh = logging.FileHandler(ERROR_LOG_PATH, encoding="utf-8")
    eh.setLevel(logging.ERROR)
    eh.setFormatter(fmt_file)
    logger.addHandler(eh)

    return logger


log = setup_logging()


# ==================== 工具函数 ====================
# 数字提取正则：
#   1) 带千分位逗号的数：\d{1,3}(?:,\d{3})+(?:\.\d+)?   如 4,529.30 / 2,158,633,048.42
#   2) 普通小数：       \d+\.\d+                        如 4529.30 / 12.2
#   3) 整数：           \d+                              如 2025 / 10
NUM_PATTERN = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d+")


def extract_numbers(text):
    """从文本中提取所有数值（过滤年份、百分比基数 100、过小数）.

    返回 float 列表（保留重复值，因为同一数值出现多次属于不同语义位置）。
    """
    if not text:
        return []
    numbers = []
    for m in NUM_PATTERN.finditer(text):
        raw = m.group().replace(",", "")
        try:
            val = float(raw)
        except ValueError:
            continue
        # 过滤年份
        if val.is_integer() and int(val) in YEAR_NUMBERS:
            continue
        # 过滤百分比基数 100
        if val == 100.0:
            continue
        # 过滤 0 和过小值
        if 0 < val < 0.01:
            continue
        if val == 0.0:
            continue
        numbers.append(val)
    return numbers


def generate_variants(num):
    """为原始数值生成单位换算变体（转换为亿元等可比单位）.

    对大数（>1000）生成 ÷1e2/1e4/1e5/1e8 的变体，
    小数通常是百分比或已换算值，直接返回。
    """
    variants = [num]
    if num > VARIANT_THRESHOLD:
        for factor in UNIT_FACTORS[1:]:  # 跳过 1.0
            variants.append(num * factor)
    return variants


def find_match(expected_num, source_numbers, tolerance=NUMERIC_TOLERANCE):
    """在源数值列表中查找与期望数值匹配的项（含单位换算）.

    返回 (matched_bool, src_num, variant_used)。
    """
    for src_num in source_numbers:
        for variant in generate_variants(src_num):
            if abs(expected_num - variant) <= tolerance:
                return True, src_num, variant
    return False, None, None


def load_json(path):
    if path.exists():
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.error(f"加载缓存失败 {path}: {e}")
    return {}


def save_json(path, data):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        log.error(f"保存缓存失败 {path}: {e}")


# ==================== API 调用 ====================
def search_knowledge_base(query, search_cache):
    """调用 /api/rag/search 检索（带缓存）."""
    if query in search_cache:
        return search_cache[query]
    try:
        r = requests.post(
            f"{BASE_URL}/api/rag/search",
            json={"query": query, "mode": "hybrid", "topK": 5},
            headers=HEADERS,
            timeout=90,
        )
        r.raise_for_status()
        result = r.json()
        search_cache[query] = result
        time.sleep(REQUEST_DELAY)
        return result
    except Exception as e:
        log.error(f"[SEARCH ERROR] query='{query}': {e}")
        return None


def check_service_health():
    """检查 main_service 健康状态."""
    try:
        r = requests.get(f"{BASE_URL}/api/health", headers=HEADERS, timeout=10)
        r.raise_for_status()
        return True
    except Exception as e:
        log.error(f"main_service 不可用: {e}")
        return False


# ==================== 验证1：数值一致性 ====================
def verify_numerical_consistency(qa_data):
    """验证1：L1-L4 expectedAnswer 数值与 dataSource.originalText 一致性.

    比对策略：
      - 从 expectedAnswer 提取所有数值
      - 主源：dataSource.originalText
      - 补充源：calculationMethod（L2 跨文档/L3 计算推理 的中间值会记录于此）
      - 支持单位换算（千元/万元/百万元/元 → 亿元）
      - 允许误差 ≤ 0.1
    """
    log.info("=" * 70)
    log.info("【验证1】数值一致性验证（L1-L4，70条）")
    log.info("=" * 70)
    log.info(f"比对策略：expectedAnswer 数值 vs dataSource.originalText")
    log.info(f"        （L2/L3 中间值允许从 calculationMethod 匹配，支持单位换算，误差 ≤ {NUMERIC_TOLERANCE}）")
    log.info("")

    consistent_count = 0
    inconsistent_count = 0
    inconsistencies = []

    l1_l4 = [q for q in qa_data if q["id"].startswith(("L1-", "L2-", "L3-", "L4-"))]
    log.info(f"L1-L4 共 {len(l1_l4)} 条")

    for item in l1_l4:
        qid = item["id"]
        category = item.get("category", "")
        expected_answer = item.get("expectedAnswer", "")
        data_source = item.get("dataSource")
        calc_method = item.get("calculationMethod") or ""

        if not data_source or not data_source.get("originalText"):
            log.warning(f"[{qid}] dataSource.originalText 缺失，记为不一致")
            inconsistent_count += 1
            inconsistencies.append({
                "id": qid,
                "query": item.get("query", ""),
                "reason": "dataSource.originalText 缺失",
                "expectedAnswer": expected_answer,
                "originalText": "",
                "unmatched": [],
            })
            continue

        original_text = data_source["originalText"]
        expected_numbers = extract_numbers(expected_answer)
        original_numbers = extract_numbers(original_text)
        calc_numbers = extract_numbers(calc_method)

        if not expected_numbers:
            # expectedAnswer 无数值（异常情况）
            log.warning(f"[{qid}] expectedAnswer 未提取到数值: {expected_answer}")
            inconsistent_count += 1
            inconsistencies.append({
                "id": qid,
                "query": item.get("query", ""),
                "reason": "expectedAnswer 未提取到数值",
                "expectedAnswer": expected_answer,
                "originalText": original_text,
                "unmatched": [],
            })
            continue

        unmatched = []
        matched_in_calc = []

        for exp_num in expected_numbers:
            # 主源：originalText
            matched, _, _ = find_match(exp_num, original_numbers)
            if matched:
                continue
            # 补充源：calculationMethod
            matched_calc, src_calc, variant_calc = find_match(exp_num, calc_numbers)
            if matched_calc:
                matched_in_calc.append((exp_num, src_calc, variant_calc))
                continue
            # 都未匹配
            unmatched.append(exp_num)

        if unmatched:
            inconsistent_count += 1
            # 找最接近的 originalText 数值用于差异报告
            closest = None
            closest_diff = float("inf")
            for exp_num in unmatched:
                for src_num in original_numbers:
                    for variant in generate_variants(src_num):
                        diff = abs(exp_num - variant)
                        if diff < closest_diff:
                            closest_diff = diff
                            closest = {
                                "expected": exp_num,
                                "src": src_num,
                                "variant": variant,
                                "diff": diff,
                            }

            inc = {
                "id": qid,
                "query": item.get("query", ""),
                "category": category,
                "expectedAnswer": expected_answer,
                "originalText": original_text,
                "calculationMethod": calc_method,
                "unmatched": unmatched,
                "matched_in_calc": [(e, s, v) for e, s, v in matched_in_calc],
                "closest": closest,
            }
            inconsistencies.append(inc)

            log.warning(f"[{qid}] 数值不一致！未匹配数值: {unmatched}")
            if closest:
                log.warning(f"  expectedAnswer 数值: {closest['expected']}")
                log.warning(f"  最接近的文档原文数值: {closest['src']} (换算后: {closest['variant']:.4f})")
                log.warning(f"  差异: {closest['diff']:.2f}")
            log.warning(f"  expectedAnswer: {expected_answer}")
            log.warning(f"  文档原文: {original_text[:150]}...")
            if matched_in_calc:
                log.info(f"  [补充] 以下数值在 calculationMethod 中找到匹配:")
                for e, s, v in matched_in_calc:
                    log.info(f"    {e} ↔ {s} (换算后 {v:.4f})")
            log.warning(f"  需要人工核查")
        else:
            consistent_count += 1
            detail = ""
            if matched_in_calc:
                detail = f"（其中 {len(matched_in_calc)} 个数值通过 calculationMethod 补充匹配）"
            log.debug(f"[{qid}] 一致 {detail}: {expected_answer[:60]}")

    log.info("")
    log.info(f"数值一致性汇总：一致 {consistent_count} 条，不一致 {inconsistent_count} 条")

    if inconsistencies:
        log.info("")
        log.info("不一致详情汇总：")
        for inc in inconsistencies:
            log.info(f"  [{inc['id']}] ({inc.get('category', '')}) 未匹配: {inc['unmatched']}")
            if inc.get("closest"):
                c = inc["closest"]
                log.info(f"    期望 {c['expected']} ↔ 文档 {c['src']} (换算 {c['variant']:.4f}), 差异 {c['diff']:.2f}")

    return consistent_count, inconsistent_count, inconsistencies


# ==================== 验证2：canAnswer 核对 ====================
def verify_cananswer(qa_data, search_cache):
    """验证2：对每条 canAnswer=true 的 query，检查知识库是否有对应数据."""
    log.info("")
    log.info("=" * 70)
    log.info("【验证2】canAnswer 核对（所有 canAnswer=true 的 query）")
    log.info("=" * 70)

    cananswer_true = [q for q in qa_data if q.get("canAnswer") is True]
    log.info(f"canAnswer=true 的 query 共 {len(cananswer_true)} 条")
    log.info("")

    has_data_count = 0
    no_data_count = 0
    search_failed_count = 0
    no_data_queries = []

    for i, item in enumerate(cananswer_true, 1):
        qid = item["id"]
        query = item.get("query", "")
        category = item.get("category", "")

        log.info(f"[{i}/{len(cananswer_true)}] [{qid}] 检索: {query[:60]}")

        result = search_knowledge_base(query, search_cache)
        if result is None:
            search_failed_count += 1
            log.warning(f"  [{qid}] 检索失败，跳过")
            continue

        results = result.get("results", [])
        # 判定"有数据"：results 非空且至少一条 text 非空
        has_data = len(results) > 0 and any(r.get("text", "").strip() for r in results)

        if has_data:
            has_data_count += 1
            top_score = results[0].get("score", 0) if results else 0
            log.debug(f"  [{qid}] 有数据（{len(results)} 条，top score: {top_score}）")
        else:
            no_data_count += 1
            no_data_queries.append({
                "id": qid,
                "query": query,
                "category": category,
            })
            log.warning(f"  [{qid}] canAnswer=true 但知识库无数据，需补数据")

    # 保存缓存
    save_json(SEARCH_CACHE_PATH, search_cache)

    log.info("")
    log.info(f"canAnswer 核对汇总：有数据 {has_data_count} 条，无数据 {no_data_count} 条，检索失败 {search_failed_count} 条")

    if no_data_queries:
        log.warning("")
        log.warning("⚠ canAnswer=true 但知识库无数据的 query（需补数据，不允许改 canAnswer=false）：")
        for q in no_data_queries:
            log.warning(f"  [{q['id']}] ({q['category']}) {q['query']}")

    return has_data_count, no_data_count, no_data_queries


# ==================== 验证3：dataSource 完整性 ====================
def verify_datasource_completeness(qa_data):
    """验证3：dataSource 完整性检查."""
    log.info("")
    log.info("=" * 70)
    log.info("【验证3】dataSource 完整性检查")
    log.info("=" * 70)

    required_fields = ["documentName", "documentId", "page", "originalText"]

    l1_l4_ok = 0
    l1_l4_fail = 0
    l1_l4_issues = []  # 严重问题
    l1_l4_warnings = []  # 警告（如 page=null）

    l5_l9_null = 0
    l5_l9_has = 0

    for item in qa_data:
        qid = item["id"]
        data_source = item.get("dataSource")

        if qid.startswith(("L1-", "L2-", "L3-", "L4-")):
            # L1-L4: dataSource 必须非 null，且包含四个字段
            if data_source is None:
                l1_l4_fail += 1
                l1_l4_issues.append({"id": qid, "issue": "dataSource 为 null"})
                continue

            critical_issues = []
            warnings = []

            for field in required_fields:
                if field not in data_source:
                    critical_issues.append(f"字段缺失: {field}")
                elif field != "page" and data_source[field] is None:
                    critical_issues.append(f"字段为 null: {field}")
                elif field != "page" and data_source[field] == "":
                    critical_issues.append(f"字段为空字符串: {field}")
                elif field == "page" and data_source[field] is None:
                    warnings.append("page 为 null（数据所在页码未提取）")

            if critical_issues:
                l1_l4_fail += 1
                l1_l4_issues.append({"id": qid, "issue": "; ".join(critical_issues)})
            else:
                l1_l4_ok += 1

            if warnings:
                l1_l4_warnings.append({"id": qid, "warning": "; ".join(warnings)})
        else:
            # L5-L9: dataSource 可以为 null
            if data_source is None:
                l5_l9_null += 1
            else:
                l5_l9_has += 1

    log.info(f"L1-L4 dataSource 完整性：完整 {l1_l4_ok} 条，不完整 {l1_l4_fail} 条")
    log.info(f"L5-L9 dataSource：null {l5_l9_null} 条，非 null {l5_l9_has} 条")

    if l1_l4_issues:
        log.warning("")
        log.warning("L1-L4 完整性问题（严重）：")
        for issue in l1_l4_issues:
            log.warning(f"  [{issue['id']}] {issue['issue']}")

    if l1_l4_warnings:
        log.info("")
        log.info(f"L1-L4 完整性警告（page=null，非失败项）：共 {len(l1_l4_warnings)} 条")
        for w in l1_l4_warnings[:10]:  # 只显示前10条
            log.info(f"  [{w['id']}] {w['warning']}")
        if len(l1_l4_warnings) > 10:
            log.info(f"  ... 还有 {len(l1_l4_warnings) - 10} 条")

    return l1_l4_ok, l1_l4_fail, l1_l4_issues, l5_l9_null, l5_l9_has


# ==================== 验证4：calculationMethod 检查 ====================
def verify_calculation_method(qa_data):
    """验证4：calculationMethod 检查."""
    log.info("")
    log.info("=" * 70)
    log.info("【验证4】calculationMethod 检查")
    log.info("=" * 70)

    l1_l4_ok = 0
    l1_l4_fail = 0
    l1_l4_issues = []

    l3_formula_ok = 0
    l3_formula_fail = 0
    l3_formula_issues = []

    for item in qa_data:
        qid = item["id"]
        category = item.get("category", "")
        calc_method = item.get("calculationMethod")

        if not qid.startswith(("L1-", "L2-", "L3-", "L4-")):
            continue

        # L1-L4 必须有 calculationMethod
        if not calc_method:
            l1_l4_fail += 1
            l1_l4_issues.append({"id": qid, "issue": "calculationMethod 缺失或为空"})
        else:
            l1_l4_ok += 1

        # L3-计算推理 必须包含计算公式（"=" 和 "×" 或 "/"）
        if category.startswith("L3-"):
            has_equal = "=" in calc_method
            has_multiply = "×" in calc_method
            has_divide = "/" in calc_method
            if has_equal and (has_multiply or has_divide):
                l3_formula_ok += 1
            else:
                l3_formula_fail += 1
                missing = []
                if not has_equal:
                    missing.append("'='")
                if not (has_multiply or has_divide):
                    missing.append("'×' 或 '/'")
                l3_formula_issues.append({
                    "id": qid,
                    "issue": f"计算公式缺少符号: {', '.join(missing)}",
                    "calculationMethod": calc_method,
                })

    log.info(f"L1-L4 calculationMethod 完整性：完整 {l1_l4_ok} 条，缺失 {l1_l4_fail} 条")
    log.info(f"L3 计算公式检查：符合 {l3_formula_ok} 条，不符合 {l3_formula_fail} 条")

    if l1_l4_issues:
        log.warning("")
        log.warning("L1-L4 calculationMethod 问题：")
        for issue in l1_l4_issues:
            log.warning(f"  [{issue['id']}] {issue['issue']}")

    if l3_formula_issues:
        log.warning("")
        log.warning("L3 计算公式问题：")
        for issue in l3_formula_issues:
            log.warning(f"  [{issue['id']}] {issue['issue']}")
            log.warning(f"    calculationMethod: {issue['calculationMethod']}")

    return l1_l4_ok, l1_l4_fail, l3_formula_ok, l3_formula_fail


# ==================== 主流程 ====================
def main():
    log.info("=" * 70)
    log.info("测试集 expectedAnswer 与知识库文档一致性验证")
    log.info(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info(f"测试集路径: {QA_PATH}")
    log.info(f"运行日志: {RUN_LOG_PATH}")
    log.info(f"错误日志: {ERROR_LOG_PATH}")
    log.info("=" * 70)

    # 1. 加载测试集
    if not QA_PATH.exists():
        log.error(f"测试集文件不存在: {QA_PATH}")
        sys.exit(2)
    with open(QA_PATH, encoding="utf-8") as f:
        qa_data = json.load(f)
    log.info(f"加载测试集: {len(qa_data)} 条")

    # 2. 检查服务可用性
    if not check_service_health():
        log.error("main_service 不可用，无法执行 canAnswer 核对")
        sys.exit(2)
    log.info("main_service 健康检查通过")

    # 3. 加载检索缓存
    search_cache = load_json(SEARCH_CACHE_PATH)
    log.info(f"检索缓存: {len(search_cache)} 条")
    log.info("")

    # 4. 执行四项验证
    num_consistent, num_inconsistent, num_issues = verify_numerical_consistency(qa_data)
    can_has_data, can_no_data, can_no_data_queries = verify_cananswer(qa_data, search_cache)
    ds_ok, ds_fail, ds_issues, ds_l5l9_null, ds_l5l9_has = verify_datasource_completeness(qa_data)
    cm_ok, cm_fail, l3_ok, l3_fail = verify_calculation_method(qa_data)

    # 5. 汇总报告
    log.info("")
    log.info("=" * 70)
    log.info("验证汇总报告")
    log.info("=" * 70)
    log.info(f"1. 数值一致性（L1-L4）：一致 {num_consistent} 条，不一致 {num_inconsistent} 条")
    log.info(f"2. canAnswer 核对：有数据 {can_has_data} 条，无数据 {can_no_data} 条")
    log.info(f"3. dataSource 完整性（L1-L4）：完整 {ds_ok} 条，不完整 {ds_fail} 条")
    log.info(f"4. calculationMethod（L1-L4）：完整 {cm_ok} 条，缺失 {cm_fail} 条")
    log.info(f"5. L3 计算公式：符合 {l3_ok} 条，不符合 {l3_fail} 条")

    # 6. 判断是否通过
    passed = True
    failures = []

    if num_inconsistent > 0:
        passed = False
        failures.append(f"数值不一致 {num_inconsistent} 条")
    if ds_fail > 0:
        passed = False
        failures.append(f"dataSource 不完整 {ds_fail} 条")
    if cm_fail > 0:
        passed = False
        failures.append(f"calculationMethod 缺失 {cm_fail} 条")
    if l3_fail > 0:
        passed = False
        failures.append(f"L3 计算公式不符合 {l3_fail} 条")

    # canAnswer 无数据属于警告，不直接导致失败（需补数据，但不影响本次验证通过性）
    # 但如果有大量无数据，提示用户
    cananswer_warning = can_no_data > 0

    log.info("")
    if passed:
        log.info("=" * 70)
        log.info("✓ 验证通过")
        log.info("=" * 70)
        if cananswer_warning:
            log.info(f"⚠ 警告: canAnswer=true 但知识库无数据 {can_no_data} 条，需补数据")
            log.info("   （警告不导致验证失败，但需人工补数据，不允许改 canAnswer=false）")
        log.info(f"运行日志: {RUN_LOG_PATH}")
        sys.exit(0)
    else:
        log.error("=" * 70)
        log.error("✗ 验证失败")
        log.error("=" * 70)
        log.error(f"失败原因: {'; '.join(failures)}")
        if cananswer_warning:
            log.error(f"⚠ 警告: canAnswer=true 但知识库无数据 {can_no_data} 条，需补数据")
        log.error(f"运行日志: {RUN_LOG_PATH}")
        log.error(f"错误日志: {ERROR_LOG_PATH}")
        sys.exit(1)


if __name__ == "__main__":
    main()
