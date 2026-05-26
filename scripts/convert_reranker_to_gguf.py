"""
将 HuggingFace 格式的 bge-reranker-base 模型转换为 GGUF 格式
供 llama.cpp server 的 --reranking 模式使用
"""

import os
import sys
import struct
import json
import numpy as np
from pathlib import Path

MODEL_DIR = r"D:\models\modelscope\bge-reranker-base"
OUTPUT_DIR = r"D:\models\modelscope\bge-reranker-base-gguf"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "bge-reranker-base-f16.gguf")

GGUF_MAGIC = 0x46475547  # "GGUF"
GGUF_VERSION = 3

GGML_TYPE_F32 = 0
GGML_TYPE_F16 = 1
GGML_TYPE_Q8_0 = 7

LLM_KV_GENERAL_ARCHITECTURE = "general.architecture"
LLM_KV_CONTEXT_LENGTH = "bert.context_length"
LLM_KV_EMBEDDING_LENGTH = "bert.embedding_length"
LLM_KV_FEED_FORWARD_LENGTH = "bert.feed_forward_length"
LLM_KV_ATTENTION_HEAD_COUNT = "bert.attention.head_count"
LLM_KV_BLOCK_COUNT = "bert.block_count"
LLM_KV_POOLING_TYPE = "bert.pooling_type"


def convert():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    logger.info(f"Loading model from: {MODEL_DIR}")

    try:
        from transformers import AutoModelForSequenceClassification, AutoConfig
        import torch
    except ImportError:
        logger.error("Missing dependencies. Install: pip install transformers torch")
        sys.exit(1)

    config = AutoConfig.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    state_dict = model.state_dict()

    logger.info(f"Model config: vocab_size={config.vocab_size}, hidden_size={config.hidden_size}, "
                f"num_hidden_layers={config.num_hidden_layers}, num_attention_heads={config.num_attention_heads}")

    tensors = []
    tensor_infos = {}

    for name, tensor in state_dict.items():
        gguf_name = name.replace(".", "_")
        if tensor.dtype == torch.float32:
            data = tensor.numpy().astype(np.float16)
            tensor_infos[gguf_name] = (GGML_TYPE_F16, list(data.shape))
            tensors.append((gguf_name, data.tobytes()))
        elif tensor.dtype == torch.float16:
            data = tensor.numpy()
            tensor_infos[gguf_name] = (GGML_TYPE_F16, list(data.shape))
            tensors.append((gguf_name, data.tobytes()))
        else:
            data = tensor.float().numpy().astype(np.float16)
            tensor_infos[gguf_name] = (GGML_TYPE_F16, list(data.shape))
            tensors.append((gguf_name, data.tobytes()))

    kv_pairs = {
        "general.architecture": "bert",
        "general.name": "bge-reranker-base",
        "bert.context_length": str(config.max_position_embeddings),
        "bert.embedding_length": str(config.hidden_size),
        "bert.feed_forward_length": str(config.intermediate_size),
        "bert.attention.head_count": str(config.num_attention_heads),
        "bert.block_count": str(config.num_hidden_layers),
        "bert.pooling_type": "2",  # RANK pooling for reranking
        "general.file_type": "1",  # F16
    }

    logger.info(f"Writing GGUF file: {OUTPUT_FILE}")
    logger.info(f"Tensors: {len(tensors)}, KV pairs: {len(kv_pairs)}")

    with open(OUTPUT_FILE, "wb") as f:
        f.write(struct.pack("<I", GGUF_MAGIC))
        f.write(struct.pack("<I", GGUF_VERSION))
        f.write(struct.pack("<Q", len(tensors)))
        f.write(struct.pack("<Q", len(kv_pairs)))

        for key, value in kv_pairs.items():
            key_bytes = key.encode("utf-8")
            f.write(struct.pack("<Q", len(key_bytes)))
            f.write(key_bytes)
            f.write(struct.pack("<I", 4))  # GGUF_TYPE_STRING
            val_bytes = value.encode("utf-8")
            f.write(struct.pack("<Q", len(val_bytes)))
            f.write(val_bytes)

        for name, (dtype, shape) in tensor_infos.items():
            name_bytes = name.encode("utf-8")
            n_dims = len(shape)
            f.write(struct.pack("<Q", len(name_bytes)))
            f.write(name_bytes)
            f.write(struct.pack("<I", n_dims))
            for dim in shape:
                f.write(struct.pack("<Q", dim))
            f.write(struct.pack("<I", dtype))
            f.write(struct.pack("<Q", 0))  # offset

        data_offset = f.tell()
        for name, (dtype, shape) in tensor_infos.items():
            pass

        for name, raw_data in tensors:
            aligned = len(raw_data) % 32
            if aligned:
                raw_data += b"\x00" * (32 - aligned)
            f.write(raw_data)

    file_size = os.path.getsize(OUTPUT_FILE)
    logger.info(f"GGUF file written: {OUTPUT_FILE} ({file_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger = logging.getLogger("GGUFConvert")
    convert()
