#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""测试百炼平台 V3：支持专属工作空间 URL（MaaS API）"""
import os
import time
from openai import OpenAI

# 百炼所有可能的 key 环境变量名
KEY_ENVS = [
    "DASHSCOPE_API_KEY",
    "DASHSCOPE_API_KEY1",
    "DASHSCOPE_API_KEY2",
    "DASHSCOPE_API_KEY3",
]

# 两种 base_url 都要测试
BASE_URLS = [
    # 专属工作空间 URL（用户最新提供）
    ("maas_workspace", "https://ws-tnq834yxgaaw4e8v.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"),
    # 标准 DashScope URL（旧版）
    ("dashscope_standard", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
]

# 测试模型列表（含 yaml 中所有版本 + 备选）
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


def test(key_name, key_value, base_url_name, base_url, model):
    """测试单个 key+url+model 组合"""
    client = OpenAI(
        api_key=key_value,
        base_url=base_url,
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
    print("百炼平台 V3 测试（支持专属工作空间 URL）")
    print("=" * 80)

    # 1. 列出所有相关环境变量
    print("\n【环境变量检查】")
    found_keys = {}
    for env_name in KEY_ENVS:
        val = os.getenv(env_name, "")
        if val:
            print(f"  [OK] {env_name} = {val[:12]}...(len={len(val)})")
            found_keys[env_name] = val
        else:
            print(f"  [--] {env_name} = (未设置)")

    if not found_keys:
        print("\n未找到任何百炼相关环境变量！")
        return

    # 2. 对每个 key + 每个 URL 测试所有模型
    for key_name, key_value in found_keys.items():
        for base_url_name, base_url in BASE_URLS:
            print(f"\n【key={key_name}, url={base_url_name}】")
            print(f"  base_url: {base_url}")
            print(f"  key prefix: {key_value[:12]}...")
            success_count = 0
            for model in MODELS:
                if test(key_name, key_value, base_url_name, base_url, model):
                    success_count += 1
                    break  # 只要有一个模型成功就停止测试这个 key+url 组合
            else:
                print(f"  小结: {success_count}/{len(MODELS)} 个模型可用")
                continue
            print(f"  小结: {success_count}/{len(MODELS)} 个模型可用（找到可用模型，停止测试）")

    print("\n" + "=" * 80)
    print("测试完成")
    print("=" * 80)


if __name__ == "__main__":
    main()
