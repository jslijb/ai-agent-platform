"""
A股上市公司财报爬取脚本
数据源：巨潮资讯网 (cninfo.com.cn) — 中国证监会指定信息披露平台
爬取范围：沪深主板上市公司（排除创业板、科创板、北交所）
爬取类型：2025年年报、2026年一季报
优化：按股票代码精确查询 + 并行下载
"""

import os
import re
import sys
import json
import time
import logging
import requests
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

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
CODES_FILE = os.path.join(DATA_DIR, "main_board_codes.json")

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

PAGE_DELAY = 0.2
MAX_RETRIES = 3
PAGE_SIZE = 30
DOWNLOAD_WORKERS = 5
QUERY_WORKERS = 2

CATEGORY_ANNUAL = "category_ndbg_szsh"
CATEGORY_Q1 = "category_yjdbg_szsh"


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


def load_main_board_codes() -> list[str]:
    if os.path.exists(CODES_FILE):
        with open(CODES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("all", [])

    import baostock as bs
    lg = bs.login()
    rs = bs.query_stock_basic()
    codes = []
    while rs.error_code == '0' and rs.next():
        row = rs.get_row_data()
        code = row[0].replace("sh.", "").replace("sz.", "")
        outDate = row[3] if len(row) > 3 else ""
        if outDate and outDate != "":
            continue
        if re.match(r'^(600|601|603|605|000|001)', code):
            codes.append(code)
    bs.logout()

    os.makedirs(os.path.dirname(CODES_FILE), exist_ok=True)
    with open(CODES_FILE, "w", encoding="utf-8") as f:
        json.dump({"all": codes}, f, ensure_ascii=False)
    return codes


def query_stock_announcements(code: str, category: str, se_date: str) -> list[dict]:
    org_id = ""
    if code.startswith("6"):
        org_id = f"sh{code}"
    else:
        org_id = f"sz{code}"

    body = {
        "pageNum": "1",
        "pageSize": str(PAGE_SIZE),
        "column": "szse",
        "tabName": "fulltext",
        "plate": "",
        "stock": code,
        "searchkey": "",
        "secid": org_id,
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
                timeout=15,
            )
            if resp.status_code == 200:
                return resp.json().get("announcements", [])
            else:
                logger.warning(f"[{code}] 请求返回 {resp.status_code}, 重试 {attempt + 1}")
        except requests.RequestException as e:
            logger.warning(f"[{code}] 请求异常: {e}, 重试 {attempt + 1}")
        time.sleep(1)

    return []


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
            logger.warning(f"下载异常: {e}, 重试 {attempt + 1}")
        time.sleep(1)
    return False


_error_logger_initialized = False


def _log_error(msg: str):
    global _error_logger_initialized
    error_logger = logging.getLogger("CrawlError")
    if not _error_logger_initialized:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        error_logger.addHandler(fh)
        error_logger.setLevel(logging.ERROR)
        _error_logger_initialized = True
    error_logger.error(msg)


def process_single_stock(args: tuple) -> list[tuple[str, str]]:
    code, category, se_date, save_dir = args
    tasks = []

    announcements = query_stock_announcements(code, category, se_date)

    if not announcements:
        return tasks

    for ann in announcements:
        sec_code = ann.get("secCode", "")
        sec_name = ann.get("secName", "")
        title = ann.get("announcementTitle", "")
        adjunct_url = ann.get("adjunctUrl", "")

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
            continue

        pdf_url = CNINFO_PDF_BASE + adjunct_url
        tasks.append((pdf_url, save_path))

    return tasks


def crawl_report_type(category: str, se_date: str, save_dir: str, report_label: str, progress: dict):
    os.makedirs(save_dir, exist_ok=True)

    codes = load_main_board_codes()
    total_stocks = len(codes)
    logger.info(f"[{report_label}] 主板股票共 {total_stocks} 只，开始查询...")

    progress_key = f"{report_label}_queried"
    queried = progress.get(progress_key, 0)

    all_tasks = []
    processed = 0

    work_items = []
    for code in codes[queried:]:
        work_items.append((code, category, se_date, save_dir))

    with ThreadPoolExecutor(max_workers=QUERY_WORKERS) as executor:
        futures = {executor.submit(process_single_stock, item): item[0] for item in work_items}

        for future in as_completed(futures):
            code = futures[future]
            try:
                tasks = future.result()
                all_tasks.extend(tasks)
            except Exception as e:
                logger.error(f"[{code}] 查询异常: {e}")
                _log_error(f"查询失败: {code} - {e}")

            processed += 1
            if processed % 100 == 0 or processed == len(work_items):
                progress[progress_key] = queried + processed
                save_progress(progress)
                logger.info(f"[{report_label}] 查询进度: {processed}/{len(work_items)}, 待下载: {len(all_tasks)}")

            time.sleep(0.3)

    logger.info(f"[{report_label}] 查询完成: 扫描 {total_stocks} 只股票, 待下载 {len(all_tasks)} 个文件")

    if not all_tasks:
        logger.info(f"[{report_label}] 无新文件需要下载")
        progress[f"{report_label}_done"] = True
        save_progress(progress)
        return

    success_count = 0
    fail_count = 0
    total = len(all_tasks)

    logger.info(f"[{report_label}] 开始并行下载 {total} 个文件 (并发: {DOWNLOAD_WORKERS})")

    with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as executor:
        futures = {executor.submit(download_pdf, url, path): (url, path) for url, path in all_tasks}

        for future in as_completed(futures):
            url, path = futures[future]
            try:
                ok = future.result()
                if ok:
                    success_count += 1
                    if success_count % 50 == 0 or success_count == total:
                        logger.info(f"[{report_label}] 下载进度: {success_count}/{total}")
                else:
                    fail_count += 1
                    _log_error(f"下载失败: {url}")
            except Exception as e:
                fail_count += 1
                _log_error(f"下载异常: {url} - {e}")

    existing = len([f for f in os.listdir(save_dir) if f.endswith(".pdf")]) if os.path.exists(save_dir) else 0
    logger.info(f"[{report_label}] 完成: 目录共 {existing} 份PDF, 本次下载 {success_count}, 失败 {fail_count}")

    progress[f"{report_label}_done"] = True
    progress[f"{report_label}_total"] = existing
    save_progress(progress)


def main():
    start_time = datetime.now()
    os.makedirs(DATA_DIR, exist_ok=True)

    logger.info("=" * 60)
    logger.info("  A股上市公司财报爬取 (优化版v2)")
    logger.info("  数据源: 巨潮资讯网 (cninfo.com.cn)")
    logger.info("  范围: 沪深主板（排除创业板、科创板、北交所）")
    logger.info("  类型: 2025年年报 + 2026年一季报")
    logger.info(f"  查询并发: {QUERY_WORKERS}, 下载并发: {DOWNLOAD_WORKERS}")
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
    logger.info(f"  耗时: {duration:.0f}s ({duration / 60:.1f}min)")
    logger.info(f"  存储位置: {DATA_DIR}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
