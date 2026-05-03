import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { listWorkouts } from "@/api/workouts";
import type { AnalysisRecord, SavedWorkoutListItem } from "@/types";

type HoopCoachContextValue = {
  workouts: SavedWorkoutListItem[];
  analysisRecords: AnalysisRecord[];
  refreshWorkouts: () => Promise<void>;
  saveAnalysisRecord: (record: AnalysisRecord) => Promise<void>;
  removeWorkoutFromState: (workoutId: string) => void;
  upsertWorkoutInState: (workout: SavedWorkoutListItem) => void;
};

const AnalysisStorageKey = "hoopcoach-mobile-analysis-records";
const HoopCoachContext = createContext<HoopCoachContextValue | null>(null);

export function HoopCoachProvider({ children }: PropsWithChildren) {
  const [workouts, setWorkouts] = useState<SavedWorkoutListItem[]>([]);
  const [analysisRecords, setAnalysisRecords] = useState<AnalysisRecord[]>([]);

  async function refreshWorkouts() {
    setWorkouts(await listWorkouts());
  }

  async function loadAnalysisRecords() {
    const stored = await AsyncStorage.getItem(AnalysisStorageKey);
    setAnalysisRecords(stored ? JSON.parse(stored) : []);
  }

  async function saveAnalysisRecord(record: AnalysisRecord) {
    const nextRecords = [record, ...analysisRecords].slice(0, 40);
    setAnalysisRecords(nextRecords);
    await AsyncStorage.setItem(AnalysisStorageKey, JSON.stringify(nextRecords));
  }

  function removeWorkoutFromState(workoutId: string) {
    setWorkouts((current) => current.filter((item) => item.id !== workoutId));
  }

  function upsertWorkoutInState(workout: SavedWorkoutListItem) {
    setWorkouts((current) => {
      const exists = current.some((item) => item.id === workout.id);
      return exists
        ? current.map((item) => item.id === workout.id ? workout : item)
        : [workout, ...current];
    });
  }

  useEffect(() => {
    void refreshWorkouts();
    void loadAnalysisRecords();
  }, []);

  const value = useMemo(() => ({
    workouts,
    analysisRecords,
    refreshWorkouts,
    saveAnalysisRecord,
    removeWorkoutFromState,
    upsertWorkoutInState
  }), [analysisRecords, workouts]);

  return (
    <HoopCoachContext.Provider value={value}>
      {children}
    </HoopCoachContext.Provider>
  );
}

export function useHoopCoach() {
  const value = useContext(HoopCoachContext);

  if (!value) {
    throw new Error("useHoopCoach must be used inside HoopCoachProvider.");
  }

  return value;
}
