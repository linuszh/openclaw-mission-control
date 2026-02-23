"""merge_heads

Revision ID: edc3f50b4ebe
Revises: 96e6d1121bf5, b497b348ebb4
Create Date: 2026-02-23 10:32:11.155767

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'edc3f50b4ebe'
down_revision = ('96e6d1121bf5', 'b497b348ebb4')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
