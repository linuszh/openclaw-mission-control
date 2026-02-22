import asyncio
from sqlmodel import select, text
from app.db.session import async_session_maker
from app.models.activity_events import ActivityEvent

async def main():
    async with async_session_maker() as session:
        result = await session.execute(
            select(ActivityEvent).where(ActivityEvent.agent_id == '8877183d-6a0e-499f-846c-de84ff29264f').order_by(ActivityEvent.created_at.desc()).limit(10)
        )
        events = result.scalars().all()
        print("Recent Activity Events:")
        for e in events:
            print(f"[{e.created_at}] {e.event_type}: {e.message}")

if __name__ == "__main__":
    asyncio.run(main())
