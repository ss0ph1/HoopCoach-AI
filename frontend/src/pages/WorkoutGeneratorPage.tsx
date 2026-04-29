import { useState } from "react";
import { generateWorkout } from "../api/workouts.js";
import WorkoutForm from "../components/WorkoutForm.js";
import WorkoutResult from "../components/WorkoutResult.js";
import WorkoutHistoryPage from "./WorkoutHistoryPage.js";
import type { GeneratedWorkout, WorkoutFeedback, WorkoutRequestInput } from "../types.js";

type ActivePage = "generate" | "history";

export default function WorkoutGeneratorPage() {
  const [activePage, setActivePage] = useState<ActivePage>("generate");
  const [workout, setWorkout] = useState<GeneratedWorkout | null>(null);
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<WorkoutFeedback | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerateWorkout(request: WorkoutRequestInput) {
    setIsLoading(true);
    setError("");

    try {
      const result = await generateWorkout(request);
      setWorkout(result.workout);
      setWorkoutId(result.workoutId);
      setFeedback(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto w-[min(1180px,calc(100%-32px))] py-10 max-[860px]:w-[min(100%-20px,1180px)] max-[860px]:py-7">
      <section className="mb-7 max-w-[760px]">
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-court">HoopFlow AI</p>
        <h1 className="mb-3 text-[clamp(2.2rem,6vw,4.8rem)] font-bold leading-[0.95]">
          Build a basketball workout that fits today.
        </h1>
        <p className="leading-7 text-slate-600">
          Choose your time, focus skills, level, and equipment. HoopFlow turns it
          into a structured training session with drill cards and tutorial searches.
        </p>
      </section>

      <nav className="mb-5 flex flex-wrap gap-2">
        <button
          className={activePage === "generate" ? "rounded-md bg-ink px-4 py-2 font-bold text-white" : "rounded-md border border-[#d8dfd1] bg-white px-4 py-2 font-bold text-slate-700"}
          type="button"
          onClick={() => setActivePage("generate")}
        >
          Generate Workout
        </button>
        <button
          className={activePage === "history" ? "rounded-md bg-ink px-4 py-2 font-bold text-white" : "rounded-md border border-[#d8dfd1] bg-white px-4 py-2 font-bold text-slate-700"}
          type="button"
          onClick={() => setActivePage("history")}
        >
          Workout History
        </button>
      </nav>

      {activePage === "generate" ? (
        <div className="grid grid-cols-[minmax(300px,420px)_1fr] items-start gap-5 max-[860px]:grid-cols-1">
          <WorkoutForm onSubmit={handleGenerateWorkout} isLoading={isLoading} />
          <WorkoutResult
            workout={workout}
            workoutId={workoutId}
            feedback={feedback}
            isLoading={isLoading}
            error={error}
            onFeedbackSubmitted={setFeedback}
          />
        </div>
      ) : (
        <WorkoutHistoryPage />
      )}

      <section className="mt-5 rounded-lg border border-[#d8dfd1] bg-white p-6 shadow-[0_16px_40px_rgb(23_32_42_/_0.08)]">
        <h2 className="mb-4 text-xl font-bold">Future video analysis</h2>
        <p className="leading-7 text-slate-600">
          Future versions may let players upload training videos and use OpenCV,
          MediaPipe, and PyTorch or TensorFlow to review shooting form, footwork,
          balance, and movement quality. This MVP focuses only on workout generation.
        </p>
      </section>
    </main>
  );
}
