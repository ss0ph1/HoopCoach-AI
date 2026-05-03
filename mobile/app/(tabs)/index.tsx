import { Link, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { ScorePill } from "@/components/ScorePill";
import { Screen } from "@/components/Screen";
import { useHoopCoach } from "@/context/HoopCoachContext";
import { formatDate } from "@/utils/format";

export default function DashboardScreen() {
  const { workouts, analysisRecords } = useHoopCoach();
  const recentWorkout = workouts[0];
  const totalMinutes = workouts.reduce((sum, item) => sum + item.totalDurationMinutes, 0);

  return (
    <Screen>
      <Text className="text-3xl font-extrabold text-white">Welcome back 👋</Text>
      <Text className="mt-2 text-slate-400">Ready to get better today?</Text>

      <View className="mt-6 flex-row gap-3">
        <Metric value={String(workouts.length)} label="Workouts" />
        <Metric value={String(totalMinutes)} label="Minutes" />
        <Metric value={String(analysisRecords.length)} label="Analyses" />
      </View>

      <Card title="Recent Workout">
        {recentWorkout ? (
          <Pressable onPress={() => router.push(`/workouts/${recentWorkout.id}`)}>
            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-1">
                <Text className="text-lg font-extrabold text-white">{recentWorkout.title}</Text>
                <Text className="mt-1 text-slate-400">{formatDate(recentWorkout.createdAt)} · {recentWorkout.totalDurationMinutes} min</Text>
              </View>
              <ScorePill score={recentWorkout.feedback?.difficultyFeedback === "too_easy" ? 68 : 85} />
            </View>
          </Pressable>
        ) : (
          <Text className="text-slate-400">Generate your first workout to start tracking progress.</Text>
        )}
      </Card>

      <Card title="Quick Actions">
        <View className="gap-3">
          <Link href="/generate" asChild>
            <Action title="Generate Workout" subtitle="Create a custom plan" />
          </Link>
          <Link href="/analysis" asChild>
            <Action title="Form Analysis" subtitle="Upload photo or video" />
          </Link>
          <Link href="/progress" asChild>
            <Action title="View Progress" subtitle="Track workouts and analyses" />
          </Link>
        </View>
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

function Action({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Pressable className="rounded-xl border border-white/10 bg-white/5 p-4">
      <Text className="font-extrabold text-white">{title}</Text>
      <Text className="mt-1 text-sm text-slate-400">{subtitle}</Text>
    </Pressable>
  );
}
