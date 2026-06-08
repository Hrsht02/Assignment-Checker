from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from app.config import get_settings
from app.routers import auth, org_admin, college_admin, assignments, submissions, professor, student, notifications
from app.tasks.scheduler import start_scheduler, scheduler

settings = get_settings()

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    from app.seed import seed
    await seed()
    start_scheduler()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="AI Academic Platform API",
    version="3.0.0",
    description="Multi-tenant AI academic platform — Org → College → Course → Branch → Semester",
    lifespan=lifespan,
)

# Build allowed origins list — hardcoded + any extras from CORS_ORIGINS env var
_cors_origins = [
    "https://assignment-checker-two.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
]
if settings.CORS_ORIGINS:
    _cors_origins += [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/api/v1")
app.include_router(org_admin.router,     prefix="/api/v1")
app.include_router(college_admin.router, prefix="/api/v1")
app.include_router(assignments.router,   prefix="/api/v1")
app.include_router(submissions.router,   prefix="/api/v1")
app.include_router(professor.router,     prefix="/api/v1")
app.include_router(student.router,       prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "3.0.0"}


app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
