import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError

from fastapi import HTTPException
from app.schemas.workout import WorkoutRequestCreate
from app.services import workout_generator as generator


class GeminiGenerationTests(unittest.TestCase):
    def setUp(self):
        self.request = WorkoutRequestCreate(
            availableTimeMinutes=30, targetSkills=["shooting"],
            skillLevel="beginner", equipment=["basketball"], includeGymWorkout=False,
        )
        self.settings = SimpleNamespace(
            ai_provider="gemini", gemini_api_key="test-key",
            gemini_model="gemini-3.5-flash-lite", openai_api_key="paid-key",
        )
        drill = dict(name="No-hoop release", durationMinutes=5, purpose="Practice release",
                     instructions="Without a hoop, gently toss and catch for 30 seconds, rest 15.",
                     difficulty="beginner", equipment=["basketball"], youtubeSearchUrl="untrusted")
        self.workout = dict(title="Shooting practice", totalDurationMinutes=30, focusAreas=["shooting"],
                            sections={"warmup": [drill], "basketballDrills": [{**drill, "durationMinutes": 15}],
                                      "conditioning": [drill], "gymWorkout": [], "cooldown": [drill]})

    def test_structured_request_and_validated_result(self):
        payload = {"candidates": [{"content": {"parts": [{"text": json.dumps(self.workout)}]}}]}
        with patch.object(generator, "settings", self.settings), patch.object(generator, "urlopen", return_value=io.BytesIO(json.dumps(payload).encode())) as fetch:
            result = generator.create_workout_plan(self.request)
        api_request = fetch.call_args.args[0]
        self.assertEqual(api_request.get_header("X-goog-api-key"), "test-key")
        body = json.loads(api_request.data)
        self.assertEqual(body["generationConfig"]["responseMimeType"], "application/json")
        self.assertEqual(result.totalDurationMinutes, 30)
        self.assertTrue(result.sections.warmup[0].youtubeSearchUrl.startswith("https://www.youtube.com/results?"))

    def test_missing_key_and_quota_do_not_use_paid_provider(self):
        with patch.object(generator, "settings", self.settings), patch.object(generator, "urlopen") as fetch:
            self.settings.gemini_api_key = ""
            with self.assertRaises(HTTPException) as missing:
                generator.create_workout_plan(self.request)
            self.assertEqual(missing.exception.status_code, 503)
            fetch.assert_not_called()
            self.settings.gemini_api_key = "test-key"
            fetch.side_effect = HTTPError("https://example.com", 429, "quota", {}, None)
            with self.assertRaises(HTTPException) as quota:
                generator.create_workout_plan(self.request)
            self.assertEqual(quota.exception.status_code, 429)

    def test_invalid_output_is_rejected(self):
        self.workout["sections"]["basketballDrills"][0]["equipment"] = ["hoop"]
        payload = {"candidates": [{"content": {"parts": [{"text": json.dumps(self.workout)}]}}]}
        with patch.object(generator, "settings", self.settings), patch.object(generator, "urlopen", return_value=io.BytesIO(json.dumps(payload).encode())):
            with self.assertRaises(HTTPException) as invalid:
                generator.create_workout_plan(self.request)
            self.assertEqual(invalid.exception.status_code, 502)

    def test_legacy_provider_setting_still_uses_gemini(self):
        self.settings.ai_provider = "openai"
        with patch.object(generator, "settings", self.settings), patch.object(generator, "create_gemini_workout", return_value="gemini-result") as generate:
            self.assertEqual(generator.create_workout_plan(self.request), "gemini-result")
            generate.assert_called_once_with(self.request, [])

    def test_hoop_prompt_and_output_match_selected_equipment(self):
        self.assertIn("No hoop is available", generator.build_workout_prompt(self.request, []))
        self.request.equipment = ["basketball", "hoop"]
        prompt = generator.build_workout_prompt(self.request, [])
        self.assertIn("A hoop is available", prompt)
        self.assertNotIn("No hoop is available", prompt)
        self.assertIn("made-shot targets", prompt)
        for title in ["No-Hoop Shooting Form Workout", "No–Hoop Shooting", "Without a Hoop Shooting", "Shooting practice"]:
            self.workout["title"] = title
            with self.assertRaises(ValueError):
                generator.enforce_quality_rules(generator.GeneratedWorkoutPayload.model_validate(self.workout), self.request)
        self.workout["title"] = "Form Shooting at the Basket"
        self.workout["sections"]["basketballDrills"][0].update(name="Form shooting", instructions="Make 10 shots at the basket and repeat.", equipment=["basketball", "hoop"])
        result = generator.enforce_quality_rules(generator.GeneratedWorkoutPayload.model_validate(self.workout), self.request)
        self.assertEqual(result.title, "Form Shooting at the Basket")
