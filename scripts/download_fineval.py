"""
FinEval 数据集下载和转换脚本
从 GitHub 旧 commit 下载金融多选题数据，转换为适配器期望的格式
"""
import os
import csv
import json
import logging
import subprocess
import sys

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(os.path.dirname(__file__), 'fineval_download.log'), encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)

# 旧 commit hash（数据删除前的最后一个 commit）
COMMIT_HASH = "0a5f23f01e0291b11f0a0a06e3737770d471d731"

# GitHub 镜像加速地址
MIRROR_BASE = "https://ghfast.top/"

# 数据文件在 GitHub 中的基础路径
GITHUB_DATA_BASE = f"https://raw.githubusercontent.com/SUFE-AIFLM-Lab/FinEval/{COMMIT_HASH}/code/opensource_eval/1academic_eval/code/data"

# 学科列表及其分类
SUBJECT_MAPPING = {
    "accounting": ["accounting", "会计", "Accounting"],
    "advanced_financial_accounting": ["advanced_financial_accounting", "高级财务会计", "Accounting"],
    "auditing": ["auditing", "审计学", "Accounting"],
    "corporate_strategy_and_risk_management": ["corporate_strategy_and_risk_management", "公司战略与风险管理", "Accounting"],
    "cost_accounting": ["cost_accounting", "成本会计学", "Accounting"],
    "economic_law": ["economic_law", "经济法", "Accounting"],
    "financial_management": ["financial_management", "财务管理学", "Accounting"],
    "intermediate_financial_accounting": ["intermediate_financial_accounting", "中级财务会计", "Accounting"],
    "management_accounting": ["management_accounting", "管理会计学", "Accounting"],
    "tax_law": ["tax_law", "税法", "Accounting"],
    "banking_practitioner_qualification_certificate": ["banking_practitioner_qualification_certificate", "银行从业资格证", "Certificate"],
    "certified_management_accountant": ["certified_management_accountant", "管理会计师", "Certificate"],
    "certified_practising_accountant": ["certified_practising_accountant", "注册会计师", "Certificate"],
    "china_actuary": ["china_actuary", "中国精算师", "Certificate"],
    "fund_qualification_certificate": ["fund_qualification_certificate", "基金从业资格证", "Certificate"],
    "futures_practitioner_qualification_certificate": ["futures_practitioner_qualification_certificate", "期货从业资格证", "Certificate"],
    "securities_practitioner_qualification_certificate": ["securities_practitioner_qualification_certificate", "证券从业资格证", "Certificate"],
    "econometrics": ["econometrics", "计量经济学", "Economy"],
    "international_economics": ["international_economics", "国际经济学", "Economy"],
    "macroeconomics": ["macroeconomics", "宏观经济学", "Economy"],
    "microeconomics": ["microeconomics", "微观经济学", "Economy"],
    "political_economy": ["political_economy", "政治经济学", "Economy"],
    "public_finance": ["public_finance", "财政学", "Economy"],
    "statistics": ["statistics", "统计学", "Economy"],
    "central_banking": ["central_banking", "中央银行学", "Finance"],
    "commercial_bank_finance": ["commercial_bank_finance", "商业银行金融学", "Finance"],
    "corporate_finance": ["corporate_finance", "公司金融学", "Finance"],
    "finance": ["finance", "金融学", "Finance"],
    "financial_engineering": ["financial_engineering", "金融工程学", "Finance"],
    "financial_markets": ["financial_markets", "金融市场学", "Finance"],
    "insurance": ["insurance", "保险学", "Finance"],
    "international_finance": ["international_finance", "国际金融学", "Finance"],
    "investments": ["investments", "投资学", "Finance"],
    "monetary_finance": ["monetary_finance", "货币金融学", "Finance"],
}

# 临时下载目录
TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp_csv")

# 输出目录
OUTPUT_DIRS = [
    r"D:\data\modelscope\FinEval\converted",
    r"d:\Python\ai-agent-platform\data\datasets\FinEval\converted",
]


def download_csv_file(subject_name, split="val"):
    """使用 curl.exe 从 GitHub 镜像下载 CSV 文件"""
    filename = f"{subject_name}_{split}.csv"
    url = f"{GITHUB_DATA_BASE}/{split}/{filename}"
    mirror_url = f"{MIRROR_BASE}{url}"

    os.makedirs(TEMP_DIR, exist_ok=True)
    output_path = os.path.join(TEMP_DIR, filename)

    logger.info(f"正在下载: {filename}")
    logger.info(f"URL: {mirror_url}")

    try:
        result = subprocess.run(
            ["curl.exe", "-s", "-L", "-o", output_path, mirror_url],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            logger.error(f"下载失败 {filename}: {result.stderr}")
            return None

        # 验证文件是否下载成功
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            logger.error(f"下载的文件为空或不存在: {filename}")
            return None

        # 检查文件内容是否为有效 CSV（不是 HTML 错误页面）
        with open(output_path, 'r', encoding='utf-8') as f:
            first_line = f.readline()
            if not first_line.startswith('id,') and not first_line.startswith('id\t'):
                logger.error(f"下载的文件内容无效: {filename}, 首行: {first_line[:100]}")
                return None

        logger.info(f"下载成功: {filename} ({os.path.getsize(output_path)} bytes)")
        return output_path

    except subprocess.TimeoutExpired:
        logger.error(f"下载超时: {filename}")
        return None
    except Exception as e:
        logger.error(f"下载异常 {filename}: {str(e)}")
        return None


def convert_csv_to_json(csv_path, subject_name, category_cn, category_en):
    """将 CSV 文件转换为适配器期望的 JSON 格式"""
    items = []

    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            # 尝试检测分隔符
            sample = f.read(2048)
            f.seek(0)

            # 使用 csv.Sniffer 检测分隔符
            try:
                dialect = csv.Sniffer().sniff(sample)
                delimiter = dialect.delimiter
            except csv.Error:
                delimiter = ','

            reader = csv.DictReader(f, delimiter=delimiter)

            for row_idx, row in enumerate(reader):
                try:
                    # 获取字段值，处理可能的字段名差异
                    question = row.get('question', '').strip()
                    option_a = row.get('A', '').strip()
                    option_b = row.get('B', '').strip()
                    option_c = row.get('C', '').strip()
                    option_d = row.get('D', '').strip()
                    answer = row.get('answer', '').strip()
                    explanation = row.get('explanation', '').strip()

                    # 跳过空行
                    if not question:
                        continue

                    # 验证答案格式
                    if answer not in ['A', 'B', 'C', 'D']:
                        logger.warning(f"跳过无效答案行 (subject={subject_name}, row={row_idx}): answer='{answer}'")
                        continue

                    item = {
                        "id": row_idx + 1,
                        "question": question,
                        "A": option_a,
                        "B": option_b,
                        "C": option_c,
                        "D": option_d,
                        "answer": answer,
                        "explanation": explanation,
                        "category": category_en,
                        "subcategory": category_cn,
                        "subject": subject_name,
                    }
                    items.append(item)

                except Exception as e:
                    logger.warning(f"解析行失败 (subject={subject_name}, row={row_idx}): {str(e)}")
                    continue

    except Exception as e:
        logger.error(f"读取 CSV 文件失败 {csv_path}: {str(e)}")
        return []

    return items


def save_json(items, output_path, subject_name):
    """保存 JSON 文件"""
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        logger.info(f"保存成功: {output_path} ({len(items)} 条记录)")
        return True
    except Exception as e:
        logger.error(f"保存 JSON 失败 {output_path}: {str(e)}")
        return False


def main():
    logger.info("=" * 60)
    logger.info("FinEval 数据集下载和转换开始")
    logger.info("=" * 60)

    # 清理旧的错误数据
    for output_dir in OUTPUT_DIRS:
        if os.path.exists(output_dir):
            for f in os.listdir(output_dir):
                if f.endswith('.json'):
                    file_path = os.path.join(output_dir, f)
                    # 删除网络安全相关的错误数据
                    if any(sec in f.lower() for sec in ['cryptography', 'malware', 'memorysafety',
                                                         'networksecurity', 'pentest', 'reverse',
                                                         'softwaresecurity', 'systemsecurity',
                                                         'vulnerability', 'websecurity']):
                        os.remove(file_path)
                        logger.info(f"删除旧的错误数据: {file_path}")

    total_items = 0
    success_count = 0
    fail_count = 0

    for subject_name, mapping_info in SUBJECT_MAPPING.items():
        subject_en, category_cn, category_en = mapping_info

        # 下载 val CSV 文件
        csv_path = download_csv_file(subject_name, split="val")
        if csv_path is None:
            # 尝试直接下载（不使用镜像）
            logger.info(f"镜像下载失败，尝试直接下载: {subject_name}")
            continue

        # 转换为 JSON
        items = convert_csv_to_json(csv_path, subject_name, category_cn, category_en)
        if not items:
            logger.warning(f"转换结果为空: {subject_name}")
            fail_count += 1
            continue

        # 保存到所有输出目录
        json_filename = f"{subject_name}_val.json"
        all_saved = True
        for output_dir in OUTPUT_DIRS:
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, json_filename)
            if not save_json(items, output_path, subject_name):
                all_saved = False

        if all_saved:
            total_items += len(items)
            success_count += 1
        else:
            fail_count += 1

    # 清理临时文件
    if os.path.exists(TEMP_DIR):
        import shutil
        shutil.rmtree(TEMP_DIR)
        logger.info(f"已清理临时目录: {TEMP_DIR}")

    logger.info("=" * 60)
    logger.info(f"FinEval 数据集下载和转换完成")
    logger.info(f"成功: {success_count} 个学科, 失败: {fail_count} 个学科")
    logger.info(f"总记录数: {total_items}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
