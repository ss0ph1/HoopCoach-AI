import axios from "axios";
import { accountRequest, accountScope, hasAccount } from "./account.js";
import { apiClient } from "./client.js";
import type {
  DifficultyFeedback,
  GeneratedWorkout,
  SavedWorkoutDetail,
  SavedWorkoutListItem,
  WorkoutFeedbackUpdateResponse,
  WorkoutRequestInput
} from "../types.js";

type GenerateWorkoutResponse = {
  workoutId: string | null;
  workout: GeneratedWorkout;
  generation?: GeneratedWorkout["generation"];
};

export async function generateWorkout(
  request: WorkoutRequestInput
): Promise<GenerateWorkoutResponse> {
  const owner = accountScope();
  try {
    const client = hasAccount() ? axios : apiClient;
    const response = await client.post<GenerateWorkoutResponse>("/api/workouts/generate", request);

    if (!response.data || typeof response.data.workout?.title !== "string" || !response.data.workout.sections) {
      throw new Error("The generation API returned an invalid response. Please retry.");
    }
    if (accountScope() !== owner) throw new Error('Your account changed during generation. Please generate again from your current account.');
    const result = response.data;
    result.workout = { ...result.workout, generation: result.generation };
    if (hasAccount()) {
      const saved = await accountRequest({ action: 'save', kind: 'workout', record: { workout: result.workout } });
      result.workoutId = saved.record.id;
    } else if (useBrowserHistory) {
      result.workoutId = crypto.randomUUID();
      const record: SavedWorkoutDetail = { id: result.workoutId, workout: result.workout, createdAt: new Date().toISOString(), feedback: null };
      saveBrowserWorkouts([record, ...browserWorkouts()]);
    }
    return result;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data as { errors?: string[]; error?: string; detail?: string } | undefined;
      const message =
        responseData?.errors?.join(" ") ??
        responseData?.error ??
        responseData?.detail ??
        "Could not generate workout.";

      throw new Error(message);
    }

    throw error;
  }
}

export async function listWorkouts(): Promise<SavedWorkoutListItem[]> {
  if (hasAccount()) return (await accountRequest({ action: 'list' })).records.filter((item: { kind: string }) => item.kind === 'workout').map((item: SavedWorkoutDetail) => ({ id: item.id, title: item.workout.title, totalDurationMinutes: item.workout.totalDurationMinutes, focusAreas: item.workout.focusAreas, createdAt: item.createdAt, feedback: item.feedback, completedAt: item.completedAt, completedMinutes: item.completedMinutes }));
  if (useBrowserHistory) return browserWorkouts().map(item => ({ id: item.id, title: item.workout.title, totalDurationMinutes: item.workout.totalDurationMinutes, focusAreas: item.workout.focusAreas, createdAt: item.createdAt, feedback: item.feedback, completedAt: item.completedAt, completedMinutes: item.completedMinutes }));
  const response = await apiClient.get<SavedWorkoutListItem[]>("/api/workouts");
  return Array.isArray(response.data) ? response.data : [];
}

export async function getWorkout(workoutId: string): Promise<SavedWorkoutDetail> {
  if (hasAccount()) {
    const records = (await accountRequest({ action: 'list' })).records;
    const record = records.find((item: SavedWorkoutDetail) => item.id === workoutId);
    if (!record) throw new Error('Workout not found.');
    return record;
  }
  if (useBrowserHistory) return findBrowserWorkout(workoutId);
  const response = await apiClient.get<SavedWorkoutDetail>(`/api/workouts/${workoutId}`);
  return response.data;
}

export async function submitWorkoutFeedback(
  workoutId: string,
  feedback: { difficultyFeedback: DifficultyFeedback; notes: string }
): Promise<WorkoutFeedbackUpdateResponse> {
  if (hasAccount()) { const { record } = await accountRequest({ action: 'feedback', id: workoutId, ...feedback }); return { feedback: record.feedback, workout: record.workout }; }
  if (useBrowserHistory) {
    const record = findBrowserWorkout(workoutId);
    record.feedback = { id: crypto.randomUUID(), workoutId, ...feedback, createdAt: new Date().toISOString() };
    saveBrowserWorkouts(browserWorkouts().map(item => item.id === workoutId ? record : item));
    return { feedback: record.feedback, workout: record.workout };
  }
  const response = await apiClient.post<WorkoutFeedbackUpdateResponse>(
    `/api/workouts/${workoutId}/feedback`,
    feedback
  );
  return response.data;
}

export async function renameWorkout(workoutId: string, title: string): Promise<SavedWorkoutDetail> {
  if (hasAccount()) return (await accountRequest({ action: 'rename', id: workoutId, title })).record;
  if (useBrowserHistory) {
    const record = findBrowserWorkout(workoutId);
    record.workout.title = title;
    saveBrowserWorkouts(browserWorkouts().map(item => item.id === workoutId ? record : item));
    return record;
  }
  const response = await apiClient.patch<SavedWorkoutDetail>(
    `/api/workouts/${workoutId}`,
    { title }
  );
  return response.data;
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  if (hasAccount()) { await accountRequest({ action: 'delete', id: workoutId }); return; }
  if (useBrowserHistory) {
    saveBrowserWorkouts(browserWorkouts().filter(item => item.id !== workoutId));
    return;
  }
  await apiClient.delete(`/api/workouts/${workoutId}`);
}

const useBrowserHistory = true;
const historyKey = "hoopcoach-workouts-v1";
function browserWorkouts(): SavedWorkoutDetail[] {
  try {
    const records = JSON.parse(localStorage.getItem(historyKey) || "[]");
    return Array.isArray(records) ? records.filter(item => item?.id && item.workout?.sections) : [];
  } catch { return []; }
}
function saveBrowserWorkouts(records: SavedWorkoutDetail[]) {
  try { localStorage.setItem(historyKey, JSON.stringify(records.slice(0, 50))); }
  catch { throw new Error("Your workout could not be saved in this browser. Free some storage and retry."); }
}
function findBrowserWorkout(id: string): SavedWorkoutDetail {
  const record = browserWorkouts().find(item => item.id === id);
  if (!record) throw new Error("Workout not found in this browser.");
  return record;
}

export async function completeWorkout(workoutId: string, completedSteps: number[]): Promise<void> {
  if (hasAccount()) { await accountRequest({ action: 'complete', id: workoutId, completedSteps }); return; }
  const record = findBrowserWorkout(workoutId);
  const drills = [...record.workout.sections.warmup, ...record.workout.sections.basketballDrills, ...record.workout.sections.conditioning, ...record.workout.sections.gymWorkout, ...record.workout.sections.cooldown];
  record.completedAt = new Date().toISOString();
  record.completedMinutes = completedSteps.reduce((sum, index) => sum + drills[index].durationMinutes, 0);
  saveBrowserWorkouts(browserWorkouts().map(item => item.id === workoutId ? record : item));
}
