# 2026-08-03 市场缓存端点未写入与上游分钟线不可用

## 现象
- `cache-warmup.py` 请求了 `industry/concept/minute/trade_cal`，但 `market_cache_entries` 只有 `basic/financial/financial_report/history/index/realtime`。
- `minute` 补跑时 efinance 报安装目录 `search-cache.json` 权限错误；修复权限后仍遇到东方财富接口远端断连。
- mootdx 分钟线接口返回空数据。

## 根因
- `data_service/main.py` 的 `trade_cal/industry/concept/minute` 端点只调用 provider 返回数据，没有执行 `cache.get()` / `cache.set()`。
- efinance 在 `efinance.utils` 中复制了 `SEARCH_RESULT_CACHE_PATH` 常量，只改 `efinance.config.SEARCH_RESULT_CACHE_PATH` 不够。
- 上游行情接口可能返回空数据或远端断连，不能把空列表当作已补齐。

## 修复
- 为 `trade_cal/industry/concept/minute` 端点补充缓存读取和写入逻辑。
- 在 `efinance_provider.py` 中同时重定向 `efinance.config.SEARCH_RESULT_CACHE_PATH` 与 `efinance.utils.SEARCH_RESULT_CACHE_PATH` 到项目可写目录。
- `cache-warmup.py` 的分钟线预热增加 efinance → mootdx fallback。
- 新增 `tests/data-service/test_market_cache_endpoints.py`，验证首次请求写缓存、二次请求命中缓存。

## 防回归
- 预热脚本新增数据类型时，必须检查对应 API 端点是否有 `cache.get()` / `cache.set()`。
- 缓存审计必须检查 `data_type` 分布与 0 记录项。
- 对上游返回空数据的类型，标记为阻塞，不写伪数据。
