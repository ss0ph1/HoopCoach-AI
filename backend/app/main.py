import os
import tempfile

os.environ.setdefault("MPLCONFIGDIR", tempfile.gettempdir())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analysis, users, workouts

app = FastAPI(title="HoopCoach API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:19006",
        "http://127.0.0.1:19006",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):51\d{2}",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "HoopCoach API"}


app.include_router(workouts.router, prefix="/api/workouts", tags=["workouts"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
