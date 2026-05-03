import { Text, View } from "react-native";

export function ScorePill({ score }: { score: number }) {
  return (
    <View className="h-16 w-16 items-center justify-center rounded-full border-4 border-green-600">
      <Text className="text-lg font-extrabold text-green-400">{score}%</Text>
    </View>
  );
}
