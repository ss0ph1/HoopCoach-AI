import axios from "axios";
import { apiClient } from "./client";
import type {
  DifficultyFeedback,
  GeneratedWorkout,
  SavedWorkoutDetail,
  SavedWorkoutListItem,
  WorkoutFeedbackUpdateResponse,
  WorkoutRequestInput
} from "@/types";

type GenerateWorkoutResponse = {
  workoutId: string | null;
  workout: GeneratedWorkout;
};

export async function generateWorkout(request: WorkoutRequestInput): Promise<GenerateWorkoutResponse> {
  try {
    const response = await apiClient.post<GenerateWorkoutResponse>("/api/workouts/generate", request);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data as { errors?: string[]; error?: string; detail?: string } | undefined;
      throw new Error(responseData?.errors?.join(" ") ?? responseData?.error ?? responseData?.detail ?? "Could not generate workout.");
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
): Promise<WorkoutFeedbackUpdateResponse> {
  const response = await apiClient.post<WorkoutFeedbackUpdateResponse>(`/api/workouts/${workoutId}/feedback`, feedback);
  return response.data;
}

export async function renameWorkout(workoutId: string, title: string): Promise<SavedWorkoutDetail> {
  const response = await apiClient.patch<SavedWorkoutDetail>(`/api/workouts/${workoutId}`, { title });
  return response.data;
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await apiClient.delete(`/api/workouts/${workoutId}`);
}
