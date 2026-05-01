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
                        "You are HoopCoach, a practical basketball training coach. "
                        "Generate safe, structured workouts as JSON only."
                    ),
                },
                {"role": "user", "content": build_workout_prompt(request, recent_workouts or [])},
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "hoopcoach_workout",
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


def adapt_workout_from_feedback(
    workout_json: dict,
    difficulty_feedback: str,
    notes: str = "",
) -> GeneratedWorkoutPayload:
    """Adjust the saved workout immediately after feedback.

    This is intentionally simple and predictable: feedback should update the
    visible workout right away, while future generated workouts still use the
    full feedback history in the OpenAI prompt.
    """
    workout = GeneratedWorkoutPayload.model_validate(workout_json)
    adjusted = workout.model_dump(mode="json")
    normalized_notes = notes.lower()

    for section_name, drills in adjusted["sections"].items():
        for drill in drills:
            if section_name in {"warmup", "cooldown"}:
                continue

            if not _should_adjust_drill(drill, normalized_notes):
                continue

            if _wants_no_cones(normalized_notes):
                drill["equipment"] = [
                    item for item in drill["equipment"]
                    if "cone" not in item.lower()
                ] or ["basketball", "open space"]

            if _wants_ball_handling_replacement(normalized_notes, drill):
                drill["name"] = _adapt_drill_name(
                    "Stationary Combo Handles Into Burst",
                    difficulty_feedback,
                )
                drill["purpose"] = (
                    "Improve ball control and change-of-speed without needing cones."
                )
                drill["instructions"] = (
                    "Start in an athletic stance. Complete 20 seconds of crossover, "
                    "between-the-legs, and behind-the-back combos, then explode forward "
                    "for three hard dribbles. Reset and repeat on both hands."
                )
            else:
                drill["name"] = _adapt_drill_name(drill["name"], difficulty_feedback)

            drill["difficulty"] = _adapt_difficulty(
                drill["difficulty"],
                difficulty_feedback,
            )
            drill["instructions"] = _adapt_instructions(
                drill["instructions"],
                difficulty_feedback,
                notes,
            )
            drill["youtubeSearchUrl"] = create_youtube_search_url(
                f"basketball {drill['name']} tutorial"
            )

    return GeneratedWorkoutPayload.model_validate(adjusted)


def _should_adjust_drill(drill: dict, normalized_notes: str) -> bool:
    if not normalized_notes.strip():
        return True

    drill_text = " ".join(
        [
            drill.get("name", ""),
            drill.get("purpose", ""),
            drill.get("instructions", ""),
            " ".join(drill.get("equipment", [])),
        ]
    ).lower()

    skill_keywords = {
        "shooting": ["shoot", "shot", "form"],
        "ball handling": ["ball handling", "handle", "dribble", "dribbling"],
        "finishing": ["finish", "layup", "rim"],
        "defense": ["defense", "defensive", "closeout", "slide"],
        "conditioning": ["conditioning", "sprint", "interval"],
        "strength": ["strength", "gym", "squat", "lunge"],
        "footwork": ["footwork", "pivot", "jab"],
    }

    matched_skill = False
    for keywords in skill_keywords.values():
        if any(keyword in normalized_notes for keyword in keywords):
            matched_skill = True
            if any(keyword in drill_text for keyword in keywords):
                return True

    if _wants_no_cones(normalized_notes) and "cone" in drill_text:
        return True

    return not matched_skill


def _wants_no_cones(normalized_notes: str) -> bool:
    return any(phrase in normalized_notes for phrase in ["no cone", "no cones", "without cones", "get rid of cones", "remove cones"])


def _wants_ball_handling_replacement(normalized_notes: str, drill: dict) -> bool:
    drill_text = f"{drill.get('name', '')} {drill.get('purpose', '')} {drill.get('instructions', '')}".lower()
    asks_for_another_drill = any(phrase in normalized_notes for phrase in ["another drill", "different drill", "replace"])
    mentions_ball_handling = any(keyword in normalized_notes for keyword in ["ball handling", "handle", "dribble", "dribbling"])
    is_ball_handling_drill = any(keyword in drill_text for keyword in ["ball handling", "handle", "dribble", "dribbling", "cone"])

    return asks_for_another_drill and mentions_ball_handling and is_ball_handling_drill


def _adapt_drill_name(name: str, difficulty_feedback: str) -> str:
    clean_name = (
        name.replace(" Advanced Progression", "")
        .replace(" Fundamentals", "")
        .replace(" Steady Reps", "")
    )

    if difficulty_feedback == "too_easy":
        return f"{clean_name} Advanced Progression"

    if difficulty_feedback == "too_hard":
        return f"{clean_name} Fundamentals"

    return f"{clean_name} Steady Reps"


def _adapt_difficulty(current_difficulty: str, difficulty_feedback: str) -> str:
    levels = ["beginner", "intermediate", "advanced"]
    normalized = current_difficulty.lower()
    current_index = levels.index(normalized) if normalized in levels else 1

    if difficulty_feedback == "too_easy":
        return levels[min(current_index + 1, len(levels) - 1)]

    if difficulty_feedback == "too_hard":
        return levels[max(current_index - 1, 0)]

    return levels[current_index]


def _adapt_instructions(instructions: str, difficulty_feedback: str, notes: str) -> str:
    base_instructions = instructions.split(" Coach adjustment:")[0]
    note_text = f" Player note: {notes.strip()}" if notes.strip() else ""

    if difficulty_feedback == "too_easy":
        adjustment = (
            "Coach adjustment: increase pace, add a time limit, use a tighter target, "
            "or add a defender/decision cue while keeping good form."
        )
    elif difficulty_feedback == "too_hard":
        adjustment = (
            "Coach adjustment: slow the drill down, reduce the rep target, remove extra "
            "constraints, and focus on clean technique before adding speed."
        )
    else:
        adjustment = (
            "Coach adjustment: keep this drill at a similar difficulty and focus on "
            "consistent reps with short rest."
        )

    return f"{base_instructions} {adjustment}{note_text}"
