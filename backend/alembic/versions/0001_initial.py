"""Initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-02-05 12:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "printers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("base_url", sa.String(length=500), nullable=False),
        sa.Column("api_key", sa.String(length=500), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("tags", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=1000), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("file_id", sa.Integer(), sa.ForeignKey("files.id"), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'uploaded'")),
        sa.Column("requested_action", sa.String(length=20), nullable=False, server_default=sa.text("'upload'")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "job_targets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("printer_id", sa.Integer(), sa.ForeignKey("printers.id"), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("error_message", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("job_targets")
    op.drop_table("jobs")
    op.drop_table("files")
    op.drop_table("printers")
