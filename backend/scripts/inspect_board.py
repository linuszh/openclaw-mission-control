import asyncio
from sqlmodel import select
from app.db.session import async_session_maker
from app.models.boards import Board

async def main():
    async with async_session_maker() as session:
        result = await session.execute(
            select(Board).where(Board.id == '081dc099-27f4-4e9b-9559-b35de32633d9')
        )
        b = result.scalars().first()
        print("Board:", b.name if b else "Not Found")

if __name__ == "__main__":
    asyncio.run(main())