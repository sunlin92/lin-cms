"""应用配置：环境变量前缀 LIN_，pydantic-settings 强类型加载。"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

VALID_ENVS = ("development", "test", "production")


def _parse_list(value: Any) -> list[str]:
    """列表字段兼容 JSON 数组与逗号分隔两种环境变量写法。"""
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text.startswith("["):
            return [str(item) for item in json.loads(text)]
        return [part.strip() for part in text.split(",") if part.strip()]
    return [str(value)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LIN_", env_file=".env", extra="ignore")

    env: str = "development"
    secret_key: str = ""
    database_url: str = "sqlite:///./data/lincms.db"
    # NoDecode：跳过 pydantic-settings 对复杂类型的 JSON 预解析，交给自定义校验器按逗号分隔解析
    cors_origins: Annotated[list[str], NoDecode] = []
    upload_extensions: Annotated[list[str], NoDecode] = ["jpg", "jpeg", "png"]

    @field_validator("cors_origins", "upload_extensions", mode="before")
    @classmethod
    def _split_list(cls, value: Any) -> list[str]:
        return _parse_list(value)

    access_token_ttl: int = 3600
    refresh_token_ttl: int = 604800
    login_captcha: bool = False

    site_domain: str = ""
    upload_dir: str = "assets"
    upload_single_limit: int = 2 * 1024 * 1024
    upload_total_limit: int = 20 * 1024 * 1024
    upload_max_files: int = 10

    rate_limit_enabled: bool = True
    trust_proxy: bool = False
    rate_login: int = 60
    rate_refresh: int = 60
    rate_logout: int = 60
    rate_captcha: int = 60
    rate_register: int = 30

    bootstrap_admin_password: str = "123456"
    version: str = "0.1.0"

    # Agent 接入（docs/04 §12；采用无 pepper 高熵 SHA-256 摘要方案，不设 PEPPER 变量）
    agent_token_default_ttl_days: int = 90
    agent_token_max_ttl_days: int = 365
    agent_token_max_active_per_user: int = 20
    agent_audit_retention_days: int = 180
    agent_content_max_record_bytes: int = 65536
    agent_content_max_fields: int = 100
    agent_rate_limit_enabled: bool = True
    agent_rate_limit_per_minute: int = 120
    agent_content_filter_scan_limit: int = 1000

    def validate_runtime(self) -> None:
        if self.env not in VALID_ENVS:
            raise RuntimeError(f"LIN_ENV 必须是 {VALID_ENVS} 之一，当前为 {self.env!r}")
        if not self.secret_key:
            raise RuntimeError("LIN_SECRET_KEY 未设置：请复制 .env.example 为 .env 并填入真实密钥")
        if self.env == "production":
            if self.bootstrap_admin_password == "123456":
                raise RuntimeError("生产环境必须通过 LIN_BOOTSTRAP_ADMIN_PASSWORD 设置强初始密码")
        if self.agent_audit_retention_days <= 0:
            raise ValueError("LIN_AGENT_AUDIT_RETENTION_DAYS 审计保留天数必须是正整数")
        if self.agent_token_default_ttl_days > self.agent_token_max_ttl_days:
            raise ValueError("LIN_AGENT_TOKEN_DEFAULT_TTL_DAYS 有效期默认值不得超过上限")
        if self.agent_content_filter_scan_limit <= 0:
            raise ValueError("LIN_AGENT_CONTENT_FILTER_SCAN_LIMIT 扫描上限必须为正整数")

    @property
    def docs_enabled(self) -> bool:
        return self.env != "production"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


def create_settings() -> Settings:
    """每次构建应用时读取环境变量；测试可用独立环境变量构造独立实例。"""
    return Settings()


@lru_cache
def get_settings() -> Settings:
    settings = create_settings()
    settings.validate_runtime()
    return settings
