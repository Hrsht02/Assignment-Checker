from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from app.routers import auth, admin, semesters, assignments, submissions, professor, student, notifications
from app.tasks.scheduler import start_scheduler, scheduler

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    start_scheduler()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="AI Academic Platform API",
    version="1.0.0",
    description="AI-powered assignment evaluation and academic management system",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(semesters.router, prefix="/api/v1")
app.include_router(assignments.router, prefix="/api/v1")
app.include_router(submissions.router, prefix="/api/v1")
app.include_router(professor.router, prefix="/api/v1")
app.include_router(student.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "AI Academic Platform"}


# Serve local uploads in dev
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
