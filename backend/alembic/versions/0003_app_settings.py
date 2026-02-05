"""Add app settings table

Revision ID: 0003_app_settings
Revises: 0002_printer_api_key_nullable
Create Date: 2026-02-05 13:40:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003_app_settings"
down_revision = "0002_printer_api_key_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=100), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
