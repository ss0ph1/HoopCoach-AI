from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.repositories.workout_repository import (
    delete_generated_workout,
    get_generated_workout,
    list_generated_workouts,
    list_recent_workouts_with_feedback,
    rename_generated_workout,
    save_generated_workout,
    save_workout_feedback,
    update_generated_workout_json,
)
from app.schemas.workout import (
    GenerateWorkoutResponse,
    WorkoutFeedbackCreate,
    WorkoutFeedbackRead,
    WorkoutFeedbackUpdateResponse,
    WorkoutListItem,
    WorkoutRenameRequest,
    WorkoutRequestCreate,
    WorkoutResponse,
)
from app.services.workout_generator import adapt_workout_from_feedback, create_workout_plan

router = APIRouter()


@router.post(
    "/generate",
    response_model=GenerateWorkoutResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_workout(
    workout_request: WorkoutRequestCreate,
    db: Session = Depends(get_db),
) -> GenerateWorkoutResponse:
    recent_workouts = list_recent_workouts_with_feedback(db)
    workout = create_workout_plan(workout_request, recent_workouts)
    saved_workout = save_generated_workout(db, workout_request, workout)

    return GenerateWorkoutResponse(workoutId=saved_workout.id, workout=workout)


@router.get("", response_model=list[WorkoutListItem])
def get_workouts(db: Session = Depends(get_db)) -> list[WorkoutListItem]:
    workouts = list_generated_workouts(db)

    return [
        WorkoutListItem(
            id=workout.id,
            title=workout.title,
            totalDurationMinutes=workout.workout_json.get("totalDurationMinutes", 0),
            focusAreas=workout.workout_json.get("focusAreas", []),
            createdAt=workout.created_at,
            feedback=to_feedback_read(workout.feedback),
        )
        for workout in workouts
    ]


@router.get("/{workout_id}", response_model=WorkoutResponse)
def get_workout(workout_id: UUID, db: Session = Depends(get_db)) -> WorkoutResponse:
    workout = get_generated_workout(db, workout_id)

    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found.",
        )

    return WorkoutResponse(
        id=workout.id,
        workout=workout.workout_json,
        createdAt=workout.created_at,
        feedback=to_feedback_read(workout.feedback),
    )


@router.patch("/{workout_id}", response_model=WorkoutResponse)
def rename_workout(
    workout_id: UUID,
    rename_request: WorkoutRenameRequest,
    db: Session = Depends(get_db),
) -> WorkoutResponse:
    workout = get_generated_workout(db, workout_id)

    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found.",
        )

    title = rename_request.title.strip()

    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workout title cannot be empty.",
        )

    updated_workout = rename_generated_workout(db, workout, title)

    return WorkoutResponse(
        id=updated_workout.id,
        workout=updated_workout.workout_json,
        createdAt=updated_workout.created_at,
        feedback=to_feedback_read(updated_workout.feedback),
    )


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(
    workout_id: UUID,
    db: Session = Depends(get_db),
) -> None:
    workout = get_generated_workout(db, workout_id)

    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found.",
        )

    delete_generated_workout(db, workout)


@router.post("/{workout_id}/feedback", response_model=WorkoutFeedbackUpdateResponse)
def submit_workout_feedback(
    workout_id: UUID,
    feedback: WorkoutFeedbackCreate,
    db: Session = Depends(get_db),
) -> WorkoutFeedbackUpdateResponse:
    workout = get_generated_workout(db, workout_id)

    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found.",
        )

    saved_feedback = save_workout_feedback(db, workout, feedback)
    adjusted_workout = adapt_workout_from_feedback(
        workout.workout_json,
        feedback.difficultyFeedback,
        feedback.notes,
    )
    update_generated_workout_json(db, workout, adjusted_workout.model_dump(mode="json"))

    return WorkoutFeedbackUpdateResponse(
        feedback=to_feedback_read(saved_feedback),
        workout=adjusted_workout,
    )


def to_feedback_read(feedback) -> WorkoutFeedbackRead | None:
    if feedback is None:
        return None

    return WorkoutFeedbackRead(
        id=feedback.id,
        workoutId=feedback.workout_id,
        difficultyFeedback=feedback.difficulty_feedback,
        notes=feedback.notes,
        createdAt=feedback.created_at,
    )
