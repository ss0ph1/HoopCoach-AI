import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { generateWorkout } from "@/api/workouts";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { useHoopCoach } from "@/context/HoopCoachContext";
import type { SkillLevel, TargetSkill } from "@/types";
import { titleCase } from "@/utils/format";

const skills: TargetSkill[] = ["shooting", "ball handling", "finishing", "defense", "conditioning", "footwork"];
const equipmentOptions = ["basketball", "hoop", "cones", "resistance bands", "dumbbells", "none"];
const timeOptions = [30, 45, 60, 90];
const levels: SkillLevel[] = ["beginner", "intermediate", "advanced"];

export default function GenerateScreen() {
  const { refreshWorkouts } = useHoopCoach();
  const [availableTimeMinutes, setAvailableTimeMinutes] = useState(60);
  const [targetSkills, setTargetSkills] = useState<TargetSkill[]>(["shooting", "ball handling"]);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("intermediate");
  const [equipment, setEquipment] = useState<string[]>(["basketball", "hoop"]);
  const [includeGymWorkout, setIncludeGymWorkout] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleSkill(skill: TargetSkill) {
    setTargetSkills((current) =>
      current.includes(skill)
        ? current.filter((item) => item !== skill)
        : [...current, skill].slice(0, 3)
    );
  }

  function toggleEquipment(item: string) {
    setEquipment((current) =>
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item]
    );
  }

  async function handleGenerate() {
    if (!targetSkills.length) {
      setError("Choose at least one focus skill.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await generateWorkout({ availableTimeMinutes, targetSkills, skillLevel, equipment, includeGymWorkout });
      await refreshWorkouts();
      if (result.workoutId) {
        router.push(`/workouts/${result.workoutId}`);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not generate workout.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Screen>
      <Text className="text-3xl font-extrabold text-white">Generate Workout</Text>
      <Text className="mt-2 text-slate-400">Build a personalized HoopCoach plan.</Text>

      <Card title="Available Time">
        <View className="flex-row flex-wrap gap-2">
          {timeOptions.map((minutes) => (
            <Chip key={minutes} selected={availableTimeMinutes === minutes} label={`${minutes} min`} onPress={() => setAvailableTimeMinutes(minutes)} />
          ))}
        </View>
      </Card>

      <Card title="Focus Skills">
        <View className="flex-row flex-wrap gap-2">
          {skills.map((skill) => (
            <Chip key={skill} selected={targetSkills.includes(skill)} label={titleCase(skill)} onPress={() => toggleSkill(skill)} />
          ))}
        </View>
      </Card>

      <Card title="Skill Level">
        <View className="flex-row flex-wrap gap-2">
          {levels.map((level) => (
            <Chip key={level} selected={skillLevel === level} label={titleCase(level)} onPress={() => setSkillLevel(level)} />
          ))}
        </View>
      </Card>

      <Card title="Equipment">
        <View className="flex-row flex-wrap gap-2">
          {equipmentOptions.map((item) => (
            <Chip key={item} selected={equipment.includes(item)} label={titleCase(item)} onPress={() => toggleEquipment(item)} />
          ))}
        </View>
      </Card>

      <Card>
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-white">Include Gym Workout</Text>
          <Switch value={includeGymWorkout} onValueChange={setIncludeGymWorkout} trackColor={{ true: "#f97316" }} />
        </View>
      </Card>

      {error ? <Text className="mb-3 font-bold text-red-300">{error}</Text> : null}
      <Pressable className="rounded-xl bg-court p-4" disabled={isLoading} onPress={handleGenerate}>
        <Text className="text-center font-extrabold text-white">{isLoading ? "Generating..." : "Generate My Workout"}</Text>
      </Pressable>
    </Screen>
  );
}

function Chip({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable className={selected ? "rounded-lg bg-court px-4 py-2" : "rounded-lg border border-white/10 bg-white/5 px-4 py-2"} onPress={onPress}>
      <Text className={selected ? "font-bold text-white" : "font-bold text-slate-300"}>{label}</Text>
    </Pressable>
  );
}
