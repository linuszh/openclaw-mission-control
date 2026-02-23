"""add_smtp_and_direction_to_email

Revision ID: 69015b2cb75b
Revises: fbc9e606f4c1
Create Date: 2026-02-23 23:09:11.553981

"""
from __future__ import annotations

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op


# revision identifiers, used by Alembic.
revision = '69015b2cb75b'
down_revision = 'fbc9e606f4c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'email_accounts',
        sa.Column('smtp_server', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default=''),
    )
    op.add_column(
        'email_accounts',
        sa.Column('smtp_port', sa.Integer(), nullable=False, server_default='587'),
    )
    op.add_column(
        'email_accounts',
        sa.Column('smtp_use_ssl', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        'email_messages',
        sa.Column('direction', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='received'),
    )
    op.create_index(op.f('ix_email_messages_direction'), 'email_messages', ['direction'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_email_messages_direction'), table_name='email_messages')
    op.drop_column('email_messages', 'direction')
    op.drop_column('email_accounts', 'smtp_use_ssl')
    op.drop_column('email_accounts', 'smtp_port')
    op.drop_column('email_accounts', 'smtp_server')
