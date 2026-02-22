"""add_default_model_to_boards_and_model_to_tasks

Revision ID: a1c3e5d7f9b2
Revises: b7a1d9c3e4f5
Create Date: 2026-02-22

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "a1c3e5d7f9b2"
down_revision = "b7a1d9c3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("boards", sa.Column("default_model", sa.String(), nullable=True))
    op.add_column("tasks", sa.Column("model", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("boards", "default_model")
    op.drop_column("tasks", "model")
