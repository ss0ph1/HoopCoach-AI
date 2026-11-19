import { useEffect, useState, type ChangeEvent } from "react";
import { analyzeShootingPhoto } from "../api/analysis.js";
import { errorMessage } from "../api/error-message.js";
import type { ShootingPhotoAnalysisResult } from "../types.js";

const card = "rounded-xl border border-white/10 bg-[#11191d] p-5 shadow-2xl";
const degrees = (value: number | null | undefined) => value == null ? "Unknown" : `${value.toFixed(1)}°`;

export default function UploadShootingPhoto({ themeMode = "night" }: { themeMode?: "night" | "day" }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<ShootingPhotoAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null); setResult(null); setError("");
  }
  async function analyze() {
    if (!file || busy) return;
    setBusy(true); setError("");
    try { setResult(await analyzeShootingPhoto(file)); }
    catch (err) { setError(errorMessage(err, "Could not analyze the photo. Please retry.")); }
    finally { setBusy(false); }
  }
  const measured = result && Object.values(result.measurements).some(value => value !== null);
  const measurements = [
    ["Shooting Elbow Angle", degrees(result?.measurements.shootingElbowAngle)],
    ["Shoulder Height Difference", result?.measurements.shoulderTilt == null ? "Unknown" : `${(result.measurements.shoulderTilt * 100).toFixed(1)}% of image height`],
    ["Projected Body Lean", degrees(result?.measurements.bodyLean)]
  ];
  return <section aria-label="Shooting form analysis">
    <h2 className={`mb-5 text-xl font-extrabold ${themeMode === "night" ? "text-white" : "text-slate-950"}`}>Shooting Form Analysis</h2>
    <div className="grid grid-cols-[0.9fr_1.1fr] gap-5 max-[980px]:grid-cols-1">
      <section className={card}>
        <div className="overflow-hidden rounded-lg border border-dashed border-white/20 bg-black/20">
          {preview ? <img src={preview} alt="Selected shooting form preview" className="max-h-[420px] min-h-[240px] w-full object-contain" /> : <div className="grid min-h-[300px] place-items-center p-6 text-center">
            <div><p className="text-5xl" aria-hidden="true">📷</p><p className="mt-4 text-lg font-extrabold text-white">Upload a shooting photo</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">Choose a clear front or side view with one player's arms, shoulders and hips visible.</p></div>
          </div>}
          <div className="p-5 text-center"><label className={`inline-flex cursor-pointer rounded-md bg-orange-600 px-4 py-3 font-extrabold text-white hover:bg-orange-500 ${busy ? "pointer-events-none opacity-50" : ""}`}>
            Choose Image<input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={busy} onChange={selectFile} />
          </label>{file && <p className="mt-3 break-words text-sm font-bold text-orange-300">{file.name}</p>}</div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-300">{error}</p>}
        <button disabled={!file || busy} onClick={() => void analyze()} className="mt-5 w-full rounded-md bg-orange-600 py-4 font-extrabold text-white disabled:opacity-50">{busy ? "Analyzing..." : "Analyze Shooting Photo"}</button>
        <p className="mt-4 text-sm leading-6 text-slate-500">A single photo provides a posture estimate, not a measurement of your shooting motion or accuracy.</p>
      </section>
      <div className="grid content-start gap-4">
        <section className={card} aria-live="polite"><h3 className="font-extrabold text-white">Overall Score</h3><div className="mt-4 flex items-center gap-5">
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-8 border-green-600 text-3xl font-extrabold text-green-400">{busy ? "..." : result?.score ?? "—"}</div>
          <div><p className="text-xl font-extrabold text-green-400">{busy ? "Analyzing" : result ? measured ? "Form snapshot" : "No clear pose" : "Ready"}</p><p className="mt-2 leading-6 text-slate-300">{busy ? "Reading the photo and estimating pose landmarks..." : result?.summary ?? "Upload a photo to see your form feedback."}</p></div>
        </div></section>
        <section className={card}><h3 className="mb-4 font-extrabold text-white">Feedback</h3><div className="grid gap-3">
          {result?.feedback.length ? result.feedback.map(item => <article key={item.category} className="rounded-lg border border-white/10 bg-white/5 p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="font-extrabold text-white">{item.category}</h4><p className="mt-1 text-sm leading-6 text-slate-300">{item.message}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${item.status === "good" ? "bg-green-500/15 text-green-300" : item.status === "needs_work" ? "bg-orange-500/15 text-orange-300" : "bg-white/10 text-slate-400"}`}>{item.status.replace(/_/g, " ")}</span></div></article>) : <p className="text-sm text-slate-400">Feedback will appear after a clear pose is detected.</p>}
        </div></section>
        <section className={card}><h3 className="mb-4 font-extrabold text-white">Measurements</h3><div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">{measurements.map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">{label}</p><p className="mt-1 text-xl font-extrabold text-white">{value}</p></div>)}</div></section>
      </div>
    </div>
  </section>;
}
