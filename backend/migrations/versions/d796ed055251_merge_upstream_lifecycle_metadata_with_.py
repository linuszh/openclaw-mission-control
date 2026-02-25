"""merge upstream lifecycle metadata with notification channel branch

Revision ID: d796ed055251
Revises: 03463e20814c, e3a1b2c4d5f6
Create Date: 2026-02-25 01:30:41.121554

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd796ed055251'
down_revision = ('03463e20814c', 'e3a1b2c4d5f6')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
