import { useEffect, useMemo, useState } from "react";
import { deleteWorkout, getWorkout, listWorkouts, generateWorkout, renameWorkout, submitWorkoutFeedback } from "../api/workouts.js";
import FormAnalysis from "./FormAnalysis.js";
import type {
  GeneratedWorkout,
  SavedWorkoutDetail,
  SavedWorkoutListItem,
  SkillLevel,
  TargetSkill,
  DifficultyFeedback,
  WorkoutFeedback,
  WorkoutRequestInput
} from "../types.js";

type ActiveView = "dashboard" | "generate" | "workouts" | "session" | "analysis" | "progress" | "history" | "profile";
type ThemeMode = "night" | "day";
type HistoryTab = "all" | "workouts" | "analyses" | "feedback";
type WorkoutDetailTab = "overview" | "drills" | "feedback";
type AnalysisVideoRecord = {
  id: string;
  fileName: string;
  analysisType: "shooting" | "dribbling";
  score: number;
  uploadedAt: string;
};

const targetSkills: TargetSkill[] = [
  "shooting",
  "ball handling",
  "finishing",
  "defense",
  "conditioning",
  "footwork"
];

const equipmentOptions = ["basketball", "hoop", "cones", "resistance bands", "dumbbells", "none"];

export default function WorkoutGeneratorPage() {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [themeMode, setThemeMode] = useState<ThemeMode>("night");
  const [history, setHistory] = useState<SavedWorkoutListItem[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<SavedWorkoutDetail | null>(null);
  const [detailBackView, setDetailBackView] = useState<ActiveView>("dashboard");
  const [activeSessionWorkout, setActiveSessionWorkout] = useState<SavedWorkoutDetail | null>(null);
  const [activeTutorialDrill, setActiveTutorialDrill] = useState<TutorialDrill | null>(null);
  const [generatedWorkout, setGeneratedWorkout] = useState<GeneratedWorkout | null>(null);
  const [generatedWorkoutId, setGeneratedWorkoutId] = useState<string | null>(null);
  const [analysisVideos, setAnalysisVideos] = useState<AnalysisVideoRecord[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  async function refreshHistory() {
    try {
      setHistory(await listWorkouts());
    } catch {
      setError("Could not load workout history.");
    }
  }

  async function openWorkout(workoutId: string, backView: ActiveView = "dashboard") {
    try {
      const workout = await getWorkout(workoutId);
      setSelectedWorkout(workout);
      setDetailBackView(backView);
      setActiveView("workouts");
    } catch {
      setError("Could not load that workout.");
    }
  }

  async function handleGenerateWorkout(request: WorkoutRequestInput) {
    setIsGenerating(true);
    setError("");

    try {
      const result = await generateWorkout(request);
      const workoutId = result.workoutId ?? "unsaved-workout";
      setGeneratedWorkout(result.workout);
      setGeneratedWorkoutId(workoutId);
      setSelectedWorkout({
        id: workoutId,
        workout: result.workout,
        createdAt: new Date().toISOString(),
        feedback: null
      });
      setDetailBackView("generate");
      await refreshHistory();
      setActiveView("workouts");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not generate workout.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleFeedbackSaved(feedback: WorkoutFeedback, adjustedWorkout: GeneratedWorkout) {
    setGeneratedWorkout((current) => current && generatedWorkoutId === feedback.workoutId ? adjustedWorkout : current);
    setSelectedWorkout((current) => current ? { ...current, workout: adjustedWorkout, feedback } : current);
    setActiveSessionWorkout((current) => current && current.id === feedback.workoutId ? { ...current, workout: adjustedWorkout, feedback } : current);
    setHistory((current) =>
      current.map((item) => item.id === feedback.workoutId ? {
        ...item,
        title: adjustedWorkout.title,
        totalDurationMinutes: adjustedWorkout.totalDurationMinutes,
        focusAreas: adjustedWorkout.focusAreas,
        feedback
      } : item)
    );
  }

  function startWorkoutSession(workout: SavedWorkoutDetail) {
    setActiveSessionWorkout(workout);
    setActiveView("session");
  }

  function handleAnalysisVideoSaved(record: AnalysisVideoRecord) {
    setAnalysisVideos((current) => {
      const nextRecords = [record, ...current].slice(0, 30);
      localStorage.setItem("hoopcoach-analysis-videos", JSON.stringify(nextRecords));
      return nextRecords;
    });
  }

  async function handleRenameWorkout(workoutId: string, title: string) {
    const renamedWorkout = await renameWorkout(workoutId, title);
    setSelectedWorkout(renamedWorkout);
    setActiveSessionWorkout((current) => current && current.id === workoutId ? renamedWorkout : current);

    if (generatedWorkoutId === workoutId) {
      setGeneratedWorkout(renamedWorkout.workout);
    }

    setHistory((current) =>
      current.map((item) => item.id === workoutId ? {
        ...item,
        title: renamedWorkout.workout.title,
        totalDurationMinutes: renamedWorkout.workout.totalDurationMinutes,
        focusAreas: renamedWorkout.workout.focusAreas,
        feedback: renamedWorkout.feedback
      } : item)
    );
  }

  async function handleDeleteWorkout(workoutId: string) {
    await deleteWorkout(workoutId);
    setHistory((current) => current.filter((item) => item.id !== workoutId));
    setSelectedWorkout((current) => current?.id === workoutId ? null : current);
    setActiveSessionWorkout((current) => current?.id === workoutId ? null : current);

    if (generatedWorkoutId === workoutId) {
      setGeneratedWorkout(null);
      setGeneratedWorkoutId(null);
    }

    setActiveView(detailBackView === "workouts" ? "history" : detailBackView);
  }

  useEffect(() => {
    void refreshHistory();
    setAnalysisVideos(loadAnalysisVideoRecords());
  }, []);

  const recentWorkout = selectedWorkout ?? (generatedWorkout && generatedWorkoutId
    ? {
        id: generatedWorkoutId,
        workout: generatedWorkout,
        createdAt: new Date().toISOString(),
        feedback: null
      }
    : null);

  return (
    <div className={themeMode === "night" ? "min-h-screen bg-[#070b0d] text-white" : "min-h-screen bg-[#eef2f5] text-[#111827]"}>
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <Sidebar activeView={activeView} themeMode={themeMode} onChange={setActiveView} />
        <main className="min-w-0 flex-1 pb-24 md:pb-6">
          <TopBar themeMode={themeMode} onToggleTheme={() => setThemeMode((current) => current === "night" ? "day" : "night")} />
          <div className="p-4 md:p-6">
            {activeView === "dashboard" ? (
              <Dashboard history={history} onOpenWorkout={openWorkout} onNavigate={setActiveView} />
            ) : null}
            {activeView === "generate" ? (
              <GenerateWorkoutScreen
                isGenerating={isGenerating}
                error={error}
                onGenerate={handleGenerateWorkout}
              />
            ) : null}
            {activeView === "workouts" ? (
              <WorkoutDetailScreen
                workout={recentWorkout}
                onBack={() => setActiveView(detailBackView)}
                onStartWorkout={startWorkoutSession}
                onFeedbackSaved={handleFeedbackSaved}
                onOpenTutorial={setActiveTutorialDrill}
                onRenameWorkout={handleRenameWorkout}
                onDeleteWorkout={handleDeleteWorkout}
              />
            ) : null}
            {activeView === "session" ? (
              <WorkoutSessionScreen
                workout={activeSessionWorkout}
                onExit={() => setActiveView("workouts")}
                onOpenTutorial={setActiveTutorialDrill}
              />
            ) : null}
            {activeView === "analysis" ? <FormAnalysis themeMode={themeMode} onVideoAnalyzed={handleAnalysisVideoSaved} /> : null}
            {activeView === "progress" ? <ProgressScreen history={history} analysisVideos={analysisVideos} /> : null}
            {activeView === "history" ? (
              <HistoryScreen
                history={history}
                analysisVideos={analysisVideos}
                onOpenWorkout={(workoutId) => openWorkout(workoutId, "history")}
              />
            ) : null}
            {activeView === "profile" ? <ProfileScreen history={history} /> : null}
          </div>
        </main>
      </div>
      <BottomNav activeView={activeView} themeMode={themeMode} onChange={setActiveView} />
      {activeTutorialDrill ? (
        <TutorialModal drill={activeTutorialDrill} onClose={() => setActiveTutorialDrill(null)} />
      ) : null}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-orange-600 text-lg">🏀</span>
      <span className="font-extrabold">HoopCoach AI</span>
    </div>
  );
}

function TopBar({
  themeMode,
  onToggleTheme
}: {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
}) {
  return (
    <header className={themeMode === "night" ? "sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-[#0a1013]/90 px-4 backdrop-blur md:px-6" : "sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6"}>
      <button className={themeMode === "night" ? "text-xl text-slate-300" : "text-xl text-slate-700"} type="button">☰</button>
      <div className="flex items-center gap-3">
        <button
          className={themeMode === "night" ? "rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-200" : "rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"}
          type="button"
          onClick={onToggleTheme}
        >
          {themeMode === "night" ? "☀ Day" : "☾ Night"}
        </button>
        <button className={themeMode === "night" ? "text-xl text-slate-300" : "text-xl text-slate-700"} type="button">♧</button>
      </div>
    </header>
  );
}

function Sidebar({
  activeView,
  themeMode,
  onChange
}: {
  activeView: ActiveView;
  themeMode: ThemeMode;
  onChange: (view: ActiveView) => void;
}) {
  return (
    <aside className={themeMode === "night" ? "hidden w-56 shrink-0 border-r border-white/10 bg-[#0b1114] p-4 md:block" : "hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 md:block"}>
      <Brand />
      <nav className="mt-10 grid gap-2">
        {navItems.map((item) => (
          <button
            className={navItemClass(activeView === item.view, themeMode)}
            key={item.view}
            type="button"
            onClick={() => onChange(item.view)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-24 rounded-lg border border-orange-500/40 bg-orange-500/10 p-3">
        <p className="font-bold text-orange-300">Premium</p>
        <p className="mt-2 text-xs leading-5 text-slate-300">Unlock advanced insights and personalized coaching.</p>
        <button className="mt-3 w-full rounded-md bg-orange-600 py-2 text-sm font-extrabold" type="button">
          Go Premium
        </button>
      </div>
    </aside>
  );
}

function BottomNav({
  activeView,
  themeMode,
  onChange
}: {
  activeView: ActiveView;
  themeMode: ThemeMode;
  onChange: (view: ActiveView) => void;
}) {
  return (
    <nav className={themeMode === "night" ? "fixed bottom-0 left-0 right-0 z-30 grid grid-cols-6 border-t border-white/10 bg-[#0b1114]/95 px-2 py-2 backdrop-blur md:hidden" : "fixed bottom-0 left-0 right-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur md:hidden"}>
      {navItems.slice(0, 6).map((item) => (
        <button
          className={activeView === item.view ? "text-orange-500" : themeMode === "night" ? "text-slate-300" : "text-slate-600"}
          key={item.view}
          type="button"
          onClick={() => onChange(item.view)}
        >
          <span className="block text-lg">{item.icon}</span>
          <span className="text-[10px]">{item.short}</span>
        </button>
      ))}
    </nav>
  );
}

function Dashboard({
  history,
  onOpenWorkout,
  onNavigate
}: {
  history: SavedWorkoutListItem[];
  onOpenWorkout: (id: string) => void;
  onNavigate: (view: ActiveView) => void;
}) {
  const recent = history[0];
  const avgScore = useMemo(() => {
    const feedbackCount = history.filter((item) => item.feedback).length;
    return feedbackCount ? 78 : 72;
  }, [history]);

  return (
    <section>
      <h1 className="mb-2 text-3xl font-extrabold">Welcome back, Alex! 👋</h1>
      <p className="mb-6 text-slate-400">Ready to get better today?</p>

      <DarkCard title="This Week Overview">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard value={String(Math.max(history.length, 4))} label="Workouts" />
          <StatCard value={String(history.reduce((sum, item) => sum + item.totalDurationMinutes, 0) || 210)} label="Minutes" />
          <StatCard value={`${avgScore}%`} label="Avg. Score" />
          <StatCard value="🔥" label="Day Streak" />
        </div>
      </DarkCard>

      <DarkCard title="Recent Workout" className="mt-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-extrabold">{recent?.title ?? "Full Court Skills & Conditioning"}</p>
            <p className="mt-1 text-sm text-slate-400">{recent ? formatDate(recent.createdAt) : "May 16, 2025"} · {recent?.totalDurationMinutes ?? 45} min</p>
            <button
              className="mt-4 rounded-md bg-orange-600 px-4 py-2 text-sm font-extrabold"
              type="button"
              onClick={() => (recent ? onOpenWorkout(recent.id) : onNavigate("generate"))}
            >
              View Workout
            </button>
          </div>
          <ScorePill score={85} />
        </div>
      </DarkCard>

      <DarkCard title="Quick Actions" className="mt-5">
        <div className="grid grid-cols-3 gap-3 max-[640px]:grid-cols-1">
          <ActionButton icon="🎯" title="Generate Workout" text="Create a custom plan" onClick={() => onNavigate("generate")} />
          <ActionButton icon="🏀" title="Form Analysis" text="Analyze your form" onClick={() => onNavigate("analysis")} />
          <ActionButton icon="📈" title="View Progress" text="Track your growth" onClick={() => onNavigate("progress")} />
        </div>
      </DarkCard>
    </section>
  );
}

function GenerateWorkoutScreen({
  isGenerating,
  error,
  onGenerate
}: {
  isGenerating: boolean;
  error: string;
  onGenerate: (request: WorkoutRequestInput) => void;
}) {
  const [availableTimeMinutes, setAvailableTimeMinutes] = useState(60);
  const [selectedSkills, setSelectedSkills] = useState<TargetSkill[]>(["shooting", "ball handling"]);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("intermediate");
  const [equipment, setEquipment] = useState(["basketball", "hoop"]);
  const [includeGymWorkout, setIncludeGymWorkout] = useState(true);

  function toggleSkill(skill: TargetSkill) {
    setSelectedSkills((current) =>
      current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill].slice(0, 3)
    );
  }

  function toggleEquipment(item: string) {
    setEquipment((current) =>
      current.includes(item) ? current.filter((value) => value !== item) : [...current, item]
    );
  }

  return (
    <section>
      <h1 className="text-3xl font-extrabold">Generate Workout</h1>
      <p className="mt-2 text-slate-400">Get a personalized workout plan in seconds.</p>

      <form
        className="mt-6 rounded-xl border border-white/10 bg-[#11191d] p-5 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          onGenerate({
            availableTimeMinutes,
            targetSkills: selectedSkills,
            skillLevel,
            equipment,
            includeGymWorkout
          });
        }}
      >
        <DarkField label="Available Time">
          <select className={darkInputClass} value={availableTimeMinutes} onChange={(event) => setAvailableTimeMinutes(Number(event.target.value))}>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
          </select>
        </DarkField>

        <DarkField label="Focus Skills (Select up to 3)">
          <div className="flex flex-wrap gap-2">
            {targetSkills.map((skill) => (
              <Chip key={skill} selected={selectedSkills.includes(skill)} onClick={() => toggleSkill(skill)}>
                {titleCase(skill)}
              </Chip>
            ))}
          </div>
        </DarkField>

        <DarkField label="Skill Level">
          <select className={darkInputClass} value={skillLevel} onChange={(event) => setSkillLevel(event.target.value as SkillLevel)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </DarkField>

        <DarkField label="Equipment Available">
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map((item) => (
              <Chip key={item} selected={equipment.includes(item)} onClick={() => toggleEquipment(item)}>
                {titleCase(item)}
              </Chip>
            ))}
          </div>
        </DarkField>

        <label className="mt-5 flex items-center justify-between text-slate-200">
          <span>Include Gym Workout</span>
          <input className="h-5 w-5 accent-orange-600" type="checkbox" checked={includeGymWorkout} onChange={(event) => setIncludeGymWorkout(event.target.checked)} />
        </label>

        {error ? <p className="mt-4 text-sm font-bold text-red-400">{error}</p> : null}
        <button className="mt-8 w-full rounded-md bg-orange-600 py-4 font-extrabold hover:bg-orange-500 disabled:opacity-60" disabled={isGenerating || selectedSkills.length === 0}>
          {isGenerating ? "Generating..." : "Generate My Workout 🏀"}
        </button>
      </form>
    </section>
  );
}

function WorkoutDetailScreen({
  workout,
  onBack,
  onStartWorkout,
  onFeedbackSaved,
  onOpenTutorial,
  onRenameWorkout,
  onDeleteWorkout
}: {
  workout: SavedWorkoutDetail | null;
  onBack: () => void;
  onStartWorkout: (workout: SavedWorkoutDetail) => void;
  onFeedbackSaved: (feedback: WorkoutFeedback, adjustedWorkout: GeneratedWorkout) => void;
  onOpenTutorial: (drill: TutorialDrill) => void;
  onRenameWorkout: (workoutId: string, title: string) => Promise<void>;
  onDeleteWorkout: (workoutId: string) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<WorkoutDetailTab>("overview");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(workout?.workout.title ?? "");
  const [actionMessage, setActionMessage] = useState("");
  const [isManagingWorkout, setIsManagingWorkout] = useState(false);

  useEffect(() => {
    setDraftTitle(workout?.workout.title ?? "");
    setIsEditingTitle(false);
    setActionMessage("");
  }, [workout?.id, workout?.workout.title]);

  if (!workout) {
    return (
      <EmptyState
        title="No workout selected"
        text="Generate a workout or choose one from history."
      />
    );
  }

  const sections = [
    ["Warm Up", workout.workout.sections.warmup, "🧘"],
    ["Skills Work", workout.workout.sections.basketballDrills, "🎯"],
    ["Conditioning", workout.workout.sections.conditioning, "🏃"],
    ["Gym (Optional)", workout.workout.sections.gymWorkout, "🏋️"],
    ["Cool Down", workout.workout.sections.cooldown, "🧊"]
  ] as const;
  const workoutId = workout.id;

  async function handleSaveTitle() {
    const trimmedTitle = draftTitle.trim();

    if (!trimmedTitle) {
      setActionMessage("Workout title cannot be empty.");
      return;
    }

    setIsManagingWorkout(true);
    setActionMessage("");

    try {
      await onRenameWorkout(workoutId, trimmedTitle);
      setIsEditingTitle(false);
      setActionMessage("Workout renamed.");
    } catch {
      setActionMessage("Could not rename workout.");
    } finally {
      setIsManagingWorkout(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this saved workout? This cannot be undone.")) {
      return;
    }

    setIsManagingWorkout(true);
    setActionMessage("");

    try {
      await onDeleteWorkout(workoutId);
    } catch {
      setActionMessage("Could not delete workout.");
      setIsManagingWorkout(false);
    }
  }

  return (
    <section>
      <button className="mb-4 text-sm font-bold text-slate-300" type="button" onClick={onBack}>← Back</button>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xl font-extrabold text-white outline-none"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
              />
              <button className="rounded-md bg-orange-600 px-4 py-2 font-bold disabled:opacity-60" type="button" disabled={isManagingWorkout} onClick={handleSaveTitle}>
                Save
              </button>
              <button className="rounded-md border border-white/10 bg-white/5 px-4 py-2 font-bold text-slate-300" type="button" disabled={isManagingWorkout} onClick={() => setIsEditingTitle(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <h1
              className="cursor-text break-words text-3xl font-extrabold"
              title="Double-click to rename"
              onDoubleClick={() => setIsEditingTitle(true)}
            >
              {workout.workout.title}
            </h1>
          )}
          <p className="mt-2 text-slate-400">{formatDate(workout.createdAt)} · {workout.workout.totalDurationMinutes} min · {workout.workout.focusAreas.join(", ")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-200 hover:border-orange-500/50" type="button" onClick={() => setIsEditingTitle(true)}>
              Rename
            </button>
            <button className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300 hover:border-red-400" type="button" disabled={isManagingWorkout} onClick={handleDelete}>
              Delete
            </button>
          </div>
          {actionMessage ? <p className="mt-2 text-sm font-bold text-slate-300">{actionMessage}</p> : null}
        </div>
        <ScorePill score={85} />
      </div>
      <div className="mb-5 flex gap-8 border-b border-white/10 text-sm font-bold">
        {workoutDetailTabs.map((tab) => (
          <button
            className={activeTab === tab.value ? "border-b-2 border-orange-600 pb-3 text-orange-500" : "pb-3 text-slate-300"}
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? <WorkoutOverviewTab workout={workout} sections={sections} onOpenTutorial={onOpenTutorial} /> : null}
      {activeTab === "drills" ? <WorkoutDrillsTab sections={sections} onOpenTutorial={onOpenTutorial} /> : null}
      {activeTab === "feedback" ? <WorkoutFeedbackTab workout={workout} onFeedbackSaved={onFeedbackSaved} /> : null}

      <button className="mt-5 w-full rounded-md bg-orange-600 py-4 font-extrabold" type="button" onClick={() => onStartWorkout(workout)}>
        Start Workout ▶
      </button>
    </section>
  );
}

function WorkoutOverviewTab({
  workout,
  sections,
  onOpenTutorial
}: {
  workout: SavedWorkoutDetail;
  sections: readonly (readonly [string, GeneratedWorkout["sections"]["warmup"], string])[];
  onOpenTutorial: (drill: TutorialDrill) => void;
}) {
  return (
    <div className="grid gap-3">
      <DarkCard>
        <div className="grid grid-cols-3 gap-3 max-[700px]:grid-cols-1">
          <StatCard value={`${workout.workout.totalDurationMinutes}`} label="Minutes" />
          <StatCard value={String(workout.workout.focusAreas.length)} label="Focus Areas" />
          <StatCard value={String(sections.reduce((sum, [, drills]) => sum + drills.length, 0))} label="Drills" />
        </div>
      </DarkCard>
      {sections.map(([label, drills, icon]) =>
        drills.length ? (
          <DarkWorkoutSection key={label} label={label} icon={icon} drills={drills} onOpenTutorial={onOpenTutorial} />
        ) : null
      )}
    </div>
  );
}

function WorkoutDrillsTab({
  sections,
  onOpenTutorial
}: {
  sections: readonly (readonly [string, GeneratedWorkout["sections"]["warmup"], string])[];
  onOpenTutorial: (drill: TutorialDrill) => void;
}) {
  return (
    <div className="grid gap-4">
      {sections.map(([label, drills]) =>
        drills.length ? (
          <DarkCard title={label} key={label}>
            <div className="grid gap-3">
              {drills.map((drill) => (
                <article className="rounded-lg border border-white/10 bg-white/5 p-4" key={drill.name}>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h3 className="font-extrabold">{drill.name}</h3>
                    <span className="shrink-0 text-sm text-slate-300">{drill.durationMinutes} min</span>
                  </div>
                  <p className="text-sm leading-6 text-slate-300">{drill.instructions}</p>
                  <p className="mt-2 text-sm text-slate-400">{drill.purpose}</p>
                  <button
                    className="mt-3 inline-flex rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-bold text-orange-300 hover:border-orange-400"
                    type="button"
                    onClick={() => onOpenTutorial(drill)}
                  >
                    Watch Tutorial
                  </button>
                </article>
              ))}
            </div>
          </DarkCard>
        ) : null
      )}
    </div>
  );
}

function WorkoutFeedbackTab({
  workout,
  onFeedbackSaved
}: {
  workout: SavedWorkoutDetail;
  onFeedbackSaved: (feedback: WorkoutFeedback, adjustedWorkout: GeneratedWorkout) => void;
}) {
  const [difficultyFeedback, setDifficultyFeedback] = useState<DifficultyFeedback>(
    workout.feedback?.difficultyFeedback ?? "just_right"
  );
  const [notes, setNotes] = useState(workout.feedback?.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [drillChanges, setDrillChanges] = useState<DrillChange[]>([]);

  useEffect(() => {
    setDifficultyFeedback(workout.feedback?.difficultyFeedback ?? "just_right");
    setNotes(workout.feedback?.notes ?? "");
    setMessage("");
    setDrillChanges([]);
  }, [workout.id]);

  async function handleSubmitFeedback() {
    setIsSaving(true);
    setMessage("");

    try {
      const previousWorkout = workout.workout;
      const result = await submitWorkoutFeedback(workout.id, {
        difficultyFeedback,
        notes
      });
      setDrillChanges(buildDrillChanges(previousWorkout, result.workout));
      onFeedbackSaved(result.feedback, result.workout);
      setMessage("Feedback saved. This workout was updated, and future AI workouts will adapt too.");
    } catch {
      setMessage("Could not save feedback.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DarkCard title="Feedback">
      <div className="grid gap-4">
        <div>
          <p className="mb-3 text-sm text-slate-400">How did this workout feel?</p>
          <div className="flex flex-wrap gap-2">
            {feedbackChoices.map((choice) => (
              <button
                className={difficultyFeedback === choice.value ? "rounded-md bg-orange-600 px-4 py-2 text-sm font-bold text-white" : "rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300"}
                key={choice.value}
                type="button"
                onClick={() => setDifficultyFeedback(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-300">What should the AI change in this workout?</span>
          <textarea
            className="min-h-28 rounded-lg border border-white/10 bg-white/5 p-3 text-white outline-none placeholder:text-slate-500"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Example: make ball handling harder, reduce conditioning, add more shooting off the dribble..."
          />
        </label>

        {workout.feedback ? (
          <div className="rounded-lg bg-white/5 p-4">
            <p className="text-sm text-slate-400">Current saved feedback</p>
            <p className="mt-1 font-extrabold text-orange-400">{titleCase(workout.feedback.difficultyFeedback.replace("_", " "))}</p>
            <p className="mt-2 text-slate-300">{workout.feedback.notes || "No notes added."}</p>
          </div>
        ) : null}

        {drillChanges.length ? (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
            <p className="font-extrabold text-green-300">Workout Updated</p>
            <p className="mt-1 text-sm text-slate-300">These drill changes were applied to this saved workout.</p>
            <div className="mt-4 grid gap-3">
              {drillChanges.map((change) => (
                <article className="rounded-lg bg-black/20 p-3" key={`${change.section}-${change.beforeName}-${change.afterName}`}>
                  <p className="text-xs font-bold uppercase text-green-300">{change.section}</p>
                  <p className="mt-1 text-sm text-slate-400 line-through">{change.beforeName}</p>
                  <p className="mt-1 font-extrabold text-white">{change.afterName}</p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">
                    {change.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <button
          className="rounded-md bg-orange-600 px-4 py-3 font-extrabold disabled:opacity-60"
          type="button"
          disabled={isSaving}
          onClick={handleSubmitFeedback}
        >
          {isSaving ? "Saving..." : workout.feedback ? "Update Feedback" : "Submit Feedback"}
        </button>
        {message ? <p className="text-sm font-bold text-slate-300">{message}</p> : null}
      </div>
    </DarkCard>
  );
}

type WorkoutStep = {
  section: string;
  drill: GeneratedWorkout["sections"]["warmup"][number];
};

type TutorialDrill = GeneratedWorkout["sections"]["warmup"][number];

type DrillChange = {
  section: string;
  beforeName: string;
  afterName: string;
  details: string[];
};

function WorkoutSessionScreen({
  workout,
  onExit,
  onOpenTutorial
}: {
  workout: SavedWorkoutDetail | null;
  onExit: () => void;
  onOpenTutorial: (drill: TutorialDrill) => void;
}) {
  const steps = useMemo(() => workout ? getWorkoutSteps(workout) : [], [workout]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [skippedSteps, setSkippedSteps] = useState<WorkoutStep[]>([]);

  const currentStep = steps[currentIndex] ?? null;
  const isComplete = steps.length > 0 && currentIndex >= steps.length;
  const progressPercent = steps.length ? Math.min(100, Math.round((currentIndex / steps.length) * 100)) : 0;

  useEffect(() => {
    setCurrentIndex(0);
    setSkippedSteps([]);
    setIsRunning(Boolean(workout));
  }, [workout?.id]);

  useEffect(() => {
    if (!currentStep) {
      setRemainingSeconds(0);
      return;
    }

    setRemainingSeconds(Math.max(currentStep.drill.durationMinutes * 60, 30));
  }, [currentIndex, currentStep]);

  useEffect(() => {
    if (!isRunning || !currentStep) {
      return;
    }

    const timerId = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isRunning, currentStep]);

  useEffect(() => {
    if (isRunning && currentStep && remainingSeconds === 0) {
      setCurrentIndex((current) => Math.min(current + 1, steps.length));
    }
  }, [currentStep, isRunning, remainingSeconds, steps.length]);

  function advanceStep(shouldSkip: boolean) {
    if (!currentStep) {
      return;
    }

    if (shouldSkip) {
      setSkippedSteps((current) => [...current, currentStep]);
    }

    setCurrentIndex((current) => Math.min(current + 1, steps.length));
    setIsRunning(true);
  }

  if (!workout) {
    return (
      <EmptyState
        title="No workout running"
        text="Open a workout and press Start Workout."
      />
    );
  }

  if (isComplete) {
    return (
      <section>
        <button className="mb-4 text-sm font-bold text-slate-300" type="button" onClick={onExit}>← Back to workout</button>
        <DarkCard>
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-orange-400">Workout Complete</p>
            <h1 className="mt-2 text-3xl font-extrabold">{workout.workout.title}</h1>
            <p className="mt-3 text-slate-300">Nice work. You completed {steps.length - skippedSteps.length} of {steps.length} steps.</p>
          </div>
        </DarkCard>
        <SkippedStepsList skippedSteps={skippedSteps} />
      </section>
    );
  }

  return (
    <section>
      <button className="mb-4 text-sm font-bold text-slate-300" type="button" onClick={onExit}>← Back to workout</button>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-orange-400">Step {currentIndex + 1} of {steps.length}</p>
          <h1 className="mt-1 text-3xl font-extrabold">{workout.workout.title}</h1>
          <p className="mt-2 text-slate-400">{progressPercent}% complete</p>
        </div>
        <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 text-center">
          <p className="text-xs font-bold uppercase text-orange-300">Timer</p>
          <p className="mt-1 text-3xl font-extrabold">{formatTimer(remainingSeconds)}</p>
        </div>
      </div>

      <div className="mb-5 h-3 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-orange-600" style={{ width: `${progressPercent}%` }} />
      </div>

      {currentStep ? (
        <div className="grid grid-cols-[1.4fr_0.8fr] gap-5 max-[900px]:grid-cols-1">
          <DarkCard>
            <p className="text-sm font-bold text-orange-400">{currentStep.section}</p>
            <h2 className="mt-2 text-3xl font-extrabold">{currentStep.drill.name}</h2>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="rounded-md bg-white/5 px-3 py-2">{currentStep.drill.durationMinutes} min</span>
              <span className="rounded-md bg-white/5 px-3 py-2">{titleCase(currentStep.drill.difficulty)}</span>
              <span className="rounded-md bg-white/5 px-3 py-2">{currentStep.drill.equipment.join(", ") || "No equipment"}</span>
            </div>
            <div className="mt-5 grid gap-4 text-slate-300">
              <div>
                <p className="font-extrabold text-white">Instructions</p>
                <p className="mt-2 leading-7">{currentStep.drill.instructions}</p>
              </div>
              <div>
                <p className="font-extrabold text-white">Purpose</p>
                <p className="mt-2 leading-7">{currentStep.drill.purpose}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="rounded-md bg-orange-600 px-5 py-3 font-extrabold" type="button" onClick={() => advanceStep(false)}>
                Complete Step
              </button>
              <button className="rounded-md border border-white/15 bg-white/5 px-5 py-3 font-bold text-slate-200" type="button" onClick={() => setIsRunning((current) => !current)}>
                {isRunning ? "Pause" : "Resume"}
              </button>
              <button className="rounded-md border border-white/15 bg-white/5 px-5 py-3 font-bold text-slate-200" type="button" onClick={() => advanceStep(true)}>
                Skip Step
              </button>
            </div>
          </DarkCard>

          <div className="grid gap-5">
            <DarkCard title="Tutorial">
              <button
                className="block w-full rounded-lg border border-white/10 bg-white/5 p-4 text-left font-bold text-orange-300 hover:border-orange-500/50"
                type="button"
                onClick={() => onOpenTutorial(currentStep.drill)}
              >
                Watch tutorial in HoopCoach →
              </button>
              <p className="mt-3 text-sm text-slate-400">Open the in-site tutorial player when you need a quick visual demo for this drill.</p>
            </DarkCard>
            <DarkCard title="Upcoming">
              <div className="grid gap-2">
                {steps.slice(currentIndex + 1, currentIndex + 5).map((step, index) => (
                  <div className="rounded-lg bg-white/5 p-3" key={`${step.section}-${step.drill.name}-${index}`}>
                    <p className="font-bold">{step.drill.name}</p>
                    <p className="text-sm text-slate-400">{step.section} · {step.drill.durationMinutes} min</p>
                  </div>
                ))}
                {currentIndex + 1 >= steps.length ? <p className="text-sm text-slate-400">Last step.</p> : null}
              </div>
            </DarkCard>
            <SkippedStepsList skippedSteps={skippedSteps} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SkippedStepsList({ skippedSteps }: { skippedSteps: WorkoutStep[] }) {
  return (
    <DarkCard title="Skipped" className="mt-5">
      {skippedSteps.length ? (
        <div className="grid gap-2">
          {skippedSteps.map((step, index) => (
            <div className="rounded-lg bg-white/5 p-3" key={`${step.section}-${step.drill.name}-${index}`}>
              <p className="font-bold">{step.drill.name}</p>
              <p className="text-sm text-slate-400">{step.section}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No skipped steps yet.</p>
      )}
    </DarkCard>
  );
}

function TutorialModal({
  drill,
  onClose
}: {
  drill: TutorialDrill;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur">
      <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-white/10 bg-[#0b1114] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
          <div>
            <p className="text-sm font-bold uppercase text-orange-400">HoopCoach Tutorial</p>
            <h2 className="mt-1 text-2xl font-extrabold text-white">{drill.name}</h2>
          </div>
          <button
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-bold text-slate-200 hover:border-orange-500/50"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-[1.5fr_0.9fr] gap-4 p-4 max-[900px]:grid-cols-1">
          <div>
            <GeneratedInstructionVideo drill={drill} />
            <a
              className="mt-3 inline-flex rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-bold text-orange-300 hover:border-orange-400"
              href={drill.youtubeSearchUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open more videos
            </a>
          </div>

          <div className="grid content-start gap-4">
            <div className="rounded-lg bg-white/5 p-4">
              <p className="font-extrabold text-white">What to focus on</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{drill.purpose}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-4">
              <p className="font-extrabold text-white">How to do it</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{drill.instructions}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TutorialMetricCard value={`${drill.durationMinutes}`} label="Minutes" />
              <TutorialMetricCard value={titleCase(drill.difficulty)} label="Difficulty" />
            </div>
            <div className="rounded-lg bg-white/5 p-4">
              <p className="font-extrabold text-white">Equipment</p>
              <p className="mt-2 text-sm text-slate-300">{drill.equipment.join(", ") || "No equipment"}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TutorialMetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-4 text-center">
      <p className="break-words text-xl font-extrabold leading-tight text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{label}</p>
    </div>
  );
}

function GeneratedInstructionVideo({ drill }: { drill: TutorialDrill }) {
  const cues = buildInstructionCues(drill);
  const [activeCue, setActiveCue] = useState(0);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setActiveCue((current) => (current + 1) % cues.length);
    }, 2400);

    return () => window.clearInterval(timerId);
  }, [cues.length]);

  const drillType = getDrillType(drill);

  return (
    <div className="aspect-video overflow-hidden rounded-lg border border-white/10 bg-[#101719] p-4">
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-orange-400">Generated Drill Demo</p>
            <p className="mt-1 text-lg font-extrabold text-white">{drillType.title}</p>
          </div>
          <span className="rounded-full bg-orange-500/15 px-3 py-1 text-xs font-bold text-orange-300">
            Step {activeCue + 1}/{cues.length}
          </span>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-[radial-gradient(circle_at_center,#253037_0,#12191d_65%)]">
          <div className="absolute inset-x-8 top-8 h-px bg-white/15" />
          <div className="absolute inset-x-8 bottom-8 h-px bg-white/15" />
          <div className="absolute left-1/2 top-0 h-full w-px bg-white/10" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
          <div className="absolute right-10 top-1/2 h-24 w-16 -translate-y-1/2 rounded-l-full border-2 border-orange-400/70" />
          <div className="absolute right-5 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border-4 border-orange-500" />

          <div className={`absolute h-12 w-12 rounded-full bg-orange-500 shadow-[0_0_32px_rgba(249,115,22,0.55)] ${drillType.ballClass}`} />
          <div className={`absolute grid h-16 w-16 place-items-center rounded-full border-2 border-green-400 bg-green-500/25 text-2xl ${drillType.playerClass}`}>
            ⛹
          </div>
          <div className={`absolute rounded-full border-2 border-dashed border-green-300/70 ${drillType.pathClass}`} />
        </div>

        <div className="mt-3 rounded-lg bg-black/30 p-3">
          <p className="text-sm font-bold text-orange-300">{cues[activeCue]}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {cues.map((cue, index) => (
              <div className={index === activeCue ? "h-1 rounded-full bg-orange-500" : "h-1 rounded-full bg-white/15"} key={cue} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryScreen({
  history,
  analysisVideos,
  onOpenWorkout
}: {
  history: SavedWorkoutListItem[];
  analysisVideos: AnalysisVideoRecord[];
  onOpenWorkout: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("all");
  const filteredHistory = filterHistory(history, activeTab);
  const filteredVideos = filterAnalysisVideos(analysisVideos, activeTab);
  const hasHistoryItems = filteredHistory.length > 0 || filteredVideos.length > 0;

  return (
    <section>
      <h1 className="text-3xl font-extrabold">History</h1>
      <div className="mt-5 flex flex-wrap gap-3">
        {historyTabs.map((tab) => (
          <button
            className={activeTab === tab.value ? "rounded-md bg-orange-600 px-4 py-2 font-bold" : "rounded-md border border-white/10 bg-white/5 px-4 py-2 text-slate-300"}
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-3">
        {filteredVideos.map((video) => (
          <article className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#11191d] p-4" key={video.id}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-orange-500/15 text-xl">▶</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">{video.fileName}</p>
              <p className="text-sm text-slate-400">{titleCase(video.analysisType)} analysis · {formatDate(video.uploadedAt)}</p>
            </div>
            <ScorePill score={video.score} compact />
          </article>
        ))}
        {filteredHistory.map((item) => (
          <button className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#11191d] p-4 text-left hover:border-orange-500/50" key={item.id} type="button" onClick={() => onOpenWorkout(item.id)}>
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-white/5">🗓️</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">{item.title}</p>
              <p className="text-sm text-slate-400">{formatDate(item.createdAt)} · {item.totalDurationMinutes} min</p>
            </div>
            <ScorePill score={item.feedback?.difficultyFeedback === "too_easy" ? 68 : 85} compact />
            <span className="text-slate-400">›</span>
          </button>
        ))}
        {!hasHistoryItems ? (
          <div className="rounded-xl border border-white/10 bg-[#11191d] p-6 text-center">
            <p className="font-extrabold">{emptyHistoryTitle(activeTab)}</p>
            <p className="mt-2 text-sm text-slate-400">{emptyHistoryText(activeTab)}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProgressScreen({
  history,
  analysisVideos
}: {
  history: SavedWorkoutListItem[];
  analysisVideos: AnalysisVideoRecord[];
}) {
  const performanceData = buildPerformanceData(history);
  const weeklyMinutes = buildWeeklyWorkoutMinutes(history);
  const totalMinutes = history.reduce((sum, item) => sum + item.totalDurationMinutes, 0);

  return (
    <section>
      <h1 className="text-3xl font-extrabold">Progress</h1>
      <DarkCard title="Performance Over Time" className="mt-5">
        <PerformanceLineChart data={performanceData} />
      </DarkCard>
      <DarkCard title="Workout Time by Week" className="mt-5">
        <div className="mb-4 grid grid-cols-3 gap-3 max-[720px]:grid-cols-1">
          <StatCard value={`${totalMinutes}`} label="Total Minutes" />
          <StatCard value={`${history.length}`} label="Saved Workouts" />
          <StatCard value={`${weeklyMinutes.at(-1)?.minutes ?? 0}`} label="This Week" />
        </div>
        <WeeklyMinutesChart data={weeklyMinutes} />
      </DarkCard>
      <DarkCard title="Skill Breakdown" className="mt-5">
        <div className="grid grid-cols-[180px_1fr] items-center gap-6 max-[640px]:grid-cols-1">
          <div className="h-40 w-40 rounded-full" style={{ background: "conic-gradient(#f97316 0 28%, #3b82f6 28% 54%, #a855f7 54% 76%, #22c55e 76% 100%)" }} />
          <div className="grid gap-3">
            {["Shooting 78%", "Ball Handling 72%", "Finishing 65%", "Defense 60%", "Conditioning 70%"].map((item) => (
              <p className="text-slate-300" key={item}>{item}</p>
            ))}
          </div>
        </div>
      </DarkCard>
      <UploadedVideosSection videos={analysisVideos} />
      <p className="mt-4 text-sm text-slate-500">Based on {history.length} saved workouts.</p>
    </section>
  );
}

function WeeklyMinutesChart({ data }: { data: Array<{ label: string; minutes: number }> }) {
  const maxMinutes = Math.max(...data.map((item) => item.minutes), 60);

  return (
    <div className="grid gap-3">
      {data.map((item) => (
        <div className="grid grid-cols-[80px_1fr_70px] items-center gap-3" key={item.label}>
          <p className="text-sm font-bold text-slate-400">{item.label}</p>
          <div className="h-8 overflow-hidden rounded-md bg-white/10">
            <div
              className="h-full rounded-md bg-orange-600"
              style={{ width: `${Math.max((item.minutes / maxMinutes) * 100, item.minutes ? 8 : 0)}%` }}
            />
          </div>
          <p className="text-right text-sm font-extrabold text-white">{item.minutes} min</p>
        </div>
      ))}
    </div>
  );
}

function UploadedVideosSection({ videos }: { videos: AnalysisVideoRecord[] }) {
  return (
    <DarkCard title="Uploaded Analysis Videos" className="mt-5">
      {videos.length ? (
        <div className="grid gap-3">
          {videos.map((video) => (
            <article className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/5 p-4" key={video.id}>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-orange-500/15 text-xl">▶</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold text-white">{video.fileName}</p>
                <p className="text-sm text-slate-400">{titleCase(video.analysisType)} analysis · {formatDate(video.uploadedAt)}</p>
              </div>
              <ScorePill score={video.score} compact />
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Analyze a shooting or dribbling video and it will show up here.</p>
      )}
    </DarkCard>
  );
}

function PerformanceLineChart({ data }: { data: Array<{ label: string; score: number }> }) {
  const width = 760;
  const height = 260;
  const padding = 42;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const points = data.map((item, index) => {
    const x = padding + (index / Math.max(data.length - 1, 1)) * innerWidth;
    const y = padding + (1 - item.score / 100) * innerHeight;
    return { ...item, x, y };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <div className="overflow-x-auto">
      <svg className="min-w-[640px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Performance over time line chart">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padding + (1 - tick / 100) * innerHeight;
          return (
            <g key={tick}>
              <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="currentColor" className="text-white/10" />
              <text x={12} y={y + 4} className="fill-slate-400 text-[12px]">{tick}</text>
            </g>
          );
        })}
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} stroke="currentColor" className="text-white/20" />
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="currentColor" className="text-white/20" />
        <path d={path} fill="none" stroke="#f97316" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <g key={`${point.label}-${point.score}`}>
            <circle cx={point.x} cy={point.y} r="6" fill="#f97316" stroke="#11191d" strokeWidth="3" />
            <text x={point.x} y={height - 12} textAnchor="middle" className="fill-slate-400 text-[12px]">{point.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ProfileScreen({ history }: { history: SavedWorkoutListItem[] }) {
  return (
    <section>
      <h1 className="text-3xl font-extrabold">Profile</h1>
      <DarkCard className="mt-5">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-slate-700 text-4xl">👤</div>
          <div className="flex-1">
            <p className="text-xl font-extrabold">Alex Johnson</p>
            <p className="text-slate-400">alex@hoopcoach.ai</p>
          </div>
          <button className="rounded-md border border-white/20 px-4 py-2 font-bold" type="button">Edit Profile</button>
        </div>
      </DarkCard>
      <div className="mt-5 grid grid-cols-4 gap-3 max-[720px]:grid-cols-2">
        <StatCard value={String(history.length || 24)} label="Workouts" />
        <StatCard value="18.6" label="Hours" />
        <StatCard value="72%" label="Avg. Score" />
        <StatCard value="🔥" label="Day Streak" />
      </div>
      <DarkCard className="mt-5">
        {["Goals", "Preferences", "Account", "Subscription"].map((item) => (
          <div className="flex items-center justify-between border-b border-white/10 py-4 last:border-0" key={item}>
            <div>
              <p className="font-extrabold">{item}</p>
              <p className="text-sm text-slate-400">Manage your {item.toLowerCase()}</p>
            </div>
            <span>›</span>
          </div>
        ))}
      </DarkCard>
    </section>
  );
}

function DarkWorkoutSection({
  label,
  icon,
  drills,
  onOpenTutorial
}: {
  label: string;
  icon: string;
  drills: GeneratedWorkout["sections"]["warmup"];
  onOpenTutorial: (drill: TutorialDrill) => void;
}) {
  const duration = drills.reduce((sum, drill) => sum + drill.durationMinutes, 0);
  return (
    <article className="flex gap-4 rounded-xl border border-white/10 bg-[#11191d] p-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex justify-between gap-3">
          <h3 className="font-extrabold">{label}</h3>
          <span className="text-sm text-slate-300">{duration} min</span>
        </div>
        <ul className="list-disc pl-5 text-sm text-slate-300">
          {drills.map((drill) => (
            <li key={drill.name}>
              <span>{drill.name}</span>
              <button
                className="ml-2 font-bold text-orange-300 hover:text-orange-200"
                type="button"
                onClick={() => onOpenTutorial(drill)}
              >
                video
              </button>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function DarkCard({
  title,
  className = "",
  children
}: {
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-white/10 bg-[#11191d] p-4 shadow-2xl ${className}`}>
      {title ? <h2 className="mb-4 font-extrabold">{title}</h2> : null}
      {children}
    </section>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-4 text-center">
      <p className="break-words text-[clamp(1.25rem,3vw,2rem)] font-extrabold leading-tight">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{label}</p>
    </div>
  );
}

function ActionButton({
  icon,
  title,
  text,
  onClick
}: {
  icon: string;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button className="rounded-lg border border-white/10 bg-white/5 p-4 text-left hover:border-orange-500/50" type="button" onClick={onClick}>
      <span className="text-2xl">{icon}</span>
      <p className="mt-2 font-extrabold">{title}</p>
      <p className="text-xs text-slate-400">{text}</p>
    </button>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-xl border border-white/10 bg-[#11191d] p-6 text-center">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="mt-2 text-slate-400">{text}</p>
      </div>
    </section>
  );
}

function DarkField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-5 block">
      <span className="mb-2 block text-sm font-bold text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function Chip({
  selected,
  onClick,
  children
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={selected ? "rounded-md bg-orange-600 px-4 py-2 text-sm font-bold" : "rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300"}
      type="button"
      onClick={onClick}
    >
      {children} {selected ? "×" : ""}
    </button>
  );
}

function ScorePill({ score, compact = false }: { score: number; compact?: boolean }) {
  return (
    <div className={`grid place-items-center rounded-full border-4 border-green-600 text-green-400 ${compact ? "h-14 w-14 text-sm" : "h-20 w-20 text-xl"} font-extrabold`}>
      {score}%
    </div>
  );
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildInstructionCues(drill: TutorialDrill) {
  const rawCues = drill.instructions
    .split(".")
    .map((cue) => cue.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (rawCues.length >= 3) {
    return rawCues;
  }

  return [
    "Start in an athletic stance with your eyes up.",
    "Move through the drill at game speed while staying balanced.",
    "Reset with clean form before each new rep."
  ];
}

function getDrillType(drill: TutorialDrill) {
  const text = `${drill.name} ${drill.purpose} ${drill.instructions}`.toLowerCase();

  if (text.includes("shoot")) {
    return {
      title: "Shooting Form Demo",
      playerClass: "right-[32%] top-[44%] animate-pulse",
      ballClass: "right-[18%] top-[25%] animate-bounce",
      pathClass: "right-[17%] top-[20%] h-40 w-40"
    };
  }

  if (text.includes("sprint") || text.includes("conditioning")) {
    return {
      title: "Conditioning Route Demo",
      playerClass: "left-[18%] top-[45%] animate-pulse",
      ballClass: "left-[30%] top-[48%]",
      pathClass: "left-[18%] top-[35%] h-20 w-[58%]"
    };
  }

  if (text.includes("strength") || text.includes("squat") || text.includes("lunge")) {
    return {
      title: "Strength Movement Demo",
      playerClass: "left-[45%] top-[42%] animate-bounce",
      ballClass: "left-[60%] top-[46%]",
      pathClass: "left-[39%] top-[34%] h-28 w-32"
    };
  }

  return {
    title: "Ball Handling Demo",
    playerClass: "left-[42%] top-[43%] animate-pulse",
    ballClass: "left-[52%] top-[54%] animate-bounce",
    pathClass: "left-[28%] top-[35%] h-28 w-[42%]"
  };
}

function getWorkoutSteps(workout: SavedWorkoutDetail): WorkoutStep[] {
  const sections = [
    ["Warm Up", workout.workout.sections.warmup],
    ["Skills Work", workout.workout.sections.basketballDrills],
    ["Conditioning", workout.workout.sections.conditioning],
    ["Gym", workout.workout.sections.gymWorkout],
    ["Cool Down", workout.workout.sections.cooldown]
  ] as const;

  return sections.flatMap(([section, drills]) =>
    drills.map((drill) => ({
      section,
      drill
    }))
  );
}

function buildDrillChanges(beforeWorkout: GeneratedWorkout, afterWorkout: GeneratedWorkout): DrillChange[] {
  const beforeDrills = flattenWorkoutDrills(beforeWorkout);
  const afterDrills = flattenWorkoutDrills(afterWorkout);

  return afterDrills.flatMap((afterDrill, index) => {
    const beforeDrill = beforeDrills[index];

    if (!beforeDrill) {
      return [];
    }

    const details: string[] = [];

    if (beforeDrill.drill.name !== afterDrill.drill.name) {
      details.push(`Changed drill to ${afterDrill.drill.name}.`);
    }

    if (beforeDrill.drill.difficulty !== afterDrill.drill.difficulty) {
      details.push(`Difficulty changed from ${titleCase(beforeDrill.drill.difficulty)} to ${titleCase(afterDrill.drill.difficulty)}.`);
    }

    const beforeEquipment = beforeDrill.drill.equipment.join(", ") || "none";
    const afterEquipment = afterDrill.drill.equipment.join(", ") || "none";

    if (beforeEquipment !== afterEquipment) {
      details.push(`Equipment changed from ${beforeEquipment} to ${afterEquipment}.`);
    }

    if (beforeDrill.drill.instructions !== afterDrill.drill.instructions) {
      details.push("Instructions updated based on your feedback.");
    }

    if (!details.length) {
      return [];
    }

    return [{
      section: afterDrill.section,
      beforeName: beforeDrill.drill.name,
      afterName: afterDrill.drill.name,
      details
    }];
  });
}

function flattenWorkoutDrills(workout: GeneratedWorkout): WorkoutStep[] {
  const sections = [
    ["Warm Up", workout.sections.warmup],
    ["Skills Work", workout.sections.basketballDrills],
    ["Conditioning", workout.sections.conditioning],
    ["Gym", workout.sections.gymWorkout],
    ["Cool Down", workout.sections.cooldown]
  ] as const;

  return sections.flatMap(([section, drills]) =>
    drills.map((drill) => ({
      section,
      drill
    }))
  );
}

function buildPerformanceData(history: SavedWorkoutListItem[]) {
  const fallback = [34, 48, 41, 62, 57, 74, 63, 82, 76, 91, 86];
  const source = history.length
    ? history.slice(0, 11).reverse().map((item, index) => ({
        label: `W${index + 1}`,
        score: item.feedback?.difficultyFeedback === "too_hard"
          ? 58
          : item.feedback?.difficultyFeedback === "too_easy"
            ? 68
            : 82
      }))
    : fallback.map((score, index) => ({ label: `W${index + 1}`, score }));

  return source.length >= 2 ? source : fallback.map((score, index) => ({ label: `W${index + 1}`, score }));
}

function buildWeeklyWorkoutMinutes(history: SavedWorkoutListItem[]) {
  const today = new Date();
  const weekStarts = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (5 - index) * 7);
    return getWeekStart(date);
  });

  return weekStarts.map((weekStart) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const minutes = history.reduce((sum, item) => {
      const createdAt = new Date(item.createdAt);
      return createdAt >= weekStart && createdAt < weekEnd
        ? sum + item.totalDurationMinutes
        : sum;
    }, 0);

    return {
      label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
      minutes
    };
  });
}

function getWeekStart(value: Date) {
  const date = new Date(value);
  const day = date.getDay();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

function loadAnalysisVideoRecords(): AnalysisVideoRecord[] {
  try {
    const stored = localStorage.getItem("hoopcoach-analysis-videos");
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function filterHistory(history: SavedWorkoutListItem[], activeTab: HistoryTab) {
  if (activeTab === "analyses") {
    return [];
  }

  if (activeTab === "all") {
    return history;
  }

  if (activeTab === "workouts") {
    return history;
  }

  if (activeTab === "feedback") {
    return history.filter((item) => item.feedback);
  }

  return [];
}

function filterAnalysisVideos(videos: AnalysisVideoRecord[], activeTab: HistoryTab) {
  if (activeTab === "all" || activeTab === "analyses") {
    return videos;
  }

  return [];
}

function emptyHistoryTitle(activeTab: HistoryTab) {
  if (activeTab === "analyses") {
    return "No form analyses saved yet";
  }

  if (activeTab === "feedback") {
    return "No feedback submitted yet";
  }

  return "No workouts yet";
}

function emptyHistoryText(activeTab: HistoryTab) {
  if (activeTab === "analyses") {
    return "Photo analysis works now, but saved analysis history has not been added yet.";
  }

  if (activeTab === "feedback") {
    return "Submit feedback after a workout and it will show up here.";
  }

  return "Generate your first workout to start building history.";
}

function navItemClass(isActive: boolean, themeMode: ThemeMode) {
  if (isActive) {
    return "flex items-center gap-3 rounded-lg bg-orange-600 px-3 py-3 text-left text-sm font-bold text-white";
  }

  return themeMode === "night"
    ? "flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-300 hover:bg-white/5"
    : "flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-100";
}

const darkInputClass = "w-full rounded-md border border-white/10 bg-white/5 px-4 py-3 text-white outline-none";

const historyTabs: Array<{ value: HistoryTab; label: string }> = [
  { value: "all", label: "All" },
  { value: "workouts", label: "Workouts" },
  { value: "analyses", label: "Analyses" },
  { value: "feedback", label: "Feedback" }
];

const workoutDetailTabs: Array<{ value: WorkoutDetailTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "drills", label: "Drills" },
  { value: "feedback", label: "Feedback" }
];

const feedbackChoices: Array<{ value: DifficultyFeedback; label: string }> = [
  { value: "too_easy", label: "Too Easy" },
  { value: "just_right", label: "Just Right" },
  { value: "too_hard", label: "Too Hard" }
];

const navItems: Array<{ view: ActiveView; label: string; short: string; icon: string }> = [
  { view: "dashboard", label: "Dashboard", short: "Home", icon: "⌂" },
  { view: "generate", label: "Generate Workout", short: "Create", icon: "⚙" },
  { view: "workouts", label: "Workouts", short: "Plans", icon: "☑" },
  { view: "analysis", label: "Analysis", short: "Form", icon: "♙" },
  { view: "progress", label: "Progress", short: "Stats", icon: "▥" },
  { view: "history", label: "History", short: "Log", icon: "◴" },
  { view: "profile", label: "Profile", short: "Me", icon: "♙" }
];
