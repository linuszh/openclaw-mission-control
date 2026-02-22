import asyncio
from app.db.session import async_session_maker
from sqlmodel import select, text
from app.models.gateways import Gateway
from app.services.openclaw.gateway_rpc import GatewayConfig, openclaw_call

async def main():
    async with async_session_maker() as session:
        gateway = (await session.execute(select(Gateway))).scalars().first()
        config = GatewayConfig(url=gateway.url, token=gateway.token)
        print("Calling health...")
        health = await openclaw_call("health", config=config)
        print(health)
        
        print("Sleeping 5s to see if gateway is stable...")
        await asyncio.sleep(5)
        
        print("Calling config.get...")
        cfg = await openclaw_call("config.get", config=config)
        print(f"Got config hash: {cfg.get('hash')}")

asyncio.run(main())