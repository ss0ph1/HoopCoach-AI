from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import users, workouts

app = FastAPI(title="HoopFlow AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "HoopFlow AI API"}


app.include_router(workouts.router, prefix="/api/workouts", tags=["workouts"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
