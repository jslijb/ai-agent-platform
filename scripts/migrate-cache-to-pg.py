import sqlite3
import json
import logging
import os
import sys
import datetime
from pathlib import Path
from collections import defaultdict

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("migrate-cache-to-pg")

SQLITE_DB = Path(__file__).parent.parent / "data" / "market_cache" / "market_data.db"

ENV_LOCAL_PATH = Path(__file__).parent.parent / ".env.local"


def load_env_local():
    if not ENV_LOCAL_PATH.exists():
        logger.warning(f".env.local 文件不存在: {ENV_LOCAL_PATH}")
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
    logger.info(f".env.local 加载完成")


def unix_ts_to_pg_timestamp(unix_ts):
    if unix_ts is None:
        return None
    try:
        dt = datetime.datetime.fromtimestamp(unix_ts, tz=datetime.timezone.utc)
        return dt.replace(tzinfo=None)
    except (ValueError, OSError, OverflowError) as e:
        logger.error(f"Unix timestamp 转换失败: {unix_ts}, 错误: {e}")
        return None


def main():
    load_env_local()

    if not SQLITE_DB.exists():
        logger.error(f"SQLite 数据库不存在: {SQLITE_DB}")
        sys.exit(1)

    database_url = os.environ.get("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")
    logger.info(f"PostgreSQL 连接串: {database_url.split('@')[-1]}")

    try:
        import psycopg2
    except ImportError:
        logger.error("psycopg2 未安装，请执行: pip install psycopg2-binary")
        sys.exit(1)

    sqlite_conn = sqlite3.connect(str(SQLITE_DB))
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cursor = sqlite_conn.cursor()

    sqlite_cursor.execute("SELECT COUNT(*) as cnt FROM cache_entries")
    total_count = sqlite_cursor.fetchone()["cnt"]
    logger.info(f"SQLite 缓存总条数: {total_count}")

    if total_count == 0:
        logger.info("SQLite 缓存为空，无需迁移")
        sqlite_conn.close()
        return

    sqlite_cursor.execute("""
        SELECT cache_key, data_type, data, created_at, expires_at, source, record_count
        FROM cache_entries
        ORDER BY created_at DESC
    """)
    rows = sqlite_cursor.fetchall()
    logger.info(f"从 SQLite 读取 {len(rows)} 条记录")

    deduped = {}
    for row in rows:
        key = row["cache_key"]
        if key not in deduped:
            deduped[key] = row

    deduped_count = len(deduped)
    removed_count = total_count - deduped_count
    logger.info(f"去重完成: 原始={total_count}, 去重后={deduped_count}, 移除重复={removed_count}")

    type_stats = defaultdict(int)
    for row in deduped.values():
        type_stats[row["data_type"]] += 1

    logger.info("各 data_type 数量:")
    for dt, cnt in sorted(type_stats.items()):
        logger.info(f"  {dt}: {cnt}")

    pg_conn = psycopg2.connect(database_url)
    pg_conn.autocommit = False
    pg_cursor = pg_conn.cursor()

    pg_cursor.execute("""
        CREATE TABLE IF NOT EXISTS market_cache_entries (
            cache_key TEXT PRIMARY KEY,
            data_type TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP(3),
            source TEXT,
            record_count INTEGER DEFAULT 0
        )
    """)
    pg_cursor.execute("""
        CREATE INDEX IF NOT EXISTS market_cache_data_type_idx ON market_cache_entries(data_type)
    """)
    pg_cursor.execute("""
        CREATE INDEX IF NOT EXISTS market_cache_expires_at_idx ON market_cache_entries(expires_at)
    """)
    pg_conn.commit()
    logger.info("PostgreSQL 表结构确认完成")

    migrated = 0
    errors = 0

    for key, row in deduped.items():
        try:
            created_at_pg = unix_ts_to_pg_timestamp(row["created_at"])
            expires_at_pg = unix_ts_to_pg_timestamp(row["expires_at"])

            if created_at_pg is None:
                logger.error(f"跳过记录 (created_at 转换失败): key={key}, created_at={row['created_at']}")
                errors += 1
                continue

            pg_cursor.execute("""
                INSERT INTO market_cache_entries (cache_key, data_type, data, created_at, expires_at, source, record_count)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (cache_key) DO UPDATE SET
                    data_type = EXCLUDED.data_type,
                    data = EXCLUDED.data,
                    created_at = EXCLUDED.created_at,
                    expires_at = EXCLUDED.expires_at,
                    source = EXCLUDED.source,
                    record_count = EXCLUDED.record_count
            """, (
                key,
                row["data_type"],
                row["data"],
                created_at_pg,
                expires_at_pg,
                row["source"],
                row["record_count"] or 0,
            ))
            migrated += 1

            if migrated % 100 == 0:
                pg_conn.commit()
                logger.info(f"迁移进度: {migrated}/{deduped_count}")

        except Exception as e:
            logger.error(f"迁移失败: key={key}, 错误: {e}", exc_info=True)
            errors += 1
            pg_conn.rollback()

    pg_conn.commit()

    pg_cursor.execute("SELECT COUNT(*) FROM market_cache_entries")
    pg_total = pg_cursor.fetchone()[0]

    pg_cursor.execute("""
        SELECT data_type, COUNT(*) as cnt, SUM(record_count) as total_records
        FROM market_cache_entries
        GROUP BY data_type
    """)
    pg_stats = {}
    for row in pg_cursor.fetchall():
        pg_stats[row[0]] = {"cache_entries": row[1], "total_records": row[2] or 0}

    pg_conn.close()
    sqlite_conn.close()

    logger.info("=" * 60)
    logger.info("迁移统计:")
    logger.info(f"  SQLite 总条数: {total_count}")
    logger.info(f"  去重后条数: {deduped_count}")
    logger.info(f"  去重移除: {removed_count}")
    logger.info(f"  成功迁移: {migrated}")
    logger.info(f"  迁移失败: {errors}")
    logger.info(f"  PostgreSQL 总条数: {pg_total}")
    logger.info("PostgreSQL 各 data_type 统计:")
    for dt, info in sorted(pg_stats.items()):
        logger.info(f"  {dt}: cache_entries={info['cache_entries']}, total_records={info['total_records']}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
