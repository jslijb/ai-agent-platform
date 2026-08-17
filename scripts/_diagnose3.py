#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""诊断中国人保、华海药业、中国铁建、片仔癀的关键 chunks 格式。"""
import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
CHUNKS_CACHE = SCRIPT_DIR / "_chunks_cache.json"

with open(CHUNKS_CACHE, encoding="utf-8") as f:
    cache = json.load(f)

DOC_MAP = {
    "中国人保": "96fbb269-27ff-4e4c-9728-149c224757c9",
    "华海药业": "4d9b581b-f92f-4932-be2c-332991bd9135",
    "中国铁建": "004689c8-0bc3-494a-b7c8-9fed16234051",
    "片仔癀": "2b07be9c-8d9b-4776-ae7f-d380e01f1b43",
    "中国能建": "066be4a7-a8ff-4686-a621-61e6d2cb879d",
    "江苏银行": "dc9487b2-a56e-4784-9620-4bd1fbe22c22",
}

KEYWORDS = ["营业收入", "净利润", "营业总成本", "营业成本", "总资产", "资产总计",
            "净资产", "归属于上市公司股东", "归属于母公司", "研发费用", "研发投入",
            "保费收入", "原保险保费", "经纪业务", "新签合同", "负债合计", "负债总计",
            "毛利率", "净利率", "净资产收益率", "资产负债率", "同比"]


def show_company(name, max_chunks=8):
    doc_id = DOC_MAP[name]
    chunks = cache.get(doc_id, [])
    print(f"\n{'='*70}")
    print(f"{name} ({doc_id[:8]}...) 共 {len(chunks)} chunks")
    print(f"{'='*70}")
    # 找包含关键词的 chunks
    matched = []
    for i, ch in enumerate(chunks):
        text = ch.get("chunkText", "")
        for kw in KEYWORDS:
            if kw in text:
                matched.append((i, kw, text))
                break
    print(f"匹配到 {len(matched)} 个关键 chunks")
    for i, kw, text in matched[:max_chunks]:
        ch = chunks[i]
        print(f"\n--- chunk[{i}] (kw={kw}) chunkIndex={ch.get('chunkIndex')} ---")
        # 只打印前 600 字符
        print(text[:600])


for name in ["中国人保", "华海药业", "中国铁建", "片仔癀"]:
    show_company(name, max_chunks=5)
