import asyncio

from sqlmodel import select

from app.core.time import utcnow
from app.db.session import async_session_maker
from app.models.agents import Agent


async def main():
    async with async_session_maker() as session:
        result = await session.execute(
            select(Agent).where(Agent.id == "8877183d-6a0e-499f-846c-de84ff29264f")
        )
        agent = result.scalar_one_or_none()
        if agent:
            print(f"Setting agent {agent.name} to online")
            agent.status = "online"
            agent.provision_action = None
            agent.provision_requested_at = None
            agent.last_seen_at = utcnow()
            agent.updated_at = utcnow()
            session.add(agent)
            await session.commit()
            print("Successfully updated agent.")


if __name__ == "__main__":
    asyncio.run(main())
