from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

# SQLite needs check_same_thread=False via connect_args
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=not _is_sqlite,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
