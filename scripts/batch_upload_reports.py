"""
批量上传财报到知识库
上传4家公司（江苏银行、东吴证券、华海药业、片仔癀）的2025年报和2026一季报
支持断点续传：上传前检查已有文档，跳过已上传的文件
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
            os.path.join(LOG_DIR, "batch_upload_reports.log"),
            encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger("BatchUpload")

# 错误日志单独记录
error_logger = logging.getLogger("BatchUploadError")
error_logger.setLevel(logging.ERROR)
error_handler = logging.FileHandler(
    os.path.join(LOG_DIR, "batch_upload_reports_error.log"),
    encoding="utf-8",
)
error_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
error_logger.addHandler(error_handler)

# ====== 配置 ======
BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000")
UPLOAD_API = f"{BASE_URL}/api/document/upload"
LIST_API = f"{BASE_URL}/api/document/list"
USER_ID = os.environ.get("TEST_USER_ID", "69ea0f70-00a0-426b-aa5f-0e198d0f69d3")
UPLOAD_INTERVAL = 5  # 上传间隔（秒）

REPORTS_BASE_DIR = os.path.join(BASE_DIR, "data", "financial_reports")

# 待上传的财报文件列表
REPORT_FILES = [
    # 江苏银行
    {
        "company": "江苏银行",
        "code": "600919",
        "files": [
            {"subdir": "2025_annual", "filename": "600919_江苏银行_江苏银行2025年年度报告.pdf"},
            {"subdir": "2026_q1", "filename": "600919_江苏银行_江苏银行2026年第一季度报告.pdf"},
        ],
    },
    # 东吴证券
    {
        "company": "东吴证券",
        "code": "601555",
        "files": [
            {"subdir": "2025_annual", "filename": "601555_东吴证券_东吴证券股份有限公司2025年年度报告.pdf"},
            {"subdir": "2026_q1", "filename": "601555_东吴证券_东吴证券股份有限公司2026年第一季度报告.pdf"},
        ],
    },
    # 华海药业
    {
        "company": "华海药业",
        "code": "600521",
        "files": [
            {"subdir": "2025_annual", "filename": "600521_华海药业_浙江华海药业股份有限公司2025年年度报告.pdf"},
            {"subdir": "2026_q1", "filename": "600521_华海药业_浙江华海药业股份有限公司2026年第一季度报告.pdf"},
        ],
    },
    # 片仔癀
    {
        "company": "片仔癀",
        "code": "600436",
        "files": [
            {"subdir": "2025_annual", "filename": "600436_片仔癀_漳州片仔癀药业股份有限公司2025年年度报告.pdf"},
            {"subdir": "2026_q1", "filename": "600436_片仔癀_漳州片仔癀药业股份有限公司2026年第一季度报告.pdf"},
        ],
    },
]


def get_existing_documents() -> dict:
    """获取已有文档列表，用于断点续传"""
    try:
        resp = requests.get(
            LIST_API,
            headers={"x-test-user-id": USER_ID},
            timeout=30,
        )
        data = resp.json()
        if data.get("success"):
            docs = data.get("documents", [])
            # 以文件名为key，构建已上传文档字典
            existing = {}
            for doc in docs:
                fname = doc.get("fileName", "")
                status = doc.get("status", "")
                existing[fname] = {
                    "id": doc.get("id"),
                    "status": status,
                    "chunkCount": doc.get("chunkCount", 0),
                }
            logger.info(f"已有文档数量: {len(docs)}, 已完成: {sum(1 for d in docs if d.get('status') == 'completed')}")
            return existing
        else:
            logger.warning(f"获取文档列表失败: {data.get('message', '未知错误')}")
            return {}
    except requests.RequestException as e:
        logger.warning(f"获取文档列表异常: {e}")
        return {}


def upload_file(file_path: str) -> dict:
    """上传单个文件到知识库"""
    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    logger.info(f"开始上传: {filename} ({file_size / 1024 / 1024:.2f} MB)")

    try:
        with open(file_path, "rb") as f:
            files = {"file": (filename, f, "application/pdf")}
            headers = {"x-test-user-id": USER_ID}
            resp = requests.post(
                UPLOAD_API,
                files=files,
                headers=headers,
                timeout=600,
            )

        data = resp.json()
        if data.get("success"):
            doc_id = data.get("documentId", "")
            chunk_count = data.get("chunkCount", 0)
            logger.info(f"上传成功: {filename}, documentId={doc_id}, 分块数={chunk_count}")
            return {"success": True, "documentId": doc_id, "chunkCount": chunk_count}
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
    except requests.RequestException as e:
        msg = str(e)
        logger.error(f"上传异常: {filename}, 原因: {msg}")
        error_logger.error(f"上传异常: {filename}, 原因: {msg}")
        return {"success": False, "message": msg}
    except Exception as e:
        msg = str(e)
        logger.error(f"未知异常: {filename}, 原因: {msg}")
        error_logger.error(f"未知异常: {filename}, 原因: {msg}")
        return {"success": False, "message": msg}


def main():
    start_time = datetime.now()
    logger.info("=" * 60)
    logger.info("  财报批量上传脚本")
    logger.info(f"  API地址: {BASE_URL}")
    logger.info(f"  上传间隔: {UPLOAD_INTERVAL}秒")
    logger.info(f"  目标公司: 江苏银行、东吴证券、华海药业、片仔癀")
    logger.info(f"  文件数量: 8份（4家公司 × 2份报告）")
    logger.info("=" * 60)

    # 检查API连通性
    try:
        resp = requests.get(f"{BASE_URL}/api/health", timeout=10)
        logger.info(f"API连通性检查: HTTP {resp.status_code}")
    except requests.RequestException as e:
        logger.error(f"API不可用: {e}")
        logger.error("请确认服务已启动后再运行此脚本")
        return

    # 获取已有文档（断点续传）
    existing_docs = get_existing_documents()

    # 统计
    total = 0
    success_count = 0
    skip_count = 0
    fail_count = 0
    results = []

    for company_info in REPORT_FILES:
        company = company_info["company"]
        code = company_info["code"]
        logger.info(f"\n--- 处理公司: {company} ({code}) ---")

        for file_info in company_info["files"]:
            total += 1
            subdir = file_info["subdir"]
            filename = file_info["filename"]
            file_path = os.path.join(REPORTS_BASE_DIR, subdir, filename)

            # 检查文件是否存在
            if not os.path.exists(file_path):
                logger.error(f"文件不存在: {file_path}")
                error_logger.error(f"文件不存在: {file_path}")
                fail_count += 1
                results.append({"company": company, "filename": filename, "status": "文件不存在"})
                continue

            # 检查是否已上传（断点续传）
            if filename in existing_docs:
                doc_info = existing_docs[filename]
                if doc_info["status"] == "completed":
                    logger.info(f"跳过（已上传）: {filename}, 状态={doc_info['status']}, 分块数={doc_info['chunkCount']}")
                    skip_count += 1
                    results.append({
                        "company": company,
                        "filename": filename,
                        "status": "已跳过",
                        "documentId": doc_info["id"],
                    })
                    continue
                elif doc_info["status"] == "processing":
                    logger.info(f"跳过（处理中）: {filename}, 状态=processing")
                    skip_count += 1
                    results.append({
                        "company": company,
                        "filename": filename,
                        "status": "处理中-跳过",
                        "documentId": doc_info["id"],
                    })
                    continue
                else:
                    # failed 状态的文档，重新上传
                    logger.info(f"文档状态为 {doc_info['status']}，重新上传: {filename}")

            # 上传文件
            result = upload_file(file_path)
            if result["success"]:
                success_count += 1
                results.append({
                    "company": company,
                    "filename": filename,
                    "status": "上传成功",
                    "documentId": result.get("documentId"),
                    "chunkCount": result.get("chunkCount"),
                })
            else:
                fail_count += 1
                results.append({
                    "company": company,
                    "filename": filename,
                    "status": f"上传失败: {result.get('message', '未知')}",
                })

            # 上传间隔
            if result["success"] and total < 8:
                logger.info(f"等待 {UPLOAD_INTERVAL} 秒...")
                time.sleep(UPLOAD_INTERVAL)

    # 输出汇总
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    logger.info("\n" + "=" * 60)
    logger.info("  上传汇总")
    logger.info("=" * 60)
    logger.info(f"  总文件数: {total}")
    logger.info(f"  上传成功: {success_count}")
    logger.info(f"  跳过(已存在): {skip_count}")
    logger.info(f"  上传失败: {fail_count}")
    logger.info(f"  耗时: {duration:.0f}秒 ({duration / 60:.1f}分钟)")
    logger.info("=" * 60)

    # 详细结果
    logger.info("\n--- 详细结果 ---")
    for r in results:
        status_icon = "✅" if "成功" in r["status"] else "⏭️" if "跳过" in r["status"] else "❌"
        logger.info(f"  {status_icon} [{r['company']}] {r['filename']} - {r['status']}")

    if fail_count > 0:
        logger.warning(f"\n有 {fail_count} 个文件上传失败，请检查错误日志: {os.path.join(LOG_DIR, 'batch_upload_reports_error.log')}")


if __name__ == "__main__":
    main()
