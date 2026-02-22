import asyncio
from sqlmodel import select, text
from app.db.session import async_session_maker
from app.models.agents import Agent
from app.models.activity_events import ActivityEvent

async def main():
    async with async_session_maker() as session:
        result = await session.execute(
            select(Agent).where(Agent.id == '8877183d-6a0e-499f-846c-de84ff29264f')
        )
        agent = result.scalar_one_or_none()
        if agent:
            print("Agent DB state:")
            print(f"Status: {agent.status}")
            print(f"Token Hash: {agent.agent_token_hash}")
            if hasattr(agent, 'openclaw_session_id'):
                print(f"Gateway Session ID: {agent.openclaw_session_id}")
            elif hasattr(agent, 'gateway_session_id'):
                print(f"Gateway Session ID: {agent.gateway_session_id}")
            else:
                print("Gateway Session ID: N/A")
            print(f"Last Seen At: {agent.last_seen_at}")
            print(f"Provision Action: {getattr(agent, 'provision_action', None)}")
            print(f"Provision Requested At: {getattr(agent, 'provision_requested_at', None)}")
        
        result = await session.execute(
            select(ActivityEvent).where(ActivityEvent.agent_id == '8877183d-6a0e-499f-846c-de84ff29264f').order_by(ActivityEvent.created_at.desc()).limit(10)
        )
        events = result.scalars().all()
        print("\nRecent Activity Events:")
        for e in events:
            print(f"[{e.created_at}] {e.event_type}: {e.details}")

if __name__ == "__main__":
    asyncio.run(main())
