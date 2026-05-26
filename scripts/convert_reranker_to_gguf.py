"""
将 HuggingFace 格式的 bge-reranker-base 模型转换为 GGUF 格式
独立脚本，不依赖 llama.cpp 仓库
"""

import os
import sys
import json
import struct
import numpy as np
from pathlib import Path

MODEL_DIR = r"D:\models\modelscope\bge-reranker-base"
OUTPUT_FILE = r"D:\models\modelscope\bge-reranker-base\bge-reranker-base-f16.gguf"

GGUF_MAGIC = 0x46554747  # "GGUF" in little-endian
GGUF_VERSION = 3

GGML_TYPE_F32 = 0
GGML_TYPE_F16 = 1

GGUF_TYPE_UINT32 = 4
GGUF_TYPE_STRING = 8
GGUF_TYPE_ARRAY = 9


def write_kv_string(f, key: str, value: str):
    key_bytes = key.encode("utf-8")
    f.write(struct.pack("<Q", len(key_bytes)))
    f.write(key_bytes)
    f.write(struct.pack("<I", GGUF_TYPE_STRING))
    val_bytes = value.encode("utf-8")
    f.write(struct.pack("<Q", len(val_bytes)))
    f.write(val_bytes)


def write_kv_uint32(f, key: str, value: int):
    key_bytes = key.encode("utf-8")
    f.write(struct.pack("<Q", len(key_bytes)))
    f.write(key_bytes)
    f.write(struct.pack("<I", GGUF_TYPE_UINT32))
    f.write(struct.pack("<I", value))


def convert():
    print(f"[1/4] Loading model from: {MODEL_DIR}")

    try:
        from transformers import AutoModelForSequenceClassification, AutoConfig
        import torch
    except ImportError:
        print("ERROR: Missing dependencies. Install: pip install transformers torch")
        sys.exit(1)

    config = AutoConfig.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    state_dict = model.state_dict()

    print(f"  vocab_size={config.vocab_size}, hidden_size={config.hidden_size}, "
          f"num_layers={config.num_hidden_layers}, num_heads={config.num_attention_heads}")

    print(f"[2/4] Preparing tensors ({len(state_dict)} tensors)")
    tensor_data = []
    tensor_infos = []

    for name, tensor in state_dict.items():
        gguf_name = name
        if tensor.dtype == torch.float32:
            data = tensor.numpy().astype(np.float16)
            dtype = GGML_TYPE_F16
        elif tensor.dtype == torch.float16:
            data = tensor.numpy()
            dtype = GGML_TYPE_F16
        else:
            data = tensor.float().numpy().astype(np.float16)
            dtype = GGML_TYPE_F16

        shape = list(data.shape)
        raw = data.tobytes()

        aligned_len = len(raw)
        if aligned_len % 32 != 0:
            aligned_len = (aligned_len // 32 + 1) * 32
            raw = raw + b"\x00" * (aligned_len - len(raw))

        tensor_infos.append((gguf_name, dtype, shape, len(raw)))
        tensor_data.append(raw)

    print(f"[3/4] Writing GGUF file: {OUTPUT_FILE}")

    n_tensors = len(tensor_infos)
    n_kv = 12

    with open(OUTPUT_FILE, "wb") as f:
        f.write(struct.pack("<I", GGUF_MAGIC))
        f.write(struct.pack("<I", GGUF_VERSION))
        f.write(struct.pack("<Q", n_tensors))
        f.write(struct.pack("<Q", n_kv))

        write_kv_string(f, "general.architecture", "bert")
        write_kv_string(f, "general.name", "bge-reranker-base")
        write_kv_uint32(f, "bert.context_length", config.max_position_embeddings)
        write_kv_uint32(f, "bert.embedding_length", config.hidden_size)
        write_kv_uint32(f, "bert.feed_forward_length", config.intermediate_size)
        write_kv_uint32(f, "bert.attention.head_count", config.num_attention_heads)
        write_kv_uint32(f, "bert.block_count", config.num_hidden_layers)
        write_kv_uint32(f, "bert.pooling_type", 2)  # RANK
        write_kv_uint32(f, "general.file_type", 1)  # F16
        write_kv_string(f, "bert.vocab_size", str(config.vocab_size))
        write_kv_string(f, "bert.model_type", "bert")

        offset = 0
        for i, (name, dtype, shape, data_len) in enumerate(tensor_infos):
            name_bytes = name.encode("utf-8")
            f.write(struct.pack("<Q", len(name_bytes)))
            f.write(name_bytes)
            n_dims = len(shape)
            f.write(struct.pack("<I", n_dims))
            for dim in shape:
                f.write(struct.pack("<Q", dim))
            f.write(struct.pack("<I", dtype))
            f.write(struct.pack("<Q", offset))
            offset += data_len

        for raw in tensor_data:
            f.write(raw)

    file_size = os.path.getsize(OUTPUT_FILE)
    print(f"[4/4] Done! GGUF file: {OUTPUT_FILE} ({file_size / 1024 / 1024:.1f} MB)")
    print(f"  Tensors: {n_tensors}")


if __name__ == "__main__":
    convert()
