import asyncio
from sqlmodel import select
from app.db.session import async_session_maker
from app.models.agents import Agent
from app.core.time import utcnow

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
            print(f"Resetting Agent {a.id}: {a.name}")
            a.status = "provisioning"
            a.last_seen_at = None
            a.provision_requested_at = None
            a.provision_action = None
            a.updated_at = utcnow()
            session.add(a)
        
        await session.commit()
        print("Agents successfully reset to 'provisioning' state.")

if __name__ == "__main__":
    asyncio.run(main())