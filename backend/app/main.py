from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from app.routers import auth, org_admin, college_admin, assignments, submissions, professor, student, notifications
from app.tasks.scheduler import start_scheduler, scheduler

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed default org admin
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
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
