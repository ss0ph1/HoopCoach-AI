import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { analyzeShootingPhoto } from "../api/analysis.js";
import type {
  ShootingPhotoAnalysisResult,
  ShootingPhotoFeedbackItem
} from "../types.js";

export default function UploadShootingPhoto({ themeMode = "night" }: { themeMode?: "night" | "day" }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ShootingPhotoAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const previewUrl = useMemo(
    () => (selectedFile ? URL.createObjectURL(selectedFile) : ""),
    [selectedFile]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
    setError("");
  }

  async function handleAnalyze() {
    if (!selectedFile) {
      setError("Please choose a shooting photo first.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      setResult(await analyzeShootingPhoto(selectedFile));
    } catch {
      setError("Could not analyze that image. Try a clear PNG or JPG shooting photo.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className={themeMode === "night" ? "mb-6 text-4xl font-extrabold tracking-tight text-white max-[720px]:text-3xl" : "mb-6 text-4xl font-extrabold tracking-tight text-slate-950 max-[720px]:text-3xl"}>
        Shooting Form Analysis
      </h2>

      <div className="grid grid-cols-[1.02fr_1fr] gap-8 max-[980px]:grid-cols-1">
        <div>
          <ImageAnalysisPanel
            previewUrl={previewUrl}
            result={result}
            isLoading={isLoading}
            error={error}
            onFileChange={handleFileChange}
            onAnalyze={handleAnalyze}
            hasFile={Boolean(selectedFile)}
          />
          <p className="mt-3 text-center text-sm text-slate-500">
            Note: This analysis is AI-assisted and not a substitute for professional coaching.
          </p>
        </div>

        <div className="grid gap-4">
          <ScoreCard result={result} isLoading={isLoading} />
          <FeedbackCard feedback={result?.feedback ?? []} measurements={result?.measurements ?? null} />
          <TipsCard />
        </div>
      </div>

      <KeyMeasurements result={result} />
    </section>
  );
}

function ImageAnalysisPanel({
  previewUrl,
  result,
  isLoading,
  error,
  onFileChange,
  onAnalyze,
  hasFile
}: {
  previewUrl: string;
  result: ShootingPhotoAnalysisResult | null;
  isLoading: boolean;
  error: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  hasFile: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-[0_14px_35px_rgb(23_32_42_/_0.12)] ring-1 ring-black/10">
      <div className="relative min-h-[520px] bg-[#ebe7df] max-[720px]:min-h-[420px]">
        {previewUrl ? (
          <img
            className="absolute inset-0 h-full w-full object-contain"
            src={previewUrl}
            alt="Selected shooting form preview"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              <p className="mb-3 text-xl font-extrabold text-ink">Upload a shooting photo</p>
              <p className="mx-auto max-w-sm leading-7 text-slate-600">
                Use one clear front or side view. MediaPipe works best when the full upper body is visible.
              </p>
            </div>
          </div>
        )}

        {result ? <ImageOverlays result={result} /> : null}

        <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center gap-3 rounded-lg bg-white/90 p-3 shadow-lg backdrop-blur">
          <label className="cursor-pointer rounded-md border border-[#d8dfd1] bg-white px-3 py-2 text-sm font-bold text-slate-700">
            Choose Image
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={onFileChange}
            />
          </label>
          <button
            className="rounded-md bg-court px-3 py-2 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isLoading || !hasFile}
            onClick={onAnalyze}
          >
            {isLoading ? "Analyzing..." : "Analyze"}
          </button>
          {error ? <p className="text-sm font-bold text-red-600">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

function ImageOverlays({ result }: { result: ShootingPhotoAnalysisResult }) {
  const elbowAngle = result.measurements.shootingElbowAngle;
  const shoulderTilt = result.measurements.shoulderTilt;
  const bodyLean = result.measurements.bodyLean;

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-[8%] top-[24%]">
        <MetricBadge
          label="Elbow Angle"
          value={formatMeasurement(elbowAngle, "deg")}
          status={findStatus(result.feedback, "elbow")}
          tone="green"
        />
      </div>
      <div className="absolute right-[20%] top-[38%]">
        <MetricBadge
          label="Shoulder Tilt"
          value={formatShoulderTilt(shoulderTilt)}
          status={findStatus(result.feedback, "shoulder")}
          tone={findStatus(result.feedback, "shoulder") === "needs_work" ? "gold" : "green"}
        />
      </div>
      <div className="absolute bottom-[27%] right-[30%]">
        <MetricBadge
          label="Body Lean"
          value={formatMeasurement(bodyLean, "deg")}
          status={findStatus(result.feedback, "body")}
          tone="green"
        />
      </div>
      <div className="absolute left-[30%] top-[33%] h-[2px] w-[34%] rotate-[-10deg] bg-green-500/90" />
      <div className="absolute left-[30%] top-[47%] h-[2px] w-[32%] rotate-[-14deg] bg-amber-400/90" />
      <div className="absolute bottom-[26%] left-[30%] h-[34%] border-l-2 border-dashed border-white/90" />
    </div>
  );
}

function MetricBadge({
  label,
  value,
  status,
  tone
}: {
  label: string;
  value: string;
  status: string;
  tone: "green" | "gold";
}) {
  const className =
    tone === "green"
      ? "rounded-lg border border-white/80 bg-gradient-to-br from-green-600 to-green-800 px-4 py-3 text-center text-white shadow-xl"
      : "rounded-lg border border-white/80 bg-gradient-to-br from-amber-500 to-yellow-800 px-4 py-3 text-center text-white shadow-xl";

  return (
    <div className={className}>
      <p className="text-sm font-extrabold">{label}</p>
      <p className="text-3xl font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-sm font-bold capitalize">{formatStatus(status)}</p>
    </div>
  );
}

function ScoreCard({
  result,
  isLoading
}: {
  result: ShootingPhotoAnalysisResult | null;
  isLoading: boolean;
}) {
  const score = result?.score ?? 0;
  const scoreStyle = {
    background: `conic-gradient(#16a34a ${score * 3.6}deg, #e5e7eb 0deg)`
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_14px_35px_rgb(23_32_42_/_0.08)]">
      <h3 className="mb-5 text-2xl font-extrabold text-ink">Overall Score</h3>
      <div className="flex items-center gap-8 max-[560px]:flex-col max-[560px]:items-start">
        <div className="grid h-40 w-40 shrink-0 place-items-center rounded-full p-4" style={scoreStyle}>
          <div className="grid h-full w-full place-items-center rounded-full bg-white">
            <div className="text-center">
              <p className="text-6xl font-extrabold text-green-600">{isLoading ? "..." : score}</p>
              <p className="text-xl text-slate-500">/100</p>
            </div>
          </div>
        </div>
        <div>
          <p className="mb-3 text-3xl font-extrabold text-green-600">
            {result ? scoreHeadline(score) : "Ready to analyze"}
          </p>
          <p className="max-w-sm text-lg leading-7 text-slate-700">
            {result
              ? result.summary
              : "Upload a shooting photo to get simple form feedback based on pose landmarks."}
          </p>
        </div>
      </div>
    </section>
  );
}

function FeedbackCard({
  feedback,
  measurements
}: {
  feedback: ShootingPhotoFeedbackItem[];
  measurements: ShootingPhotoAnalysisResult["measurements"] | null;
}) {
  const rows = feedback.length
    ? feedback
    : [
        {
          category: "Shooting Elbow Angle",
          status: "unknown" as const,
          message: "Upload a photo to estimate your shooting elbow angle."
        },
        {
          category: "Shoulder Alignment",
          status: "unknown" as const,
          message: "Upload a photo to check whether your shoulders look level."
        },
        {
          category: "Body Balance",
          status: "unknown" as const,
          message: "Upload a photo to estimate whether your torso is mostly vertical."
        }
      ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_35px_rgb(23_32_42_/_0.08)]">
      <h3 className="mb-4 text-2xl font-extrabold text-ink">Feedback</h3>
      <div className="grid gap-3">
        {rows.map((item) => (
          <article className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4" key={item.category}>
            <span className={statusIconClassName(item.status)}>
              {item.status === "needs_work" ? "!" : item.status === "good" ? "✓" : "?"}
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="text-lg font-extrabold text-ink">{item.category}</h4>
              <p className="text-slate-600">{item.message}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={item.status === "needs_work" ? "font-extrabold text-orange-500" : "font-extrabold text-green-600"}>
                {formatStatus(item.status)}
              </p>
              <p className="font-bold text-green-600">
                {measurementForCategory(item.category, measurements)}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TipsCard() {
  return (
    <section className="grid grid-cols-[1fr_260px] gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_35px_rgb(23_32_42_/_0.08)] max-[620px]:grid-cols-1">
      <div>
        <h3 className="mb-4 text-xl font-extrabold text-ink">Tips to Improve</h3>
        <ul className="list-disc space-y-2 pl-5 leading-6 text-slate-700">
          <li>Try to keep your shooting shoulder level.</li>
          <li>Engage your core and avoid leaning forward.</li>
          <li>Hold your follow-through for a smooth release.</li>
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-center">
        <div className="grid place-items-center">
          <div className="mb-2 h-20 w-10 rounded-full bg-green-300/70" />
          <p className="text-3xl font-extrabold text-green-600">✓</p>
          <p className="text-sm font-bold text-green-700">Good</p>
        </div>
        <div className="grid place-items-center">
          <div className="mb-2 h-20 w-10 rounded-full bg-red-300/70" />
          <p className="text-3xl font-extrabold text-red-500">×</p>
          <p className="text-sm font-bold text-red-600">Needs Work</p>
        </div>
      </div>
    </section>
  );
}

function KeyMeasurements({ result }: { result: ShootingPhotoAnalysisResult | null }) {
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_35px_rgb(23_32_42_/_0.08)]">
      <h3 className="mb-5 text-xl font-extrabold text-ink">Key Measurements</h3>
      <div className="grid grid-cols-3 divide-x divide-slate-200 max-[720px]:grid-cols-1 max-[720px]:divide-x-0 max-[720px]:divide-y">
        <Measurement
          icon="∠"
          label="Shooting Elbow Angle"
          value={formatMeasurement(result?.measurements.shootingElbowAngle ?? null, "deg")}
        />
        <Measurement
          icon="⟳"
          label="Shoulder Tilt"
          value={formatShoulderTilt(result?.measurements.shoulderTilt ?? null)}
        />
        <Measurement
          icon="⌁"
          label="Body Lean"
          value={formatMeasurement(result?.measurements.bodyLean ?? null, "deg")}
        />
      </div>
    </section>
  );
}

function Measurement({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-5 px-8 py-2 first:pl-0 max-[720px]:px-0 max-[720px]:py-4">
      <span className="text-5xl text-slate-500">{icon}</span>
      <div>
        <p className="text-lg text-slate-700">{label}</p>
        <p className="text-2xl font-extrabold text-ink">{value}</p>
      </div>
    </div>
  );
}

function formatMeasurement(value: number | null, unit: string) {
  if (value === null) {
    return "--";
  }

  return `${Math.round(value)}°${unit === "deg" ? "" : ` ${unit}`}`;
}

function formatShoulderTilt(value: number | null) {
  if (value === null) {
    return "--";
  }

  return `${Math.round(value * 100)}°`;
}

function measurementForCategory(
  category: string,
  measurements: ShootingPhotoAnalysisResult["measurements"] | null
) {
  const normalizedCategory = category.toLowerCase();

  if (!measurements) {
    return "--";
  }

  if (normalizedCategory.includes("elbow")) {
    return formatMeasurement(measurements.shootingElbowAngle, "deg");
  }

  if (normalizedCategory.includes("shoulder")) {
    return formatShoulderTilt(measurements.shoulderTilt);
  }

  if (normalizedCategory.includes("body")) {
    return formatMeasurement(measurements.bodyLean, "deg");
  }

  return "--";
}

function scoreHeadline(score: number) {
  if (score >= 80) {
    return "Good Form!";
  }

  if (score >= 50) {
    return "Solid Start";
  }

  return "Needs Work";
}

function findStatus(feedback: ShootingPhotoFeedbackItem[], keyword: string) {
  return feedback.find((item) => item.category.toLowerCase().includes(keyword))?.status ?? "unknown";
}

function formatStatus(status: string) {
  return status.replace("_", " ");
}

function statusIconClassName(status: string) {
  if (status === "good") {
    return "grid h-12 w-12 shrink-0 place-items-center rounded-full bg-green-600 text-3xl font-bold text-white";
  }

  if (status === "needs_work") {
    return "grid h-12 w-12 shrink-0 place-items-center rounded-full bg-orange-400 text-3xl font-bold text-white";
  }

  return "grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-400 text-2xl font-bold text-white";
}
