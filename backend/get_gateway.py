import asyncio
from app.db.session import async_session_maker
from sqlmodel import select
from app.models.gateways import Gateway

async def main():
    async with async_session_maker() as session:
        gateway = (await session.execute(select(Gateway).where(Gateway.id == '93f65b17-cf47-4723-a6ef-d4aa026e1825'))).scalar_one()
        print(f"Gateway workspace_root: {gateway.workspace_root}")

asyncio.run(main())
