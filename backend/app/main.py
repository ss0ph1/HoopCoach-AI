import os
import tempfile

os.environ.setdefault("MPLCONFIGDIR", tempfile.gettempdir())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analysis, users, workouts
from app.core.config import get_settings

app = FastAPI(title="HoopCoach API")
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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
