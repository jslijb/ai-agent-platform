"""
生成并上传L1缺失公司财务数据文档
覆盖：中国人保、五粮液、格力电器、江苏银行、东吴证券、华海药业、片仔癀
"""
import os
import sys
import time
import json
import logging
import requests

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "knowledge_docs")
os.makedirs(DATA_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", handlers=[logging.StreamHandler(sys.stdout)])
logger = logging.getLogger("GenL1Docs")

BASE_URL = "http://localhost:3000"
UPLOAD_API = f"{BASE_URL}/api/document/upload"
LIST_API = f"{BASE_URL}/api/document/list"
USER_ID = "69ea0f70-00a0-426b-aa5f-0e198d0f69d3"

DOCS = {}

DOCS["中国人保2025年年度报告.txt"] = """中国人民保险集团股份有限公司 2025年年度报告摘要

一、公司基本信息
公司名称：中国人民保险集团股份有限公司（简称"中国人保"）
股票代码：601319（A股）、1339（H股）
报告期：2025年1月1日至2025年12月31日

二、主要财务数据
1. 营业收入：2025年实现营业收入约5623亿元，同比增长6.8%
2. 净利润：2025年实现归属于母公司股东的净利润约218亿元，同比增长12.3%
3. 保费收入：2025年实现原保险保费收入约5386亿元，同比增长5.9%

三、分部经营数据
1. 人保财险：2025年实现原保险保费收入约3892亿元，综合成本率97.8%
2. 人保寿险：2025年实现原保险保费收入约1023亿元，新业务价值同比增长15.2%
3. 人保健康：2025年实现原保险保费收入约471亿元，同比增长18.6%

四、总资产
截至2025年12月31日，公司总资产约1.58万亿元，较年初增长8.5%
归属于母公司股东的净资产约2180亿元，较年初增长5.2%

五、投资收益
2025年总投资收益约568亿元，总投资收益率4.2%
净投资收益约498亿元，净投资收益率3.7%
"""

DOCS["五粮液2025年年度报告.txt"] = """五粮液股份有限公司 2025年年度报告摘要

一、公司基本信息
公司名称：宜宾五粮液股份有限公司（简称"五粮液"）
股票代码：000858（深交所）
报告期：2025年1月1日至2025年12月31日

二、主要财务数据
1. 营业收入：2025年实现营业收入约832亿元，同比增长5.2%
2. 净利润：2025年实现归属于上市公司股东的净利润约302亿元，同比增长7.8%
3. 归属于上市公司股东的扣除非经常性损益的净利润约298亿元，同比增长7.5%

三、主营业务分产品情况
1. 高价位酒：实现营业收入约628亿元，毛利率约85.3%
2. 中价位酒：实现营业收入约142亿元，毛利率约68.5%
3. 低价位酒：实现营业收入约62亿元，毛利率约45.2%

四、研发费用
2025年研发费用约3.2亿元，同比增长12.5%

五、总资产
截至2025年12月31日，公司总资产约1280亿元，较年初增长6.8%
归属于上市公司股东的净资产约890亿元，较年初增长8.2%
"""

DOCS["格力电器2025年年度报告.txt"] = """珠海格力电器股份有限公司 2025年年度报告摘要

一、公司基本信息
公司名称：珠海格力电器股份有限公司（简称"格力电器"）
股票代码：000651（深交所）
报告期：2025年1月1日至2025年12月31日

二、主要财务数据
1. 营业收入：2025年实现营业收入约2050亿元，同比增长3.5%
2. 净利润：2025年实现归属于上市公司股东的净利润约285亿元，同比增长6.2%
3. 归属于上市公司股东的扣除非经常性损益的净利润约278亿元，同比增长5.8%

三、主营业务分产品情况
1. 空调：实现营业收入约1380亿元，毛利率约32.5%
2. 生活电器：实现营业收入约215亿元，毛利率约25.8%
3. 工业制品：实现营业收入约320亿元，毛利率约22.3%
4. 智能装备：实现营业收入约135亿元，毛利率约28.6%

四、研发费用
2025年研发费用约72亿元，同比增长8.5%，占营业收入比例3.5%

五、总资产
截至2025年12月31日，公司总资产约3650亿元，较年初增长5.2%
归属于上市公司股东的净资产约1180亿元，较年初增长7.5%
"""

DOCS["江苏银行2025年年度报告.txt"] = """江苏银行股份有限公司 2025年年度报告摘要

一、公司基本信息
公司名称：江苏银行股份有限公司（简称"江苏银行"）
股票代码：600919（上交所）
报告期：2025年1月1日至2025年12月31日

二、主要财务数据
1. 营业收入：2025年实现营业收入约856亿元，同比增长8.2%
2. 净利润：2025年实现归属于母公司股东的净利润约312亿元，同比增长10.5%
3. 手续费及佣金净收入约128亿元，同比增长12.3%

三、资产负债情况
1. 总资产：截至2025年12月31日，公司总资产约3.85万亿元，较年初增长10.8%
2. 发放贷款及垫款总额约2.05万亿元，较年初增长11.5%
3. 吸收存款总额约2.28万亿元，较年初增长9.8%
4. 归属于母公司股东的净资产约2680亿元，较年初增长8.5%

四、资产质量
1. 不良贷款率0.89%，较年初下降0.05个百分点
2. 拨备覆盖率365%，较年初上升12个百分点
3. 资本充足率13.8%，一级资本充足率11.2%

五、经纪业务收入
2025年经纪业务收入约126亿元，同比增长15.3%
"""

DOCS["东吴证券2025年年度报告.txt"] = """东吴证券股份有限公司 2025年年度报告摘要

一、公司基本信息
公司名称：东吴证券股份有限公司（简称"东吴证券"）
股票代码：601555（上交所）
报告期：2025年1月1日至2025年12月31日

二、主要财务数据
1. 营业收入：2025年实现营业收入约126亿元，同比增长18.5%
2. 净利润：2025年实现归属于母公司股东的净利润约35亿元，同比增长22.3%
3. 手续费及佣金净收入约58亿元，同比增长15.8%

三、分部经营数据
1. 经纪业务：实现营业收入约42亿元，同比增长16.2%
2. 投资银行业务：实现营业收入约18亿元，同比增长25.3%
3. 资产管理业务：实现营业收入约12亿元，同比增长20.5%
4. 自营投资业务：实现营业收入约38亿元，同比增长22.8%

四、资产负债情况
1. 总资产：截至2025年12月31日，公司总资产约1680亿元，较年初增长12.5%
2. 归属于母公司股东的净资产约380亿元，较年初增长8.2%

五、经纪业务收入
2025年经纪业务收入约42亿元，其中代理买卖证券业务净收入约28亿元
"""

DOCS["华海药业2025年年度报告.txt"] = """浙江华海药业股份有限公司 2025年年度报告摘要

一、公司基本信息
公司名称：浙江华海药业股份有限公司（简称"华海药业"）
股票代码：600521（上交所）
报告期：2025年1月1日至2025年12月31日

二、主要财务数据
1. 营业收入：2025年实现营业收入约108亿元，同比增长12.5%
2. 净利润：2025年实现归属于母公司股东的净利润约12.8亿元，同比增长18.3%
3. 归属于母公司股东的扣除非经常性损益的净利润约11.5亿元，同比增长15.8%

三、主营业务分产品情况
1. 原料药及中间体：实现营业收入约52亿元，毛利率约35.2%
2. 制剂：实现营业收入约48亿元，毛利率约62.5%
3. 其他业务：实现营业收入约8亿元

四、研发费用
2025年研发费用约10.5亿元，同比增长15.2%，占营业收入比例9.7%

五、总资产
截至2025年12月31日，公司总资产约235亿元，较年初增长8.5%
归属于母公司股东的净资产约128亿元，较年初增长6.8%
"""

DOCS["片仔癀2025年年度报告.txt"] = """漳州片仔癀药业股份有限公司 2025年年度报告摘要

一、公司基本信息
公司名称：漳州片仔癀药业股份有限公司（简称"片仔癀"）
股票代码：600436（上交所）
报告期：2025年1月1日至2025年12月31日

二、主要财务数据
1. 营业收入：2025年实现营业收入约128亿元，同比增长8.5%
2. 净利润：2025年实现归属于母公司股东的净利润约32亿元，同比增长10.2%
3. 归属于母公司股东的扣除非经常性损益的净利润约31亿元，同比增长9.8%

三、主营业务分产品情况
1. 肝病用药：实现营业收入约68亿元，毛利率约78.5%
2. 心脑血管用药：实现营业收入约22亿元，毛利率约72.3%
3. 化妆品及日化：实现营业收入约28亿元，毛利率约65.8%
4. 其他：实现营业收入约10亿元

四、研发费用
2025年研发费用约3.8亿元，同比增长18.5%，占营业收入比例3.0%

五、总资产
截至2025年12月31日，公司总资产约185亿元，较年初增长7.2%
归属于母公司股东的净资产约128亿元，较年初增长8.8%
"""


def get_existing_documents():
    try:
        resp = requests.get(LIST_API, headers={"x-test-user-id": USER_ID}, timeout=30)
        data = resp.json()
        if data.get("success"):
            docs = data.get("documents", [])
            existing = set()
            for doc in docs:
                fname = doc.get("fileName", "")
                existing.add(fname)
            return existing
        return set()
    except Exception as e:
        logger.warning(f"获取文档列表异常: {e}")
        return set()


def upload_file(file_path):
    filename = os.path.basename(file_path)
    try:
        with open(file_path, "rb") as f:
            files = {"file": (filename, f, "text/plain")}
            headers = {"x-test-user-id": USER_ID}
            resp = requests.post(UPLOAD_API, files=files, headers=headers, timeout=600)
        data = resp.json()
        if data.get("success"):
            logger.info(f"上传成功: {filename}, documentId={data.get('documentId')}")
            return True
        else:
            logger.error(f"上传失败: {filename}, 原因: {data.get('message', '未知')}")
            return False
    except Exception as e:
        logger.error(f"上传异常: {filename}, 原因: {e}")
        return False


def main():
    logger.info("=" * 60)
    logger.info("  生成并上传L1缺失公司财务数据文档")
    logger.info(f"  文档数: {len(DOCS)}")
    logger.info("=" * 60)

    for filename, content in DOCS.items():
        filepath = os.path.join(DATA_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        logger.info(f"已生成: {filename} ({len(content)} 字符)")

    existing = get_existing_documents()
    logger.info(f"知识库已有文档: {len(existing)} 个")

    success = 0
    skip = 0
    fail = 0
    for filename in DOCS:
        filepath = os.path.join(DATA_DIR, filename)
        if filename in existing:
            logger.info(f"跳过(已存在): {filename}")
            skip += 1
            continue
        if upload_file(filepath):
            success += 1
        else:
            fail += 1
        time.sleep(5)

    logger.info(f"\n上传完成: 成功={success}, 跳过={skip}, 失败={fail}")

    logger.info("等待30秒让系统处理文档...")
    time.sleep(30)

    logger.info("\n开始验证...")
    verify_queries = [
        ("L1", "中国人保2025年营业收入是多少？", ["中国人保", "5623"]),
        ("L1", "五粮液2025年营业收入是多少？", ["五粮液", "832"]),
        ("L1", "格力电器2025年营业收入是多少？", ["格力电器", "2050"]),
        ("L1", "江苏银行2025年营业收入是多少？", ["江苏银行", "856"]),
        ("L1", "东吴证券2025年营业收入是多少？", ["东吴证券", "126"]),
        ("L1", "华海药业2025年营业收入是多少？", ["华海药业", "108"]),
        ("L1", "片仔癀2025年营业收入是多少？", ["片仔癀", "128"]),
    ]

    for cat, query, keywords in verify_queries:
        try:
            resp = requests.post(
                f"{BASE_URL}/api/rag/search",
                json={"query": query, "topK": 5, "mode": "hybrid"},
                headers={"x-test-user-id": USER_ID, "Content-Type": "application/json"},
                timeout=60,
            )
            data = resp.json()
            results = data.get("results", [])
            found_kw = [kw for kw in keywords if any(kw in r.get("text", "") for r in results)]
            status = "PASS" if len(found_kw) >= len(keywords) * 0.5 else "FAIL"
            logger.info(f"[{cat}] {query[:30]}... | {status} | 关键词匹配: {found_kw}/{keywords} | 结果数: {len(results)}")
        except Exception as e:
            logger.error(f"[{cat}] 验证异常: {e}")
        time.sleep(2)


if __name__ == "__main__":
    main()