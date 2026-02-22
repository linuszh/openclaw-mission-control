"""Schemas for gateway-main and lead-agent coordination endpoints."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field
from sqlmodel import SQLModel
from sqlmodel._compat import SQLModelConfig

from app.schemas.common import NonEmptyStr

RUNTIME_ANNOTATION_TYPES = (UUID, NonEmptyStr)


def _lead_reply_tags() -> list[str]:
    return ["gateway_main", "lead_reply"]


def _user_reply_tags() -> list[str]:
    return ["gateway_main", "user_reply"]


class GatewayLeadMessageRequest(SQLModel):
    """Request payload for sending a message to a board lead agent."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "lead_direct_message",
            "x-when-to-use": [
                "A board has an urgent tactical request that needs direct lead routing",
                "You need a specific lead response before delegating work",
            ],
            "x-when-not-to-use": [
                "Broadcasting to many leads (use broadcast request)",
                "Requesting end-user decisions (use ask-user request)",
            ],
            "x-required-actor": "main_agent",
            "x-response-shape": "GatewayLeadMessageResponse",
        },
    )

    kind: Literal["question", "handoff"] = Field(
        default="question",
        description="Routing mode for lead messages.",
        examples=["question", "handoff"],
    )
    correlation_id: str | None = Field(
        default=None,
        description="Optional correlation token shared across upstream and downstream systems.",
        examples=["lead-msg-1234"],
    )
    content: NonEmptyStr = Field(
        description="Human-readable body sent to lead agents.",
        examples=["Please triage the highest-priority blocker on board X."],
    )

    # How the lead should reply (defaults are interpreted by templates).
    reply_tags: list[str] = Field(
        default_factory=_lead_reply_tags,
        description="Tags required by reply templates when the lead responds.",
        examples=[["gateway_main", "lead_reply"]],
    )
    reply_source: str | None = Field(
        default="lead_to_gateway_main",
        description="Reply destination key for the orchestrator.",
        examples=["lead_to_gateway_main"],
    )


class GatewayLeadMessageResponse(SQLModel):
    """Response payload for a lead-message dispatch attempt."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "lead_direct_message_result",
            "x-when-to-use": [
                "Confirm lead routing outcome for a direct message request.",
            ],
            "x-when-not-to-use": [
                "Broadcast outcomes (use GatewayLeadBroadcastResponse)",
            ],
            "x-required-actor": "gateway_main",
            "x-interpretation": "Use to confirm handoff path and recipient lead context.",
        },
    )

    ok: bool = Field(default=True, description="Whether dispatch was accepted.")
    board_id: UUID = Field(description="Board receiving the message.")
    lead_agent_id: UUID | None = Field(
        default=None,
        description="Resolved lead agent id when present.",
    )
    lead_agent_name: str | None = Field(
        default=None,
        description="Resolved lead agent display name.",
    )
    lead_created: bool = Field(
        default=False,
        description="Whether a lead fallback actor was created during routing.",
    )


class GatewayLeadBroadcastRequest(SQLModel):
    """Request payload for broadcasting a message to multiple board leads."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "lead_broadcast_message",
            "x-when-to-use": [
                "Multiple board leads need the same message",
                "Coordinating cross-board operational alerts",
            ],
            "x-when-not-to-use": [
                "Single lead response required (use direct message)",
                "Personalized board-level instruction from agent context",
            ],
            "x-required-actor": "main_agent",
            "x-response-shape": "GatewayLeadBroadcastResponse",
        },
    )

    kind: Literal["question", "handoff"] = Field(
        default="question",
        description="Broadcast intent. `question` asks for responses; `handoff` requests transfer.",
        examples=["question", "handoff"],
    )
    correlation_id: str | None = Field(
        default=None,
        description="Optional correlation token shared with downstream handlers.",
        examples=["broadcast-2026-02-14"],
    )
    content: NonEmptyStr = Field(
        description="Message content distributed to selected board leads.",
        examples=["Board-wide incident: prioritize risk triage on task set 14."],
    )
    board_ids: list[UUID] | None = Field(
        default=None,
        description="Optional explicit list of board IDs; omit for lead-scoped defaults.",
        examples=[["11111111-1111-1111-1111-111111111111"]],
    )
    reply_tags: list[str] = Field(
        default_factory=_lead_reply_tags,
        description="Tags required by reply templates when each lead responds.",
        examples=[["gateway_main", "lead_reply"]],
    )
    reply_source: str | None = Field(
        default="lead_to_gateway_main",
        description="Reply destination key for broadcast responses.",
        examples=["lead_to_gateway_main"],
    )


class GatewayLeadBroadcastBoardResult(SQLModel):
    """Per-board result entry for a lead broadcast operation."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "lead_broadcast_status",
            "x-when-to-use": [
                "Reading per-board outcomes for retries/follow-up workflows",
            ],
            "x-when-not-to-use": ["Global summary checks should use parent broadcast response"],
            "x-interpretation": "Use this result object as a transport status for one board.",
        },
    )

    board_id: UUID = Field(description="Target board id for this result.")
    lead_agent_id: UUID | None = Field(
        default=None,
        description="Resolved lead agent id for the target board.",
    )
    lead_agent_name: str | None = Field(
        default=None,
        description="Resolved lead agent display name.",
    )
    ok: bool = Field(default=False, description="Whether this board delivery succeeded.")
    error: str | None = Field(
        default=None,
        description="Failure reason if this board failed.",
    )


class GatewayLeadBroadcastResponse(SQLModel):
    """Aggregate response for a lead broadcast operation."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "lead_broadcast_summary",
            "x-when-to-use": [
                "Inspect final counters after attempting a multi-board send.",
            ],
            "x-when-not-to-use": [
                "Single-board directed lead message (use GatewayLeadMessageResponse)",
            ],
            "x-required-actor": "lead_agent_or_router",
            "x-interpretation": "Use sent/failed counters before considering retry logic.",
            "x-response-shape": "List of GatewayLeadBroadcastBoardResult",
        },
    )

    ok: bool = Field(default=True, description="Whether broadcast execution succeeded.")
    sent: int = Field(default=0, description="Number of boards successfully messaged.")
    failed: int = Field(default=0, description="Number of boards that failed messaging.")
    results: list[GatewayLeadBroadcastBoardResult] = Field(default_factory=list)


class GatewayMainAskUserRequest(SQLModel):
    """Request payload for asking the end user via a main gateway agent."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "human_escalation_request",
            "x-when-to-use": [
                "Blocking decision requires explicit user input",
                "Task flow requires preference confirmation or permission",
            ],
            "x-required-actor": "lead_agent",
            "x-response-shape": "GatewayMainAskUserResponse",
        },
    )

    correlation_id: str | None = Field(
        default=None,
        description="Optional correlation token for tracing request/response flow.",
        examples=["ask-user-001"],
    )
    content: NonEmptyStr = Field(
        description="Prompt that should be asked to the human.",
        examples=["Can we proceed with the proposed vendor budget increase?"],
    )
    preferred_channel: str | None = Field(
        default=None,
        description="Optional preferred messaging channel.",
        examples=["chat", "email"],
    )

    # How the main agent should reply back into Mission Control
    # (defaults interpreted by templates).
    reply_tags: list[str] = Field(
        default_factory=_user_reply_tags,
        description="Tags required for routing the user response.",
        examples=[["gateway_main", "user_reply"]],
    )
    reply_source: str | None = Field(
        default="user_via_gateway_main",
        description="Reply destination key for user confirmation loops.",
        examples=["user_via_gateway_main"],
    )


class GatewayMainAskUserResponse(SQLModel):
    """Response payload for user-question dispatch via gateway main agent."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "human_escalation_result",
            "x-when-to-use": [
                "Track completion and main-agent handoff after human escalation request.",
            ],
            "x-when-not-to-use": [
                "Regular lead routing outcomes (use lead message/broadcast responses)",
            ],
            "x-required-actor": "lead_agent",
            "x-interpretation": "Track whether ask was accepted and which main agent handled it.",
        },
    )

    ok: bool = Field(default=True, description="Whether ask-user dispatch was accepted.")
    board_id: UUID = Field(description="Board context used for the request.")
    main_agent_id: UUID | None = Field(
        default=None,
        description="Resolved main agent id handling the ask.",
    )
    main_agent_name: str | None = Field(
        default=None,
        description="Resolved main agent display name.",
    )


class RelayTaskRequest(SQLModel):
    """Payload for cross-board task relay from one board lead to another."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "cross_board_task_relay",
            "x-when-to-use": [
                "A board lead on one board (e.g. Dispatch/GLM) needs to create a task on another board (e.g. Execution/Qwen)",
                "Relaying inbox work detected on one board to a specialist board lead",
            ],
            "x-when-not-to-use": [
                "Creating a task on your own board — use agent_lead_create_task instead",
                "Sending an ephemeral message without a persistent task — use nudge",
            ],
            "x-required-actor": "board_lead_any_board_in_gateway",
            "x-response-shape": "RelayTaskResponse",
        },
    )

    title: NonEmptyStr = Field(description="Task title to create on the target board.")
    description: str | None = Field(default=None, description="Task body and context.")
    priority: str = Field(default="medium", description="Task priority: low, medium, high.")
    relay_reason: str | None = Field(
        default=None,
        description="Optional note explaining why this task is being relayed.",
    )
    correlation_id: str | None = Field(
        default=None,
        description="Optional correlation token for cross-board audit tracing.",
    )


class RelayTaskResponse(SQLModel):
    """Response for a successful cross-board task relay."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "cross_board_task_relay_result",
            "x-interpretation": "Task created on target board and target lead notified.",
        },
    )

    ok: bool = Field(default=True)
    task_id: UUID = Field(description="ID of the newly created task on the target board.")
    target_board_id: UUID = Field(description="Target board where the task was created.")
    target_lead_agent_id: UUID | None = Field(
        default=None, description="Lead agent on the target board that was notified."
    )
    target_lead_agent_name: str | None = Field(default=None)
    nudge_sent: bool = Field(default=False, description="Whether a gateway nudge was dispatched.")
