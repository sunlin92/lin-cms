"""Agent 接入改造：6 张新表（docs/04 §3，docs/05 Task 2）

Revision ID: 0002_agent_content
Revises: 0001_baseline
Create Date: 2026-10-20
"""

import sqlalchemy as sa

from alembic import op

revision = "0002_agent_content"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def _common_columns() -> list[sa.Column]:
    return [
        sa.Column("create_time", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("update_time", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "lin_content_type",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("schema_json", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        *_common_columns(),
        sa.UniqueConstraint("key", name="uq_content_type_key"),
    )
    op.create_table(
        "lin_content_record",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("content_type_id", sa.Integer(), sa.ForeignKey("lin_content_type.id"), nullable=False),
        sa.Column("data_json", sa.Text(), nullable=False),
        sa.Column("deleted_token", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        *_common_columns(),
    )
    op.create_index("ix_lin_content_record_content_type_id", "lin_content_record", ["content_type_id"])
    op.create_index("ix_lin_content_record_deleted_token", "lin_content_record", ["deleted_token"])
    op.create_table(
        "lin_group_content_permission",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("lin_group.id"), nullable=False),
        sa.Column("content_type_id", sa.Integer(), sa.ForeignKey("lin_content_type.id"), nullable=False),
        sa.Column("can_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_create", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_update", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_delete", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_common_columns(),
        sa.UniqueConstraint("group_id", "content_type_id", name="uq_group_content_type"),
    )
    op.create_index("ix_lin_group_content_permission_group_id", "lin_group_content_permission", ["group_id"])
    op.create_index(
        "ix_lin_group_content_permission_content_type_id", "lin_group_content_permission", ["content_type_id"]
    )
    op.create_table(
        "lin_agent_token",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("lin_user.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("prefix", sa.String(16), nullable=False),
        sa.Column("secret_digest", sa.String(128), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("create_time", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("secret_digest", name="uq_agent_token_digest"),
    )
    op.create_index("ix_lin_agent_token_user_id", "lin_agent_token", ["user_id"])
    op.create_index("ix_lin_agent_token_prefix", "lin_agent_token", ["prefix"])
    op.create_table(
        "lin_agent_token_scope",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("agent_token_id", sa.Integer(), sa.ForeignKey("lin_agent_token.id"), nullable=False),
        sa.Column("content_type_id", sa.Integer(), sa.ForeignKey("lin_content_type.id"), nullable=False),
        sa.Column("can_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_create", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_update", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_delete", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("agent_token_id", "content_type_id", name="uq_token_scope_type"),
    )
    op.create_index("ix_lin_agent_token_scope_agent_token_id", "lin_agent_token_scope", ["agent_token_id"])
    op.create_index("ix_lin_agent_token_scope_content_type_id", "lin_agent_token_scope", ["content_type_id"])
    op.create_table(
        "lin_agent_audit_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("agent_token_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("content_type_key", sa.String(80), nullable=True),
        sa.Column("record_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("error_code", sa.Integer(), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("create_time", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_lin_agent_audit_log_agent_token_id", "lin_agent_audit_log", ["agent_token_id"])
    op.create_index("ix_lin_agent_audit_log_user_id", "lin_agent_audit_log", ["user_id"])
    op.create_index("ix_lin_agent_audit_log_create_time", "lin_agent_audit_log", ["create_time"])


def downgrade() -> None:
    op.drop_index("ix_lin_agent_audit_log_create_time", table_name="lin_agent_audit_log")
    op.drop_index("ix_lin_agent_audit_log_user_id", table_name="lin_agent_audit_log")
    op.drop_index("ix_lin_agent_audit_log_agent_token_id", table_name="lin_agent_audit_log")
    op.drop_table("lin_agent_audit_log")
    op.drop_index("ix_lin_agent_token_scope_content_type_id", table_name="lin_agent_token_scope")
    op.drop_index("ix_lin_agent_token_scope_agent_token_id", table_name="lin_agent_token_scope")
    op.drop_table("lin_agent_token_scope")
    op.drop_index("ix_lin_agent_token_prefix", table_name="lin_agent_token")
    op.drop_index("ix_lin_agent_token_user_id", table_name="lin_agent_token")
    op.drop_table("lin_agent_token")
    op.drop_index("ix_lin_group_content_permission_content_type_id", table_name="lin_group_content_permission")
    op.drop_index("ix_lin_group_content_permission_group_id", table_name="lin_group_content_permission")
    op.drop_table("lin_group_content_permission")
    op.drop_index("ix_lin_content_record_deleted_token", table_name="lin_content_record")
    op.drop_index("ix_lin_content_record_content_type_id", table_name="lin_content_record")
    op.drop_table("lin_content_record")
    op.drop_table("lin_content_type")
