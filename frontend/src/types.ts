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
  generation?: { source: "gemini" | "openai"; model: string; responseId: string | null; generatedAt: string };
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

export type WorkoutFeedbackUpdateResponse = {
  feedback: WorkoutFeedback;
  workout: GeneratedWorkout;
};

export type SavedWorkoutListItem = {
  completedAt?: string;
  completedMinutes?: number;
  id: string;
  title: string;
  totalDurationMinutes: number;
  focusAreas: string[];
  createdAt: string;
  feedback: WorkoutFeedback | null;
};

export type SavedWorkoutDetail = {
  completedAt?: string;
  completedMinutes?: number;
  id: string;
  workout: GeneratedWorkout;
  createdAt: string;
  feedback: WorkoutFeedback | null;
};

export type ShootingPhotoFeedbackStatus = "good" | "needs_work" | "unknown";

export type ShootingPhotoFeedbackItem = {
  category: string;
  status: ShootingPhotoFeedbackStatus;
  message: string;
};

export type ShootingPhotoAnalysisResult = {
  score: number;
  summary: string;
  feedback: ShootingPhotoFeedbackItem[];
  measurements: {
    shootingElbowAngle: number | null;
    shoulderTilt: number | null;
    bodyLean: number | null;
  };
};

export type AnalysisFeedbackStatus = "good" | "needs_work" | "unknown";

export type AnalysisFeedbackItem = {
  category: string;
  status: AnalysisFeedbackStatus;
  message: string;
};

export type ShootingVideoAnalysisResult = {
  processing?: "browser";
  id?: string;
  analysisType: "shooting";
  score: number;
  summary: string;
  feedback: AnalysisFeedbackItem[];
  measurements: {
    averageElbowAngle: number | null;
    releaseElbowAngle: number | null;
    shoulderTilt: number | null;
    bodyLean: number | null;
    kneeBend: number | null;
    followThroughHeld: boolean | null;
  };
  s3Url?: string;
  s3Key?: string;
  createdAt?: string;
};

export type DribblingVideoAnalysisResult = {
  processing?: "browser";
  id?: string;
  analysisType: "dribbling";
  score: number;
  summary: string;
  feedback: AnalysisFeedbackItem[];
  measurements: {
    averageKneeBend: number | null;
    averageBodyLean: number | null;
    headDownPercentage: number | null;
    stanceStability: number | null;
    estimatedBallHeight: string | null;
  };
  s3Url?: string;
  s3Key?: string;
  createdAt?: string;
};

export type VideoAnalysisResult = ShootingVideoAnalysisResult | DribblingVideoAnalysisResult;
