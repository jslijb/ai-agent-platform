import sqlite3
import json
import logging
import time
import threading
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

        logger.info(f"缓存命中: {key}")
        return json.loads(row["data"])

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


_cache_instance: Optional[LocalCache] = None
_cache_lock = threading.Lock()


def get_cache() -> LocalCache:
    global _cache_instance
    if _cache_instance is None:
        with _cache_lock:
            if _cache_instance is None:
                _cache_instance = LocalCache()
    return _cache_instance
