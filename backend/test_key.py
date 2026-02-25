import asyncio

from sqlmodel import select

from app.db.session import async_session_maker
from app.models.agents import Agent
from app.services.openclaw.internal.agent_key import agent_key
from app.services.openclaw.internal.session_keys import board_lead_session_key


async def main():
    async with async_session_maker() as session:
        agent = (
            await session.execute(
                select(Agent).where(Agent.id == "8877183d-6a0e-499f-846c-de84ff29264f")
            )
        ).scalar_one()
        print(f"agent_key: {agent_key(agent)}")
        print(
            f"session_key: {board_lead_session_key(agent.board_id) if agent.is_board_lead else 'not lead'}"
        )


asyncio.run(main())
