from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

TargetSkill = Literal[
    "shooting",
    "ball handling",
    "finishing",
    "defense",
    "conditioning",
    "vertical jump",
    "strength",
    "footwork",
]

SkillLevel = Literal["beginner", "intermediate", "advanced"]


class WorkoutRequestCreate(BaseModel):
    availableTimeMinutes: int = Field(ge=15, le=180)
    targetSkills: list[TargetSkill] = Field(min_length=1)
    skillLevel: SkillLevel
    equipment: list[str] = Field(default_factory=list)
    includeGymWorkout: bool


class Drill(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    durationMinutes: int
    purpose: str
    instructions: str
    difficulty: str
    equipment: list[str]
    youtubeSearchUrl: str


class WorkoutSections(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warmup: list[Drill]
    basketballDrills: list[Drill]
    conditioning: list[Drill]
    gymWorkout: list[Drill]
    cooldown: list[Drill]


class GeneratedWorkoutPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    totalDurationMinutes: int
    focusAreas: list[str]
    sections: WorkoutSections


class GenerateWorkoutResponse(BaseModel):
    workoutId: UUID
    workout: GeneratedWorkoutPayload


DifficultyFeedback = Literal["too_easy", "just_right", "too_hard"]


class WorkoutFeedbackCreate(BaseModel):
    difficultyFeedback: DifficultyFeedback
    notes: str = ""


class WorkoutFeedbackRead(BaseModel):
    id: UUID
    workoutId: UUID
    difficultyFeedback: DifficultyFeedback
    notes: str
    createdAt: datetime


class WorkoutFeedbackUpdateResponse(BaseModel):
    feedback: WorkoutFeedbackRead
    workout: GeneratedWorkoutPayload


class WorkoutListItem(BaseModel):
    id: UUID
    title: str
    totalDurationMinutes: int
    focusAreas: list[str]
    createdAt: datetime
    feedback: WorkoutFeedbackRead | None = None


class WorkoutResponse(BaseModel):
    id: UUID
    workout: GeneratedWorkoutPayload
    createdAt: datetime
    feedback: WorkoutFeedbackRead | None = None


class WorkoutRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
