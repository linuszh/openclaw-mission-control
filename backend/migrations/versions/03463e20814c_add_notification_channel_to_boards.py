"""add_notification_channel_to_boards

Revision ID: 03463e20814c
Revises: 69015b2cb75b
Create Date: 2026-02-23 23:22:57.447515

"""
from __future__ import annotations

import sqlmodel.sql.sqltypes
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '03463e20814c'
down_revision = '69015b2cb75b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('boards', sa.Column('notification_channel', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    op.drop_column('boards', 'notification_channel')
