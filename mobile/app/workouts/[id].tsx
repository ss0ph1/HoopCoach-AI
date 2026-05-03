import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { deleteWorkout, getWorkout, renameWorkout, submitWorkoutFeedback } from "@/api/workouts";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { useHoopCoach } from "@/context/HoopCoachContext";
import type { DifficultyFeedback, SavedWorkoutDetail } from "@/types";
import { formatDate, titleCase } from "@/utils/format";

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refreshWorkouts, removeWorkoutFromState, upsertWorkoutInState } = useHoopCoach();
  const [workout, setWorkout] = useState<SavedWorkoutDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [difficultyFeedback, setDifficultyFeedback] = useState<DifficultyFeedback>("just_right");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadWorkout() {
      if (!id) return;
      setIsLoading(true);
      const result = await getWorkout(id);
      setWorkout(result);
      setTitle(result.workout.title);
      setDifficultyFeedback(result.feedback?.difficultyFeedback ?? "just_right");
      setNotes(result.feedback?.notes ?? "");
      setIsLoading(false);
    }

    void loadWorkout();
  }, [id]);

  async function handleRename() {
    if (!workout || !title.trim()) return;
    const renamed = await renameWorkout(workout.id, title.trim());
    setWorkout(renamed);
    upsertWorkoutInState({
      id: renamed.id,
      title: renamed.workout.title,
      totalDurationMinutes: renamed.workout.totalDurationMinutes,
      focusAreas: renamed.workout.focusAreas,
      createdAt: renamed.createdAt,
      feedback: renamed.feedback
    });
    setIsEditing(false);
  }

  async function handleDelete() {
    if (!workout) return;
    Alert.alert("Delete workout?", "This saved workout will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteWorkout(workout.id);
          removeWorkoutFromState(workout.id);
          router.back();
        }
      }
    ]);
  }

  async function handleFeedback() {
    if (!workout) return;
    const result = await submitWorkoutFeedback(workout.id, { difficultyFeedback, notes });
    setWorkout({ ...workout, workout: result.workout, feedback: result.feedback });
    await refreshWorkouts();
    setMessage("Feedback saved and this workout was updated.");
  }

  if (isLoading) {
    return (
      <Screen>
        <Text className="text-white">Loading workout...</Text>
      </Screen>
    );
  }

  if (!workout) {
    return (
      <Screen>
        <Text className="text-white">Workout not found.</Text>
      </Screen>
    );
  }

  const sections = [
    ["Warm Up", workout.workout.sections.warmup],
    ["Skills Work", workout.workout.sections.basketballDrills],
    ["Conditioning", workout.workout.sections.conditioning],
    ["Gym", workout.workout.sections.gymWorkout],
    ["Cool Down", workout.workout.sections.cooldown]
  ] as const;

  return (
    <Screen>
      <Pressable onPress={() => router.back()}>
        <Text className="mb-4 font-bold text-slate-300">← Back</Text>
      </Pressable>

      {isEditing ? (
        <View className="mb-4 gap-3">
          <TextInput className="rounded-xl border border-white/10 bg-white/5 p-4 text-xl font-extrabold text-white" value={title} onChangeText={setTitle} />
          <View className="flex-row gap-3">
            <Pressable className="flex-1 rounded-xl bg-court p-3" onPress={handleRename}>
              <Text className="text-center font-bold text-white">Save</Text>
            </Pressable>
            <Pressable className="flex-1 rounded-xl border border-white/10 bg-white/5 p-3" onPress={() => setIsEditing(false)}>
              <Text className="text-center font-bold text-slate-300">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onLongPress={() => setIsEditing(true)} onPress={() => setIsEditing(true)}>
          <Text className="text-3xl font-extrabold text-white">{workout.workout.title}</Text>
          <Text className="mt-1 text-slate-400">Tap title to rename</Text>
        </Pressable>
      )}

      <Text className="mt-2 text-slate-400">{formatDate(workout.createdAt)} · {workout.workout.totalDurationMinutes} min · {workout.workout.focusAreas.join(", ")}</Text>

      <View className="my-4 flex-row gap-3">
        <Pressable className="flex-1 rounded-xl border border-white/10 bg-white/5 p-3" onPress={() => setIsEditing(true)}>
          <Text className="text-center font-bold text-white">Rename</Text>
        </Pressable>
        <Pressable className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 p-3" onPress={handleDelete}>
          <Text className="text-center font-bold text-red-300">Delete</Text>
        </Pressable>
      </View>

      {sections.map(([label, drills]) => drills.length ? (
        <Card title={label} key={label}>
          {drills.map((drill) => (
            <View className="mb-3 rounded-xl bg-white/5 p-3" key={drill.name}>
              <Text className="font-extrabold text-white">{drill.name}</Text>
              <Text className="mt-1 text-sm text-slate-400">{drill.durationMinutes} min · {titleCase(drill.difficulty)}</Text>
              <Text className="mt-2 leading-5 text-slate-300">{drill.instructions}</Text>
            </View>
          ))}
        </Card>
      ) : null)}

      <Card title="Feedback">
        <View className="mb-3 flex-row flex-wrap gap-2">
          {(["too_easy", "just_right", "too_hard"] as DifficultyFeedback[]).map((choice) => (
            <Pressable className={difficultyFeedback === choice ? "rounded-lg bg-court px-3 py-2" : "rounded-lg border border-white/10 bg-white/5 px-3 py-2"} key={choice} onPress={() => setDifficultyFeedback(choice)}>
              <Text className="font-bold text-white">{titleCase(choice.replace("_", " "))}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          className="min-h-24 rounded-xl border border-white/10 bg-white/5 p-3 text-white"
          multiline
          placeholder="Tell HoopCoach what to change..."
          placeholderTextColor="#64748b"
          value={notes}
          onChangeText={setNotes}
        />
        <Pressable className="mt-3 rounded-xl bg-court p-4" onPress={handleFeedback}>
          <Text className="text-center font-extrabold text-white">Save Feedback</Text>
        </Pressable>
        {message ? <Text className="mt-3 font-bold text-green-300">{message}</Text> : null}
      </Card>
    </Screen>
  );
}
