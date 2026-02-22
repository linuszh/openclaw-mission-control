import asyncio
from sqlmodel import select
from app.db.session import async_session_maker
from app.models.agents import Agent

async def main():
    async with async_session_maker() as session:
        result = await session.execute(
            select(Agent).where(
                Agent.id.in_([
                    '8877183d-6a0e-499f-846c-de84ff29264f', 
                    '0d05b031-2d6d-47b7-a54a-e7e0fe9233ea'
                ])
            )
        )
        agents = result.scalars().all()
        for a in agents:
            print(f"Agent {a.id}: {a.name}")
            print(f"  status: {a.status}")
            print(f"  board_id: {a.board_id}")
            print(f"  is_board_lead: {a.is_board_lead}")
            print(f"  openclaw_session_id: {a.openclaw_session_id}")
            print(f"  provision_action: {a.provision_action}")
            print(f"  last_seen_at: {a.last_seen_at}")
            print(f"  updated_at: {a.updated_at}")
            print("---")

if __name__ == "__main__":
    asyncio.run(main())
