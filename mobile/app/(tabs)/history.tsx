import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { ScorePill } from "@/components/ScorePill";
import { Screen } from "@/components/Screen";
import { useHoopCoach } from "@/context/HoopCoachContext";
import { formatDate, titleCase } from "@/utils/format";

export default function HistoryScreen() {
  const { workouts, analysisRecords } = useHoopCoach();

  return (
    <Screen>
      <Text className="text-3xl font-extrabold text-white">History</Text>
      <Text className="mt-2 text-slate-400">Saved workouts and uploaded analyses.</Text>

      <Card title="Analyses">
        {analysisRecords.length ? analysisRecords.map((record) => (
          <View className="mb-3 flex-row items-center gap-3 rounded-xl bg-white/5 p-3" key={record.id}>
            <View className="h-11 w-11 items-center justify-center rounded-lg bg-orange-500/15">
              <Text className="text-lg">▶</Text>
            </View>
            <View className="flex-1">
              <Text numberOfLines={1} className="font-extrabold text-white">{record.fileName}</Text>
              <Text className="text-sm text-slate-400">{titleCase(record.analysisType)} · {formatDate(record.uploadedAt)}</Text>
            </View>
            <ScorePill score={record.score} />
          </View>
        )) : <Text className="text-slate-400">Upload an analysis video or photo to see it here.</Text>}
      </Card>

      <Card title="Workouts">
        {workouts.length ? workouts.map((workout) => (
          <Pressable className="mb-3 flex-row items-center gap-3 rounded-xl bg-white/5 p-3" key={workout.id} onPress={() => router.push(`/workouts/${workout.id}`)}>
            <View className="h-11 w-11 items-center justify-center rounded-lg bg-white/5">
              <Text>📋</Text>
            </View>
            <View className="flex-1">
              <Text numberOfLines={1} className="font-extrabold text-white">{workout.title}</Text>
              <Text className="text-sm text-slate-400">{formatDate(workout.createdAt)} · {workout.totalDurationMinutes} min</Text>
            </View>
            <Text className="text-slate-400">›</Text>
          </Pressable>
        )) : <Text className="text-slate-400">No workouts saved yet.</Text>}
      </Card>
    </Screen>
  );
}
