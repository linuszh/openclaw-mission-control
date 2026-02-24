"""GitHub integration endpoints — repo listing via the gh CLI."""

from __future__ import annotations

import json
import subprocess
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import SQLModel

from app.api.deps import require_org_member

if TYPE_CHECKING:
    from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/github", tags=["github"])

ORG_MEMBER_DEP = Depends(require_org_member)


class GithubRepo(SQLModel):
    """Slim GitHub repo descriptor returned by the repo-list endpoint."""

    name_with_owner: str
    is_private: bool
    description: str | None = None


@router.get(
    "/repos",
    response_model=list[GithubRepo],
    summary="List GitHub repositories",
    description=(
        "Returns repositories visible to the authenticated gh CLI user. "
        "Requires `gh` to be installed and authenticated on the server."
    ),
)
async def list_github_repos(
    _ctx: OrganizationContext = ORG_MEMBER_DEP,  # type: ignore[assignment]
) -> list[GithubRepo]:
    """Shell out to `gh repo list` and return parsed repo descriptors."""
    try:
        result = subprocess.run(  # noqa: S603
            [
                "gh",
                "repo",
                "list",
                "--json",
                "nameWithOwner,isPrivate,description",
                "--limit",
                "100",
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="gh CLI not found on the server. Install GitHub CLI to use this feature.",
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="gh repo list timed out.",
        )

    if result.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"gh repo list failed: {result.stderr.strip() or 'unknown error'}",
        )

    try:
        raw: list[dict[str, object]] = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to parse gh output: {exc}",
        )

    return [
        GithubRepo(
            name_with_owner=str(item.get("nameWithOwner", "")),
            is_private=bool(item.get("isPrivate", False)),
            description=str(item["description"]) if item.get("description") else None,
        )
        for item in raw
        if item.get("nameWithOwner")
    ]
