"""
将 HuggingFace 格式的 bge-reranker-base 模型转换为 GGUF 格式
基于 llama.cpp 官方 convert_hf_to_gguf.py 中 BertModel/RobertaModel 的逻辑
bge-reranker-base 基于 XLM-RoBERTa-base 架构 (RobertaForSequenceClassification)
"""

import os
import sys
import json
import numpy as np

MODEL_DIR = r"D:\models\modelscope\bge-reranker-base"
OUTPUT_FILE = r"D:\models\modelscope\bge-reranker-base\bge-reranker-base-f16.gguf"

SKIP_TENSOR_PREFIXES = (
    "roberta.embeddings.position_ids",
    "roberta.pooler",
    "cls.predictions",
    "cls.seq_relationship",
)


def remap_tensor_name(name):
    if name.startswith("roberta."):
        name = name[len("roberta."):]
    if name.endswith(".gamma"):
        name = name[:-6] + ".weight"
    if name.endswith(".beta"):
        name = name[:-5] + ".bias"
    return name


def should_skip_tensor(name):
    for prefix in SKIP_TENSOR_PREFIXES:
        if name.startswith(prefix):
            return True
    return False


def convert():
    print(f"[1/5] Loading model from: {MODEL_DIR}")

    try:
        from transformers import AutoModelForSequenceClassification, AutoConfig, AutoTokenizer
        import torch
    except ImportError:
        print("ERROR: pip install transformers torch")
        sys.exit(1)

    try:
        import gguf
    except ImportError:
        print("ERROR: pip install gguf")
        sys.exit(1)

    config = AutoConfig.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    state_dict = model.state_dict()

    pad_token_id = config.pad_token_id if hasattr(config, 'pad_token_id') and config.pad_token_id is not None else 1
    position_offset = 1 + pad_token_id

    print(f"  model_type={config.model_type}, vocab_size={config.vocab_size}")
    print(f"  hidden_size={config.hidden_size}, num_layers={config.num_hidden_layers}")
    print(f"  num_heads={config.num_attention_heads}, max_pos={config.max_position_embeddings}")
    print(f"  pad_token_id={pad_token_id}, position_offset={position_offset}")

    print(f"[2/5] Creating GGUF writer with BERT metadata")
    writer = gguf.GGUFWriter(OUTPUT_FILE, "bert")

    writer.add_name("bge-reranker-base")
    writer.add_context_length(config.max_position_embeddings - position_offset)
    writer.add_embedding_length(config.hidden_size)
    writer.add_feed_forward_length(config.intermediate_size)
    writer.add_head_count(config.num_attention_heads)
    writer.add_block_count(config.num_hidden_layers)
    writer.add_file_type(gguf.GGMLQuantizationType.F16)

    writer.add_layer_norm_eps(1e-12)
    writer.add_causal_attention(False)
    writer.add_pooling_type(gguf.PoolingType.RANK)

    id2label = getattr(config, 'id2label', None)
    if id2label and len(id2label) > 2:
        labels = [id2label[str(i)] for i in sorted(id2label.keys(), key=int)]
        writer.add_classifier_output_labels(labels)

    print(f"[3/5] Adding tokenizer data")
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
        vocab = tokenizer.get_vocab()
        sorted_vocab = sorted(vocab.items(), key=lambda x: x[1])
        tokens = [t.encode("utf-8") for t, _ in sorted_vocab]
        scores = [0.0] * len(tokens)
        toktypes = [1] * len(tokens)

        special_ids = set(tokenizer.all_special_ids)
        for i, (_, tid) in enumerate(sorted_vocab):
            if tid in special_ids:
                toktypes[i] = 3

        writer.add_tokenizer_model("bert")
        writer.add_token_list(tokens)
        writer.add_token_scores(scores)
        writer.add_token_types(toktypes)

        type_vocab_size = getattr(config, 'type_vocab_size', 1)
        writer.add_token_type_count(type_vocab_size)

        special_vocab = gguf.SpecialVocab(MODEL_DIR, n_vocab=len(tokens))
        special_vocab.add_to_gguf(writer)
        print(f"  tokenizer: {len(tokens)} tokens, model=bert")
    except Exception as e:
        print(f"  WARNING: tokenizer failed: {e}")
        print(f"  Falling back to minimal tokenizer")
        writer.add_tokenizer_model("bert")
        writer.add_token_list([f"[PAD{i}]".encode("utf-8") for i in range(config.vocab_size)])
        writer.add_token_scores([-10000.0] * config.vocab_size)
        writer.add_token_type_count(1)

    print(f"[4/5] Adding {len(state_dict)} tensors")
    added = 0
    for name, tensor in state_dict.items():
        if should_skip_tensor(name):
            print(f"  SKIP: {name}")
            continue

        new_name = remap_tensor_name(name)

        if name == "roberta.embeddings.position_embeddings.weight":
            if position_offset > 0:
                tensor = tensor[position_offset:, :]
                print(f"  {name} -> {new_name}: shape={list(tensor.shape)} (trimmed offset={position_offset})")
            else:
                print(f"  {name} -> {new_name}: shape={list(tensor.shape)}")
        elif name == "classifier.weight":
            new_name = "classifier.out_proj.weight"
            print(f"  {name} -> {new_name}: shape={list(tensor.shape)}")
        elif name == "classifier.bias":
            new_name = "classifier.out_proj.bias"
            print(f"  {name} -> {new_name}: shape={list(tensor.shape)}")
        else:
            print(f"  {name} -> {new_name}: shape={list(tensor.shape)}")

        if tensor.dtype == torch.float32:
            data = tensor.numpy().astype(np.float16)
        elif tensor.dtype == torch.float16:
            data = tensor.numpy()
        else:
            data = tensor.float().numpy().astype(np.float16)

        writer.add_tensor(new_name, data, raw_dtype=gguf.GGMLQuantizationType.F16)
        added += 1

    print(f"  Total tensors added: {added}")

    print(f"[5/5] Writing GGUF file: {OUTPUT_FILE}")
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()

    file_size = os.path.getsize(OUTPUT_FILE)
    print(f"Done! GGUF file: {OUTPUT_FILE} ({file_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    convert()
