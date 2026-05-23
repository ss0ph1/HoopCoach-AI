import axios from "axios";
import { apiClient } from "./client.js";
import type {
  DifficultyFeedback,
  Drill,
  GeneratedWorkout,
  SavedWorkoutDetail,
  SavedWorkoutListItem,
  WorkoutFeedbackUpdateResponse,
  WorkoutRequestInput
} from "../types.js";

type GenerateWorkoutResponse = {
  workoutId: string | null;
  workout: GeneratedWorkout;
};

export async function generateWorkout(
  request: WorkoutRequestInput
): Promise<GenerateWorkoutResponse> {
  try {
    const response = await apiClient.post<GenerateWorkoutResponse>("/api/workouts/generate", request);

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (isMissingBackendError(error)) {
        return {
          workoutId: null,
          workout: buildDemoWorkout(request)
        };
      }

      const responseData = error.response?.data as { errors?: string[]; error?: string } | undefined;
      const message =
        responseData?.errors?.join(" ") ??
        responseData?.error ??
        "Could not generate workout.";

      throw new Error(message);
    }

    throw error;
  }
}

export async function listWorkouts(): Promise<SavedWorkoutListItem[]> {
  const response = await apiClient.get<SavedWorkoutListItem[]>("/api/workouts");
  return Array.isArray(response.data) ? response.data : [];
}

export async function getWorkout(workoutId: string): Promise<SavedWorkoutDetail> {
  const response = await apiClient.get<SavedWorkoutDetail>(`/api/workouts/${workoutId}`);
  return response.data;
}

export async function submitWorkoutFeedback(
  workoutId: string,
  feedback: { difficultyFeedback: DifficultyFeedback; notes: string }
): Promise<WorkoutFeedbackUpdateResponse> {
  const response = await apiClient.post<WorkoutFeedbackUpdateResponse>(
    `/api/workouts/${workoutId}/feedback`,
    feedback
  );
  return response.data;
}

export async function renameWorkout(workoutId: string, title: string): Promise<SavedWorkoutDetail> {
  const response = await apiClient.patch<SavedWorkoutDetail>(
    `/api/workouts/${workoutId}`,
    { title }
  );
  return response.data;
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await apiClient.delete(`/api/workouts/${workoutId}`);
}

function isMissingBackendError(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const hasConfiguredBackend = Boolean(import.meta.env.VITE_API_BASE_URL);
  const status = error.response?.status;

  return !hasConfiguredBackend && (status === 404 || status === 405 || status === undefined);
}

function buildDemoWorkout(request: WorkoutRequestInput): GeneratedWorkout {
  const basketballMinutes = Math.max(
    5,
    request.availableTimeMinutes - 15 - (request.includeGymWorkout ? 10 : 0)
  );
  const conditioningMinutes = Math.max(4, Math.round(request.availableTimeMinutes * 0.15));
  const warmupMinutes = 8;
  const cooldownMinutes = 5;
  const gymMinutes = request.includeGymWorkout ? 10 : 0;
  const drillMinutes = Math.max(
    5,
    request.availableTimeMinutes - warmupMinutes - conditioningMinutes - cooldownMinutes - gymMinutes
  );

  const primarySkill = request.targetSkills[0] ?? "shooting";
  const secondarySkill = request.targetSkills[1] ?? "ball handling";
  const equipment = request.equipment.length ? request.equipment : ["basketball"];
  const levelLabel = request.skillLevel[0].toUpperCase() + request.skillLevel.slice(1);

  return {
    title: `${levelLabel} ${request.targetSkills.join(" + ") || "basketball"} Workout`,
    totalDurationMinutes: request.availableTimeMinutes,
    focusAreas: request.targetSkills,
    sections: {
      warmup: [
        createDrill(
          "Dynamic Court Warmup",
          warmupMinutes,
          "Raise body temperature and prepare joints for basketball movement.",
          "Jog, backpedal, defensive slide, high knees, and form skips for steady reps.",
          request.skillLevel,
          []
        )
      ],
      basketballDrills: [
        createDrill(
          drillNameForSkill(primarySkill),
          Math.ceil(drillMinutes / 2),
          `Build game-ready ${primarySkill} reps with clear technique focus.`,
          instructionsForSkill(primarySkill, request.skillLevel),
          request.skillLevel,
          equipment
        ),
        createDrill(
          drillNameForSkill(secondarySkill),
          Math.floor(drillMinutes / 2),
          `Add variety and keep improving ${secondarySkill}.`,
          instructionsForSkill(secondarySkill, request.skillLevel),
          request.skillLevel,
          equipment
        )
      ],
      conditioning: [
        createDrill(
          "Baseline Sprint Intervals",
          conditioningMinutes,
          "Improve basketball conditioning without needing extra equipment.",
          "Sprint baseline to free throw line, backpedal home, rest briefly, then repeat with controlled breathing.",
          request.skillLevel,
          []
        )
      ],
      gymWorkout: request.includeGymWorkout
        ? [
            createDrill(
              "Bodyweight Strength Circuit",
              gymMinutes,
              "Build lower-body strength, core control, and injury-resistant movement.",
              "Complete squats, reverse lunges, pushups, and plank holds with smooth form.",
              request.skillLevel,
              equipment.includes("dumbbells") ? ["dumbbells"] : []
            )
          ]
        : [],
      cooldown: [
        createDrill(
          "Breathing and Mobility Cooldown",
          cooldownMinutes,
          "Lower heart rate and restore hips, ankles, shoulders, and calves.",
          "Walk slowly, then stretch calves, quads, hip flexors, hamstrings, chest, and shoulders.",
          "beginner",
          []
        )
      ]
    }
  };
}

function createDrill(
  name: string,
  durationMinutes: number,
  purpose: string,
  instructions: string,
  difficulty: string,
  equipment: string[]
): Drill {
  return {
    name,
    durationMinutes,
    purpose,
    instructions,
    difficulty,
    equipment,
    youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`basketball ${name} tutorial`).split("%20").join("+")}`
  };
}

function drillNameForSkill(skill: string) {
  const drillNames: Record<string, string> = {
    shooting: "Form Shooting Into Spot Makes",
    "ball handling": "Stationary Combo Handles Into Burst",
    finishing: "Mikan Finishes and Angle Layups",
    defense: "Slide Sprint Closeout Drill",
    conditioning: "Court Sprint Change of Direction",
    "vertical jump": "Approach Jump Technique Reps",
    strength: "Lower Body Strength Circuit",
    footwork: "Pivot Series and Jab Step Reps"
  };

  return drillNames[skill] ?? "Game Skill Repetition Drill";
}

function instructionsForSkill(skill: string, level: string) {
  const pace = level === "advanced" ? "game-speed" : level === "intermediate" ? "controlled but sharp" : "slow and clean";

  return `Work at a ${pace} pace. Focus on balance, clean footwork, strong posture, and repeatable technique before adding speed.`;
}
