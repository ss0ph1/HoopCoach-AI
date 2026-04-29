export type TargetSkill =
  | "shooting"
  | "ball handling"
  | "finishing"
  | "defense"
  | "conditioning"
  | "vertical jump"
  | "strength"
  | "footwork";

export type SkillLevel = "beginner" | "intermediate" | "advanced";

export type WorkoutRequestInput = {
  availableTimeMinutes: number;
  targetSkills: TargetSkill[];
  skillLevel: SkillLevel;
  equipment: string[];
  includeGymWorkout: boolean;
};

export type Drill = {
  name: string;
  durationMinutes: number;
  purpose: string;
  instructions: string;
  difficulty: string;
  equipment: string[];
  youtubeSearchUrl: string;
};

export type GeneratedWorkout = {
  title: string;
  totalDurationMinutes: number;
  focusAreas: string[];
  sections: {
    warmup: Drill[];
    basketballDrills: Drill[];
    conditioning: Drill[];
    gymWorkout: Drill[];
    cooldown: Drill[];
  };
};

export type DifficultyFeedback = "too_easy" | "just_right" | "too_hard";

export type WorkoutFeedback = {
  id: string;
  workoutId: string;
  difficultyFeedback: DifficultyFeedback;
  notes: string;
  createdAt: string;
};

export type SavedWorkoutListItem = {
  id: string;
  title: string;
  totalDurationMinutes: number;
  focusAreas: string[];
  createdAt: string;
  feedback: WorkoutFeedback | null;
};

export type SavedWorkoutDetail = {
  id: string;
  workout: GeneratedWorkout;
  createdAt: string;
  feedback: WorkoutFeedback | null;
};
