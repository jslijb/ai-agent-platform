#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Test AGNES API connectivity using requests library directly"""
import os
import time
import requests
import json

def main():
    key = os.getenv("AGNES_KEY", "")
    if not key:
        print("AGNES_KEY not set")
        return

    print(f"AGNES_KEY length: {len(key)}")

    url = "https://apihub.agnes-ai.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
    }
    payload = {
        "model": "agnes-2.0-flash",
        "messages": [{"role": "user", "content": "hello"}],
        "temperature": 0,
    }

    print(f"Sending test request to {url}...")
    start = time.time()
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        elapsed = time.time() - start
        print(f"Status: {resp.status_code}, elapsed: {elapsed:.2f}s")
        print(f"Response: {resp.text[:500]}")
    except requests.exceptions.Timeout:
        elapsed = time.time() - start
        print(f"TIMEOUT - elapsed: {elapsed:.2f}s")
    except requests.exceptions.ConnectionError as e:
        elapsed = time.time() - start
        print(f"CONNECTION ERROR - elapsed: {elapsed:.2f}s")
        print(f"Error: {str(e)[:300]}")
    except Exception as e:
        elapsed = time.time() - start
        print(f"FAILED - elapsed: {elapsed:.2f}s")
        print(f"Error type: {type(e).__name__}")
        print(f"Error: {str(e)[:300]}")

    # Also test basic connectivity
    print("\n--- Testing basic connectivity ---")
    start = time.time()
    try:
        r = requests.get("https://apihub.agnes-ai.com", timeout=30)
        elapsed = time.time() - start
        print(f"GET https://apihub.agnes-ai.com - Status: {r.status_code}, elapsed: {elapsed:.2f}s")
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET failed - elapsed: {elapsed:.2f}s, error: {type(e).__name__}: {str(e)[:200]}")

if __name__ == "__main__":
    main()
