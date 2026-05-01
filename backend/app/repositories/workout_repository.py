from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import GeneratedWorkout, WorkoutFeedback, WorkoutRequest
from app.schemas.workout import (
    GeneratedWorkoutPayload,
    WorkoutFeedbackCreate,
    WorkoutRequestCreate,
)


def save_generated_workout(
    db: Session,
    workout_request: WorkoutRequestCreate,
    workout: GeneratedWorkoutPayload,
) -> GeneratedWorkout:
    db_workout_request = WorkoutRequest(
        available_time_minutes=workout_request.availableTimeMinutes,
        target_skills=list(workout_request.targetSkills),
        skill_level=workout_request.skillLevel,
        equipment=workout_request.equipment,
        include_gym_workout=workout_request.includeGymWorkout,
    )
    db.add(db_workout_request)
    db.flush()

    db_workout = GeneratedWorkout(
        workout_request_id=db_workout_request.id,
        title=workout.title,
        workout_json=workout.model_dump(mode="json"),
    )
    db.add(db_workout)
    db.commit()
    db.refresh(db_workout)

    return db_workout


def list_generated_workouts(db: Session) -> list[GeneratedWorkout]:
    statement = (
        select(GeneratedWorkout)
        .options(selectinload(GeneratedWorkout.feedback))
        .order_by(GeneratedWorkout.created_at.desc())
    )
    return list(db.scalars(statement).all())


def get_generated_workout(db: Session, workout_id: UUID) -> GeneratedWorkout | None:
    statement = (
        select(GeneratedWorkout)
        .options(selectinload(GeneratedWorkout.feedback))
        .where(GeneratedWorkout.id == workout_id)
    )
    return db.scalars(statement).first()


def list_recent_workouts_with_feedback(db: Session, limit: int = 5) -> list[GeneratedWorkout]:
    statement = (
        select(GeneratedWorkout)
        .options(selectinload(GeneratedWorkout.feedback))
        .order_by(GeneratedWorkout.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(statement).all())


def save_workout_feedback(
    db: Session,
    workout: GeneratedWorkout,
    feedback: WorkoutFeedbackCreate,
) -> WorkoutFeedback:
    # One workout has one feedback record. Submitting again updates the previous response.
    if workout.feedback is None:
        db_feedback = WorkoutFeedback(workout_id=workout.id)
        db.add(db_feedback)
    else:
        db_feedback = workout.feedback

    db_feedback.difficulty_feedback = feedback.difficultyFeedback
    db_feedback.notes = feedback.notes
    db.commit()
    db.refresh(db_feedback)

    return db_feedback


def update_generated_workout_json(
    db: Session,
    workout: GeneratedWorkout,
    workout_json: dict,
) -> GeneratedWorkout:
    workout.workout_json = workout_json
    workout.title = workout_json.get("title", workout.title)
    db.commit()
    db.refresh(workout)

    return workout


def rename_generated_workout(
    db: Session,
    workout: GeneratedWorkout,
    title: str,
) -> GeneratedWorkout:
    workout.title = title
    workout.workout_json = {
        **workout.workout_json,
        "title": title,
    }
    db.commit()
    db.refresh(workout)

    return workout


def delete_generated_workout(db: Session, workout: GeneratedWorkout) -> None:
    db.delete(workout)
    db.commit()
