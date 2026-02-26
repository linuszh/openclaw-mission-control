"""merge comment_required_for_review with lifecycle metadata

Revision ID: 27eee6bd7606
Revises: d796ed055251, f1b2c3d4e5a6
Create Date: 2026-02-26 06:19:55.575078

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '27eee6bd7606'
down_revision = ('d796ed055251', 'f1b2c3d4e5a6')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
