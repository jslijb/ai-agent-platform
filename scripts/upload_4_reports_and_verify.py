"""
上传 4 家公司 2025 年年度报告 PDF 到知识库，并验证检索命中率。
支持断点续传：上传前检查已有文档，跳过已入库的。
上传后轮询文档状态直到 completed。
最后对 4 家公司各执行 1 个代表性 query 测试检索。

使用方式（PowerShell）：
    conda activate bigmodel
    python scripts/upload_4_reports_and_verify.py
"""

import os
import sys
import time
import json
import logging
from datetime import datetime

import requests

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
            os.path.join(LOG_DIR, "upload_4_reports_and_verify.log"),
            encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger("UploadVerify")

error_logger = logging.getLogger("UploadVerifyError")
error_logger.setLevel(logging.ERROR)
error_handler = logging.FileHandler(
    os.path.join(LOG_DIR, "upload_4_reports_and_verify_error.log"),
    encoding="utf-8",
)
error_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
error_logger.addHandler(error_handler)

# ====== 配置 ======
BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000")
UPLOAD_API = f"{BASE_URL}/api/document/upload"
LIST_API = f"{BASE_URL}/api/document/list"
SEARCH_API = f"{BASE_URL}/api/rag/search"
HEALTH_API = f"{BASE_URL}/api/health"
USER_ID = os.environ.get("TEST_USER_ID", "69ea0f70-00a0-426b-aa5f-0e198d0f69d3")

REPORTS_DIR = os.path.join(BASE_DIR, "data", "financial_reports")

# 待上传的 4 份 2025 年年度报告 PDF（位于 data/financial_reports/ 根目录）
REPORT_FILES = [
    {"company": "片仔癀", "code": "600436", "filename": "片仔癀_600436_2025年年度报告.pdf"},
    {"company": "华海药业", "code": "600521", "filename": "华海药业_600521_2025年年度报告.pdf"},
    {"company": "江苏银行", "code": "600919", "filename": "江苏银行_600919_2025年年度报告.pdf"},
    {"company": "东吴证券", "code": "601555", "filename": "东吴证券_601555_2025年年度报告.pdf"},
]

# 每家公司的代表性检索 query
VERIFY_QUERIES = [
    {"company": "片仔癀", "query": "片仔癀2025年营业收入"},
    {"company": "华海药业", "query": "华海药业2025年净利润"},
    {"company": "江苏银行", "query": "江苏银行2025年净利润"},
    {"company": "东吴证券", "query": "东吴证券2025年营业收入"},
]

# 轮询文档状态的参数
POLL_INTERVAL = 15  # 秒
POLL_TIMEOUT = 1800  # 30 分钟上限（PDF 较大，解析 + embedding 可能较慢）

# completed / partial 都视为处理完成（partial 表示图谱构建失败但文本检索可用）
DONE_STATUSES = {"completed", "partial"}


def headers():
    return {"x-test-user-id": USER_ID}


def check_health() -> bool:
    """检查 API 健康状态"""
    try:
        resp = requests.get(HEALTH_API, timeout=30)
        data = resp.json()
        status = data.get("status")
        checks = data.get("checks", {})
        logger.info(f"健康检查: overall={status}")
        for name, info in checks.items():
            logger.info(f"  - {name}: {info.get('status')} (latency={info.get('latency')}ms)")
        # embedding 和 database 必须可用
        embedding_ok = checks.get("embedding", {}).get("status") == "up"
        db_ok = checks.get("database", {}).get("status") == "up"
        if not (embedding_ok and db_ok):
            logger.error("关键服务（database/embedding）不可用，无法继续")
            return False
        return True
    except Exception as e:
        logger.error(f"健康检查失败: {e}")
        return False


def get_existing_documents() -> dict:
    """获取已有文档列表，返回 {fileName: doc_info} 字典"""
    try:
        resp = requests.get(LIST_API, headers=headers(), timeout=30)
        data = resp.json()
        if data.get("success"):
            docs = data.get("documents", [])
            existing = {}
            for doc in docs:
                fname = doc.get("fileName", "")
                existing[fname] = {
                    "id": doc.get("id"),
                    "status": doc.get("status", ""),
                    "chunkCount": doc.get("chunkCount", 0),
                }
            completed = sum(1 for d in docs if d.get("status") in DONE_STATUSES)
            logger.info(f"已有文档数量: {len(docs)}, 已完成(completed/partial): {completed}")
            return existing
        else:
            logger.warning(f"获取文档列表失败: {data.get('message', '未知错误')}")
            return {}
    except requests.RequestException as e:
        logger.warning(f"获取文档列表异常: {e}")
        return {}


def upload_file(file_path: str) -> dict:
    """上传单个 PDF 到知识库"""
    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    logger.info(f"开始上传: {filename} ({file_size / 1024 / 1024:.2f} MB)")

    try:
        with open(file_path, "rb") as f:
            files = {"file": (filename, f, "application/pdf")}
            resp = requests.post(
                UPLOAD_API,
                files=files,
                headers=headers(),
                timeout=600,
            )
        data = resp.json()
        if data.get("success"):
            doc_id = data.get("documentId", "")
            logger.info(f"上传成功: {filename}, documentId={doc_id}")
            return {"success": True, "documentId": doc_id}
        else:
            msg = data.get("message", "未知错误")
            logger.error(f"上传失败: {filename}, 原因: {msg}")
            error_logger.error(f"上传失败: {filename}, 原因: {msg}")
            return {"success": False, "message": msg}
    except requests.Timeout:
        msg = "上传超时（600秒）"
        logger.error(f"上传失败: {filename}, 原因: {msg}")
        error_logger.error(f"上传失败: {filename}, 原因: {msg}")
        return {"success": False, "message": msg}
    except Exception as e:
        msg = str(e)
        logger.error(f"上传异常: {filename}, 原因: {msg}")
        error_logger.error(f"上传异常: {filename}, 原因: {msg}")
        return {"success": False, "message": msg}


def poll_document_status(filename: str, existing_docs: dict) -> dict:
    """轮询文档状态直到完成或失败"""
    start = time.time()
    last_status = None
    while time.time() - start < POLL_TIMEOUT:
        # 重新获取文档列表以拿到最新状态
        docs = get_existing_documents()
        doc_info = docs.get(filename)
        if not doc_info:
            logger.warning(f"轮询时未找到文档: {filename}")
            time.sleep(POLL_INTERVAL)
            continue

        status = doc_info["status"]
        chunk_count = doc_info["chunkCount"]
        if status != last_status:
            logger.info(f"文档状态变更: {filename} -> {status} (chunks={chunk_count})")
            last_status = status

        if status in DONE_STATUSES:
            logger.info(f"文档处理完成: {filename}, 状态={status}, 分块数={chunk_count}")
            return {"success": True, "status": status, "chunkCount": chunk_count, "documentId": doc_info["id"]}
        if status == "failed":
            msg = f"文档处理失败: {filename}"
            logger.error(msg)
            error_logger.error(msg)
            return {"success": False, "status": status, "message": msg}

        time.sleep(POLL_INTERVAL)

    msg = f"轮询超时({POLL_TIMEOUT}s): {filename}, 最后状态={last_status}"
    logger.error(msg)
    error_logger.error(msg)
    return {"success": False, "status": last_status, "message": msg}


def search(query: str, top_k: int = 5) -> dict:
    """执行 RAG 检索"""
    body = {
        "query": query,
        "topK": top_k,
        "mode": "hybrid",
        "useGraph": True,
        "useRerank": True,
        "useParentDoc": True,
    }
    try:
        resp = requests.post(SEARCH_API, json=body, headers=headers(), timeout=120)
        data = resp.json()
        return data
    except Exception as e:
        logger.error(f"检索异常: query={query}, 原因: {e}")
        error_logger.error(f"检索异常: query={query}, 原因: {e}")
        return {"success": False, "message": str(e)}


def main():
    start_time = datetime.now()
    logger.info("=" * 70)
    logger.info("  上传 4 家公司 2025 年年度报告 PDF 并验证检索")
    logger.info(f"  API: {BASE_URL}")
    logger.info(f"  用户ID: {USER_ID}")
    logger.info(f"  文件目录: {REPORTS_DIR}")
    logger.info(f"  文件数量: {len(REPORT_FILES)}")
    logger.info("=" * 70)

    # 1. 健康检查
    if not check_health():
        logger.error("服务不健康，终止")
        return

    # 2. 获取已有文档（断点续传）
    existing_docs = get_existing_documents()

    # 3. 上传 4 个 PDF
    upload_results = []
    for info in REPORT_FILES:
        company = info["company"]
        filename = info["filename"]
        file_path = os.path.join(REPORTS_DIR, filename)

        logger.info(f"\n--- 处理: {company} ({info['code']}) ---")

        if not os.path.exists(file_path):
            msg = f"文件不存在: {file_path}"
            logger.error(msg)
            error_logger.error(msg)
            upload_results.append({"company": company, "filename": filename, "status": "文件不存在", "success": False})
            continue

        # 断点续传检查
        doc_info = existing_docs.get(filename)
        if doc_info and doc_info["status"] in DONE_STATUSES:
            logger.info(f"跳过(已入库): {filename}, 状态={doc_info['status']}, chunks={doc_info['chunkCount']}")
            upload_results.append({
                "company": company,
                "filename": filename,
                "status": doc_info["status"],
                "chunkCount": doc_info["chunkCount"],
                "documentId": doc_info["id"],
                "success": True,
                "skipped": True,
            })
            continue

        if doc_info and doc_info["status"] == "processing":
            logger.info(f"文档处理中，等待完成: {filename}")
            result = poll_document_status(filename, existing_docs)
            upload_results.append({
                "company": company,
                "filename": filename,
                "status": result.get("status"),
                "chunkCount": result.get("chunkCount"),
                "documentId": result.get("documentId"),
                "success": result.get("success", False),
                "skipped": True,
            })
            continue

        # 需要上传
        if doc_info and doc_info["status"] not in DONE_STATUSES:
            logger.info(f"文档状态={doc_info['status']}，重新上传: {filename}")

        result = upload_file(file_path)
        if not result["success"]:
            upload_results.append({
                "company": company,
                "filename": filename,
                "status": f"上传失败: {result.get('message', '')}",
                "success": False,
            })
            continue

        # 上传成功后等待一小段时间让记录写入
        time.sleep(3)
        # 轮询处理状态
        poll_result = poll_document_status(filename, get_existing_documents())
        upload_results.append({
            "company": company,
            "filename": filename,
            "status": poll_result.get("status"),
            "chunkCount": poll_result.get("chunkCount"),
            "documentId": poll_result.get("documentId") or result.get("documentId"),
            "success": poll_result.get("success", False),
            "skipped": False,
        })

    # 4. 输出上传汇总
    logger.info("\n" + "=" * 70)
    logger.info("  上传汇总")
    logger.info("=" * 70)
    for r in upload_results:
        icon = "✅" if r.get("success") else "❌"
        skip = "(跳过)" if r.get("skipped") else ""
        logger.info(
            f"  {icon} [{r['company']}] {r['filename']} -> status={r.get('status')}, "
            f"chunks={r.get('chunkCount')} {skip}"
        )

    success_count = sum(1 for r in upload_results if r.get("success"))
    fail_count = sum(1 for r in upload_results if not r.get("success"))
    logger.info(f"  成功: {success_count}/{len(upload_results)}, 失败: {fail_count}")

    # 5. 检索验证
    logger.info("\n" + "=" * 70)
    logger.info("  检索验证")
    logger.info("=" * 70)

    search_results = []
    for q in VERIFY_QUERIES:
        company = q["company"]
        query = q["query"]
        logger.info(f"\n--- 检索: [{company}] {query} ---")
        result = search(query, top_k=5)
        if not result.get("success"):
            logger.error(f"检索失败: [{company}] {result.get('message', '')}")
            search_results.append({"company": company, "query": query, "hitCount": 0, "success": False})
            continue

        results = result.get("results", [])
        hit_count = len(results)
        logger.info(f"  Hits: {hit_count}")
        for i, item in enumerate(results[:3]):
            text_preview = (item.get("text") or "")[:80].replace("\n", " ")
            doc_id = item.get("documentId", "")
            score = item.get("score", 0)
            source = item.get("source", "")
            logger.info(f"  [{i + 1}] score={score:.4f} source={source} docId={doc_id[:8]}... text={text_preview}")

        search_results.append({
            "company": company,
            "query": query,
            "hitCount": hit_count,
            "success": hit_count > 0,
        })

    # 6. 最终验证报告
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    logger.info("\n" + "=" * 70)
    logger.info("  最终验证报告")
    logger.info("=" * 70)
    logger.info(f"  开始时间: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"  结束时间: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"  总耗时: {duration:.0f}秒 ({duration / 60:.1f}分钟)")
    logger.info("")
    logger.info("  [文档上传]")
    all_upload_ok = True
    for r in upload_results:
        icon = "✅" if r.get("success") else "❌"
        logger.info(f"    {icon} {r['company']}: status={r.get('status')}, chunks={r.get('chunkCount')}")
        if not r.get("success"):
            all_upload_ok = False

    logger.info("")
    logger.info("  [检索命中]")
    all_search_ok = True
    for r in search_results:
        icon = "✅" if r.get("success") else "❌"
        logger.info(f"    {icon} {r['company']}: query='{r['query']}', Hits@5={r['hitCount']}")
        if not r.get("success"):
            all_search_ok = False

    logger.info("")
    if all_upload_ok and all_search_ok:
        logger.info("  ✅ 全部验证通过：4 份文档已入库且 4 个 query 检索命中")
    else:
        if not all_upload_ok:
            logger.error("  ❌ 文档上传存在失败项")
        if not all_search_ok:
            logger.error("  ❌ 检索验证存在未命中项")
    logger.info("=" * 70)

    # 把结果写到临时 JSON 便于后续读取
    report_path = os.path.join(LOG_DIR, "upload_4_reports_result.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "uploadResults": upload_results,
            "searchResults": search_results,
            "allUploadOk": all_upload_ok,
            "allSearchOk": all_search_ok,
            "duration": duration,
        }, f, ensure_ascii=False, indent=2)
    logger.info(f"结果已写入: {report_path}")


if __name__ == "__main__":
    main()
