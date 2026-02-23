"""Pydantic schemas for Email API requests and responses."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class EmailAccountCreate(BaseModel):
    """Payload for creating a new email sync account."""

    email_address: str
    imap_server: str
    imap_port: int
    imap_username: str
    imap_password: str
    use_ssl: bool = True


class EmailAccountUpdate(BaseModel):
    """Payload for partial updates to an email account."""

    email_address: str | None = None
    imap_server: str | None = None
    imap_port: int | None = None
    imap_username: str | None = None
    imap_password: str | None = None
    use_ssl: bool | None = None


class EmailAccountRead(BaseModel):
    """Schema for reading email account metadata."""

    id: UUID
    organization_id: UUID
    email_address: str
    imap_server: str
    imap_port: int
    use_ssl: bool
    created_at: datetime
    updated_at: datetime


class EmailMessageRead(BaseModel):
    """Schema for reading synced email messages."""

    id: UUID
    organization_id: UUID
    email_account_id: UUID
    uid: str
    sender: str
    subject: str
    snippet: str | None
    body: str | None
    status: str
    received_at: datetime
    created_at: datetime
    updated_at: datetime
