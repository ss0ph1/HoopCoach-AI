import { PropsWithChildren } from "react";
import { Text, View } from "react-native";

export function Card({ children, title }: PropsWithChildren<{ title?: string }>) {
  return (
    <View className="mb-4 rounded-2xl border border-white/10 bg-panel p-4">
      {title ? <Text className="mb-3 text-lg font-extrabold text-white">{title}</Text> : null}
      {children}
    </View>
  );
}
