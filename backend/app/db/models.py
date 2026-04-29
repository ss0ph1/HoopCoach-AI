from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    workout_requests: Mapped[list["WorkoutRequest"]] = relationship(back_populates="user")


class WorkoutRequest(Base):
    __tablename__ = "workout_requests"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    available_time_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    target_skills: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)
    skill_level: Mapped[str] = mapped_column(String, nullable=False)
    equipment: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    include_gym_workout: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    user: Mapped[User | None] = relationship(back_populates="workout_requests")
    generated_workouts: Mapped[list["GeneratedWorkout"]] = relationship(
        back_populates="workout_request",
        cascade="all, delete-orphan",
    )


class GeneratedWorkout(Base):
    __tablename__ = "generated_workouts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    workout_request_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workout_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    workout_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    workout_request: Mapped[WorkoutRequest] = relationship(back_populates="generated_workouts")
    feedback: Mapped["WorkoutFeedback | None"] = relationship(
        back_populates="workout",
        cascade="all, delete-orphan",
        uselist=False,
    )


class WorkoutFeedback(Base):
    __tablename__ = "workout_feedback"
    __table_args__ = (UniqueConstraint("workout_id", name="uq_workout_feedback_workout_id"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    workout_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("generated_workouts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    difficulty_feedback: Mapped[str] = mapped_column(String, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    workout: Mapped[GeneratedWorkout] = relationship(back_populates="feedback")
