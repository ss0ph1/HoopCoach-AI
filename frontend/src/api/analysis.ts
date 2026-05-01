import { apiClient } from "./client.js";
import type {
  DribblingVideoAnalysisResult,
  ShootingPhotoAnalysisResult,
  ShootingVideoAnalysisResult
} from "../types.js";

export async function analyzeShootingPhoto(file: File): Promise<ShootingPhotoAnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<ShootingPhotoAnalysisResult>(
    "/api/analysis/shooting-photo",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    }
  );

  return response.data;
}

export async function analyzeShootingVideo(file: File): Promise<ShootingVideoAnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<ShootingVideoAnalysisResult>(
    "/api/analysis/shooting-video",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    }
  );

  return response.data;
}

export async function analyzeDribblingVideo(file: File): Promise<DribblingVideoAnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<DribblingVideoAnalysisResult>(
    "/api/analysis/dribbling-video",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    }
  );

  return response.data;
}
