import json
import math
import logging
import re
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import quote
from typing import Any

from fastapi import HTTPException
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
    return create_gemini_workout(request, recent_workouts or [])


def create_gemini_workout(
    request: WorkoutRequestCreate, recent_workouts: list[Any]
) -> GeneratedWorkoutPayload:
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="Create a free-tier key at aistudio.google.com/apikey and set GEMINI_API_KEY on the server. Keep the Google project on the Free tier to avoid charges.")
    body = {
        "systemInstruction": {"parts": [{"text": "You are HoopCoach, a practical basketball coach. Generate a structured workout as JSON only."}]},
        "contents": [{"role": "user", "parts": [{"text": build_workout_prompt(request, recent_workouts)}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseJsonSchema": WORKOUT_JSON_SCHEMA, "maxOutputTokens": 6000},
    }
    api_request = Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{quote(settings.gemini_model, safe='')}:generateContent",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": settings.gemini_api_key},
        method="POST",
    )
    try:
        with urlopen(api_request, timeout=50) as response:
            result = json.load(response)
        parts = result["candidates"][0]["content"]["parts"]
        output = "".join(part["text"] for part in parts if "text" in part and not part.get("thought"))
        workout = GeneratedWorkoutPayload.model_validate(json.loads(output))
        for name in ["warmup", "basketballDrills", "conditioning", "gymWorkout", "cooldown"]:
            for drill in getattr(workout.sections, name):
                drill.youtubeSearchUrl = create_youtube_search_url(f"basketball {drill.name} tutorial")
        return enforce_quality_rules(workout, request)
    except HTTPError as error:
        if error.code == 429:
            raise HTTPException(status_code=429, detail="Gemini's free-tier usage limit was reached. Try again later; no paid provider was used.") from error
        raise HTTPException(status_code=502, detail="Gemini could not generate a workout. Check the server API key and model.") from error
    except Exception as error:
        logging.getLogger(__name__).warning("Gemini generation failed: %s", type(error).__name__)
        raise HTTPException(status_code=502, detail="AI generation failed. Please retry. No sample workout was substituted.") from error


def build_workout_prompt(request: WorkoutRequestCreate, recent_workouts: list[Any]) -> str:
    equipment = ", ".join("basketball" if item == "ball" else item for item in request.equipment) if request.equipment else "none"
    skills = ", ".join(request.targetSkills)
    history = format_recent_workout_context(recent_workouts)
    if "hoop" in request.equipment:
        hoop_instructions = "A hoop is available. Do not call this a no-hoop workout or claim a hoop is unavailable."
        if any(item in request.equipment for item in ["ball", "basketball"]) and any(skill in request.targetSkills for skill in ["shooting", "finishing"]):
            hoop_instructions += " Include shooting or finishing drills at the basket with reps or made-shot targets, listing both basketball and hoop as equipment."
    else:
        hoop_instructions = "No hoop is available. Use no-hoop technique drills for shooting and finishing, explain that limitation, and do not prescribe shots at a basket."

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
- Only use equipment from this list plus bodyweight or open space: {equipment}. Use these exact equipment names.
- Never assume unselected equipment or a partner is available. {hoop_instructions}
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
    allowed = {"basketball" if item == "ball" else item for item in request.equipment} | {"bodyweight", "open space", "none"}
    if "hoop" in request.equipment:
        if re.search(r"\b(?:no[\s\-\u2010-\u2015]*hoop|without\s+(?:a\s+)?hoop)\b", workout.title, re.IGNORECASE):
            raise ValueError("Workout title contradicts the available hoop.")
        if ("basketball" in allowed and any(skill in request.targetSkills for skill in ["shooting", "finishing"])
                and not any({"basketball", "hoop"}.issubset(drill.equipment) for drill in workout.sections.basketballDrills)):
            raise ValueError("Shooting or finishing with a ball and hoop must include a drill using both.")
    if not set(request.targetSkills).issubset(workout.focusAreas):
        raise ValueError("Generated workout is missing requested focus skills.")
    for name in ["warmup", "basketballDrills", "conditioning", "gymWorkout", "cooldown"]:
        drills = getattr(workout.sections, name)
        if name != "gymWorkout" and not drills:
            raise ValueError("Generated workout is missing a required section.")
        for drill in drills:
            if not set(drill.equipment).issubset(allowed):
                raise ValueError("Generated workout requires unavailable equipment.")
    if workout.totalDurationMinutes != request.availableTimeMinutes:
        raise ValueError("Generated workout duration does not match requested time.")
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
