"""Email models for IMAP account configuration and synced messages."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field

from app.core.time import utcnow
from app.models.tenancy import TenantScoped


class EmailAccount(TenantScoped, table=True):
    """IMAP account configuration for email sync."""

    __tablename__ = "email_accounts"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)

    email_address: str
    imap_server: str
    imap_port: int = Field(default=993)
    imap_username: str
    imap_password: str
    use_ssl: bool = Field(default=True)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class EmailMessage(TenantScoped, table=True):
    """Synced email message metadata and content."""

    __tablename__ = "email_messages"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    email_account_id: UUID = Field(foreign_key="email_accounts.id", index=True)

    uid: str = Field(index=True)  # IMAP UID
    sender: str
    subject: str
    snippet: str | None = Field(default=None)
    body: str | None = Field(default=None)
    status: str = Field(default="unread", index=True)

    received_at: datetime
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
