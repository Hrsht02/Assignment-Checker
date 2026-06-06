# AI-Powered Assignment Evaluation Platform

A full-stack academic management system with AI grading, semantic plagiarism detection, and automated reporting.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | FastAPI + SQLAlchemy 2 (async) |
| AI Grading | Gemini 2.5 Flash |
| Similarity | Sentence Transformers + FAISS |
| PDF | PyMuPDF + PaddleOCR |
| Workflow | LangGraph |
| Database | PostgreSQL 16 |
| Storage | Cloudflare R2 |
| Email | Resend |
| Queue | Celery + Redis |

## Quick Start (Docker)

```bash
# 1. Copy and fill in environment variables
cp backend/.env.example backend/.env

# 2. Start everything
docker compose up -d

# 3. Frontend: http://localhost:3000
# 4. API docs: http://localhost:8000/docs
```

## Local Development

### Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env with your keys

# Run PostgreSQL and Redis (Docker)
docker compose up db redis -d

# Start API server
uvicorn app.main:app --reload --port 8000

# Start Celery worker (separate terminal)
celery -A app.tasks.celery_app worker --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL async connection string |
| `SECRET_KEY` | JWT signing key (change in production) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | R2 public URL base |
| `RESEND_API_KEY` | Resend email API key |
| `REDIS_URL` | Redis connection string |

## API Documentation

After starting the backend, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## User Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Create users, manage semesters/sections, view all reports |
| **Professor** | Create assignments, review submissions, manage marks |
| **Student** | View assignments, submit PDFs, view AI feedback |

## Key Workflows

### Assignment Submission → AI Evaluation

```
Student uploads PDF
  → Stored in Cloudflare R2
  → Similarity check vs prior submissions (Sentence Transformers + FAISS)
  → If similarity ≥ threshold → Flag for professor review
  → If below threshold → LangGraph pipeline:
       1. PyMuPDF text extraction (PaddleOCR fallback)
       2. Gemini 2.5 Flash evaluates against rubric
       3. Structured feedback + score stored
  → Student notified via email + in-platform notification
```

### Plagiarism Workflow

```
Similarity > 95% → Status: "Similarity Review"
Professor reviews → Accept → Proceeds to AI evaluation
                 → Reject → Student gets 1 resubmission (1–7 day window)
```

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── routers/         # FastAPI route handlers
│   │   ├── services/        # Business logic (AI, email, storage)
│   │   └── tasks/           # Celery async tasks + APScheduler
│   ├── alembic/             # Database migrations
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/      # Shared UI components
│       ├── pages/           # Route-level page components
│       ├── hooks/           # React Query hooks
│       ├── store/           # Zustand auth state
│       ├── lib/             # API client + utilities
│       └── types/           # TypeScript interfaces
└── docker-compose.yml
```
