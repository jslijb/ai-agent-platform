"""
A股上市公司财报爬取脚本 v3 (批量模式)
数据源：巨潮资讯网 (cninfo.com.cn) — 中国证监会指定信息披露平台
爬取范围：沪深主板上市公司（排除创业板、科创板、北交所）
爬取类型：2025年年报、2026年一季报

v3 改动: 巨潮API已不支持按单只股票精确查询(stock+secid返回空)
       → 改为按交易所批量查询(column+category+seDate)，本地过滤股票代码
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

MAX_RETRIES = 3
PAGE_SIZE = 30  # 巨潮API最大只支持30，传更大值会被忽略导致分页失效
DOWNLOAD_WORKERS = 5


CATEGORY_ANNUAL = "category_ndbg_szsh"   # 年度报告: ~11000条(SSE+SZSE)
CATEGORY_Q1 = "category_yjdbg_szsh"      # 一季报(业绩预告或快报): ~5500条

# 标题关键词匹配
TITLE_ANNUAL_KW = ["年度报告"]
TITLE_Q1_KW = ["第一季度报告", "一季度报告"]
TITLE_EXCLUDE_KW = ["摘要", "修订版", "英文", "更新后", "Quarterly"]


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


def load_main_board_codes() -> set[str]:
    """加载主板股票代码集合（用于本地过滤）"""
    if os.path.exists(CODES_FILE):
        with open(CODES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return set(data.get("all", []))

    import baostock as bs
    lg = bs.login()
    rs = bs.query_stock_basic()
    codes = set()
    while rs.error_code == '0' and rs.next():
        row = rs.get_row_data()
        code = row[0].replace("sh.", "").replace("sz.", "")
        outDate = row[3] if len(row) > 3 else ""
        if outDate and outDate != "":
            continue
        if re.match(r'^(600|601|603|605|000|001)', code):
            codes.add(code)
    bs.logout()

    os.makedirs(os.path.dirname(CODES_FILE), exist_ok=True)
    with open(CODES_FILE, "w", encoding="utf-8") as f:
        json.dump({"all": sorted(codes)}, f, ensure_ascii=False)
    return codes


# ====== 核心：批量查询（不指定stock，按交易所拉全部公告）======

def _create_session() -> requests.Session:
    """创建带 cookie 的 session（巨潮需要先访问主页建立会话）"""
    s = requests.Session()
    s.headers.update(HEADERS.copy())
    try:
        s.get("http://www.cninfo.com.cn/new/disclosure", timeout=15)
    except Exception:
        pass
    return s


def query_batch_all_pages(
    column: str,
    category: str,
    se_date: str,
    session: requests.Session | None = None,
) -> list[dict]:
    """
    批量查询某交易所+分类+日期范围的所有公告（分页自动处理）
    不传 stock/secid 参数 — 这是 v3 的关键改动
    """
    s = session or _create_session()
    all_announcements = []
    page_num = 1
    total_count = None

    while True:
        body = {
            "pageNum": str(page_num),
            "pageSize": str(PAGE_SIZE),
            "column": column,
            "tabName": "fulltext",
            "stock": "",       # 关键：留空！不指定股票
            "secid": "",       # 关键：留空！
            "category": category,
            "seDate": se_date,
            "isHLtitle": "true",
        }

        for attempt in range(MAX_RETRIES):
            try:
                resp = s.post(CNINFO_QUERY_URL, data=body, timeout=20)
                if resp.status_code == 200:
                    result = resp.json()
                    anns = result.get("announcements") or []
                    if total_count is None:
                        total_count = result.get("totalAnnouncement", 0)

                    if anns:
                        all_announcements.extend(anns)

                    # 分页结束条件
                    if not anns or len(all_announcements) >= total_count:
                        logger.info(f"[{column}] 第{page_num}页完成: 累计 {len(all_announcements)}/{total_count}")
                        return all_announcements

                    page_num += 1
                    # 每页之间短暂延迟
                    time.sleep(0.2)
                    break
                else:
                    logger.warning(f"[{column}] HTTP {resp.status_code}, 重试 {attempt+1}")
            except requests.RequestException as e:
                logger.warning(f"[{column}] 异常: {e}, 重试 {attempt+1}")
            time.sleep(1)
        else:
            logger.error(f"[{column}] 第{page_num}页重试耗尽，停止分页")
            break

    return all_announcements


def match_report_title(title: str, report_type: str) -> bool:
    """检查标题是否匹配目标报告类型"""
    clean_title = re.sub(r"</?em>", "", title)

    # 排除词
    for kw in TITLE_EXCLUDE_KW:
        if kw in clean_title:
            return False

    if report_type == "annual":
        return any(kw in clean_title for kw in TITLE_ANNUAL_KW)
    elif report_type == "q1":
        return any(kw in clean_title for kw in TITLE_Q1_KW)

    return False


def download_pdf(url: str, save_path: str) -> bool:
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=90, stream=True)
            if resp.status_code == 200:
                content_type = resp.headers.get("Content-Type", "")
                # 验证返回的确实是 PDF，而非 HTML 错误页
                if "text/html" in content_type:
                    logger.warning(f"返回HTML非PDF: {url[:80]}")
                    continue
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                with open(save_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                # 检查文件大小，过小可能是错误页
                file_size = os.path.getsize(save_path)
                if file_size < 1024:  # < 1KB 极可能是错误页
                    logger.warning(f"文件过小({file_size}B)，疑似错误页: {save_path}")
                    os.remove(save_path)
                    continue
                return True
            else:
                logger.warning(f"下载失败 HTTP {resp.status_code}: {url[:80]}")
        except requests.RequestException as e:
            logger.warning(f"下载异常: {e}, 重试 {attempt + 1}")
        time.sleep(2)
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


def crawl_report_type_batched(
    category: str,
    se_date: str,
    save_dir: str,
    report_label: str,
    report_type: str,  # "annual" or "q1"
    progress: dict,
):
    """v3 核心函数：批量爬取某类报告"""
    os.makedirs(save_dir, exist_ok=True)

    # 加载主板代码用于过滤
    main_board_codes = load_main_board_codes()
    logger.info(f"[{report_label}] 主板代码池: {len(main_board_codes)} 只")

    progress_key = f"{report_label}_page"

    all_tasks = []

    # 巨潮API在 szsh 类别下忽略 column 参数，返回全市场数据
    # 因此只查一次 sse 即可获取沪深所有公告，避免重复
    session = _create_session()

    logger.info(f"[{report_label}] 开始批量查询 全市场 (sse) ...")

    announcements = query_batch_all_pages(
        column="sse",
        category=category,
        se_date=se_date,
        session=session,
    )

    if not announcements:
        logger.warning(f"[{report_label}] 返回 0 条公告")
    else:
        logger.info(f"[{report_label}] 全市场共获取 {len(announcements)} 条公告, 开始过滤...")

        # 本地过滤：只保留主板 + 标题匹配
        matched = 0
        filtered_non_main = 0
        filtered_title = 0
        filtered_no_pdf = 0

        for ann in announcements:
            sec_code = ann.get("secCode", "")
            sec_name = ann.get("secName", "")
            title = ann.get("announcementTitle", "")
            adjunct_url = ann.get("adjunctUrl", "")

            # 过滤1: 只保留主板股票（空代码也排除）
            if not sec_code or sec_code not in main_board_codes:
                filtered_non_main += 1
                continue

            # 过滤2: 标题匹配
            if not match_report_title(title, report_type):
                filtered_title += 1
                continue

            # 过滤3: 有 PDF 附件
            if not adjunct_url:
                filtered_no_pdf += 1
                continue

            matched += 1
            filename = sanitize_filename(f"{sec_code}_{sec_name}_{title}") + ".pdf"
            save_path = os.path.join(save_dir, filename)

            if os.path.exists(save_path):
                continue

            pdf_url = CNINFO_PDF_BASE + adjunct_url
            all_tasks.append((pdf_url, save_path))

        logger.info(
            f"[{report_label}] 过滤结果: "
            f"匹配={matched}, 非主板={filtered_non_main}, "
            f"标题不符={filtered_title}, 无PDF={filtered_no_pdf}"
        )

    # 按文件名去重（避免同名覆盖）
    seen_paths = set()
    deduped_tasks = []
    dup_count = 0
    for url, path in all_tasks:
        if path in seen_paths:
            dup_count += 1
            continue
        seen_paths.add(path)
        deduped_tasks.append((url, path))
    all_tasks = deduped_tasks

    if dup_count > 0:
        logger.info(f"[{report_label}] 文件名去重: 移除 {dup_count} 个重复项")

    logger.info(f"[{report_label}] 过滤完成: 待下载 {len(all_tasks)} 个文件")

    if not all_tasks:
        logger.info(f"[{report_label}] 无新文件需要下载")
        progress[f"{report_label}_done"] = True
        save_progress(progress)
        return

    # 并行下载
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
                    _log_error(f"下载失败: {url[:100]}")
            except Exception as e:
                fail_count += 1
                _log_error(f"下载异常: {url[:100]} - {e}")

    existing = len([f for f in os.listdir(save_dir) if f.endswith(".pdf")]) if os.path.exists(save_dir) else 0
    logger.info(
        f"[{report_label}] 完成! 目录共 {existing} 份PDF, "
        f"本次下载 {success_count}, 失败 {fail_count}"
    )

    progress[f"{report_label}_done"] = True
    progress[f"{report_label}_total"] = existing
    save_progress(progress)


def main():
    start_time = datetime.now()
    os.makedirs(DATA_DIR, exist_ok=True)

    # --reset-q1: 重置一季报进度
    if "--reset-q1" in sys.argv:
        logger.info("检测到 --reset-q1 参数，重置 2026一季报 进度")
        progress = load_progress()
        if os.path.exists(Q1_DIR):
            import shutil
            shutil.rmtree(Q1_DIR)
            os.makedirs(Q1_DIR, exist_ok=True)
            logger.info("已清空 2026_q1 目录")
        for key in list(progress.keys()):
            if "一季报" in key or "Q1" in key.upper():
                del progress[key]
        save_progress(progress)
        logger.info("已重置完成，可重新运行")
        return

    # --reset-all: 重置所有进度
    if "--reset-all" in sys.argv:
        logger.info("检测到 --reset-all 参数，重置所有进度")
        progress = {}
        for d in [ANNUAL_DIR, Q1_DIR]:
            if os.path.exists(d):
                import shutil
                shutil.rmtree(d)
                os.makedirs(d, exist_ok=True)
        save_progress({})
        logger.info("已重置所有进度和目录")
        return

    logger.info("=" * 60)
    logger.info("  A股上市公司财报爬取 v3 (批量模式)")
    logger.info("  数据源: 巨潮资讯网 (cninfo.com.cn)")
    logger.info("  范围: 沪深主板（排除创业板、科创板、北交所）")
    logger.info("  类型: 2025年年报 + 2026年一季报")
    logger.info(f"  下载并发: {DOWNLOAD_WORKERS}")
    logger.info("=" * 60)

    progress = load_progress()

    # 爬取 2025 年年报
    if not progress.get("2025年报_done"):
        crawl_report_type_batched(
            category=CATEGORY_ANNUAL,
            se_date="2026-01-01~2026-04-30",
            save_dir=ANNUAL_DIR,
            report_label="2025年报",
            report_type="annual",
            progress=progress,
        )
    else:
        logger.info("2025年报已爬取完成，跳过")

    # 爬取 2026 年一季报
    if not progress.get("2026一季报_done"):
        crawl_report_type_batched(
            category=CATEGORY_Q1,
            se_date="2026-03-01~2026-04-30",
            save_dir=Q1_DIR,
            report_label="2026一季报",
            report_type="q1",
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
