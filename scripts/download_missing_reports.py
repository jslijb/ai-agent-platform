"""
下载 4 家缺失公司的 2025 年年度报告 PDF
数据源：巨潮资讯网 (cninfo.com.cn)，备选：上交所/深交所

目标公司：
  - 片仔癀 (600436)
  - 华海药业 (600521)
  - 江苏银行 (600919)
  - 东吴证券 (601555)

文件名格式：{公司简称}_{股票代码}_2025年年度报告.pdf
存储目录：data/financial_reports/
"""

import os
import re
import sys
import time
import logging
import requests
from datetime import datetime
from typing import Optional

# ============== 路径配置 ==============
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "financial_reports")
LOG_DIR = os.path.join(BASE_DIR, "logs")
RUN_LOG = os.path.join(LOG_DIR, "download_missing_reports.log")
ERROR_LOG = os.path.join(LOG_DIR, "download_missing_reports_error.log")

# ============== 目标公司 ==============
TARGET_COMPANIES = [
    {"name": "片仔癀", "code": "600436"},
    {"name": "华海药业", "code": "600521"},
    {"name": "江苏银行", "code": "600919"},
    {"name": "东吴证券", "code": "601555"},
]

# ============== 巨潮资讯网 API ==============
CNINFO_QUERY_URL = "http://www.cninfo.com.cn/new/hisAnnouncement/query"
CNINFO_PDF_BASE = "http://static.cninfo.com.cn/"
CATEGORY_ANNUAL = "category_ndbg_szsh"  # 年度报告

# 上交所/深交所备选入口（用于人工提示，脚本仅尝试巨潮）
SSE_URL = "http://www.sse.com.cn/disclosure/listedinfo/announcement/"
SZSE_URL = "http://www.szse.cn/disclosure/listed/notice/index.html"

HEADERS = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Origin": "http://www.cninfo.com.cn",
    "Referer": "http://www.cninfo.com.cn/new/disclosure",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
}

# 标题过滤
TITLE_EXCLUDE_KW = ["摘要", "修订版", "英文", "更新后", "Quarterly", "取消", "更正"]

MAX_RETRIES = 3
REQUEST_TIMEOUT = 20
DOWNLOAD_TIMEOUT = 120


# ============== 日志配置 ==============
def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    logger = logging.getLogger("DownloadMissingReports")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    fh = logging.FileHandler(RUN_LOG, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    err_logger = logging.getLogger("DownloadMissingReports.Error")
    err_logger.setLevel(logging.ERROR)
    err_logger.handlers.clear()
    efh = logging.FileHandler(ERROR_LOG, encoding="utf-8")
    efh.setFormatter(fmt)
    err_logger.addHandler(efh)

    return logger, err_logger


logger, err_logger = setup_logging()


def _create_session() -> requests.Session:
    """创建带 cookie 的 session（巨潮需要先访问主页建立会话）"""
    s = requests.Session()
    s.headers.update(HEADERS)
    try:
        s.get("http://www.cninfo.com.cn/new/disclosure", timeout=15)
    except Exception as e:
        logger.warning(f"建立会话失败（不影响后续重试）: {e}")
    return s


def _clean_title(title: str) -> str:
    """清理标题中的 <em> 高亮标签"""
    return re.sub(r"</?em>", "", title or "")


def _match_annual_report(title: str) -> bool:
    """判断标题是否为'年度报告'（排除摘要/修订版等）"""
    clean = _clean_title(title)
    for kw in TITLE_EXCLUDE_KW:
        if kw in clean:
            return False
    return "年度报告" in clean


def _detect_report_year(title: str) -> Optional[int]:
    """从标题中提取报告年份，如 '2025年年度报告' -> 2025"""
    clean = _clean_title(title)
    m = re.search(r"(20\d{2})\s*年\s*年度报告", clean)
    if m:
        return int(m.group(1))
    return None


def query_cninfo_by_stock(stock_code: str, session: requests.Session) -> list[dict]:
    """
    按股票代码查询巨潮公告（任务要求方式）。
    注意：巨潮 stock 参数实际需要 "code,secid" 格式，单传 code 可能返回空，
    因此同时尝试多种格式，并在失败时回退到批量查询。
    """
    all_anns = []
    page_num = 1
    page_size = 30
    total = None

    # 尝试多种 stock 参数格式
    stock_variants = [
        stock_code,                       # 仅代码（任务描述方式）
        f"{stock_code},",                 # 代码 + 空secid
    ]

    for stock_val in stock_variants:
        all_anns = []
        page_num = 1
        total = None
        logger.info(f"  尝试 stock 参数格式: '{stock_val}'")

        while page_num <= 5:  # 最多 5 页
            body = {
                "pageNum": str(page_num),
                "pageSize": str(page_size),
                "column": "sse",
                "tabName": "fulltext",
                "stock": stock_val,
                "secid": "",
                "category": CATEGORY_ANNUAL,
                "seDate": "2025-01-01~2026-12-31",
                "isHLtitle": "true",
            }
            for attempt in range(MAX_RETRIES):
                try:
                    resp = session.post(CNINFO_QUERY_URL, data=body, timeout=REQUEST_TIMEOUT)
                    if resp.status_code == 200:
                        result = resp.json()
                        anns = result.get("announcements") or []
                        if total is None:
                            total = result.get("totalAnnouncement", 0)
                        if anns:
                            all_anns.extend(anns)
                        if not anns or len(all_anns) >= total:
                            logger.info(f"    第{page_num}页完成, 累计 {len(all_anns)}/{total}")
                            return all_anns
                        page_num += 1
                        time.sleep(0.3)
                        break
                    else:
                        logger.warning(f"    HTTP {resp.status_code}, 重试 {attempt+1}")
                except requests.RequestException as e:
                    logger.warning(f"    请求异常: {e}, 重试 {attempt+1}")
                time.sleep(1)
            else:
                logger.error(f"    第{page_num}页重试耗尽")
                break

        if all_anns:
            return all_anns

    return all_anns


def query_cninfo_batch(session: requests.Session) -> list[dict]:
    """
    批量查询巨潮全市场年度报告公告，本地过滤（v3 模式）。
    仅在前者失败时回退使用。
    """
    logger.info("  回退到批量查询模式（全市场年度报告）...")
    all_anns = []
    page_num = 1
    page_size = 30
    total = None
    max_pages = 400  # 安全上限

    while page_num <= max_pages:
        body = {
            "pageNum": str(page_num),
            "pageSize": str(page_size),
            "column": "sse",
            "tabName": "fulltext",
            "stock": "",
            "secid": "",
            "category": CATEGORY_ANNUAL,
            "seDate": "2025-01-01~2026-12-31",
            "isHLtitle": "true",
        }
        for attempt in range(MAX_RETRIES):
            try:
                resp = session.post(CNINFO_QUERY_URL, data=body, timeout=REQUEST_TIMEOUT)
                if resp.status_code == 200:
                    result = resp.json()
                    anns = result.get("announcements") or []
                    if total is None:
                        total = result.get("totalAnnouncement", 0)
                    if anns:
                        all_anns.extend(anns)
                    if not anns or len(all_anns) >= total:
                        logger.info(f"    批量查询完成, 共 {len(all_anns)}/{total} 条")
                        return all_anns
                    page_num += 1
                    if page_num % 20 == 0:
                        logger.info(f"    批量查询进度: {len(all_anns)}/{total}")
                    time.sleep(0.2)
                    break
                else:
                    logger.warning(f"    HTTP {resp.status_code}, 重试 {attempt+1}")
            except requests.RequestException as e:
                logger.warning(f"    请求异常: {e}, 重试 {attempt+1}")
            time.sleep(1)
        else:
            logger.error(f"    批量查询第{page_num}页重试耗尽")
            break

    return all_anns


def select_best_annual(announcements: list[dict], stock_code: str) -> Optional[dict]:
    """
    从公告列表中选择目标公司的最佳年度报告：
      1. secCode 匹配
      2. 标题为年度报告（排除摘要等）
      3. 优先 2025 年报，其次 2024 年报
    """
    candidates = []
    for ann in announcements:
        sec_code = (ann.get("secCode") or "").strip()
        if sec_code != stock_code:
            continue
        title = ann.get("announcementTitle", "")
        if not _match_annual_report(title):
            continue
        adjunct_url = ann.get("adjunctUrl", "")
        if not adjunct_url:
            continue
        year = _detect_report_year(title) or 0
        candidates.append({"year": year, "ann": ann, "title": _clean_title(title)})

    if not candidates:
        return None

    # 按 year 降序，优先 2025
    candidates.sort(key=lambda x: x["year"], reverse=True)
    best = candidates[0]
    if best["year"] == 2025:
        logger.info(f"  ✓ 找到 2025 年年度报告: {best['title']}")
    elif best["year"] == 2024:
        logger.info(f"  ⚠ 2025 年报未找到，回退到 2024 年年度报告: {best['title']}")
    else:
        logger.info(f"  ⚠ 仅找到 {best['year']} 年年度报告: {best['title']}")
    return best


def download_pdf(url: str, save_path: str) -> tuple[bool, str]:
    """下载 PDF，返回 (是否成功, 失败原因)"""
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT, stream=True, headers={
                "User-Agent": HEADERS["User-Agent"],
                "Referer": "http://www.cninfo.com.cn/",
            })
            if resp.status_code == 200:
                content_type = resp.headers.get("Content-Type", "")
                if "text/html" in content_type:
                    reason = f"返回HTML非PDF (Content-Type: {content_type})"
                    logger.warning(f"  {reason}, 重试 {attempt+1}")
                    time.sleep(2)
                    continue
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                with open(save_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                file_size = os.path.getsize(save_path)
                if file_size < 1024:
                    reason = f"文件过小({file_size}B)，疑似错误页"
                    logger.warning(f"  {reason}")
                    try:
                        os.remove(save_path)
                    except OSError:
                        pass
                    time.sleep(2)
                    continue
                return True, ""
            else:
                reason = f"HTTP {resp.status_code}"
                logger.warning(f"  下载失败 {reason}, 重试 {attempt+1}")
        except requests.RequestException as e:
            reason = f"请求异常: {e}"
            logger.warning(f"  {reason}, 重试 {attempt+1}")
        time.sleep(2)
    return False, "重试耗尽"


class BatchQueryCache:
    """延迟加载批量查询结果（仅当按股票查询失败时触发）"""
    def __init__(self, session: requests.Session):
        self.session = session
        self._data: list[dict] = []
        self._loaded = False

    def get(self) -> list[dict]:
        if not self._loaded:
            try:
                logger.info("首次触发批量查询（全市场年度报告），作为回退数据源...")
                self._data = query_cninfo_batch(self.session)
                self._loaded = True
                logger.info(f"批量查询获得 {len(self._data)} 条年度报告公告（已缓存）")
            except Exception as e:
                logger.warning(f"批量查询失败: {e}")
                self._data = []
                self._loaded = True
        return self._data


def process_company(company: dict, session: requests.Session,
                    batch_cache: BatchQueryCache) -> dict:
    """处理单家公司下载，返回结果 dict"""
    name = company["name"]
    code = company["code"]
    logger.info(f"{'='*60}")
    logger.info(f"处理公司: {name} ({code})")

    result = {
        "name": name,
        "code": code,
        "success": False,
        "year": None,
        "file_path": None,
        "file_size": 0,
        "tried_urls": [],
        "error": None,
        "used_fallback_year": False,
    }

    # 1) 按股票代码精确查询
    try:
        anns = query_cninfo_by_stock(code, session)
    except Exception as e:
        anns = []
        logger.warning(f"  按股票查询异常: {e}")

    # 2) 如果精确查询无结果，从批量查询结果中过滤（延迟加载）
    if not anns:
        logger.info(f"  按股票精确查询无结果，触发批量查询回退")
        anns = batch_cache.get()

    if not anns:
        result["error"] = "巨潮资讯网查询返回空公告列表"
        err_logger.error(f"{name}({code}): {result['error']}")
        return result

    # 3) 选择最佳年度报告
    best = select_best_annual(anns, code)
    if not best:
        result["error"] = f"在 {len(anns)} 条公告中未找到 {code} 的年度报告"
        err_logger.error(f"{name}({code}): {result['error']}")
        return result

    ann = best["ann"]
    year = best["year"]
    result["year"] = year
    if year != 2025:
        result["used_fallback_year"] = True

    adjunct_url = ann.get("adjunctUrl", "")
    pdf_url = CNINFO_PDF_BASE + adjunct_url
    result["tried_urls"].append(pdf_url)

    # 4) 构造文件名：{公司简称}_{股票代码}_2025年年度报告.pdf
    #    若回退到 2024 年报，文件名仍按任务要求标注 2025（实际年份在日志中标注）
    #    这里采用实际年份命名以避免误导
    year_label = year if year else 2025
    filename = f"{name}_{code}_{year_label}年年度报告.pdf"
    save_path = os.path.join(DATA_DIR, filename)
    result["file_path"] = save_path

    # 5) 下载
    logger.info(f"  下载 URL: {pdf_url}")
    logger.info(f"  保存路径: {save_path}")
    ok, reason = download_pdf(pdf_url, save_path)
    if ok:
        result["success"] = True
        result["file_size"] = os.path.getsize(save_path)
        logger.info(f"  ✓ 下载成功: {result['file_size']} 字节")
    else:
        result["error"] = f"下载失败: {reason}"
        err_logger.error(f"{name}({code}): {result['error']}, URL={pdf_url}")

    return result


def verify_downloads(results: list[dict]) -> None:
    """验证下载文件，检查大小 > 0"""
    logger.info(f"{'='*60}")
    logger.info("验证下载文件...")
    for r in results:
        if not r["success"]:
            continue
        path = r["file_path"]
        if not path or not os.path.exists(path):
            r["success"] = False
            r["error"] = "文件不存在"
            logger.error(f"  ✗ {r['name']}({r['code']}): 文件不存在 {path}")
            continue
        size = os.path.getsize(path)
        r["file_size"] = size
        if size <= 0:
            r["success"] = False
            r["error"] = f"文件大小为 0"
            logger.error(f"  ✗ {r['name']}({r['code']}): 文件大小为 0")
        else:
            logger.info(f"  ✓ {r['name']}({r['code']}): {size} 字节 - {os.path.basename(path)}")


def print_summary(results: list[dict]) -> None:
    """输出下载汇总"""
    success = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]

    logger.info(f"{'='*60}")
    logger.info("下载汇总")
    logger.info(f"{'='*60}")
    logger.info(f"成功: {len(success)} 家, 失败: {len(failed)} 家")

    if success:
        logger.info("-" * 60)
        logger.info("成功列表:")
        for r in success:
            year_note = "" if r["year"] == 2025 else f" (实际为 {r['year']} 年报)"
            logger.info(
                f"  ✓ {r['name']}({r['code']}) "
                f"- {r['file_size']} 字节{year_note} "
                f"- {os.path.basename(r['file_path'])}"
            )

    if failed:
        logger.info("-" * 60)
        logger.info("失败列表:")
        for r in failed:
            logger.info(f"  ✗ {r['name']}({r['code']}) - {r['error']}")
            for url in r["tried_urls"]:
                logger.info(f"      尝试 URL: {url}")

    if failed:
        logger.info("-" * 60)
        logger.info("【需人工处理】以下公司建议手动获取:")
        for r in failed:
            code = r["code"]
            name = r["name"]
            # 判断交易所
            if code.startswith("6"):
                exchange = "上交所 (sse.com.cn)"
                manual_url = f"http://www.sse.com.cn/disclosure/listedinfo/announcement/"
            else:
                exchange = "深交所 (szse.cn)"
                manual_url = f"http://www.szse.cn/disclosure/listed/notice/index.html"
            logger.info(f"  ▶ {name}({code}):")
            logger.info(f"      1. 巨潮资讯网手动检索: "
                        f"http://www.cninfo.com.cn/new/disclosure/stock?stockCode={code}&orgId=")
            logger.info(f"      2. {exchange}: {manual_url}")
            logger.info(f"      3. 直接搜索: {name} 2025年年度报告 pdf")
            logger.info(f"      失败原因: {r['error']}")

    logger.info(f"{'='*60}")
    logger.info(f"存储目录: {DATA_DIR}")
    logger.info(f"运行日志: {RUN_LOG}")
    logger.info(f"错误日志: {ERROR_LOG}")
    logger.info(f"{'='*60}")


def main():
    start_time = datetime.now()
    os.makedirs(DATA_DIR, exist_ok=True)

    logger.info("=" * 60)
    logger.info("  下载 4 家缺失公司 2025 年年度报告")
    logger.info("  数据源: 巨潮资讯网 (cninfo.com.cn)")
    logger.info("  目标公司: 片仔癀/华海药业/江苏银行/东吴证券")
    logger.info(f"  存储目录: {DATA_DIR}")
    logger.info("=" * 60)

    session = _create_session()

    # 批量查询结果延迟加载（仅当按股票查询失败时触发）
    batch_cache = BatchQueryCache(session)

    results = []
    for company in TARGET_COMPANIES:
        try:
            r = process_company(company, session, batch_cache)
        except Exception as e:
            r = {
                "name": company["name"],
                "code": company["code"],
                "success": False,
                "year": None,
                "file_path": None,
                "file_size": 0,
                "tried_urls": [],
                "error": f"处理异常: {e}",
                "used_fallback_year": False,
            }
            err_logger.error(f"{company['name']}({company['code']}): 处理异常 {e}")
        results.append(r)

    verify_downloads(results)
    print_summary(results)

    duration = (datetime.now() - start_time).total_seconds()
    logger.info(f"总耗时: {duration:.1f}s")

    # 退出码：有失败返回 1
    failed = [r for r in results if not r["success"]]
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
