"""baseline: lin_cms_fastapi 全部 10 张表

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-19
"""

import sqlalchemy as sa
from alembic import op

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def _timestamps():
    return (
        sa.Column("create_time", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("update_time", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def upgrade() -> None:
    op.create_table(
        "lin_user",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("username", sa.String(24), nullable=False, unique=True),
        sa.Column("nickname", sa.String(24)),
        sa.Column("email", sa.String(100), unique=True),
        sa.Column("avatar", sa.String(500)),
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
    )
    op.create_table(
        "lin_user_identity",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False, index=True),
        sa.Column("identity_type", sa.String(100), nullable=False),
        sa.Column("identifier", sa.String(100)),
        sa.Column("credential", sa.String(255)),
        *_timestamps(),
    )
    op.create_table(
        "lin_user_group",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
    )
    op.create_table(
        "lin_group",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("info", sa.String(255)),
        sa.Column("level", sa.SmallInteger(), nullable=False, server_default="3"),
        sa.Column("deleted_token", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime()),
        *_timestamps(),
        sa.UniqueConstraint("name", "deleted_token", name="uq_group_name_alive"),
    )
    op.create_table(
        "lin_group_permission",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("group_id", sa.Integer(), nullable=False, index=True),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.UniqueConstraint("group_id", "permission_id", name="uq_group_permission"),
    )
    op.create_table(
        "lin_permission",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("module", sa.String(50), nullable=False),
        sa.Column("mount", sa.Boolean(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("name", "module", name="uq_permission_name_module"),
    )
    op.create_table(
        "lin_token_blocklist",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("jti", sa.String(64), nullable=False, unique=True),
        sa.Column("user_id", sa.Integer()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("create_time", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "lin_log",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("message", sa.String(450)),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(24)),
        sa.Column("status_code", sa.Integer()),
        sa.Column("method", sa.String(20)),
        sa.Column("path", sa.String(50)),
        sa.Column("permission", sa.String(100)),
        sa.Column("create_time", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_lin_log_create_time", "lin_log", ["create_time"])
    op.create_table(
        "lin_file",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("path", sa.String(500), nullable=False),
        sa.Column("type", sa.String(10), nullable=False, server_default="LOCAL"),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("extension", sa.String(50)),
        sa.Column("size", sa.Integer()),
        sa.Column("md5", sa.String(40)),
        sa.Column("deleted_token", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime()),
        *_timestamps(),
        sa.UniqueConstraint("md5", "deleted_token", name="uq_file_md5_alive"),
    )
    op.create_table(
        "lin_book",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("title", sa.String(50), nullable=False),
        sa.Column("author", sa.String(30)),
        sa.Column("summary", sa.Text()),
        sa.Column("image", sa.String(100)),
        sa.Column("deleted_token", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime()),
        *_timestamps(),
    )
    op.create_index("ix_lin_book_title", "lin_book", ["title"])


def downgrade() -> None:
    for table in (
        "lin_book",
        "lin_file",
        "lin_log",
        "lin_token_blocklist",
        "lin_permission",
        "lin_group_permission",
        "lin_group",
        "lin_user_group",
        "lin_user_identity",
        "lin_user",
    ):
        op.drop_table(table)
