"""
R001 回归测试：市场数据端点必须写入缓存。

覆盖曾缺失缓存写入的端点：
- /api/market/trade_cal
- /api/market/industry
- /api/market/concept
- /api/market/minute
"""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
os.environ["CACHE_BACKEND"] = "sqlite"

from fastapi.testclient import TestClient

from data_service import main as data_main
from data_service.cache import local_cache


class TestMarketCacheEndpoints(unittest.TestCase):
    def setUp(self):
        local_cache._cache_instance = None
        self.client = TestClient(data_main.app)

    def tearDown(self):
        local_cache._cache_instance = None

    def _assert_second_call_from_cache(self, endpoint, payload, data_type, params, patch_target):
        cache = local_cache.get_cache()
        cache.remove(data_type, params)

        sample_data = [{"date": "2026-08-03", "value": "ok"}]
        with patch(patch_target, return_value=sample_data) as mocked:
            first = self.client.post(endpoint, json=payload)
        self.assertEqual(first.status_code, 200)
        first_body = first.json()
        self.assertTrue(first_body["success"], first_body)
        self.assertFalse(first_body["from_cache"], first_body)
        mocked.assert_called_once()

        cached = cache.get(data_type, params)
        self.assertIsNotNone(cached)
        self.assertEqual(len(cached), 1)

        with patch(patch_target, side_effect=AssertionError("provider should not be called on cache hit")):
            second = self.client.post(endpoint, json=payload)
        self.assertEqual(second.status_code, 200)
        second_body = second.json()
        self.assertTrue(second_body["success"], second_body)
        self.assertTrue(second_body["from_cache"], second_body)

        cache.remove(data_type, params)

    def test_trade_cal_writes_cache(self):
        payload = {
            "source": "baostock",
            "exchange": "SSE",
            "start_date": "2026-08-01",
            "end_date": "2026-08-03",
        }
        params = dict(payload)
        self._assert_second_call_from_cache(
            "/api/market/trade_cal",
            payload,
            "trade_cal",
            params,
            "data_service.main.baostock_provider.get_trade_calendar",
        )

    def test_industry_writes_cache(self):
        payload = {"source": "efinance", "code": "000858"}
        self._assert_second_call_from_cache(
            "/api/market/industry",
            payload,
            "industry",
            payload,
            "data_service.main.efinance_provider.get_industry",
        )

    def test_concept_writes_cache(self):
        payload = {"source": "efinance", "code": "000858"}
        self._assert_second_call_from_cache(
            "/api/market/concept",
            payload,
            "concept",
            payload,
            "data_service.main.efinance_provider.get_concept",
        )

    def test_minute_writes_cache(self):
        payload = {"source": "efinance", "code": "000858", "frequency": "5"}
        self._assert_second_call_from_cache(
            "/api/market/minute",
            payload,
            "minute",
            payload,
            "data_service.main.efinance_provider.get_minute_data",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
