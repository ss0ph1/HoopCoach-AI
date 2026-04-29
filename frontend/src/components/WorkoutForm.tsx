import { FormEvent, useState } from "react";
import type { SkillLevel, TargetSkill, WorkoutRequestInput } from "../types.js";

const targetSkillOptions: TargetSkill[] = [
  "shooting",
  "ball handling",
  "finishing",
  "defense",
  "conditioning",
  "vertical jump",
  "strength",
  "footwork"
];

const skillLevelOptions: SkillLevel[] = ["beginner", "intermediate", "advanced"];

type WorkoutFormProps = {
  isLoading: boolean;
  onSubmit: (request: WorkoutRequestInput) => void;
};

export default function WorkoutForm({ isLoading, onSubmit }: WorkoutFormProps) {
  const [availableTimeMinutes, setAvailableTimeMinutes] = useState(45);
  const [targetSkills, setTargetSkills] = useState<TargetSkill[]>(["shooting", "ball handling"]);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("intermediate");
  const [equipmentText, setEquipmentText] = useState("ball, hoop, cones");
  const [includeGymWorkout, setIncludeGymWorkout] = useState(false);

  function toggleSkill(skill: TargetSkill) {
    setTargetSkills((currentSkills) =>
      currentSkills.includes(skill)
        ? currentSkills.filter((currentSkill) => currentSkill !== skill)
        : [...currentSkills, skill]
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const equipment = equipmentText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    onSubmit({
      availableTimeMinutes,
      targetSkills,
      skillLevel,
      equipment,
      includeGymWorkout
    });
  }

  return (
    <form
      className="rounded-lg border border-[#d8dfd1] bg-white p-6 shadow-[0_16px_40px_rgb(23_32_42_/_0.08)]"
      onSubmit={handleSubmit}
    >
      <h2 className="mb-5 text-xl font-bold">Workout details</h2>

      <label className="mb-5 grid gap-2">
        <span className="text-sm font-bold text-slate-700">Available time</span>
        <input
          className="w-full rounded-md border border-[#cfd8c7] bg-[#fbfcfa] px-3 py-3 text-ink"
          min={15}
          max={180}
          type="number"
          value={availableTimeMinutes}
          onChange={(event) => setAvailableTimeMinutes(Number(event.target.value))}
        />
      </label>

      <fieldset className="mb-5 grid gap-2 border-0 p-0">
        <legend className="text-sm font-bold text-slate-700">Target skills</legend>
        <div className="flex flex-wrap gap-2">
          {targetSkillOptions.map((skill) => (
            <button
              className={
                targetSkills.includes(skill)
                  ? "rounded-full border border-court bg-court px-3 py-2 text-white"
                  : "rounded-full border border-[#ccd6c2] bg-[#fbfcfa] px-3 py-2 text-slate-700"
              }
              key={skill}
              type="button"
              onClick={() => toggleSkill(skill)}
            >
              {skill}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mb-5 grid gap-2">
        <span className="text-sm font-bold text-slate-700">Skill level</span>
        <select
          className="w-full rounded-md border border-[#cfd8c7] bg-[#fbfcfa] px-3 py-3 text-ink"
          value={skillLevel}
          onChange={(event) => setSkillLevel(event.target.value as SkillLevel)}
        >
          {skillLevelOptions.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-5 grid gap-2">
        <span className="text-sm font-bold text-slate-700">Equipment</span>
        <input
          className="w-full rounded-md border border-[#cfd8c7] bg-[#fbfcfa] px-3 py-3 text-ink"
          type="text"
          value={equipmentText}
          onChange={(event) => setEquipmentText(event.target.value)}
          placeholder="ball, hoop, cones"
        />
      </label>

      <label className="mb-5 flex items-center gap-3 font-bold text-slate-700">
        <input
          className="h-4 w-4"
          checked={includeGymWorkout}
          type="checkbox"
          onChange={(event) => setIncludeGymWorkout(event.target.checked)}
        />
        <span>Include gym or strength training</span>
      </label>

      <button
        className="w-full rounded-md bg-ink px-4 py-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLoading || targetSkills.length === 0}
      >
        {isLoading ? "Generating..." : "Generate workout"}
      </button>
    </form>
  );
}
