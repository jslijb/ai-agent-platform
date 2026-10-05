# -*- coding: utf-8 -*-
"""R030-j LLM 降级链分级策略单测：商汤软跳过循环 / AGNES+百炼永久拉黑"""

import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

import pytest  # noqa: E402

import ragas_evaluation as re_mod  # noqa: E402


# ============================================================================
# Mock 基础设施
# ============================================================================
class _Msg:
    content = '{"ok": 1}'


class _Choice:
    message = _Msg()


class _Resp:
    choices = [_Choice()]


class FakeClient:
    """按 model 名决定行为：记录调用次数，可抛异常"""

    def __init__(self, behavior):
        # behavior: {model: "ok" | Exception | list(逐次)}
        self.behavior = behavior
        self.calls = {}

    @property
    def chat(self):
        return self

    @property
    def completions(self):
        return self

    def create(self, model=None, **kwargs):
        self.calls[model] = self.calls.get(model, 0) + 1
        rule = self.behavior[model]
        if isinstance(rule, list):
            outcome = rule.pop(0) if rule else "ok"
        else:
            outcome = rule
        if isinstance(outcome, Exception):
            raise outcome
        return _Resp()


def make_caller(behavior, chain=None):
    caller = re_mod.LLMCaller(
        chain
        or [
            re_mod.LLMProvider("sensenova", "m1", "k", "u", transient=True),
            re_mod.LLMProvider("agnes", "m2", "k", "u"),
            re_mod.LLMProvider("dashscope", "m3", "k", "u"),
        ]
    )
    # 跳过真实 OpenAI 客户端初始化，但保留 current 指针语义
    caller._init_client = lambda provider: setattr(caller, "current", provider)
    caller.client = FakeClient(behavior)
    return caller


ERR_QUOTA = Exception("Error code: 403 - {'error': {'message': 'Free quota exhausted'}}")
ERR_GENERIC = Exception("Connection reset by peer")


# ============================================================================
# 商汤 transient 软跳过行为
# ============================================================================
class TestTransientSoftSkip:
    def test_transient_failure_not_blacklisted(self):
        caller = make_caller({"m1": ERR_GENERIC, "m2": "ok"})
        result = caller.call("s", "u")
        assert result == '{"ok": 1}'
        # 商汤软跳过，不进永久拉黑
        assert "sensenova/m1" in caller.soft_skipped
        assert "sensenova/m1" not in caller.exhausted

    def test_transient_failure_falls_to_next(self):
        caller = make_caller({"m1": ERR_GENERIC, "m2": "ok", "m3": "ok"})
        caller.call("s", "u")
        # 首个成功的是 AGNES
        assert caller.current.name == "agnes"

    def test_cycle_back_after_all_exhausted(self):
        # 圈1：商汤软跳过 + AGNES/百炼 403 拉黑 → 全空 → 循环 → 圈2 商汤成功
        caller = make_caller(
            {"m1": [ERR_GENERIC, "ok"], "m2": ERR_QUOTA, "m3": ERR_QUOTA}
        )
        result = caller.call("s", "u")
        assert result == '{"ok": 1}'
        # 商汤被调用了 2 次（圈1 失败 + 圈2 成功）
        assert caller.client.calls["m1"] == 2
        # AGNES/百炼只调用 1 次即永久拉黑
        assert caller.client.calls.get("m2", 0) == 1
        assert "agnes/m2" in caller.exhausted

    def test_max_cycles_then_runtime_error(self):
        # 商汤一直失败，AGNES/百炼 403 → 2 圈后 RuntimeError
        caller = make_caller({"m1": ERR_GENERIC, "m2": ERR_QUOTA, "m3": ERR_QUOTA})
        with pytest.raises(RuntimeError):
            caller.call("s", "u")
        # 商汤被尝试 MAX_SOFT_CYCLES+1 次（首圈 + 2 次循环）
        assert caller.client.calls["m1"] == re_mod.Config.MAX_SOFT_CYCLES + 1


# ============================================================================
# 非 transient 永久拉黑行为
# ============================================================================
class TestPermanentBlacklist:
    def test_403_blacklists_agnes(self):
        caller = make_caller({"m1": "ok", "m2": ERR_QUOTA, "m3": "ok"})
        # 商汤成功，AGNES 不应被触碰
        caller.call("s", "u")
        assert "agnes/m2" not in caller.exhausted

    def test_403_blacklists_dashscope_and_skips(self):
        caller = make_caller({"m1": ERR_GENERIC, "m2": ERR_QUOTA, "m3": "ok"})
        caller.call("s", "u")
        assert "dashscope/m3" not in caller.exhausted
        assert "agnes/m2" in caller.exhausted

    def test_exhausted_not_retried_within_call(self):
        # AGNES 403 拉黑后，即使循环也不重试它
        caller = make_caller({"m1": ERR_GENERIC, "m2": ERR_QUOTA, "m3": ERR_QUOTA})
        with pytest.raises(RuntimeError):
            caller.call("s", "u")
        assert caller.client.calls.get("m2", 0) == 1


# ============================================================================
# 降级链顺序（2026-09-15 更新：商汤→百炼主力→AGNES兜底）
# ============================================================================
class TestChainOrder:
    def test_sensenova_first_bailian_middle_agnes_last(self, monkeypatch):
        monkeypatch.setenv("SHANTANG_TOKEN", "sk-test")
        monkeypatch.setenv("AGNES_KEY", "agnes-test")
        monkeypatch.setenv("DASHSCOPE_API_KEY", "ds-test")
        monkeypatch.delenv("DASHSCOPE_API_KEY1", raising=False)
        monkeypatch.delenv("DASHSCOPE_API_KEY2", raising=False)
        monkeypatch.delenv("SENSENOVA_MODELS", raising=False)
        chain = re_mod.Config.get_llm_chain()
        assert chain[0].name == "sensenova"
        assert chain[0].transient is True
        assert chain[0].base_url == "https://token.sensenova.cn/v1"
        assert chain[1].name == "dashscope"
        assert chain[-1].name == "agnes"
        assert chain[-1].model == "agnes-3.0-flash"
        assert all(p.transient is False for p in chain[1:])
        # R031：书生（shusheng）插在百炼与 AGNES 之间
        middle_names = {p.name for p in chain[1:-1]}
        assert middle_names == {"dashscope", "shusheng"}
        # 书生段位置：最后一个 dashscope 之后、agnes 之前
        shusheng_idx = [i for i, p in enumerate(chain) if p.name == "shusheng"]
        assert shusheng_idx, "链中应有书生段"
        assert all(p.model in {
            "deepseek-v4-flash-0731", "qwen3.8-27b", "kimi-k2.6",
            "minimax-m3", "glm-5.3", "deepseek-v4-pro-0813",
        } for p in chain if p.name == "shusheng")

    def test_sensenova_absent_without_key(self, monkeypatch):
        monkeypatch.delenv("SHANTANG_TOKEN", raising=False)
        monkeypatch.setenv("AGNES_KEY", "agnes-test")
        monkeypatch.setenv("DASHSCOPE_API_KEY", "ds-test")
        monkeypatch.delenv("DASHSCOPE_API_KEY1", raising=False)
        monkeypatch.delenv("DASHSCOPE_API_KEY2", raising=False)
        chain = re_mod.Config.get_llm_chain()
        assert chain[0].name == "dashscope"
        assert chain[-1].name == "agnes"

    def test_sensenova_models_env_override(self, monkeypatch):
        monkeypatch.setenv("SHANTANG_TOKEN", "sk-test")
        monkeypatch.setenv("SENSENOVA_MODELS", "sensenova-a,sensenova-b")
        monkeypatch.delenv("AGNES_KEY", raising=False)
        monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
        monkeypatch.delenv("DASHSCOPE_API_KEY1", raising=False)
        monkeypatch.delenv("DASHSCOPE_API_KEY2", raising=False)
        chain = re_mod.Config.get_llm_chain()
        # 书生 key 在环境变量中时会追加在 sensenova 之后（R031）
        assert [p.model for p in chain[:2]] == ["sensenova-a", "sensenova-b"]
        assert all(p.name == "sensenova" for p in chain[:2])

    def test_bailian_model_pool_updated(self, monkeypatch):
        """2026-09-15 用户指定：10 个模型 × 1M token 额度"""
        expected = [
            "qwen3.8-27b",
            "qwen3.7-flash-2026-07-15",
            "qwen3.8-flash",
            "kimi-k3",
            "deepseek-v4-flash-0731",
            "qwen3.8-max-0902",
            "deepseek-v4.1-flash",
            "glm-5.3",
            "deepseek-v4-pro-0813",
            "qwen3.8-2.4t-a95b",
        ]
        assert re_mod.Config.BAILIAN_MODELS == expected