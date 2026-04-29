import axios from "axios";
import { apiClient } from "./client.js";
import type {
  DifficultyFeedback,
  GeneratedWorkout,
  SavedWorkoutDetail,
  SavedWorkoutListItem,
  WorkoutFeedback,
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
  return response.data;
}

export async function getWorkout(workoutId: string): Promise<SavedWorkoutDetail> {
  const response = await apiClient.get<SavedWorkoutDetail>(`/api/workouts/${workoutId}`);
  return response.data;
}

export async function submitWorkoutFeedback(
  workoutId: string,
  feedback: { difficultyFeedback: DifficultyFeedback; notes: string }
): Promise<WorkoutFeedback> {
  const response = await apiClient.post<WorkoutFeedback>(
    `/api/workouts/${workoutId}/feedback`,
    feedback
  );
  return response.data;
}
