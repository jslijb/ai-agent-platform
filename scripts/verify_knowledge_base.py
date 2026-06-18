"""
知识库验证脚本
验证各类数据是否可被搜索到，确认知识库数据完整性

验证类别：
  - 财报: "江苏银行2025年营业收入是多少？"
  - 交易规则: "A股主板涨跌幅限制是多少？"
  - 法规: "证券投资咨询管理办法"
  - 技术指标: "MACD金叉含义"

搜索API: POST http://localhost:3001/api/rag/search
  - 请求体: {"query": "xxx", "topK": 5}
  - 确认每个类别的 Hits@K > 0
  - 输出验证报告和缺失数据汇总
"""

import os
import sys
import time
import json
import logging
import requests
from datetime import datetime

# ====== 日志配置 ======
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(
            os.path.join(LOG_DIR, "verify_knowledge_base.log"),
            encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger("VerifyKB")

error_logger = logging.getLogger("VerifyKBError")
error_logger.setLevel(logging.ERROR)
error_handler = logging.FileHandler(
    os.path.join(LOG_DIR, "verify_knowledge_base_error.log"),
    encoding="utf-8",
)
error_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
error_logger.addHandler(error_handler)

# ====== 配置 ======
BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000")
SEARCH_API = f"{BASE_URL}/api/rag/search"
LIST_API = f"{BASE_URL}/api/document/list"
USER_ID = os.environ.get("TEST_USER_ID", "69ea0f70-00a0-426b-aa5f-0e198d0f69d3")

# 验证查询列表
VERIFY_QUERIES = [
    {
        "category": "财报",
        "query": "江苏银行2025年营业收入是多少？",
        "expected_keywords": ["江苏银行", "营业收入", "2025"],
        "description": "验证财报数据是否可搜索",
    },
    {
        "category": "财报",
        "query": "东吴证券2025年净利润",
        "expected_keywords": ["东吴证券", "净利润"],
        "description": "验证东吴证券财报数据",
    },
    {
        "category": "财报",
        "query": "华海药业2026年第一季度业绩",
        "expected_keywords": ["华海药业", "第一季度"],
        "description": "验证华海药业一季报数据",
    },
    {
        "category": "财报",
        "query": "片仔癀2025年年度报告",
        "expected_keywords": ["片仔癀", "年度报告"],
        "description": "验证片仔癀年报数据",
    },
    {
        "category": "交易规则",
        "query": "A股主板涨跌幅限制是多少？",
        "expected_keywords": ["涨跌幅", "限制", "10%"],
        "description": "验证交易规则数据是否可搜索",
    },
    {
        "category": "交易规则",
        "query": "上海证券交易所交易规则",
        "expected_keywords": ["上海证券交易所", "交易规则"],
        "description": "验证上交所交易规则",
    },
    {
        "category": "交易规则",
        "query": "深圳证券交易所交易规则",
        "expected_keywords": ["深圳证券交易所", "交易规则"],
        "description": "验证深交所交易规则",
    },
    {
        "category": "法规",
        "query": "证券投资咨询管理办法",
        "expected_keywords": ["证券投资咨询", "管理办法"],
        "description": "验证法规数据是否可搜索",
    },
    {
        "category": "法规",
        "query": "证券法投资者保护",
        "expected_keywords": ["证券法", "投资者"],
        "description": "验证证券法数据",
    },
    {
        "category": "法规",
        "query": "证券期货投资者适当性管理办法",
        "expected_keywords": ["适当性", "投资者"],
        "description": "验证适当性管理办法",
    },
    {
        "category": "技术指标",
        "query": "MACD金叉含义",
        "expected_keywords": ["MACD", "金叉"],
        "description": "验证技术指标知识是否可搜索",
    },
    {
        "category": "技术指标",
        "query": "PE市盈率怎么计算",
        "expected_keywords": ["PE", "市盈率"],
        "description": "验证PE指标知识",
    },
    {
        "category": "技术指标",
        "query": "KDJ超买超卖判断",
        "expected_keywords": ["KDJ", "超买"],
        "description": "验证KDJ指标知识",
    },
]


def search_knowledge_base(query: str, top_k: int = 5) -> dict:
    """调用搜索API查询知识库"""
    try:
        payload = {
            "query": query,
            "topK": top_k,
            "mode": "hybrid",
            "useGraph": True,
            "useRerank": True,
            "useParentDoc": True,
        }
        headers = {
            "Content-Type": "application/json",
            "x-test-user-id": USER_ID,
        }
        resp = requests.post(
            SEARCH_API,
            json=payload,
            headers=headers,
            timeout=60,
        )
        data = resp.json()
        return data
    except requests.Timeout:
        logger.error(f"搜索超时: {query}")
        return {"success": False, "message": "搜索超时"}
    except requests.RequestException as e:
        logger.error(f"搜索异常: {e}")
        return {"success": False, "message": str(e)}
    except Exception as e:
        logger.error(f"未知异常: {e}")
        return {"success": False, "message": str(e)}


def get_document_stats() -> dict:
    """获取文档统计信息"""
    try:
        resp = requests.get(
            LIST_API,
            headers={"x-test-user-id": USER_ID},
            timeout=30,
        )
        data = resp.json()
        if data.get("success"):
            docs = data.get("documents", [])
            stats = {
                "total": len(docs),
                "completed": 0,
                "processing": 0,
                "failed": 0,
                "pending": 0,
                "by_type": {},
            }
            for doc in docs:
                status = doc.get("status", "unknown")
                if status in stats:
                    stats[status] += 1
                doc_type = doc.get("documentType", "unknown")
                if doc_type not in stats["by_type"]:
                    stats["by_type"][doc_type] = 0
                stats["by_type"][doc_type] += 1
            return stats
        return {"total": 0}
    except Exception as e:
        logger.warning(f"获取文档统计异常: {e}")
        return {"total": 0}


def main():
    start_time = datetime.now()
    logger.info("=" * 60)
    logger.info("  知识库验证脚本")
    logger.info(f"  API地址: {BASE_URL}")
    logger.info(f"  验证查询数: {len(VERIFY_QUERIES)}")
    logger.info("=" * 60)

    # 检查API连通性
    try:
        resp = requests.get(f"{BASE_URL}/api/health", timeout=10)
        logger.info(f"API连通性检查: HTTP {resp.status_code}")
    except requests.RequestException as e:
        logger.error(f"API不可用: {e}")
        logger.error("请确认服务已启动后再运行此脚本")
        return

    # 获取文档统计
    doc_stats = get_document_stats()
    logger.info(f"\n当前知识库文档统计:")
    logger.info(f"  总文档数: {doc_stats.get('total', 0)}")
    logger.info(f"  已完成: {doc_stats.get('completed', 0)}")
    logger.info(f"  处理中: {doc_stats.get('processing', 0)}")
    logger.info(f"  失败: {doc_stats.get('failed', 0)}")

    # 执行验证查询
    results = []
    category_results = {}

    for i, query_info in enumerate(VERIFY_QUERIES, 1):
        category = query_info["category"]
        query = query_info["query"]
        expected = query_info["expected_keywords"]
        description = query_info["description"]

        logger.info(f"\n[{i}/{len(VERIFY_QUERIES)}] 类别: {category}")
        logger.info(f"  查询: {query}")
        logger.info(f"  说明: {description}")

        # 执行搜索
        search_result = search_knowledge_base(query, top_k=5)

        # 分析结果
        if not search_result.get("success"):
            logger.error(f"  ❌ 搜索失败: {search_result.get('message', '未知错误')}")
            verify_result = {
                "category": category,
                "query": query,
                "description": description,
                "status": "FAIL",
                "reason": f"搜索API失败: {search_result.get('message', '未知')}",
                "hits": 0,
                "keyword_match": [],
            }
            results.append(verify_result)
            if category not in category_results:
                category_results[category] = {"pass": 0, "fail": 0, "queries": []}
            category_results[category]["fail"] += 1
            category_results[category]["queries"].append(verify_result)
            continue

        # 获取搜索结果
        search_results = search_result.get("results", [])
        hits = len(search_results)
        logger.info(f"  返回结果数: {hits}")

        # 检查关键词匹配
        keyword_matches = []
        if hits > 0:
            for kw in expected:
                found = False
                for result in search_results:
                    text = result.get("text", "")
                    if kw in text:
                        found = True
                        break
                if found:
                    keyword_matches.append(kw)

            # 显示前3条结果摘要
            for j, result in enumerate(search_results[:3]):
                text = result.get("text", "")
                score = result.get("score", 0)
                source = result.get("source", "")
                snippet = text[:100].replace("\n", " ") if text else "(空)"
                logger.info(f"  结果{j+1}: [score={score:.4f}, source={source}] {snippet}...")

        # 判断验证结果
        match_ratio = len(keyword_matches) / len(expected) if expected else 0
        if hits > 0 and match_ratio >= 0.5:
            status = "PASS"
            status_icon = "✅"
        elif hits > 0:
            status = "PARTIAL"
            status_icon = "⚠️"
        else:
            status = "FAIL"
            status_icon = "❌"

        logger.info(f"  {status_icon} 状态: {status}, 关键词匹配: {keyword_matches}/{expected}")

        verify_result = {
            "category": category,
            "query": query,
            "description": description,
            "status": status,
            "hits": hits,
            "keyword_match": keyword_matches,
            "expected_keywords": expected,
            "match_ratio": round(match_ratio, 2),
        }
        results.append(verify_result)

        if category not in category_results:
            category_results[category] = {"pass": 0, "partial": 0, "fail": 0, "queries": []}
        if status == "PASS":
            category_results[category]["pass"] += 1
        elif status == "PARTIAL":
            category_results[category]["partial"] += 1
        else:
            category_results[category]["fail"] += 1
        category_results[category]["queries"].append(verify_result)

        # 搜索间隔
        time.sleep(1)

    # 输出验证报告
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    logger.info("\n" + "=" * 60)
    logger.info("  知识库验证报告")
    logger.info("=" * 60)

    # 按类别汇总
    all_pass = True
    missing_data = []

    for category, cat_result in category_results.items():
        total_queries = cat_result["pass"] + cat_result.get("partial", 0) + cat_result["fail"]
        pass_rate = cat_result["pass"] / total_queries * 100 if total_queries > 0 else 0

        logger.info(f"\n  【{category}】")
        logger.info(f"    通过: {cat_result['pass']}, 部分通过: {cat_result.get('partial', 0)}, 失败: {cat_result['fail']}")
        logger.info(f"    通过率: {pass_rate:.0f}%")

        if cat_result["fail"] > 0:
            all_pass = False
            # 收集缺失数据
            for q in cat_result["queries"]:
                if q["status"] == "FAIL":
                    missing_data.append({
                        "category": category,
                        "query": q["query"],
                        "description": q["description"],
                        "reason": q.get("reason", f"搜索无结果 (hits={q['hits']})"),
                    })

    # 总体统计
    total_pass = sum(r["status"] == "PASS" for r in results)
    total_partial = sum(r["status"] == "PARTIAL" for r in results)
    total_fail = sum(r["status"] == "FAIL" for r in results)

    logger.info(f"\n  --- 总体统计 ---")
    logger.info(f"    总查询数: {len(results)}")
    logger.info(f"    通过: {total_pass}")
    logger.info(f"    部分通过: {total_partial}")
    logger.info(f"    失败: {total_fail}")
    logger.info(f"    总通过率: {total_pass / len(results) * 100:.0f}%")
    logger.info(f"    耗时: {duration:.0f}秒")

    # 缺失数据汇总
    if missing_data:
        logger.info("\n" + "!" * 60)
        logger.info("  缺失数据汇总:")
        logger.info("!" * 60)
        for i, item in enumerate(missing_data, 1):
            logger.info(f"\n  [{i}] 类别: {item['category']}")
            logger.info(f"      查询: {item['query']}")
            logger.info(f"      说明: {item['description']}")
            logger.info(f"      原因: {item['reason']}")

        # 给出补充建议
        logger.info("\n  --- 补充建议 ---")
        categories_with_issues = set(item["category"] for item in missing_data)
        if "财报" in categories_with_issues:
            logger.info("  - 财报数据缺失: 运行 scripts/batch_upload_reports.py 上传财报")
        if "交易规则" in categories_with_issues:
            logger.info("  - 交易规则缺失: 运行 scripts/download_trading_rules.py 下载交易规则")
        if "法规" in categories_with_issues:
            logger.info("  - 法规数据缺失: 运行 scripts/download_regulations.py 下载法规文档")
        if "技术指标" in categories_with_issues:
            logger.info("  - 技术指标缺失: 运行 scripts/download_knowledge_docs.py 下载知识文档")
    else:
        logger.info("\n  ✅ 所有类别数据验证通过，知识库数据完整！")

    logger.info("\n" + "=" * 60)

    # 保存验证报告
    report = {
        "timestamp": datetime.now().isoformat(),
        "duration_seconds": round(duration),
        "document_stats": doc_stats,
        "summary": {
            "total_queries": len(results),
            "pass": total_pass,
            "partial": total_partial,
            "fail": total_fail,
            "pass_rate": round(total_pass / len(results) * 100, 1),
        },
        "category_results": {
            cat: {
                "pass": data["pass"],
                "partial": data.get("partial", 0),
                "fail": data["fail"],
            }
            for cat, data in category_results.items()
        },
        "missing_data": missing_data,
        "details": results,
    }

    report_dir = os.path.join(BASE_DIR, "tests", "reports")
    os.makedirs(report_dir, exist_ok=True)
    report_path = os.path.join(report_dir, f"kb_verify_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    logger.info(f"验证报告已保存: {report_path}")


if __name__ == "__main__":
    main()
