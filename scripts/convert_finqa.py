"""
FinQA 原始数据转换脚本
将 FinQA 原始格式转换为适配器期望的格式

原始格式:
{
  "pre_text": [...], "post_text": [...], "table": [[...]],
  "qa": {
    "question": "...", "program": "...", "steps": [...],
    "exe_ans": 94.0, "gold_inds": {...}, ...
  },
  "id": "..."
}

目标格式:
{
  "id": 1, "question": "...", "table": [[...]],
  "answer": "答案", "steps": ["步骤1", "步骤2"],
  "category": "numerical_reasoning", "difficulty": "easy|medium|hard"
}
"""

import json
import os
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 路径配置
SOURCE_FILE = r"d:\Python\ai-agent-platform\data\datasets\FinQA\test.json"
OUTPUT_PATH_1 = r"D:\data\modelscope\FinQA\converted\test.json"
OUTPUT_PATH_2 = r"d:\Python\ai-agent-platform\data\datasets\FinQA\converted\test.json"


def infer_difficulty(raw_steps_count: int) -> str:
    """根据原始 qa.steps 的操作步数推断难度

    使用原始 qa.steps 数组的长度（即推理操作步数）来判断难度，
    而非转换后的 steps 字段长度（因为 program 是单个字符串，长度恒为1）。
    """
    if raw_steps_count <= 2:
        return "easy"
    elif raw_steps_count <= 4:
        return "medium"
    else:
        return "hard"


def convert_item(raw_item: dict) -> dict | None:
    """转换单条数据"""
    try:
        raw_id = raw_item.get("id", "")
        qa = raw_item.get("qa", {})

        # 必填字段检查
        question = qa.get("question", "")
        if not question:
            logger.warning(f"跳过: id={raw_id}, 缺少 question")
            return None

        exe_ans = qa.get("exe_ans")
        if exe_ans is None:
            logger.warning(f"跳过: id={raw_id}, 缺少 exe_ans")
            return None

        # 处理 program -> steps
        program = qa.get("program", "")
        if isinstance(program, list):
            steps = program
        elif isinstance(program, str) and program.strip():
            steps = [program.strip()]
        else:
            # 如果 program 为空，尝试从 steps 对象构建
            raw_steps = qa.get("steps", [])
            if isinstance(raw_steps, list) and len(raw_steps) > 0:
                steps = []
                for step in raw_steps:
                    if isinstance(step, dict):
                        op = step.get("op", "")
                        arg1 = step.get("arg1", "")
                        arg2 = step.get("arg2", "")
                        res = step.get("res", "")
                        step_str = f"{op}({arg1}, {arg2}) = {res}"
                        steps.append(step_str)
                    elif isinstance(step, str):
                        steps.append(step)
            else:
                steps = []

        # 使用原始 qa.steps 的操作步数推断难度
        raw_steps = qa.get("steps", [])
        raw_steps_count = len(raw_steps) if isinstance(raw_steps, list) else 0

        # 构建转换后的数据
        converted = {
            "id": raw_id,
            "question": question,
            "table": raw_item.get("table", []),
            "answer": str(exe_ans),
            "steps": steps,
            "category": "numerical_reasoning",
            "difficulty": infer_difficulty(raw_steps_count),
        }

        return converted

    except Exception as e:
        logger.error(f"转换失败: id={raw_item.get('id', 'unknown')}, 错误: {e}")
        return None


def main():
    logger.info("=" * 60)
    logger.info("FinQA 数据转换脚本启动")
    logger.info("=" * 60)

    # 读取原始数据
    logger.info(f"读取原始数据: {SOURCE_FILE}")
    if not os.path.exists(SOURCE_FILE):
        logger.error(f"源文件不存在: {SOURCE_FILE}")
        return

    with open(SOURCE_FILE, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    logger.info(f"原始数据条目数: {len(raw_data)}")

    # 转换数据
    converted_data = []
    skipped = 0
    for item in raw_data:
        result = convert_item(item)
        if result:
            converted_data.append(result)
        else:
            skipped += 1

    logger.info(f"转换完成: 成功={len(converted_data)}, 跳过={skipped}")

    # 统计难度分布
    difficulty_stats = {"easy": 0, "medium": 0, "hard": 0}
    for item in converted_data:
        diff = item.get("difficulty", "medium")
        difficulty_stats[diff] = difficulty_stats.get(diff, 0) + 1
    logger.info(f"难度分布: {difficulty_stats}")

    # 统计 steps 长度分布
    steps_lengths = [len(item["steps"]) for item in converted_data]
    if steps_lengths:
        logger.info(
            f"Steps 长度: min={min(steps_lengths)}, max={max(steps_lengths)}, "
            f"avg={sum(steps_lengths)/len(steps_lengths):.2f}"
        )

    # 保存到项目目录
    os.makedirs(os.path.dirname(OUTPUT_PATH_2), exist_ok=True)
    with open(OUTPUT_PATH_2, "w", encoding="utf-8") as f:
        json.dump(converted_data, f, ensure_ascii=False, indent=2)
    logger.info(f"已保存到: {OUTPUT_PATH_2} ({len(converted_data)} 条)")

    # 尝试保存到 modelscope 目录
    try:
        os.makedirs(os.path.dirname(OUTPUT_PATH_1), exist_ok=True)
        with open(OUTPUT_PATH_1, "w", encoding="utf-8") as f:
            json.dump(converted_data, f, ensure_ascii=False, indent=2)
        logger.info(f"已保存到: {OUTPUT_PATH_1} ({len(converted_data)} 条)")
    except PermissionError as e:
        logger.warning(f"无法保存到 {OUTPUT_PATH_1}: {e}")
        logger.warning(f"请手动将 {OUTPUT_PATH_2} 复制到 {OUTPUT_PATH_1}")

    # 验证：读取并检查
    logger.info("=" * 60)
    logger.info("验证转换结果")
    logger.info("=" * 60)

    verify_paths = [OUTPUT_PATH_2]
    if os.path.exists(OUTPUT_PATH_1):
        verify_paths.append(OUTPUT_PATH_1)

    for output_path in verify_paths:
        with open(output_path, "r", encoding="utf-8") as f:
            verify_data = json.load(f)

        logger.info(f"验证文件: {output_path}")
        logger.info(f"  条目数: {len(verify_data)}")

        # 检查必填字段
        errors = []
        for i, item in enumerate(verify_data):
            if not item.get("id"):
                errors.append(f"第{i+1}条: 缺少 id")
            if not item.get("question"):
                errors.append(f"第{i+1}条 (id={item.get('id')}): 缺少 question")
            if not item.get("answer") and item.get("answer") != "0":
                errors.append(f"第{i+1}条 (id={item.get('id')}): 缺少 answer")
            if item.get("difficulty") not in ("easy", "medium", "hard"):
                errors.append(f"第{i+1}条 (id={item.get('id')}): 无效 difficulty={item.get('difficulty')}")

        if errors:
            logger.error(f"  验证失败, 错误数: {len(errors)}")
            for err in errors[:10]:
                logger.error(f"    {err}")
        else:
            logger.info(f"  验证通过!")

    # 打印前3条样本
    logger.info("=" * 60)
    logger.info("前3条转换样本")
    logger.info("=" * 60)
    for i in range(min(3, len(converted_data))):
        sample = converted_data[i]
        logger.info(f"样本 {i+1}:")
        logger.info(f"  id: {sample['id']}")
        logger.info(f"  question: {sample['question'][:80]}...")
        logger.info(f"  table rows: {len(sample['table'])}")
        logger.info(f"  answer: {sample['answer']}")
        logger.info(f"  steps: {sample['steps']}")
        logger.info(f"  category: {sample['category']}")
        logger.info(f"  difficulty: {sample['difficulty']}")

    logger.info("=" * 60)
    logger.info("转换脚本执行完毕")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
