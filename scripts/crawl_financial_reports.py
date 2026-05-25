"""
A股上市公司财报爬取脚本
数据源：巨潮资讯网 (cninfo.com.cn) — 中国证监会指定信息披露平台
爬取范围：沪深主板上市公司
爬取类型：2025年年报、2026年一季报
排除：创业板(300xxx/301xxx)、北交所(4xxxxx/8xxxxx)
"""

import os
import re
import sys
import json
import time
import logging
import requests
from pathlib import Path
from datetime import datetime
from urllib.parse import quote

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("CrawlReport")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "financial_reports")
PROGRESS_FILE = os.path.join(DATA_DIR, "crawl_progress.json")
LOG_FILE = os.path.join(DATA_DIR, "crawl_error.log")

ANNUAL_DIR = os.path.join(DATA_DIR, "2025_annual")
Q1_DIR = os.path.join(DATA_DIR, "2026_q1")

CNINFO_QUERY_URL = "http://www.cninfo.com.cn/new/hisAnnouncement/query"
CNINFO_PDF_BASE = "http://static.cninfo.com.cn/"

HEADERS = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Origin": "http://www.cninfo.com.cn",
    "Referer": "http://www.cninfo.com.cn/new/disclosure",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
}

REQUEST_DELAY = 1.5
MAX_RETRIES = 3
PAGE_SIZE = 30

CATEGORY_ANNUAL = "category_ndbg_szsh"
CATEGORY_Q1 = "category_yjdbg_szsh"


def is_main_board(code: str) -> bool:
    if not code or len(code) != 6:
        return False
    if code.startswith("600") or code.startswith("601") or code.startswith("603") or code.startswith("605"):
        return True
    if code.startswith("000") or code.startswith("001") or code.startswith("002"):
        return True
    if code.startswith("688"):
        return True
    return False


def sanitize_filename(name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|]', '_', name)
    name = re.sub(r'\s+', '_', name)
    return name.strip('_')


def load_progress() -> dict:
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_progress(progress: dict):
    os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


def fetch_announcements(category: str, se_date: str, page_num: int = 1) -> dict:
    body = {
        "pageNum": str(page_num),
        "pageSize": str(PAGE_SIZE),
        "column": "szse",
        "tabName": "fulltext",
        "plate": "",
        "stock": "",
        "searchkey": "",
        "secid": "",
        "category": category,
        "trade": "",
        "seDate": se_date,
        "sortName": "",
        "sortType": "",
        "isHLtitle": "true",
    }

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(
                CNINFO_QUERY_URL,
                headers=HEADERS,
                data=body,
                timeout=30,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data
            else:
                logger.warning(f"请求返回 {resp.status_code}, 重试 {attempt + 1}/{MAX_RETRIES}")
        except requests.RequestException as e:
            logger.warning(f"请求异常: {e}, 重试 {attempt + 1}/{MAX_RETRIES}")
        time.sleep(2 ** attempt)

    return {}


def download_pdf(url: str, save_path: str) -> bool:
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=60, stream=True)
            if resp.status_code == 200:
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                with open(save_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                return True
            else:
                logger.warning(f"下载失败 HTTP {resp.status_code}: {url}")
        except requests.RequestException as e:
            logger.warning(f"下载异常: {e}, 重试 {attempt + 1}/{MAX_RETRIES}")
        time.sleep(2 ** attempt)
    return False


def crawl_report_type(category: str, se_date: str, save_dir: str, report_label: str, progress: dict):
    os.makedirs(save_dir, exist_ok=True)

    progress_key = f"{report_label}_page"
    start_page = progress.get(progress_key, 1)
    total_downloaded = progress.get(f"{report_label}_downloaded", 0)
    total_skipped = progress.get(f"{report_label}_skipped", 0)

    page_num = start_page
    has_more = True

    logger.info(f"开始爬取 {report_label}, 日期范围: {se_date}, 起始页: {page_num}")

    while has_more:
        logger.info(f"正在请求第 {page_num} 页...")
        data = fetch_announcements(category, se_date, page_num)

        if not data:
            logger.error(f"第 {page_num} 页请求失败，跳过")
            page_num += 1
            time.sleep(REQUEST_DELAY)
            continue

        announcements = data.get("announcements", [])
        if not announcements:
            logger.info(f"第 {page_num} 页无数据，爬取完成")
            break

        has_more = data.get("hasMore", False)

        for ann in announcements:
            sec_code = ann.get("secCode", "")
            sec_name = ann.get("secName", "")
            title = ann.get("announcementTitle", "")
            adjunct_url = ann.get("adjunctUrl", "")

            if not is_main_board(sec_code):
                total_skipped += 1
                continue

            if not adjunct_url:
                continue

            clean_title = re.sub(r"</?em>", "", title)
            has_exclude = "摘要" in clean_title or "修订版" in clean_title or "英文" in clean_title
            is_annual = "年度报告" in clean_title and not has_exclude
            is_q1 = "第一季度报告" in clean_title and not has_exclude

            if category == CATEGORY_ANNUAL and not is_annual:
                continue
            if category == CATEGORY_Q1 and not is_q1:
                continue

            filename = sanitize_filename(f"{sec_code}_{sec_name}_{title}") + ".pdf"
            save_path = os.path.join(save_dir, filename)

            if os.path.exists(save_path):
                logger.info(f"已存在，跳过: {filename}")
                continue

            pdf_url = CNINFO_PDF_BASE + adjunct_url
            logger.info(f"下载: {sec_code} {sec_name} - {title}")

            success = download_pdf(pdf_url, save_path)
            if success:
                total_downloaded += 1
                logger.info(f"下载成功 ({total_downloaded}): {filename}")
            else:
                logger.error(f"下载失败: {filename}")
                error_logger = logging.getLogger("CrawlError")
                if not error_logger.handlers:
                    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
                    fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
                    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
                    error_logger.addHandler(fh)
                    error_logger.setLevel(logging.ERROR)
                error_logger.error(f"下载失败: {pdf_url} -> {save_path}")

            time.sleep(REQUEST_DELAY)

        progress[progress_key] = page_num + 1
        progress[f"{report_label}_downloaded"] = total_downloaded
        progress[f"{report_label}_skipped"] = total_skipped
        save_progress(progress)

        page_num += 1
        time.sleep(REQUEST_DELAY)

    logger.info(f"{report_label} 爬取完成: 下载 {total_downloaded} 份, 跳过非主板 {total_skipped} 份")

    progress[f"{report_label}_done"] = True
    save_progress(progress)


def main():
    start_time = datetime.now()
    os.makedirs(DATA_DIR, exist_ok=True)

    fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    fh.setLevel(logging.ERROR)
    logging.getLogger("CrawlError").addHandler(fh)

    logger.info("=" * 60)
    logger.info("  A股上市公司财报爬取")
    logger.info("  数据源: 巨潮资讯网 (cninfo.com.cn)")
    logger.info("  范围: 沪深主板（排除创业板、北交所）")
    logger.info("  类型: 2025年年报 + 2026年一季报")
    logger.info("=" * 60)

    progress = load_progress()

    if not progress.get("2025年报_done"):
        crawl_report_type(
            category=CATEGORY_ANNUAL,
            se_date="2026-01-01~2026-06-30",
            save_dir=ANNUAL_DIR,
            report_label="2025年报",
            progress=progress,
        )
    else:
        logger.info("2025年报已爬取完成，跳过")

    if not progress.get("2026一季报_done"):
        crawl_report_type(
            category=CATEGORY_Q1,
            se_date="2026-01-01~2026-06-30",
            save_dir=Q1_DIR,
            report_label="2026一季报",
            progress=progress,
        )
    else:
        logger.info("2026一季报已爬取完成，跳过")

    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    annual_count = len([f for f in os.listdir(ANNUAL_DIR) if f.endswith(".pdf")]) if os.path.exists(ANNUAL_DIR) else 0
    q1_count = len([f for f in os.listdir(Q1_DIR) if f.endswith(".pdf")]) if os.path.exists(Q1_DIR) else 0

    logger.info("=" * 60)
    logger.info(f"  爬取完成!")
    logger.info(f"  2025年年报: {annual_count} 份")
    logger.info(f"  2026年一季报: {q1_count} 份")
    logger.info(f"  总计: {annual_count + q1_count} 份")
    logger.info(f"  耗时: {duration:.0f}s")
    logger.info(f"  存储位置: {DATA_DIR}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
