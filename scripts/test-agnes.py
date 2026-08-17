#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Test AGNES API connectivity"""
import os
import time
import sys

def main():
    key = os.getenv("AGNES_KEY", "")
    if not key:
        print("AGNES_KEY not set")
        sys.exit(1)

    print(f"AGNES_KEY length: {len(key)}")
    print(f"AGNES_KEY prefix: {key[:8]}...")

    try:
        from openai import OpenAI
    except ImportError:
        print("openai not installed, trying pip install...")
        os.system("pip install openai")
        from openai import OpenAI

    client = OpenAI(
        api_key=key,
        base_url="https://apihub.agnes-ai.com/v1",
        timeout=120,
        max_retries=0,
    )

    print("Sending test request to AGNES agnes-2.0-flash...")
    start = time.time()
    try:
        resp = client.chat.completions.create(
            model="agnes-2.0-flash",
            messages=[{"role": "user", "content": "hello"}],
            temperature=0,
            timeout=120,
        )
        elapsed = time.time() - start
        content = resp.choices[0].message.content or ""
        print(f"SUCCESS - elapsed: {elapsed:.2f}s")
        print(f"Response: {content[:200]}")
    except Exception as e:
        elapsed = time.time() - start
        print(f"FAILED - elapsed: {elapsed:.2f}s")
        print(f"Error type: {type(e).__name__}")
        print(f"Error: {str(e)[:300]}")

if __name__ == "__main__":
    main()
