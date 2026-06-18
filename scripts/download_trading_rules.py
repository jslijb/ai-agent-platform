"""
下载A股交易规则并上传到知识库
数据源：
  - 上海证券交易所 (sse.com.cn): 《上海证券交易所交易规则》
  - 深圳证券交易所 (szse.cn): 《深圳证券交易所交易规则》

注意：交易所官网的规则文档通常为动态加载页面，PDF下载链接可能需要登录或通过JS渲染获取。
如果无法直接下载，脚本会输出明确的问题提示，需手动下载。
"""

import os
import sys
import time
import json
import logging
import requests
from datetime import datetime
from pathlib import Path

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
            os.path.join(LOG_DIR, "download_trading_rules.log"),
            encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger("TradingRules")

error_logger = logging.getLogger("TradingRulesError")
error_logger.setLevel(logging.ERROR)
error_handler = logging.FileHandler(
    os.path.join(LOG_DIR, "download_trading_rules_error.log"),
    encoding="utf-8",
)
error_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
error_logger.addHandler(error_handler)

# ====== 配置 ======
BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000")
UPLOAD_API = f"{BASE_URL}/api/document/upload"
LIST_API = f"{BASE_URL}/api/document/list"
USER_ID = os.environ.get("TEST_USER_ID", "69ea0f70-00a0-426b-aa5f-0e198d0f69d3")
UPLOAD_INTERVAL = 5

DATA_DIR = os.path.join(BASE_DIR, "data", "trading_rules")
os.makedirs(DATA_DIR, exist_ok=True)

# 交易规则目标文件
TARGET_RULES = [
    {
        "name": "上海证券交易所交易规则",
        "source": "上海证券交易所",
        "source_url": "http://www.sse.com.cn/",
        # 上交所规则页面（尝试访问的URL）
        "attempt_urls": [
            "http://www.sse.com.cn/lawandrules/sserules/trading/stock/c/c_20220110_5676251.shtml",
            "http://www.sse.com.cn/lawandrules/sserules/trading/stock/",
        ],
        "local_filename": "上海证券交易所交易规则.pdf",
    },
    {
        "name": "深圳证券交易所交易规则",
        "source": "深圳证券交易所",
        "source_url": "http://www.szse.cn/",
        "attempt_urls": [
            "http://www.szse.cn/lawrules/rule/stock/trade/",
            "http://www.szse.cn/lawrules/rule/stock/trade/t20230217_599645.html",
        ],
        "local_filename": "深圳证券交易所交易规则.pdf",
    },
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def get_existing_documents() -> dict:
    """获取已有文档列表"""
    try:
        resp = requests.get(
            LIST_API,
            headers={"x-test-user-id": USER_ID},
            timeout=30,
        )
        data = resp.json()
        if data.get("success"):
            docs = data.get("documents", [])
            existing = {}
            for doc in docs:
                fname = doc.get("fileName", "")
                status = doc.get("status", "")
                existing[fname] = {"id": doc.get("id"), "status": status}
            return existing
        return {}
    except requests.RequestException as e:
        logger.warning(f"获取文档列表异常: {e}")
        return {}


def try_download_pdf(url: str, save_path: str) -> bool:
    """尝试从URL下载PDF文件"""
    try:
        logger.info(f"尝试下载: {url}")
        resp = requests.get(url, headers=HEADERS, timeout=30, allow_redirects=True)

        if resp.status_code != 200:
            logger.warning(f"HTTP {resp.status_code}: {url}")
            return False

        content_type = resp.headers.get("Content-Type", "")

        # 检查是否返回了PDF
        if "application/pdf" in content_type:
            if len(resp.content) < 1024:
                logger.warning(f"返回内容过小({len(resp.content)}B)，疑似错误页")
                return False
            with open(save_path, "wb") as f:
                f.write(resp.content)
            logger.info(f"下载成功: {save_path} ({len(resp.content) / 1024:.1f} KB)")
            return True

        # 如果返回HTML，尝试从中提取PDF链接
        if "text/html" in content_type:
            text = resp.text
            # 查找PDF链接模式
            import re
            pdf_patterns = [
                r'href=["\']([^"\']*\.pdf)["\']',
                r'href=["\']([^"\']*\.pdf[^"\']*)["\']',
                r'["\']([^"\']*upload[^"\']*\.pdf)["\']',
                r'["\']([^"\']*file[^"\']*\.pdf)["\']',
            ]
            found_pdfs = set()
            for pattern in pdf_patterns:
                matches = re.findall(pattern, text, re.IGNORECASE)
                found_pdfs.update(matches)

            if found_pdfs:
                logger.info(f"在页面中发现 {len(found_pdfs)} 个PDF链接")
                for pdf_url in found_pdfs:
                    # 补全相对URL
                    if pdf_url.startswith("/"):
                        from urllib.parse import urlparse
                        parsed = urlparse(url)
                        pdf_url = f"{parsed.scheme}://{parsed.netloc}{pdf_url}"
                    elif not pdf_url.startswith("http"):
                        pdf_url = url.rsplit("/", 1)[0] + "/" + pdf_url

                    logger.info(f"尝试PDF链接: {pdf_url}")
                    try:
                        pdf_resp = requests.get(pdf_url, headers=HEADERS, timeout=30, allow_redirects=True)
                        if pdf_resp.status_code == 200 and "application/pdf" in pdf_resp.headers.get("Content-Type", ""):
                            if len(pdf_resp.content) > 1024:
                                with open(save_path, "wb") as f:
                                    f.write(pdf_resp.content)
                                logger.info(f"PDF下载成功: {save_path} ({len(pdf_resp.content) / 1024:.1f} KB)")
                                return True
                    except requests.RequestException:
                        continue

            logger.warning(f"页面中未找到可下载的PDF链接: {url}")
            return False

        logger.warning(f"非PDF响应 (Content-Type: {content_type}): {url}")
        return False

    except requests.Timeout:
        logger.warning(f"下载超时: {url}")
        return False
    except requests.RequestException as e:
        logger.warning(f"下载异常: {e}")
        return False


def upload_file(file_path: str) -> dict:
    """上传文件到知识库"""
    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    logger.info(f"开始上传: {filename} ({file_size / 1024:.1f} KB)")

    try:
        with open(file_path, "rb") as f:
            files = {"file": (filename, f, "application/pdf")}
            headers = {"x-test-user-id": USER_ID}
            resp = requests.post(UPLOAD_API, files=files, headers=headers, timeout=600)

        data = resp.json()
        if data.get("success"):
            logger.info(f"上传成功: {filename}, documentId={data.get('documentId')}, 分块数={data.get('chunkCount')}")
            return {"success": True, "documentId": data.get("documentId"), "chunkCount": data.get("chunkCount")}
        else:
            msg = data.get("message", "未知错误")
            logger.error(f"上传失败: {filename}, 原因: {msg}")
            error_logger.error(f"上传失败: {filename}, 原因: {msg}")
            return {"success": False, "message": msg}
    except Exception as e:
        msg = str(e)
        logger.error(f"上传异常: {filename}, 原因: {msg}")
        error_logger.error(f"上传异常: {filename}, 原因: {msg}")
        return {"success": False, "message": msg}


def main():
    start_time = datetime.now()
    logger.info("=" * 60)
    logger.info("  A股交易规则下载与上传脚本")
    logger.info(f"  数据目录: {DATA_DIR}")
    logger.info(f"  API地址: {BASE_URL}")
    logger.info("=" * 60)

    # 检查API连通性
    try:
        resp = requests.get(f"{BASE_URL}/api/health", timeout=10)
        logger.info(f"API连通性检查: HTTP {resp.status_code}")
    except requests.RequestException as e:
        logger.error(f"API不可用: {e}")
        logger.error("请确认服务已启动后再运行此脚本")
        return

    # 获取已有文档
    existing_docs = get_existing_documents()

    download_success = 0
    download_fail = 0
    upload_success = 0
    upload_skip = 0
    upload_fail = 0
    problems = []

    for rule in TARGET_RULES:
        logger.info(f"\n--- 处理: {rule['name']} ({rule['source']}) ---")

        local_path = os.path.join(DATA_DIR, rule["local_filename"])

        # 检查本地是否已有文件
        if os.path.exists(local_path):
            file_size = os.path.getsize(local_path)
            if file_size > 1024:
                logger.info(f"本地文件已存在: {rule['local_filename']} ({file_size / 1024:.1f} KB)")
                download_success += 1
            else:
                logger.warning(f"本地文件过小({file_size}B)，删除重新下载")
                os.remove(local_path)

        # 如果本地没有文件，尝试下载
        if not os.path.exists(local_path):
            downloaded = False
            for url in rule["attempt_urls"]:
                if try_download_pdf(url, local_path):
                    downloaded = True
                    download_success += 1
                    break

            if not downloaded:
                download_fail += 1
                problem_msg = (
                    f"无法从{rule['source']}网站下载《{rule['name']}》文件，"
                    f"请手动下载后放入 {DATA_DIR} 目录\n"
                    f"  来源网站: {rule['source_url']}\n"
                    f"  保存文件名: {rule['local_filename']}"
                )
                logger.warning(problem_msg)
                problems.append(problem_msg)
                error_logger.error(problem_msg)
                continue

        # 上传到知识库
        if os.path.exists(local_path):
            filename = os.path.basename(local_path)
            # 检查是否已上传
            if filename in existing_docs and existing_docs[filename]["status"] == "completed":
                logger.info(f"跳过（已上传）: {filename}")
                upload_skip += 1
                continue

            result = upload_file(local_path)
            if result["success"]:
                upload_success += 1
            else:
                upload_fail += 1

            # 上传间隔
            time.sleep(UPLOAD_INTERVAL)

    # 输出汇总
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    logger.info("\n" + "=" * 60)
    logger.info("  下载与上传汇总")
    logger.info("=" * 60)
    logger.info(f"  下载成功: {download_success}")
    logger.info(f"  下载失败: {download_fail}")
    logger.info(f"  上传成功: {upload_success}")
    logger.info(f"  上传跳过: {upload_skip}")
    logger.info(f"  上传失败: {upload_fail}")
    logger.info(f"  耗时: {duration:.0f}秒")
    logger.info("=" * 60)

    # 输出需要手动处理的问题
    if problems:
        logger.info("\n" + "!" * 60)
        logger.info("  需要手动下载的文件:")
        logger.info("!" * 60)
        for i, msg in enumerate(problems, 1):
            logger.info(f"\n  [{i}] {msg}")
        logger.info(f"\n  下载完成后放入目录: {DATA_DIR}")
        logger.info("  然后重新运行此脚本即可自动上传")


if __name__ == "__main__":
    main()
