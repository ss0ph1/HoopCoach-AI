import { ChangeEvent, useState } from "react";
import { analyzeDribblingVideo, analyzeShootingVideo } from "../api/analysis.js";
import UploadShootingPhoto from "./UploadShootingPhoto.js";
import type {
  AnalysisFeedbackItem,
  DribblingVideoAnalysisResult,
  ShootingVideoAnalysisResult,
  VideoAnalysisResult
} from "../types.js";

type AnalysisTab = "photo" | "shooting" | "dribbling";
type AnalysisVideoRecord = {
  id: string;
  fileName: string;
  analysisType: "shooting" | "dribbling";
  score: number;
  uploadedAt: string;
};

export default function FormAnalysis({
  themeMode = "night",
  onVideoAnalyzed
}: {
  themeMode?: "night" | "day";
  onVideoAnalyzed?: (record: AnalysisVideoRecord) => void;
}) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>("photo");

  return (
    <section>
      <div className="mb-6">
        <p className="text-sm font-bold uppercase text-orange-400">Form Analysis</p>
        <h1 className={themeMode === "night" ? "mt-1 text-3xl font-extrabold text-white" : "mt-1 text-3xl font-extrabold text-slate-950"}>
          Basketball Video Analysis
        </h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          Upload a short single-player training video. HoopCoach uses OpenCV and MediaPipe Pose for simple, explainable movement feedback.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <TabButton active={activeTab === "photo"} onClick={() => setActiveTab("photo")}>
          Photo Analysis
        </TabButton>
        <TabButton active={activeTab === "shooting"} onClick={() => setActiveTab("shooting")}>
          Shooting Video
        </TabButton>
        <TabButton active={activeTab === "dribbling"} onClick={() => setActiveTab("dribbling")}>
          Dribbling Video
        </TabButton>
      </div>

      {activeTab === "photo" ? <UploadShootingPhoto themeMode={themeMode} /> : null}
      {activeTab === "shooting" ? <VideoAnalysisPanel analysisType="shooting" onVideoAnalyzed={onVideoAnalyzed} /> : null}
      {activeTab === "dribbling" ? <VideoAnalysisPanel analysisType="dribbling" onVideoAnalyzed={onVideoAnalyzed} /> : null}
    </section>
  );
}

function TabButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "rounded-md bg-orange-600 px-4 py-2 font-bold text-white" : "rounded-md border border-white/10 bg-white/5 px-4 py-2 font-bold text-slate-300"}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function VideoAnalysisPanel({
  analysisType,
  onVideoAnalyzed
}: {
  analysisType: "shooting" | "dribbling";
  onVideoAnalyzed?: (record: AnalysisVideoRecord) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setResult(null);
    setError("");
  }

  async function handleAnalyze() {
    if (!selectedFile) {
      setError("Please choose a short training video first.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const analysisResult = analysisType === "shooting"
        ? await analyzeShootingVideo(selectedFile)
        : await analyzeDribblingVideo(selectedFile);
      setResult(analysisResult);
      onVideoAnalyzed?.({
        id: `${Date.now()}-${selectedFile.name}`,
        fileName: selectedFile.name,
        analysisType,
        score: analysisResult.score,
        uploadedAt: new Date().toISOString()
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not analyze that video.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-[0.9fr_1.1fr] gap-5 max-[980px]:grid-cols-1">
      <section className="rounded-xl border border-white/10 bg-[#11191d] p-5 shadow-2xl">
        <div className="grid min-h-[300px] place-items-center rounded-lg border border-dashed border-white/20 bg-black/20 p-6 text-center">
          <div>
            <p className="text-5xl">🎥</p>
            <p className="mt-4 text-lg font-extrabold text-white">
              {analysisType === "shooting" ? "Upload a shooting video" : "Upload a dribbling video"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
              Use a clear front or side view. Keep it under 10 seconds with one player visible.
            </p>
            <label className="mt-5 inline-flex cursor-pointer rounded-md bg-orange-600 px-4 py-3 font-extrabold text-white hover:bg-orange-500">
              Choose Video
              <input className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" onChange={handleFileChange} />
            </label>
            {selectedFile ? <p className="mt-3 text-sm font-bold text-orange-300">{selectedFile.name}</p> : null}
          </div>
        </div>

        {error ? <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-300">{error}</p> : null}

        <button
          className="mt-5 w-full rounded-md bg-orange-600 py-4 font-extrabold text-white disabled:opacity-60"
          type="button"
          disabled={isLoading || !selectedFile}
          onClick={handleAnalyze}
        >
          {isLoading ? "Analyzing..." : `Analyze ${analysisType === "shooting" ? "Shooting" : "Dribbling"} Video`}
        </button>

        <p className="mt-4 text-sm leading-6 text-slate-500">
          This is a beginner-friendly estimate using pose landmarks, not professional biomechanics analysis.
        </p>
      </section>

      <section className="grid gap-4">
        <ScoreSummary result={result} isLoading={isLoading} />
        <CloudStorageCard result={result} />
        <FeedbackList feedback={result?.feedback ?? []} />
        <MeasurementsCard result={result} />
      </section>
    </div>
  );
}

function ScoreSummary({
  result,
  isLoading
}: {
  result: VideoAnalysisResult | null;
  isLoading: boolean;
}) {
  return (
    <article className="rounded-xl border border-white/10 bg-[#11191d] p-5 shadow-2xl">
      <p className="font-extrabold text-white">Overall Score</p>
      <div className="mt-4 flex items-center gap-5">
        <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-8 border-green-600 text-3xl font-extrabold text-green-400">
          {isLoading ? "..." : result?.score ?? 0}
        </div>
        <div>
          <p className="text-xl font-extrabold text-green-400">
            {result ? titleCase(result.analysisType) : "Ready"}
          </p>
          <p className="mt-2 leading-6 text-slate-300">
            {isLoading ? "Reading video frames and estimating pose landmarks..." : result?.summary ?? "Upload a short video to get simple coaching feedback."}
          </p>
        </div>
      </div>
    </article>
  );
}

function CloudStorageCard({ result }: { result: VideoAnalysisResult | null }) {
  return (
    <article className="rounded-xl border border-white/10 bg-[#11191d] p-5 shadow-2xl">
      <p className="font-extrabold text-white">Cloud Storage</p>
      {result?.s3Url ? (
        <div className="mt-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <p className="font-bold text-green-300">Video stored securely in AWS S3.</p>
          <p className="mt-2 break-all text-xs text-slate-400">Dev URL: {result.s3Url}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-400">After analysis, HoopCoach stores the original video in S3 and saves the result in PostgreSQL.</p>
      )}
    </article>
  );
}

function FeedbackList({ feedback }: { feedback: AnalysisFeedbackItem[] }) {
  return (
    <article className="rounded-xl border border-white/10 bg-[#11191d] p-5 shadow-2xl">
      <p className="mb-4 font-extrabold text-white">Feedback</p>
      <div className="grid gap-3">
        {feedback.length ? feedback.map((item) => (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4" key={item.category}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-extrabold text-white">{item.category}</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">{item.message}</p>
              </div>
              <span className={badgeClass(item.status)}>{formatStatus(item.status)}</span>
            </div>
          </div>
        )) : (
          <p className="text-sm text-slate-400">Feedback will appear after analysis.</p>
        )}
      </div>
    </article>
  );
}

function MeasurementsCard({ result }: { result: VideoAnalysisResult | null }) {
  const rows = result ? getMeasurementRows(result) : [];

  return (
    <article className="rounded-xl border border-white/10 bg-[#11191d] p-5 shadow-2xl">
      <p className="mb-4 font-extrabold text-white">Measurements</p>
      <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
        {rows.length ? rows.map((row) => (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4" key={row.label}>
            <p className="text-sm text-slate-400">{row.label}</p>
            <p className="mt-1 break-words text-xl font-extrabold text-white">{row.value}</p>
          </div>
        )) : (
          <p className="text-sm text-slate-400">No measurements yet.</p>
        )}
      </div>
    </article>
  );
}

function getMeasurementRows(result: VideoAnalysisResult) {
  if (result.analysisType === "shooting") {
    const measurements = result.measurements as ShootingVideoAnalysisResult["measurements"];
    return [
      { label: "Average Elbow Angle", value: formatNumber(measurements.averageElbowAngle, "deg") },
      { label: "Release Elbow Angle", value: formatNumber(measurements.releaseElbowAngle, "deg") },
      { label: "Shoulder Tilt", value: formatNumber(measurements.shoulderTilt, "") },
      { label: "Body Lean", value: formatNumber(measurements.bodyLean, "deg") },
      { label: "Knee Bend", value: formatNumber(measurements.kneeBend, "deg") },
      { label: "Follow-Through Held", value: measurements.followThroughHeld === null ? "Unknown" : measurements.followThroughHeld ? "Yes" : "No" }
    ];
  }

  const measurements = result.measurements as DribblingVideoAnalysisResult["measurements"];
  return [
    { label: "Average Knee Bend", value: formatNumber(measurements.averageKneeBend, "deg") },
    { label: "Average Body Lean", value: formatNumber(measurements.averageBodyLean, "deg") },
    { label: "Head Down", value: formatNumber(measurements.headDownPercentage, "%") },
    { label: "Stance Stability", value: formatNumber(measurements.stanceStability, "") },
    { label: "Estimated Ball Height", value: titleCase(measurements.estimatedBallHeight ?? "unknown") }
  ];
}

function badgeClass(status: AnalysisFeedbackItem["status"]) {
  if (status === "good") {
    return "shrink-0 rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold text-green-300";
  }
  if (status === "needs_work") {
    return "shrink-0 rounded-full bg-orange-500/15 px-3 py-1 text-xs font-bold text-orange-300";
  }
  return "shrink-0 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-bold text-slate-300";
}

function formatStatus(status: string) {
  return status.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatNumber(value: number | null, suffix: string) {
  if (value === null) {
    return "Unknown";
  }
  return `${value}${suffix}`;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
