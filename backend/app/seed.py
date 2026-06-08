"""
Seeds the default Organisation Admin account on first run.
Safe to run multiple times (idempotent).
"""
import asyncio
from app.database import AsyncSessionLocal, engine, Base
from app.models.user import User, UserRole, UserStatus
from app.services.auth import hash_password
from sqlalchemy import select

DEFAULT_ORG_ADMIN = {
    "name": "Harshit",
    "email": "harshit@gmail.com",
    "password": "Harshit@123",
}


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(User).where(User.email == DEFAULT_ORG_ADMIN["email"])
        )
        if existing.scalar_one_or_none():
            print(f"[Seed] Org admin '{DEFAULT_ORG_ADMIN['email']}' already exists — skipping.")
            return

        admin = User(
            name=DEFAULT_ORG_ADMIN["name"],
            email=DEFAULT_ORG_ADMIN["email"],
            hashed_password=hash_password(DEFAULT_ORG_ADMIN["password"]),
            role=UserRole.ORG_ADMIN,
            status=UserStatus.ACTIVE,
            college_id=None,
        )
        db.add(admin)
        await db.commit()
        print(f"[Seed] Org admin created → {DEFAULT_ORG_ADMIN['email']}")


if __name__ == "__main__":
    asyncio.run(seed())
