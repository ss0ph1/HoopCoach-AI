import type { DribblingVideoAnalysisResult, ShootingPhotoAnalysisResult, ShootingVideoAnalysisResult } from "../types.js";

export async function analyzeShootingPhoto(file: File): Promise<ShootingPhotoAnalysisResult> {
  const { analyzePhoto } = await import("../analysis/shooting-photo.js");
  return analyzePhoto(file);
}
export async function analyzeShootingVideo(file: File, progress?: (message: string) => void, setup?: import("../analysis/shooting-insights.js").CaptureSetup): Promise<ShootingVideoAnalysisResult> {
  const { analyzeShooting } = await import("../analysis/shooting-video.js");
  return analyzeShooting(file, progress, setup);
}
export async function analyzeDribblingVideo(file: File, progress?: (message: string) => void): Promise<DribblingVideoAnalysisResult> {
  const { analyzeDribbling } = await import("../analysis/dribbling.js");
  return analyzeDribbling(file, progress);
}
