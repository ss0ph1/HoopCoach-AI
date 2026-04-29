import { useEffect, useState } from "react";
import { getWorkout, listWorkouts } from "../api/workouts.js";
import WorkoutResult from "../components/WorkoutResult.js";
import type { SavedWorkoutDetail, SavedWorkoutListItem, WorkoutFeedback } from "../types.js";

export default function WorkoutHistoryPage() {
  const [workouts, setWorkouts] = useState<SavedWorkoutListItem[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<SavedWorkoutDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadWorkouts() {
    setIsLoading(true);
    setError("");

    try {
      setWorkouts(await listWorkouts());
    } catch {
      setError("Could not load workout history.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectWorkout(workoutId: string) {
    setError("");

    try {
      setSelectedWorkout(await getWorkout(workoutId));
    } catch {
      setError("Could not load that workout.");
    }
  }

  function handleFeedbackSubmitted(feedback: WorkoutFeedback) {
    setSelectedWorkout((current) => current && { ...current, feedback });
    setWorkouts((current) =>
      current.map((workout) =>
        workout.id === feedback.workoutId ? { ...workout, feedback } : workout
      )
    );
  }

  useEffect(() => {
    void loadWorkouts();
  }, []);

  return (
    <div className="grid grid-cols-[minmax(300px,380px)_1fr] items-start gap-5 max-[900px]:grid-cols-1">
      <section className="rounded-lg border border-[#d8dfd1] bg-white p-6 shadow-[0_16px_40px_rgb(23_32_42_/_0.08)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Workout History</h2>
          <button className="rounded-md border border-[#d8dfd1] px-3 py-2 text-sm font-bold" type="button" onClick={loadWorkouts}>
            Refresh
          </button>
        </div>

        {isLoading ? <p className="text-slate-600">Loading workouts...</p> : null}
        {error ? <p className="text-red-600">{error}</p> : null}

        <div className="grid gap-3">
          {workouts.map((workout) => (
            <button
              className="rounded-lg border border-[#dfe6d8] bg-[#fbfcfa] p-4 text-left transition hover:border-court"
              key={workout.id}
              type="button"
              onClick={() => handleSelectWorkout(workout.id)}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="font-bold">{workout.title}</h3>
                <span className="shrink-0 rounded-full bg-mint px-2.5 py-1 text-xs font-extrabold text-white">
                  {workout.totalDurationMinutes} min
                </span>
              </div>
              <p className="mb-3 text-sm text-slate-500">
                {new Date(workout.createdAt).toLocaleString()}
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {workout.focusAreas.map((focusArea) => (
                  <span className="rounded-full bg-[#edf3e8] px-2.5 py-1 text-xs font-bold text-slate-700" key={focusArea}>
                    {focusArea}
                  </span>
                ))}
              </div>
              <p className="text-sm font-bold text-slate-700">
                Feedback: {workout.feedback ? formatFeedback(workout.feedback.difficultyFeedback) : "Not submitted"}
              </p>
            </button>
          ))}
        </div>
      </section>

      <WorkoutResult
        workout={selectedWorkout?.workout ?? null}
        workoutId={selectedWorkout?.id ?? null}
        feedback={selectedWorkout?.feedback ?? null}
        isLoading={false}
        error=""
        onFeedbackSubmitted={handleFeedbackSubmitted}
      />
    </div>
  );
}

function formatFeedback(feedback: string) {
  return feedback.replace("_", " ");
}
