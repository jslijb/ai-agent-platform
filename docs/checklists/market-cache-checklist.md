# 市场缓存补齐检查清单

用于新增或修复 `market_cache_entries` 数据类型时防回归。

1. 确认预热脚本请求的数据类型与 API 端点一一对应。
2. 确认对应端点先执行 `cache.get(data_type, params)`，命中时返回 `from_cache=True`。
3. 确认 provider 返回非空数据后执行 `cache.set(data_type, params, data, ttl=..., source=...)`。
4. 运行端点缓存回归测试，验证首次写缓存、二次命中缓存。
5. 审计 `market_cache_entries`：按 `data_type` 统计条数和 `record_count`，不得把空列表或伪数据写入库。
