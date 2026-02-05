"""Allow null printer api_key

Revision ID: 0002_printer_api_key_nullable
Revises: 0001_initial
Create Date: 2026-02-05 12:30:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_printer_api_key_nullable"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("printers") as batch_op:
        batch_op.alter_column("api_key", existing_type=sa.String(length=500), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("printers") as batch_op:
        batch_op.alter_column("api_key", existing_type=sa.String(length=500), nullable=False)
