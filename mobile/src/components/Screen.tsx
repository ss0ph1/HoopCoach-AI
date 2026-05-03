import { PropsWithChildren } from "react";
import { ScrollView, View } from "react-native";
import { StatusBar } from "expo-status-bar";

export function Screen({ children }: PropsWithChildren) {
  return (
    <View className="flex-1 bg-ink">
      <StatusBar style="light" />
      <ScrollView contentContainerClassName="px-5 pb-28 pt-14">
        {children}
      </ScrollView>
    </View>
  );
}
