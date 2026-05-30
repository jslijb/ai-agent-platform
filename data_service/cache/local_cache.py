import sqlite3
import json
import logging
import time
import threading
import os
import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "market_cache"
CACHE_DB = CACHE_DIR / "market_data.db"

HISTORY_TTL = 86400 * 30
FINANCIAL_TTL = 86400 * 7
REALTIME_TTL = 60
BASIC_TTL = 86400 * 7
INDEX_TTL = 86400 * 30


class LocalCache:
    def __init__(self):
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(CACHE_DB), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.row_factory = sqlite3.Row
        self._init_tables()
        logger.info(f"本地缓存初始化完成: {CACHE_DB}")

    def _init_tables(self):
        cursor = self._conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cache_entries (
                cache_key TEXT PRIMARY KEY,
                data_type TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL,
                source TEXT,
                record_count INTEGER DEFAULT 0
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_cache_type ON cache_entries(data_type)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expires_at)
        """)
        self._conn.commit()

    def _make_key(self, data_type: str, params: dict) -> str:
        if data_type == "history":
            code = params.get("code", "")
            source = params.get("source", "")
            frequency = params.get("frequency", "d")
            return f"history:code={code}&source={source}&frequency={frequency}"

        filtered = {k: v for k, v in params.items() if v is not None}
        sorted_items = sorted(filtered.items())
        param_str = "&".join(f"{k}={v}" for k, v in sorted_items)
        return f"{data_type}:{param_str}"

    def get(self, data_type: str, params: dict) -> Optional[List[Dict]]:
        key = self._make_key(data_type, params)
        now = time.time()

        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(
                "SELECT data, expires_at FROM cache_entries WHERE cache_key = ?",
                (key,)
            )
            row = cursor.fetchone()

        if row is None:
            logger.debug(f"缓存未命中: {key}")
            return None

        if row["expires_at"] is not None and row["expires_at"] < now:
            logger.debug(f"缓存已过期: {key}")
            with self._lock:
                cursor = self._conn.cursor()
                cursor.execute("DELETE FROM cache_entries WHERE cache_key = ?", (key,))
                self._conn.commit()
            return None

        all_data = json.loads(row["data"])

        if data_type == "history" and all_data:
            start_date = params.get("start_date")
            end_date = params.get("end_date")
            if start_date or end_date:
                filtered = []
                for item in all_data:
                    item_date = item.get("date") or item.get("tradeDate") or ""
                    if start_date and item_date < start_date:
                        continue
                    if end_date and item_date > end_date:
                        continue
                    filtered.append(item)
                logger.info(f"缓存命中并按日期过滤: {key}, 总记录={len(all_data)}, 过滤后={len(filtered)}, 日期范围={start_date}~{end_date}")
                return filtered

        logger.info(f"缓存命中: {key}, 记录数={len(all_data)}")
        return all_data

    def set(
        self,
        data_type: str,
        params: dict,
        data: List[Dict],
        ttl: Optional[int] = None,
        source: str = None,
    ):
        if not data:
            logger.debug(f"数据为空，跳过缓存: {data_type}")
            return

        key = self._make_key(data_type, params)
        now = time.time()
        expires_at = now + ttl if ttl else None

        if data_type == "history":
            with self._lock:
                cursor = self._conn.cursor()
                cursor.execute(
                    "SELECT data FROM cache_entries WHERE cache_key = ?",
                    (key,)
                )
                existing_row = cursor.fetchone()

            if existing_row:
                existing_data = json.loads(existing_row["data"])
                existing_dates = set()
                for item in existing_data:
                    d = item.get("date") or item.get("tradeDate") or ""
                    existing_dates.add(d)

                new_count = 0
                for item in data:
                    d = item.get("date") or item.get("tradeDate") or ""
                    if d not in existing_dates:
                        existing_data.append(item)
                        new_count += 1

                if new_count > 0:
                    existing_data.sort(key=lambda x: x.get("date") or x.get("tradeDate") or "")
                    data_json = json.dumps(existing_data, ensure_ascii=False)
                    with self._lock:
                        cursor.execute("""
                            INSERT OR REPLACE INTO cache_entries (cache_key, data_type, data, created_at, expires_at, source, record_count)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (key, data_type, data_json, now, expires_at, source, len(existing_data)))
                        self._conn.commit()
                    logger.info(f"缓存合并更新: {key}, 原有={len(existing_data)-new_count}, 新增={new_count}, 总计={len(existing_data)}")
                else:
                    with self._lock:
                        cursor.execute("""
                            UPDATE cache_entries SET expires_at = ?, source = ?
                            WHERE cache_key = ?
                        """, (expires_at, source, key))
                        self._conn.commit()
                    logger.info(f"缓存无新数据，刷新TTL: {key}, 记录数={len(existing_data)}")
                return

        data_json = json.dumps(data, ensure_ascii=False)

        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO cache_entries (cache_key, data_type, data, created_at, expires_at, source, record_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (key, data_type, data_json, now, expires_at, source, len(data)))
            self._conn.commit()

        logger.info(f"缓存已保存: {key}, 记录数: {len(data)}, TTL: {ttl}s")

    def clear_expired(self):
        now = time.time()
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(
                "DELETE FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at < ?",
                (now,)
            )
            deleted = cursor.rowcount
            self._conn.commit()
        if deleted > 0:
            logger.info(f"清理过期缓存: {deleted} 条")

    def get_stats(self) -> dict:
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(
                "SELECT data_type, COUNT(*) as cnt, SUM(record_count) as total_records FROM cache_entries GROUP BY data_type"
            )
            stats = {}
            for row in cursor.fetchall():
                stats[row["data_type"]] = {
                    "cache_entries": row["cnt"],
                    "total_records": row["total_records"] or 0,
                }
        return stats

    def remove(self, data_type: str, params: dict) -> bool:
        key = self._make_key(data_type, params)
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("DELETE FROM cache_entries WHERE cache_key = ?", (key,))
            deleted = cursor.rowcount
            self._conn.commit()
        return deleted > 0


class PgCache:
    def __init__(self):
        import psycopg2
        self._lock = threading.Lock()
        database_url = os.environ.get("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")
        self._conn = psycopg2.connect(database_url)
        self._conn.autocommit = False
        self._init_tables()
        logger.info(f"PostgreSQL缓存初始化完成: {database_url.split('@')[-1]}")

    def _init_tables(self):
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("""
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
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS market_cache_data_type_idx ON market_cache_entries(data_type)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS market_cache_expires_at_idx ON market_cache_entries(expires_at)
            """)
            self._conn.commit()

    def _make_key(self, data_type: str, params: dict) -> str:
        if data_type == "history":
            code = params.get("code", "")
            source = params.get("source", "")
            frequency = params.get("frequency", "d")
            return f"history:code={code}&source={source}&frequency={frequency}"

        filtered = {k: v for k, v in params.items() if v is not None}
        sorted_items = sorted(filtered.items())
        param_str = "&".join(f"{k}={v}" for k, v in sorted_items)
        return f"{data_type}:{param_str}"

    def get(self, data_type: str, params: dict) -> Optional[List[Dict]]:
        key = self._make_key(data_type, params)
        now = datetime.datetime.now()

        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(
                "SELECT data, expires_at FROM market_cache_entries WHERE cache_key = %s",
                (key,)
            )
            row = cursor.fetchone()

        if row is None:
            logger.debug(f"缓存未命中: {key}")
            return None

        data_val, expires_at_val = row

        if expires_at_val is not None and expires_at_val < now:
            logger.debug(f"缓存已过期: {key}")
            with self._lock:
                cursor = self._conn.cursor()
                cursor.execute("DELETE FROM market_cache_entries WHERE cache_key = %s", (key,))
                self._conn.commit()
            return None

        all_data = json.loads(data_val)

        if data_type == "history" and all_data:
            start_date = params.get("start_date")
            end_date = params.get("end_date")
            if start_date or end_date:
                filtered = []
                for item in all_data:
                    item_date = item.get("date") or item.get("tradeDate") or ""
                    if start_date and item_date < start_date:
                        continue
                    if end_date and item_date > end_date:
                        continue
                    filtered.append(item)
                logger.info(f"缓存命中并按日期过滤: {key}, 总记录={len(all_data)}, 过滤后={len(filtered)}, 日期范围={start_date}~{end_date}")
                return filtered

        logger.info(f"缓存命中: {key}, 记录数={len(all_data)}")
        return all_data

    def set(
        self,
        data_type: str,
        params: dict,
        data: List[Dict],
        ttl: Optional[int] = None,
        source: str = None,
    ):
        if not data:
            logger.debug(f"数据为空，跳过缓存: {data_type}")
            return

        key = self._make_key(data_type, params)
        now = datetime.datetime.now()
        expires_at = now + datetime.timedelta(seconds=ttl) if ttl else None

        if data_type == "history":
            with self._lock:
                cursor = self._conn.cursor()
                cursor.execute(
                    "SELECT data FROM market_cache_entries WHERE cache_key = %s",
                    (key,)
                )
                existing_row = cursor.fetchone()

            if existing_row:
                existing_data = json.loads(existing_row[0])
                existing_dates = set()
                for item in existing_data:
                    d = item.get("date") or item.get("tradeDate") or ""
                    existing_dates.add(d)

                new_count = 0
                for item in data:
                    d = item.get("date") or item.get("tradeDate") or ""
                    if d not in existing_dates:
                        existing_data.append(item)
                        new_count += 1

                if new_count > 0:
                    existing_data.sort(key=lambda x: x.get("date") or x.get("tradeDate") or "")
                    data_json = json.dumps(existing_data, ensure_ascii=False)
                    with self._lock:
                        cursor.execute("""
                            INSERT INTO market_cache_entries (cache_key, data_type, data, created_at, expires_at, source, record_count)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (cache_key) DO UPDATE SET
                                data_type = EXCLUDED.data_type,
                                data = EXCLUDED.data,
                                created_at = EXCLUDED.created_at,
                                expires_at = EXCLUDED.expires_at,
                                source = EXCLUDED.source,
                                record_count = EXCLUDED.record_count
                        """, (key, data_type, data_json, now, expires_at, source, len(existing_data)))
                        self._conn.commit()
                    logger.info(f"缓存合并更新: {key}, 原有={len(existing_data)-new_count}, 新增={new_count}, 总计={len(existing_data)}")
                else:
                    with self._lock:
                        cursor.execute("""
                            UPDATE market_cache_entries SET expires_at = %s, source = %s
                            WHERE cache_key = %s
                        """, (expires_at, source, key))
                        self._conn.commit()
                    logger.info(f"缓存无新数据，刷新TTL: {key}, 记录数={len(existing_data)}")
                return

        data_json = json.dumps(data, ensure_ascii=False)

        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("""
                INSERT INTO market_cache_entries (cache_key, data_type, data, created_at, expires_at, source, record_count)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (cache_key) DO UPDATE SET
                    data_type = EXCLUDED.data_type,
                    data = EXCLUDED.data,
                    created_at = EXCLUDED.created_at,
                    expires_at = EXCLUDED.expires_at,
                    source = EXCLUDED.source,
                    record_count = EXCLUDED.record_count
            """, (key, data_type, data_json, now, expires_at, source, len(data)))
            self._conn.commit()

        logger.info(f"缓存已保存: {key}, 记录数: {len(data)}, TTL: {ttl}s")

    def clear_expired(self):
        now = datetime.datetime.now()
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(
                "DELETE FROM market_cache_entries WHERE expires_at IS NOT NULL AND expires_at < %s",
                (now,)
            )
            deleted = cursor.rowcount
            self._conn.commit()
        if deleted > 0:
            logger.info(f"清理过期缓存: {deleted} 条")

    def get_stats(self) -> dict:
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(
                "SELECT data_type, COUNT(*) as cnt, SUM(record_count) as total_records FROM market_cache_entries GROUP BY data_type"
            )
            stats = {}
            for row in cursor.fetchall():
                stats[row[0]] = {
                    "cache_entries": row[1],
                    "total_records": row[2] or 0,
                }
        return stats

    def remove(self, data_type: str, params: dict) -> bool:
        key = self._make_key(data_type, params)
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("DELETE FROM market_cache_entries WHERE cache_key = %s", (key,))
            deleted = cursor.rowcount
            self._conn.commit()
        return deleted > 0


_cache_instance = None
_cache_lock = threading.Lock()


def get_cache():
    global _cache_instance
    if _cache_instance is None:
        with _cache_lock:
            if _cache_instance is None:
                backend = os.environ.get("CACHE_BACKEND", "sqlite")
                if backend == "postgresql":
                    try:
                        _cache_instance = PgCache()
                        logger.info("缓存后端: PostgreSQL")
                    except Exception as e:
                        logger.error(f"PostgreSQL缓存初始化失败，降级到SQLite: {e}", exc_info=True)
                        _cache_instance = LocalCache()
                        logger.info("缓存后端: SQLite (降级)")
                else:
                    _cache_instance = LocalCache()
                    logger.info("缓存后端: SQLite")
    return _cache_instance
