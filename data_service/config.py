import os
import re
import logging
import yaml
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_CONFIG_CACHE: Optional[dict] = None

CONFIG_PATH = Path(__file__).parent.parent / "config" / "api_keys.yaml"
ENV_LOCAL_PATH = Path(__file__).parent.parent / ".env.local"


def _load_env_local():
    """加载 .env.local 文件到 os.environ，使 Python 数据服务也能读取"""
    if not ENV_LOCAL_PATH.exists():
        logger.debug(f".env.local 文件不存在: {ENV_LOCAL_PATH}")
        return

    logger.info(f"正在加载 .env.local: {ENV_LOCAL_PATH}")

    try:
        with open(ENV_LOCAL_PATH, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
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
                    logger.debug(f"从 .env.local 加载环境变量: {key}")

        logger.info(".env.local 加载完成")
    except Exception as e:
        logger.error(f"加载 .env.local 失败: {e}", exc_info=True)


_load_env_local()


_ENV_VAR_PATTERN = re.compile(r'^[A-Z][A-Z0-9_]*$')

def _resolve_env_values(data: Any) -> Any:
    if isinstance(data, dict):
        resolved = {}
        for key, value in data.items():
            resolved[key] = _resolve_env_values(value)
        return resolved
    elif isinstance(data, str):
        if _ENV_VAR_PATTERN.match(data):
            env_value = os.environ.get(data)
            if env_value is not None:
                return env_value
            logger.debug(f"环境变量 '{data}' 未设置")
            return None
        return data
    elif isinstance(data, list):
        return [_resolve_env_values(item) for item in data]
    else:
        return data


def get_config() -> dict:
    """读取并解析 YAML 配置文件，返回解析后的配置字典（带缓存）"""
    global _CONFIG_CACHE
    if _CONFIG_CACHE is not None:
        return _CONFIG_CACHE

    logger.info(f"正在加载配置文件: {CONFIG_PATH}")

    if not CONFIG_PATH.exists():
        logger.error(f"配置文件不存在: {CONFIG_PATH}")
        raise FileNotFoundError(f"配置文件不存在: {CONFIG_PATH}")

    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            raw_config = yaml.safe_load(f)
        logger.info("配置文件加载成功，开始解析环境变量")
    except yaml.YAMLError as e:
        logger.error(f"YAML 解析失败: {e}")
        raise
    except Exception as e:
        logger.error(f"读取配置文件失败: {e}")
        raise

    resolved_config = _resolve_env_values(raw_config)
    _CONFIG_CACHE = resolved_config

    loaded_sections = list(resolved_config.keys()) if resolved_config else []
    logger.info(f"配置加载完成，包含以下模块: {loaded_sections}")

    return resolved_config


def get_value(section: str, key: str, default: Any = None) -> Any:
    """便捷函数：获取指定 section 和 key 的配置值

    Args:
        section: 配置模块名（如 'market_data'）
        key: 配置键名（如 'TUSHARE_TOKEN'）
        default: 默认值

    Returns:
        配置值，若不存在则返回 default
    """
    config = get_config()
    section_data = config.get(section, {})
    if section_data is None:
        section_data = {}

    if not isinstance(section_data, dict):
        logger.warning(f"配置模块 '{section}' 不是字典类型")
        return default

    value = section_data.get(key, default)
    if value is None:
        logger.debug(f"配置项 '{section}.{key}' 未找到或值为空，使用默认值: {default}")
        return default

    return value


_RAW_CONFIG_CACHE: Optional[dict] = None

def get_raw_config() -> dict:
    global _RAW_CONFIG_CACHE
    if _RAW_CONFIG_CACHE is not None:
        return _RAW_CONFIG_CACHE

    if not CONFIG_PATH.exists():
        logger.error(f"配置文件不存在: {CONFIG_PATH}")
        raise FileNotFoundError(f"配置文件不存在: {CONFIG_PATH}")

    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            raw_config = yaml.safe_load(f)
        logger.info("原始配置加载完成（不解析环境变量）")
    except yaml.YAMLError as e:
        logger.error(f"YAML 解析失败: {e}")
        raise
    except Exception as e:
        logger.error(f"读取配置文件失败: {e}")
        raise

    _RAW_CONFIG_CACHE = raw_config
    return raw_config


def get_raw_value(section: str, key: str, default: Any = None) -> Any:
    config = get_raw_config()
    section_data = config.get(section, {})
    if section_data is None:
        section_data = {}
    if not isinstance(section_data, dict):
        logger.warning(f"配置模块 '{section}' 不是字典类型")
        return default
    return section_data.get(key, default)


def reload_config() -> dict:
    global _CONFIG_CACHE, _RAW_CONFIG_CACHE
    _CONFIG_CACHE = None
    _RAW_CONFIG_CACHE = None
    logger.info("配置缓存已清除，将重新加载")
    return get_config()
