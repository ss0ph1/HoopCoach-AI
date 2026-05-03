import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { useHoopCoach } from "@/context/HoopCoachContext";

export default function ProfileScreen() {
  const { workouts, analysisRecords } = useHoopCoach();

  return (
    <Screen>
      <Text className="text-3xl font-extrabold text-white">Profile</Text>
      <Card>
        <View className="flex-row items-center gap-4">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-slate-700">
            <Text className="text-3xl">👤</Text>
          </View>
          <View>
            <Text className="text-xl font-extrabold text-white">HoopCoach Player</Text>
            <Text className="text-slate-400">player@hoopcoach.ai</Text>
          </View>
        </View>
      </Card>
      <View className="flex-row gap-3">
        <Metric value={String(workouts.length)} label="Workouts" />
        <Metric value={String(analysisRecords.length)} label="Analyses" />
      </View>
      <Card title="Mobile Notes">
        <Text className="leading-6 text-slate-300">
          This Expo app uses the same FastAPI backend as the web app. OpenAI, PostgreSQL, MediaPipe, and OpenCV stay on the server.
        </Text>
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
