"""Agent 接入配置项与错误码底座测试（docs/05 Task 1）。"""

import pytest

from app.core.config import Settings
from app.core.errors import (
    AgentTokenExpired,
    AgentTokenInvalid,
    AgentTokenLimitReached,
    AgentTokenRevoked,
    AgentTokenScopeInvalid,
    ContentDataInvalid,
    ContentForbidden,
    ContentPayloadTooLarge,
    ContentRecordNotFound,
    ContentSchemaBreaking,
    ContentSchemaInvalid,
    ContentTypeArchived,
    ContentTypeNotFound,
)


def test_agent_settings_defaults() -> None:
    settings = Settings(secret_key="x")
    assert settings.agent_token_default_ttl_days == 90
    assert settings.agent_token_max_ttl_days == 365
    assert settings.agent_token_max_active_per_user == 20
    assert settings.agent_audit_retention_days == 180
    assert settings.agent_content_max_record_bytes == 65536
    assert settings.agent_content_max_fields == 100
    assert settings.agent_rate_limit_enabled is True
    assert settings.agent_content_filter_scan_limit == 1000


def test_agent_settings_validation() -> None:
    with pytest.raises(ValueError, match="审计保留天数"):
        Settings(secret_key="x", agent_audit_retention_days=0).validate_runtime()
    with pytest.raises(ValueError, match="有效期"):
        Settings(secret_key="x", agent_token_default_ttl_days=400, agent_token_max_ttl_days=365).validate_runtime()
    with pytest.raises(ValueError, match="扫描上限"):
        Settings(secret_key="x", agent_content_filter_scan_limit=0).validate_runtime()


def test_agent_error_codes_and_status() -> None:
    cases = [
        (AgentTokenInvalid, 401, 10300),
        (AgentTokenExpired, 401, 10301),
        (AgentTokenRevoked, 401, 10302),
        (ContentForbidden, 403, 10310),
        (ContentTypeArchived, 403, 10311),
        (ContentTypeNotFound, 404, 10320),
        (ContentRecordNotFound, 404, 10321),
        (ContentSchemaInvalid, 400, 10330),
        (ContentDataInvalid, 400, 10331),
        (ContentSchemaBreaking, 400, 10332),
        (AgentTokenLimitReached, 400, 10340),
        (AgentTokenScopeInvalid, 400, 10341),
        (ContentPayloadTooLarge, 413, 10350),
    ]
    codes = [code for _, _, code in cases]
    assert len(codes) == len(set(codes)), "错误码必须唯一"
    for exc_cls, status, code in cases:
        exc = exc_cls()
        assert exc.code == code
        assert exc.status_code == status
        assert exc.message, "错误消息不得为空"
        envelope = exc.envelope("GET  /x")
        assert set(envelope) == {"message", "code", "request"}
