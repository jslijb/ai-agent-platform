"""
下载技术指标知识文档并上传到知识库
数据源优先级：
  1. 上交所/深交所投资者教育板块（官方教程）
  2. 其他可靠金融教育网站

技术指标包括：MACD、KDJ、RSI、布林带、PE、PB、ROE等

注意：交易所投教板块的内容通常为HTML页面展示，PDF下载链接较少。
如果无法从官方来源获取，脚本会输出问题提示和建议来源。
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
            os.path.join(LOG_DIR, "download_knowledge_docs.log"),
            encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger("KnowledgeDocs")

error_logger = logging.getLogger("KnowledgeDocsError")
error_logger.setLevel(logging.ERROR)
error_handler = logging.FileHandler(
    os.path.join(LOG_DIR, "download_knowledge_docs_error.log"),
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

DATA_DIR = os.path.join(BASE_DIR, "data", "knowledge_docs")
os.makedirs(DATA_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# 技术指标知识文档目标列表
# 优先从交易所投教板块获取
KNOWLEDGE_DOCS = [
    {
        "name": "MACD指标详解",
        "category": "技术指标",
        "source": "上交所投教",
        "source_url": "http://www.sse.com.cn/investor/education/",
        "attempt_urls": [
            "http://www.sse.com.cn/investor/education/technical/",
        ],
        "local_filename": "MACD指标详解.txt",
        "content_keywords": ["MACD", "移动平均收敛发散", "金叉", "死叉", "DIF", "DEA"],
    },
    {
        "name": "KDJ指标详解",
        "category": "技术指标",
        "source": "上交所投教",
        "source_url": "http://www.sse.com.cn/investor/education/",
        "attempt_urls": [
            "http://www.sse.com.cn/investor/education/technical/",
        ],
        "local_filename": "KDJ指标详解.txt",
        "content_keywords": ["KDJ", "随机指标", "超买", "超卖", "K线", "D线", "J线"],
    },
    {
        "name": "RSI指标详解",
        "category": "技术指标",
        "source": "深交所投教",
        "source_url": "http://www.szse.cn/investor/education/",
        "attempt_urls": [
            "http://www.szse.cn/investor/education/technical/",
        ],
        "local_filename": "RSI指标详解.txt",
        "content_keywords": ["RSI", "相对强弱指标", "超买", "超卖", "背离"],
    },
    {
        "name": "布林带指标详解",
        "category": "技术指标",
        "source": "深交所投教",
        "source_url": "http://www.szse.cn/investor/education/",
        "attempt_urls": [
            "http://www.szse.cn/investor/education/technical/",
        ],
        "local_filename": "布林带指标详解.txt",
        "content_keywords": ["布林带", "BOLL", "上轨", "中轨", "下轨", "波动率"],
    },
    {
        "name": "PE市盈率详解",
        "category": "基本面指标",
        "source": "上交所投教",
        "source_url": "http://www.sse.com.cn/investor/education/",
        "attempt_urls": [
            "http://www.sse.com.cn/investor/education/fundamental/",
        ],
        "local_filename": "PE市盈率详解.txt",
        "content_keywords": ["PE", "市盈率", "估值", "每股收益", "股价"],
    },
    {
        "name": "PB市净率详解",
        "category": "基本面指标",
        "source": "上交所投教",
        "source_url": "http://www.sse.com.cn/investor/education/",
        "attempt_urls": [
            "http://www.sse.com.cn/investor/education/fundamental/",
        ],
        "local_filename": "PB市净率详解.txt",
        "content_keywords": ["PB", "市净率", "净资产", "每股净资产", "估值"],
    },
    {
        "name": "ROE净资产收益率详解",
        "category": "基本面指标",
        "source": "深交所投教",
        "source_url": "http://www.szse.cn/investor/education/",
        "attempt_urls": [
            "http://www.szse.cn/investor/education/fundamental/",
        ],
        "local_filename": "ROE净资产收益率详解.txt",
        "content_keywords": ["ROE", "净资产收益率", "净利润", "净资产", "盈利能力"],
    },
]


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


def try_fetch_html_content(url: str, keywords: list) -> str:
    """
    尝试从URL获取HTML页面并提取包含关键词的正文内容
    返回提取的文本内容，失败返回空字符串
    """
    try:
        logger.info(f"尝试获取: {url}")
        resp = requests.get(url, headers=HEADERS, timeout=30, allow_redirects=True)

        if resp.status_code != 200:
            logger.warning(f"HTTP {resp.status_code}: {url}")
            return ""

        text = resp.text
        import re

        # 移除script和style
        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
        # 移除HTML标签
        text = re.sub(r'<[^>]+>', '\n', text)
        # 清理空白
        text = re.sub(r'\n\s*\n', '\n\n', text)
        text = text.strip()

        # 检查是否包含关键词
        keyword_found = False
        for kw in keywords:
            if kw in text:
                keyword_found = True
                break

        if not keyword_found:
            logger.warning(f"页面内容未包含相关关键词: {url}")
            return ""

        if len(text) < 200:
            logger.warning(f"提取内容过短({len(text)}字符)")
            return ""

        return text

    except requests.Timeout:
        logger.warning(f"获取超时: {url}")
        return ""
    except requests.RequestException as e:
        logger.warning(f"获取异常: {e}")
        return ""


def try_download_pdf(url: str, save_path: str) -> bool:
    """尝试从URL下载PDF文件"""
    try:
        logger.info(f"尝试下载PDF: {url}")
        resp = requests.get(url, headers=HEADERS, timeout=30, allow_redirects=True)

        if resp.status_code != 200:
            return False

        content_type = resp.headers.get("Content-Type", "")
        if "application/pdf" in content_type and len(resp.content) > 1024:
            with open(save_path, "wb") as f:
                f.write(resp.content)
            logger.info(f"PDF下载成功: {save_path}")
            return True

        return False

    except Exception as e:
        logger.warning(f"PDF下载异常: {e}")
        return False


def generate_knowledge_doc(doc_info: dict) -> bool:
    """
    当无法从外部网站获取时，基于关键词生成基础知识文档
    这是最后手段，仅包含基础定义和用法说明
    """
    name = doc_info["name"]
    keywords = doc_info["content_keywords"]
    category = doc_info["category"]
    local_path = os.path.join(DATA_DIR, doc_info["local_filename"])

    # 基础知识模板
    content = f"""{name}
{'=' * 40}

分类: {category}
关键词: {', '.join(keywords)}

【说明】
本文档为技术指标基础知识参考，内容来源于公开金融知识整理。
如需更详细的官方教程，请访问交易所投教板块：
  - 上海证券交易所投教: http://www.sse.com.cn/investor/education/
  - 深圳证券交易所投教: http://www.szse.cn/investor/education/

"""

    # 根据不同指标生成基础内容
    if "MACD" in name:
        content += """一、MACD指标概述
MACD（Moving Average Convergence Divergence，移动平均收敛发散指标）是最常用的技术分析指标之一，
由Gerald Appel于1970年代提出。MACD通过计算两条不同周期的指数移动平均线（EMA）之间的关系，
来判断价格趋势的方向和强度。

二、MACD计算方法
1. 计算快速EMA（通常为12日）和慢速EMA（通常为26日）
2. DIF = 快速EMA - 慢速EMA
3. DEA = DIF的9日EMA
4. MACD柱 = 2 × (DIF - DEA)

三、MACD金叉与死叉
- 金叉：DIF线从下方向上穿越DEA线，通常被视为买入信号
- 死叉：DIF线从上方向下穿越DEA线，通常被视为卖出信号

四、MACD背离
- 顶背离：价格创新高，但MACD指标未创新高，可能预示趋势反转
- 底背离：价格创新低，但MACD指标未创新低，可能预示趋势反转

五、使用注意事项
1. MACD是趋势跟踪指标，在震荡市中可能产生频繁的虚假信号
2. 建议结合其他指标（如KDJ、RSI）综合判断
3. 不同周期（日线、周线、月线）的MACD信号意义不同
4. 零轴上方的金叉通常比零轴下方的金叉更可靠
"""
    elif "KDJ" in name:
        content += """一、KDJ指标概述
KDJ指标（随机指标）由George Lane提出，是通过计算一定时期内最高价、最低价和收盘价之间的关系，
来判断价格超买超卖状态的技术指标。

二、KDJ计算方法
1. RSV = (收盘价 - N日内最低价) / (N日内最高价 - N日内最低价) × 100
2. K = 2/3 × 前日K值 + 1/3 × 当日RSV
3. D = 2/3 × 前日D值 + 1/3 × 当日K值
4. J = 3K - 2D

三、KDJ使用方法
- K值和D值在0-100之间波动
- K > 80, D > 80 为超买区域，可能回调
- K < 20, D < 20 为超卖区域，可能反弹
- J值可超过100或低于0，极端值预示反转

四、金叉与死叉
- 金叉：K线从下方向上穿越D线，买入信号
- 死叉：K线从上方向下穿越D线，卖出信号

五、使用注意事项
1. KDJ在震荡市中效果较好，趋势市中容易钝化
2. 超买超卖不代表立即反转，需结合趋势判断
3. 建议配合成交量分析使用
"""
    elif "RSI" in name:
        content += """一、RSI指标概述
RSI（Relative Strength Index，相对强弱指标）由Welles Wilder提出，
通过比较一段时间内上涨幅度和下跌幅度的比值，来判断市场的超买超卖状态。

二、RSI计算方法
RSI = 100 - 100 / (1 + RS)
其中 RS = N日内上涨幅度平均值 / N日内下跌幅度平均值
常用周期：6日、12日、24日

三、RSI使用方法
- RSI > 70 为超买区域，价格可能回调
- RSI < 30 为超卖区域，价格可能反弹
- RSI = 50 为多空分界线

四、RSI背离
- 顶背离：价格创新高，RSI未创新高
- 底背离：价格创新低，RSI未创新低

五、使用注意事项
1. 在强势趋势中，RSI可能长时间处于超买或超卖区域
2. 不同周期的RSI信号可能不同，建议多周期验证
3. RSI背离是较可靠的反转信号
"""
    elif "布林带" in name:
        content += """一、布林带指标概述
布林带（Bollinger Bands）由John Bollinger提出，是基于统计学的价格波动区间指标，
由中轨、上轨和下轨组成，反映价格的波动范围和趋势。

二、布林带计算方法
1. 中轨 = N日简单移动平均线（通常20日）
2. 上轨 = 中轨 + K × 标准差（通常K=2）
3. 下轨 = 中轨 - K × 标准差（通常K=2）

三、布林带使用方法
- 价格触及上轨：可能超买，关注回调风险
- 价格触及下轨：可能超卖，关注反弹机会
- 布林带收窄：波动率降低，可能即将突破
- 布林带扩张：波动率增加，趋势可能加速

四、使用注意事项
1. 布林带不提供方向性信号，需结合其他指标判断方向
2. 价格突破布林带不一定是反转信号
3. 布林带收窄后的突破方向通常较为可靠
"""
    elif "PE" in name or "市盈率" in name:
        content += """一、PE市盈率概述
PE（Price-to-Earnings Ratio，市盈率）是最常用的估值指标之一，
反映投资者为每1元净利润愿意支付的价格。

二、PE计算方法
PE = 股价 / 每股收益（EPS）
或 PE = 总市值 / 净利润

三、PE分类
1. 静态PE：使用上一年度净利润计算
2. 动态PE（TTM）：使用最近4个季度净利润计算
3. 预测PE：使用分析师预测净利润计算

四、PE使用方法
- PE越低，估值越便宜（同行业比较）
- PE为负表示公司亏损
- 不同行业PE差异大，需同行业比较
- PE历史分位数可判断当前估值水平

五、使用注意事项
1. PE不适用于亏损企业
2. 周期性行业PE可能失真（低PE可能是周期顶点）
3. 需结合增长率（PEG）综合判断
4. 一次性损益会影响PE的准确性
"""
    elif "PB" in name or "市净率" in name:
        content += """一、PB市净率概述
PB（Price-to-Book Ratio，市净率）是衡量股票估值水平的重要指标，
反映股价与每股净资产的关系。

二、PB计算方法
PB = 股价 / 每股净资产
或 PB = 总市值 / 净资产

三、PB使用方法
- PB < 1：股价低于净资产，可能被低估
- PB > 1：股价高于净资产，有溢价
- 同行业PB比较更有意义
- 银行、地产等重资产行业常用PB估值

四、使用注意事项
1. 无形资产占比高的公司PB参考价值有限
2. 资产减值会影响净资产的真实性
3. PB低不代表一定被低估，需关注资产质量
4. 不同行业PB中枢差异大
"""
    elif "ROE" in name or "净资产收益率" in name:
        content += """一、ROE净资产收益率概述
ROE（Return on Equity，净资产收益率）是衡量公司盈利能力的核心指标，
反映股东每投入1元净资产能获得多少净利润。

二、ROE计算方法
ROE = 净利润 / 净资产 × 100%
或 ROE = 每股收益 / 每股净资产 × 100%

三、杜邦分析分解
ROE = 净利率 × 资产周转率 × 权益乘数
三个驱动因素：
1. 净利率：反映盈利能力
2. 资产周转率：反映运营效率
3. 权益乘数：反映财务杠杆

四、ROE使用方法
- ROE > 15% 通常被认为是优秀公司
- 连续多年高ROE说明公司有持续竞争优势
- 关注ROE的驱动因素变化
- 同行业ROE比较更有意义

五、使用注意事项
1. 高杠杆可能导致ROE虚高，需关注负债率
2. 一次性收益会扭曲ROE
3. ROE应结合ROA（总资产收益率）一起分析
4. 关注ROE的趋势变化而非单一年度数值
"""

    try:
        with open(local_path, "w", encoding="utf-8") as f:
            f.write(content)
        logger.info(f"知识文档已生成: {local_path} ({len(content)} 字符)")
        return True
    except Exception as e:
        logger.error(f"生成文档失败: {e}")
        return False


def upload_file(file_path: str) -> dict:
    """上传文件到知识库"""
    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    logger.info(f"开始上传: {filename} ({file_size / 1024:.1f} KB)")

    ext = os.path.splitext(filename)[1].lower()
    mime_type = "application/pdf" if ext == ".pdf" else "text/plain"

    try:
        with open(file_path, "rb") as f:
            files = {"file": (filename, f, mime_type)}
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
    logger.info("  技术指标知识文档下载与上传脚本")
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
    generate_success = 0
    fail_count = 0
    upload_success = 0
    upload_skip = 0
    upload_fail = 0
    problems = []

    for doc_info in KNOWLEDGE_DOCS:
        logger.info(f"\n--- 处理: {doc_info['name']} ({doc_info['category']}) ---")

        local_path = os.path.join(DATA_DIR, doc_info["local_filename"])
        local_pdf_path = local_path.replace(".txt", ".pdf")

        # 检查本地是否已有文件
        local_file = None
        if os.path.exists(local_pdf_path) and os.path.getsize(local_pdf_path) > 1024:
            local_file = local_pdf_path
            logger.info(f"本地PDF已存在: {os.path.basename(local_pdf_path)}")
            download_success += 1
        elif os.path.exists(local_path) and os.path.getsize(local_path) > 100:
            local_file = local_path
            logger.info(f"本地文件已存在: {doc_info['local_filename']}")
            download_success += 1

        # 如果本地没有文件，尝试从网站获取
        if local_file is None:
            found = False

            # 1. 先尝试PDF下载
            for url in doc_info["attempt_urls"]:
                if try_download_pdf(url, local_pdf_path):
                    found = True
                    local_file = local_pdf_path
                    download_success += 1
                    break

            # 2. 尝试从HTML页面提取内容
            if not found:
                for url in doc_info["attempt_urls"]:
                    content = try_fetch_html_content(url, doc_info["content_keywords"])
                    if content:
                        try:
                            with open(local_path, "w", encoding="utf-8") as f:
                                f.write(f"{doc_info['name']}\n{'=' * 40}\n\n")
                                f.write(f"来源: {url}\n\n")
                                f.write(content)
                            local_file = local_path
                            download_success += 1
                            found = True
                            logger.info(f"HTML内容已保存: {local_path}")
                            break
                        except Exception as e:
                            logger.warning(f"保存HTML内容失败: {e}")

            # 3. 最后手段：生成基础知识文档
            if not found:
                logger.warning(f"无法从官方来源获取《{doc_info['name']}》，尝试生成基础知识文档")
                if generate_knowledge_doc(doc_info):
                    local_file = local_path
                    generate_success += 1
                    problem_msg = (
                        f"技术指标知识无官方可靠来源，已生成基础知识文档: {doc_info['name']}\n"
                        f"  建议从以下来源获取更详细内容:\n"
                        f"  - 上海证券交易所投教: http://www.sse.com.cn/investor/education/\n"
                        f"  - 深圳证券交易所投教: http://www.szse.cn/investor/education/\n"
                        f"  - 同花顺投教: https://edu.10jqka.com.cn/\n"
                        f"  - 东方财富投教: https://edu.eastmoney.com/"
                    )
                    problems.append(problem_msg)
                    logger.info(problem_msg)
                else:
                    fail_count += 1
                    problem_msg = (
                        f"技术指标知识无官方可靠来源，建议从以下来源获取《{doc_info['name']}》:\n"
                        f"  - 上海证券交易所投教: http://www.sse.com.cn/investor/education/\n"
                        f"  - 深圳证券交易所投教: http://www.szse.cn/investor/education/\n"
                        f"  - 同花顺投教: https://edu.10jqka.com.cn/\n"
                        f"  - 东方财富投教: https://edu.eastmoney.com/\n"
                        f"  下载后放入: {DATA_DIR}"
                    )
                    problems.append(problem_msg)
                    error_logger.error(problem_msg)
                    continue

        # 上传到知识库
        if local_file and os.path.exists(local_file):
            filename = os.path.basename(local_file)
            if filename in existing_docs and existing_docs[filename]["status"] == "completed":
                logger.info(f"跳过（已上传）: {filename}")
                upload_skip += 1
                continue

            result = upload_file(local_file)
            if result["success"]:
                upload_success += 1
            else:
                upload_fail += 1

            time.sleep(UPLOAD_INTERVAL)

    # 输出汇总
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    logger.info("\n" + "=" * 60)
    logger.info("  下载与上传汇总")
    logger.info("=" * 60)
    logger.info(f"  从网站下载: {download_success}")
    logger.info(f"  生成基础文档: {generate_success}")
    logger.info(f"  获取失败: {fail_count}")
    logger.info(f"  上传成功: {upload_success}")
    logger.info(f"  上传跳过: {upload_skip}")
    logger.info(f"  上传失败: {upload_fail}")
    logger.info(f"  耗时: {duration:.0f}秒")
    logger.info("=" * 60)

    # 输出问题提示
    if problems:
        logger.info("\n" + "!" * 60)
        logger.info("  需要注意的问题:")
        logger.info("!" * 60)
        for i, msg in enumerate(problems, 1):
            logger.info(f"\n  [{i}] {msg}")


if __name__ == "__main__":
    main()
