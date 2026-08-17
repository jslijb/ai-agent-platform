#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Test DashScope API with different keys"""
import os
import time
from openai import OpenAI

def test_key(key_name, key_value, model="qwen-plus"):
    print(f"\n--- Testing {key_name} (model={model}) ---")
    print(f"Key prefix: {key_value[:8]}..., length: {len(key_value)}")

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
            messages=[{"role": "user", "content": "hello, reply with one word"}],
            temperature=0,
            timeout=30,
        )
        elapsed = time.time() - start
        content = resp.choices[0].message.content or ""
        print(f"SUCCESS - elapsed: {elapsed:.2f}s")
        print(f"Response: {content[:200]}")
        return True
    except Exception as e:
        elapsed = time.time() - start
        err_msg = str(e)
        print(f"FAILED - elapsed: {elapsed:.2f}s")
        print(f"Error type: {type(e).__name__}")
        print(f"Error: {err_msg[:300]}")
        return False

def main():
    # Test DASHSCOPE_API_KEY
    key1 = os.getenv("DASHSCOPE_API_KEY", "")
    if key1:
        test_key("DASHSCOPE_API_KEY", key1, "qwen-plus")
    else:
        print("DASHSCOPE_API_KEY not set")

    # Test DASHSCOPE_API_KEY1
    key2 = os.getenv("DASHSCOPE_API_KEY1", "")
    if key2:
        test_key("DASHSCOPE_API_KEY1", key2, "qwen-plus")
    else:
        print("DASHSCOPE_API_KEY1 not set")

    # Test DASHSCOPE_API_KEY1 with qwen-flash (free model)
    if key2:
        test_key("DASHSCOPE_API_KEY1 (qwen-flash)", key2, "qwen-flash")

    # Test DASHSCOPE_API_KEY1 with qwen-turbo (cheaper model)
    if key2:
        test_key("DASHSCOPE_API_KEY1 (qwen-turbo)", key2, "qwen-turbo")

if __name__ == "__main__":
    main()
