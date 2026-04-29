import { useEffect, useState } from "react";
import { submitWorkoutFeedback } from "../api/workouts.js";
import type { DifficultyFeedback, Drill, GeneratedWorkout, WorkoutFeedback } from "../types.js";

type WorkoutResultProps = {
  workout: GeneratedWorkout | null;
  workoutId: string | null;
  feedback: WorkoutFeedback | null;
  isLoading: boolean;
  error: string;
  onFeedbackSubmitted: (feedback: WorkoutFeedback) => void;
};

const sectionLabels = {
  warmup: "Warmup",
  basketballDrills: "Basketball drills",
  conditioning: "Conditioning",
  gymWorkout: "Gym workout",
  cooldown: "Cooldown"
} as const;

export default function WorkoutResult({
  workout,
  workoutId,
  feedback,
  isLoading,
  error,
  onFeedbackSubmitted
}: WorkoutResultProps) {
  if (isLoading) {
    return (
      <section className="grid min-h-72 content-center rounded-lg border border-[#d8dfd1] bg-white p-6 shadow-[0_16px_40px_rgb(23_32_42_/_0.08)]">
        <h2 className="mb-4 text-xl font-bold">Building your plan...</h2>
        <p className="leading-7 text-slate-600">Balancing time, skill focus, equipment, and workout flow.</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="grid min-h-72 content-center rounded-lg border border-red-200 bg-white p-6 shadow-[0_16px_40px_rgb(23_32_42_/_0.08)]">
        <h2 className="mb-4 text-xl font-bold">Workout could not be generated</h2>
        <p className="leading-7 text-slate-600">{error}</p>
      </section>
    );
  }

  if (!workout) {
    return (
      <section className="grid min-h-72 content-center rounded-lg border border-[#d8dfd1] bg-white p-6 shadow-[0_16px_40px_rgb(23_32_42_/_0.08)]">
        <h2 className="mb-4 text-xl font-bold">Your workout will appear here</h2>
        <p className="leading-7 text-slate-600">Submit the form to generate drill cards, durations, and tutorial links.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[#d8dfd1] bg-white p-6 shadow-[0_16px_40px_rgb(23_32_42_/_0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-court">Generated workout</p>
          <h2 className="mb-4 text-xl font-bold">{workout.title}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-mint px-3 py-2 font-extrabold text-white">
          {workout.totalDurationMinutes} min
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {workout.focusAreas.map((focusArea) => (
          <span className="rounded-full bg-[#edf3e8] px-3 py-1.5 text-sm font-bold text-slate-700" key={focusArea}>
            {focusArea}
          </span>
        ))}
      </div>

      {(Object.keys(sectionLabels) as Array<keyof typeof sectionLabels>).map((sectionKey) => {
        const drills = workout.sections[sectionKey];

        if (drills.length === 0) {
          return null;
        }

        return (
          <div key={sectionKey}>
            <h3 className="mb-4 mt-7 text-base font-bold">{sectionLabels[sectionKey]}</h3>
            <div className="grid gap-3">
              {drills.map((drill) => (
                <DrillCard drill={drill} key={`${sectionKey}-${drill.name}`} />
              ))}
            </div>
          </div>
        );
      })}

      {workoutId ? (
        <FeedbackForm
          workoutId={workoutId}
          feedback={feedback}
          onFeedbackSubmitted={onFeedbackSubmitted}
        />
      ) : null}
    </section>
  );
}

function DrillCard({ drill }: { drill: Drill }) {
  return (
    <article className="rounded-lg border border-[#dfe6d8] bg-[#fbfcfa] p-4">
      <div className="flex justify-between gap-3">
        <h4 className="mb-2 font-bold">{drill.name}</h4>
        <span className="shrink-0 font-semibold">{drill.durationMinutes} min</span>
      </div>
      <p className="leading-6 text-slate-600">{drill.purpose}</p>
      <p className="leading-6 text-slate-800">{drill.instructions}</p>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-[#edf3e8] px-3 py-1.5 text-sm font-bold text-slate-700">
          {drill.difficulty}
        </span>
        <span className="rounded-full bg-[#edf3e8] px-3 py-1.5 text-sm font-bold text-slate-700">
          {drill.equipment.join(", ")}
        </span>
      </div>
      <a className="mt-3 inline-block font-extrabold text-court no-underline" href={drill.youtubeSearchUrl} target="_blank" rel="noreferrer">
        Watch tutorial search
      </a>
    </article>
  );
}

function FeedbackForm({
  workoutId,
  feedback,
  onFeedbackSubmitted
}: {
  workoutId: string;
  feedback: WorkoutFeedback | null;
  onFeedbackSubmitted: (feedback: WorkoutFeedback) => void;
}) {
  const [difficultyFeedback, setDifficultyFeedback] = useState<DifficultyFeedback>(
    feedback?.difficultyFeedback ?? "just_right"
  );
  const [notes, setNotes] = useState(feedback?.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDifficultyFeedback(feedback?.difficultyFeedback ?? "just_right");
    setNotes(feedback?.notes ?? "");
    setMessage("");
  }, [feedback, workoutId]);

  async function handleSubmit() {
    setIsSaving(true);
    setMessage("");

    try {
      const savedFeedback = await submitWorkoutFeedback(workoutId, {
        difficultyFeedback,
        notes
      });
      onFeedbackSubmitted(savedFeedback);
      setMessage("Feedback saved. Future workouts will adapt from this.");
    } catch {
      setMessage("Could not save feedback.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-7 rounded-lg border border-[#dfe6d8] bg-[#fbfcfa] p-4">
      <h3 className="mb-3 text-base font-bold">Workout feedback</h3>
      <div className="mb-4 flex flex-wrap gap-2">
        {feedbackOptions.map((option) => (
          <button
            className={
              difficultyFeedback === option.value
                ? "rounded-md bg-ink px-3 py-2 text-sm font-bold text-white"
                : "rounded-md border border-[#ccd6c2] bg-white px-3 py-2 text-sm font-bold text-slate-700"
            }
            key={option.value}
            type="button"
            onClick={() => setDifficultyFeedback(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="mb-4 grid gap-2">
        <span className="text-sm font-bold text-slate-700">Notes</span>
        <textarea
          className="min-h-24 rounded-md border border-[#cfd8c7] bg-white px-3 py-3 text-ink"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Example: handles were too easy, but conditioning was hard."
        />
      </label>

      <button
        className="rounded-md bg-court px-4 py-2 font-extrabold text-white disabled:opacity-60"
        type="button"
        disabled={isSaving}
        onClick={handleSubmit}
      >
        {isSaving ? "Saving..." : feedback ? "Update feedback" : "Submit feedback"}
      </button>
      {message ? <p className="mt-3 text-sm font-bold text-slate-700">{message}</p> : null}
    </div>
  );
}

const feedbackOptions: Array<{ value: DifficultyFeedback; label: string }> = [
  { value: "too_easy", label: "Too Easy" },
  { value: "just_right", label: "Just Right" },
  { value: "too_hard", label: "Too Hard" }
];
