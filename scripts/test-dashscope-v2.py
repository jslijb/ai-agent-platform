#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""测试百炼平台所有可用的 API key 和模型版本（V2）"""
import os
import time
from openai import OpenAI

# 百炼所有可能的 key 环境变量名
KEY_ENVS = [
    "DASHSCOPE_API_KEY",
    "DASHSCOPE_API_KEY1",
    "DASHSCOPE_API_KEY2",
    "DASHSCOPE_API_KEY3",
    "BAILIAN_API_KEY",
    "ALIYUN_API_KEY",
    "ALI_API_KEY",
]

# api_keys.yaml 中配置的所有 qwen-plus 版本 + 备选模型
MODELS = [
    "qwen-plus-2025-07-14",
    "qwen-plus-2025-04-28",
    "qwen-plus-2025-01-25",
    "qwen-plus-2025-09-11",
    "qwen-plus-latest",
    "qwen-plus",
    "qwen-turbo",
    "qwen-flash",
    "qwen-max",
    "qwen-max-latest",
]


def test(key_name, key_value, model):
    """测试单个 key+model 组合"""
    client = OpenAI(
        api_key=key_value,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        timeout=30,
        max_retries=0,
    )
    start = time.time()
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "回复一个字: 好"}],
            temperature=0,
            timeout=30,
        )
        elapsed = time.time() - start
        content = resp.choices[0].message.content or ""
        print(f"  [OK] {model} - {elapsed:.2f}s - {content[:50]}")
        return True
    except Exception as e:
        elapsed = time.time() - start
        err = str(e)[:150]
        print(f"  [FAIL] {model} - {elapsed:.2f}s - {err}")
        return False


def main():
    print("=" * 80)
    print("百炼 key 和模型可用性测试")
    print("=" * 80)

    # 1. 列出所有相关环境变量
    print("\n【环境变量检查】")
    found_keys = {}
    for env_name in KEY_ENVS:
        val = os.getenv(env_name, "")
        if val:
            print(f"  {env_name} = {val[:12]}...(len={len(val)})")
            found_keys[env_name] = val
        else:
            print(f"  {env_name} = (未设置)")

    if not found_keys:
        print("\n未找到任何百炼相关环境变量！")
        return

    # 2. 对每个 key 测试所有模型
    for key_name, key_value in found_keys.items():
        print(f"\n【测试 key: {key_name}】(前缀: {key_value[:12]}...)")
        success_count = 0
        for model in MODELS:
            if test(key_name, key_value, model):
                success_count += 1
        print(f"  小结: {success_count}/{len(MODELS)} 个模型可用")

    print("\n" + "=" * 80)
    print("测试完成")
    print("=" * 80)


if __name__ == "__main__":
    main()
