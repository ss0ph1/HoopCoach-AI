import "../src/styles/global.css";
import { Stack } from "expo-router";
import { HoopCoachProvider } from "@/context/HoopCoachContext";

export default function RootLayout() {
  return (
    <HoopCoachProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </HoopCoachProvider>
  );
}
