import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { ScorePill } from "@/components/ScorePill";
import { Screen } from "@/components/Screen";
import { useHoopCoach } from "@/context/HoopCoachContext";
import { formatDate, titleCase } from "@/utils/format";

export default function ProgressScreen() {
  const { workouts, analysisRecords } = useHoopCoach();
  const totalMinutes = workouts.reduce((sum, workout) => sum + workout.totalDurationMinutes, 0);
  const weeklyMinutes = buildWeeklyMinutes(workouts);
  const maxMinutes = Math.max(...weeklyMinutes.map((item) => item.minutes), 60);

  return (
    <Screen>
      <Text className="text-3xl font-extrabold text-white">Progress</Text>
      <Text className="mt-2 text-slate-400">Workout time and uploaded analysis history.</Text>

      <View className="mt-5 flex-row gap-3">
        <Metric value={String(totalMinutes)} label="Total Min" />
        <Metric value={String(workouts.length)} label="Workouts" />
        <Metric value={String(analysisRecords.length)} label="Videos" />
      </View>

      <Card title="Workout Time by Week">
        {weeklyMinutes.map((item) => (
          <View className="mb-3 flex-row items-center gap-3" key={item.label}>
            <Text className="w-14 text-xs font-bold text-slate-400">{item.label}</Text>
            <View className="h-7 flex-1 overflow-hidden rounded-md bg-white/10">
              <View className="h-full rounded-md bg-court" style={{ width: `${Math.max((item.minutes / maxMinutes) * 100, item.minutes ? 8 : 0)}%` }} />
            </View>
            <Text className="w-16 text-right text-xs font-bold text-white">{item.minutes} min</Text>
          </View>
        ))}
      </Card>

      <Card title="Uploaded Analysis Videos">
        {analysisRecords.length ? analysisRecords.map((record) => (
          <View className="mb-3 flex-row items-center gap-3 rounded-xl bg-white/5 p-3" key={record.id}>
            <View className="flex-1">
              <Text numberOfLines={1} className="font-extrabold text-white">{record.fileName}</Text>
              <Text className="text-sm text-slate-400">{titleCase(record.analysisType)} · {formatDate(record.uploadedAt)}</Text>
            </View>
            <ScorePill score={record.score} />
          </View>
        )) : <Text className="text-slate-400">Analyze a video or photo to build this list.</Text>}
      </Card>
    </Screen>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View className="mb-4 flex-1 rounded-xl border border-white/10 bg-panel p-4">
      <Text className="text-2xl font-extrabold text-white">{value}</Text>
      <Text className="mt-1 text-xs text-slate-400">{label}</Text>
    </View>
  );
}

function buildWeeklyMinutes(workouts: { createdAt: string; totalDurationMinutes: number }[]) {
  const today = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const start = new Date(today);
    start.setDate(today.getDate() - (5 - index) * 7);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const minutes = workouts.reduce((sum, workout) => {
      const createdAt = new Date(workout.createdAt);
      return createdAt >= start && createdAt < end ? sum + workout.totalDurationMinutes : sum;
    }, 0);
    return { label: `${start.getMonth() + 1}/${start.getDate()}`, minutes };
  });
}
