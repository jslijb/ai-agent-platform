import os
import sys
import json
import datetime
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("test-pg-cache")

ENV_LOCAL_PATH = os.path.join(os.path.dirname(__file__), "..", ".env.local")


def load_env_local():
    if not os.path.exists(ENV_LOCAL_PATH):
        logger.warning(f".env.local 不存在: {ENV_LOCAL_PATH}")
        return
    with open(ENV_LOCAL_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if key and key not in os.environ:
                os.environ[key] = value


def test_sqlite_fallback():
    os.environ["CACHE_BACKEND"] = "sqlite"

    from data_service.cache.local_cache import get_cache, LocalCache

    cache = get_cache()
    assert isinstance(cache, LocalCache), f"期望 LocalCache 实例，得到: {type(cache)}"
    logger.info("PASS: CACHE_BACKEND=sqlite 时 get_cache() 返回 LocalCache 实例")

    test_params = {
        "source": "test",
        "code": "sh.600000",
        "start_date": "2025-01-01",
        "end_date": "2025-01-31",
        "frequency": "d",
    }

    result = cache.get("history", test_params)
    assert result is None, "空缓存应该返回 None"
    logger.info("PASS: SQLite get() 未命中返回 None")

    test_data = [
        {"date": "2025-01-02", "open": "10.0", "close": "10.5"},
        {"date": "2025-01-03", "open": "10.5", "close": "11.0"},
    ]
    cache.set("history", test_params, test_data, ttl=3600, source="test")
    logger.info("PASS: SQLite set() 保存数据成功")

    result = cache.get("history", test_params)
    assert result is not None, "缓存应该命中"
    assert len(result) == 2, f"期望 2 条记录，得到 {len(result)}"
    logger.info(f"PASS: SQLite get() 命中返回 {len(result)} 条记录")

    new_data = [
        {"date": "2025-01-06", "open": "11.0", "close": "11.5"},
    ]
    cache.set("history", test_params, new_data, ttl=3600, source="test")
    result = cache.get("history", test_params)
    assert result is not None
    assert len(result) == 3, f"合并后期望 3 条记录，得到 {len(result)}"
    logger.info(f"PASS: SQLite history 合并后 {len(result)} 条记录")

    stats = cache.get_stats()
    assert "history" in stats, f"stats 应包含 history，得到: {stats}"
    logger.info(f"PASS: SQLite get_stats() = {stats}")

    removed = cache.remove("history", test_params)
    assert removed, "remove 应返回 True"
    result = cache.get("history", test_params)
    assert result is None, "删除后应返回 None"
    logger.info("PASS: SQLite remove() 删除成功")


def test_pg_cache_class_exists():
    from data_service.cache.local_cache import PgCache
    logger.info("PASS: PgCache 类存在且可导入")

    assert hasattr(PgCache, 'get'), "PgCache 应有 get 方法"
    assert hasattr(PgCache, 'set'), "PgCache 应有 set 方法"
    assert hasattr(PgCache, 'remove'), "PgCache 应有 remove 方法"
    assert hasattr(PgCache, 'get_stats'), "PgCache 应有 get_stats 方法"
    assert hasattr(PgCache, 'clear_expired'), "PgCache 应有 clear_expired 方法"
    logger.info("PASS: PgCache 接口方法完整 (get, set, remove, get_stats, clear_expired)")


def test_pg_fallback_when_no_psycopg2():
    os.environ["CACHE_BACKEND"] = "postgresql"

    from data_service.cache import local_cache
    local_cache._cache_instance = None

    cache = local_cache.get_cache()

    try:
        import psycopg2
        from data_service.cache.local_cache import PgCache
        assert isinstance(cache, PgCache), "psycopg2 可用时应该返回 PgCache"
        logger.info("PASS: psycopg2 可用时 CACHE_BACKEND=postgresql 返回 PgCache")
    except ImportError:
        from data_service.cache.local_cache import LocalCache
        assert isinstance(cache, LocalCache), "psycopg2 不可用时应该降级到 LocalCache"
        logger.info("PASS: psycopg2 不可用时降级到 LocalCache (预期行为)")

    local_cache._cache_instance = None


def test_migration_script_syntax():
    script_path = os.path.join(os.path.dirname(__file__), "..", "scripts", "migrate-cache-to-pg.py")
    assert os.path.exists(script_path), f"迁移脚本不存在: {script_path}"
    with open(script_path, "r", encoding="utf-8") as f:
        source = f.read()
    compile(source, script_path, "exec")
    logger.info("PASS: 迁移脚本语法正确")


def test_unix_ts_conversion():
    from scripts.migrate_cache_to_pg import unix_ts_to_pg_timestamp

    ts = 1700000000.0
    result = unix_ts_to_pg_timestamp(ts)
    assert result is not None, "转换不应返回 None"
    assert isinstance(result, datetime.datetime), "应返回 datetime 对象"
    logger.info(f"PASS: Unix timestamp {ts} -> PostgreSQL timestamp {result}")

    result_none = unix_ts_to_pg_timestamp(None)
    assert result_none is None, "None 输入应返回 None"
    logger.info("PASS: None 输入返回 None")


if __name__ == "__main__":
    load_env_local()

    test_sqlite_fallback()
    test_pg_cache_class_exists()
    test_pg_fallback_when_no_psycopg2()
    test_migration_script_syntax()

    logger.info("=" * 60)
    logger.info("所有测试通过!")
    logger.info("=" * 60)
