import json
import math
from typing import Any

from openai import OpenAI
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.workout import Drill, GeneratedWorkoutPayload, WorkoutRequestCreate, WorkoutSections
from app.services.youtube_links import create_youtube_search_url

settings = get_settings()

DRILL_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "name",
        "durationMinutes",
        "purpose",
        "instructions",
        "difficulty",
        "equipment",
        "youtubeSearchUrl",
    ],
    "properties": {
        "name": {"type": "string"},
        "durationMinutes": {"type": "integer"},
        "purpose": {"type": "string"},
        "instructions": {"type": "string"},
        "difficulty": {"type": "string"},
        "equipment": {"type": "array", "items": {"type": "string"}},
        "youtubeSearchUrl": {"type": "string"},
    },
}

WORKOUT_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["title", "totalDurationMinutes", "focusAreas", "sections"],
    "properties": {
        "title": {"type": "string"},
        "totalDurationMinutes": {"type": "integer"},
        "focusAreas": {"type": "array", "items": {"type": "string"}},
        "sections": {
            "type": "object",
            "additionalProperties": False,
            "required": ["warmup", "basketballDrills", "conditioning", "gymWorkout", "cooldown"],
            "properties": {
                "warmup": {"type": "array", "items": DRILL_JSON_SCHEMA},
                "basketballDrills": {"type": "array", "items": DRILL_JSON_SCHEMA},
                "conditioning": {"type": "array", "items": DRILL_JSON_SCHEMA},
                "gymWorkout": {"type": "array", "items": DRILL_JSON_SCHEMA},
                "cooldown": {"type": "array", "items": DRILL_JSON_SCHEMA},
            },
        },
    },
}


def create_workout_plan(
    request: WorkoutRequestCreate,
    recent_workouts: list[Any] | None = None,
) -> GeneratedWorkoutPayload:
    if not settings.openai_api_key:
        return create_fallback_workout(request, recent_workouts)

    client = OpenAI(api_key=settings.openai_api_key)

    try:
        response = client.responses.create(
            model=settings.openai_model,
            input=[
                {
                    "role": "system",
                    "content": (
                        "You are HoopFlow AI, a practical basketball training coach. "
                        "Generate safe, structured workouts as JSON only."
                    ),
                },
                {"role": "user", "content": build_workout_prompt(request, recent_workouts or [])},
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "hoopflow_workout",
                    "schema": WORKOUT_JSON_SCHEMA,
                    "strict": True,
                }
            },
        )
        workout = GeneratedWorkoutPayload.model_validate(json.loads(response.output_text))
        return enforce_quality_rules(workout, request)
    except Exception:
        return create_fallback_workout(request, recent_workouts)


def build_workout_prompt(request: WorkoutRequestCreate, recent_workouts: list[Any]) -> str:
    equipment = ", ".join(request.equipment) if request.equipment else "none"
    skills = ", ".join(request.targetSkills)
    history = format_recent_workout_context(recent_workouts)

    return f"""
Create a basketball training plan with exactly {request.availableTimeMinutes} total minutes.

Player details:
- Skill level: {request.skillLevel}
- Focus skills: {skills}
- Equipment: {equipment}
- Include gym/strength training: {request.includeGymWorkout}

Recent workout and feedback history:
{history}

Adaptive coaching rules:
- If recent feedback says too_easy, increase intensity, decision-making, pace, or drill complexity.
- If recent feedback says too_hard, simplify drills, reduce volume, and use clearer technique blocks.
- If notes mention a skill struggle, add focused practice for that skill.
- Avoid repeating identical drill names from recent workouts.

Rules:
- Include warmup, basketballDrills, conditioning, optional gymWorkout, and cooldown arrays.
- If gym training is not requested, return an empty gymWorkout array.
- Every drill must include purpose, clear instructions, difficulty, equipment, and a YouTube search URL.
- YouTube URLs must be search links, not video links.
- Do not mention video analysis as part of this MVP workout.
- Total drill duration must equal exactly {request.availableTimeMinutes} minutes.
- Only use equipment from this list unless bodyweight/open space/court is clearly implied: {equipment}.
- Make beginner workouts technique-first and advanced workouts faster, more complex, and more game-like.
- Make the plan realistic, safe, and practical.
"""


def format_recent_workout_context(recent_workouts: list[Any]) -> str:
    if not recent_workouts:
        return "- No previous workouts yet. Create a balanced first plan."

    lines = []

    for workout in recent_workouts[:5]:
        workout_json = workout.workout_json or {}
        sections = workout_json.get("sections", {})
        drill_names = [
            drill.get("name", "")
            for drills in sections.values()
            for drill in drills
            if isinstance(drill, dict)
        ]
        feedback = getattr(workout, "feedback", None)
        feedback_text = "no feedback"

        if feedback is not None:
            feedback_text = f"{feedback.difficulty_feedback}; notes: {feedback.notes or 'none'}"

        lines.append(
            f"- {workout.title} ({workout_json.get('totalDurationMinutes', 0)} min, "
            f"focus: {', '.join(workout_json.get('focusAreas', [])) or 'unknown'}). "
            f"Feedback: {feedback_text}. Drills: {', '.join(drill_names[:8]) or 'none'}."
        )

    return "\n".join(lines)


def enforce_quality_rules(
    workout: GeneratedWorkoutPayload,
    request: WorkoutRequestCreate,
) -> GeneratedWorkoutPayload:
    total_duration = sum(
        drill.durationMinutes
        for section_drills in [
            workout.sections.warmup,
            workout.sections.basketballDrills,
            workout.sections.conditioning,
            workout.sections.gymWorkout,
            workout.sections.cooldown,
        ]
        for drill in section_drills
    )

    if total_duration != request.availableTimeMinutes:
        raise ValueError("Generated workout duration does not match requested time.")

    if not request.includeGymWorkout and workout.sections.gymWorkout:
        raise ValueError("Generated workout included gym work when it was not requested.")

    return workout


def create_fallback_workout(
    request: WorkoutRequestCreate,
    recent_workouts: list[Any] | None = None,
) -> GeneratedWorkoutPayload:
    focus_label = " + ".join(request.targetSkills)
    equipment = request.equipment or ["bodyweight"]
    recent_feedback = [
        workout.feedback.difficulty_feedback
        for workout in (recent_workouts or [])
        if getattr(workout, "feedback", None) is not None
    ]
    intensity_label = "Technique"

    if recent_feedback.count("too_easy") > recent_feedback.count("too_hard"):
        intensity_label = "Progressive"
    elif recent_feedback.count("too_hard") > recent_feedback.count("too_easy"):
        intensity_label = "Controlled"

    gym_minutes = 10 if request.includeGymWorkout else 0
    basketball_minutes = max(request.availableTimeMinutes - gym_minutes - 15, 10)

    def drill(
        name: str,
        duration_minutes: int,
        purpose: str,
        instructions: str,
        search_terms: str,
        drill_equipment: list[str] | None = None,
    ) -> Drill:
        return Drill(
            name=name,
            durationMinutes=duration_minutes,
            purpose=purpose,
            instructions=instructions,
            difficulty=request.skillLevel,
            equipment=drill_equipment or equipment,
            youtubeSearchUrl=create_youtube_search_url(search_terms),
        )

    gym_workout = []

    if request.includeGymWorkout:
        gym_workout.append(
            drill(
                "Lower Body Strength Circuit",
                gym_minutes,
                "Develop leg strength and landing control for basketball.",
                "Complete squats, reverse lunges, calf raises, and plank holds with controlled form.",
                "basketball lower body strength workout tutorial",
                ["bodyweight", *equipment],
            )
        )

    return GeneratedWorkoutPayload(
        title=f"{intensity_label} {request.skillLevel} {focus_label} Workout",
        totalDurationMinutes=request.availableTimeMinutes,
        focusAreas=list(request.targetSkills),
        sections=WorkoutSections(
            warmup=[
                drill(
                    "Dynamic Court Warmup",
                    5,
                    "Raise body temperature and prepare joints for basketball movement.",
                    "Jog, backpedal, shuffle, high knees, and carioca across the court at a controlled pace.",
                    "basketball dynamic warmup tutorial",
                    ["open space"],
                )
            ],
            basketballDrills=[
                drill(
                    "Form Shooting Progression",
                    math.ceil(basketball_minutes / 2),
                    "Build repeatable shooting mechanics close to the basket.",
                    "Start two steps from the rim. Make 8 shots from the front and both sides before moving back.",
                    "basketball form shooting drill tutorial",
                    equipment,
                ),
                drill(
                    "Cone Change-of-Pace Handles",
                    basketball_minutes // 2,
                    "Improve ball control while changing speed and direction.",
                    "Set cones in a line. Attack each cone with a crossover, between-the-legs, or retreat dribble.",
                    "basketball cone ball handling drill tutorial",
                    equipment,
                ),
            ],
            conditioning=[
                drill(
                    "Baseline Sprint Intervals",
                    5,
                    "Build basketball-specific conditioning for repeated bursts.",
                    "Sprint baseline to free throw line, backpedal home, then rest 20 seconds. Repeat.",
                    "basketball baseline sprint conditioning tutorial",
                    ["court"],
                )
            ],
            gymWorkout=gym_workout,
            cooldown=[
                drill(
                    "Cooldown Stretch Flow",
                    5,
                    "Lower heart rate and improve recovery after training.",
                    "Breathe slowly while stretching calves, quads, hamstrings, hips, shoulders, and wrists.",
                    "basketball cooldown stretching routine tutorial",
                    ["open space"],
                )
            ],
        ),
    )
