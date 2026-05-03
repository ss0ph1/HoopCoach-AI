import { apiClient } from "./client.js";
import axios from "axios";
import type {
  DribblingVideoAnalysisResult,
  ShootingPhotoAnalysisResult,
  ShootingVideoAnalysisResult
} from "../types.js";

export async function analyzeShootingPhoto(file: File): Promise<ShootingPhotoAnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);

  return postAnalysisUpload<ShootingPhotoAnalysisResult>("/api/analysis/shooting-photo", formData);
}

export async function analyzeShootingVideo(file: File): Promise<ShootingVideoAnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);

  return postAnalysisUpload<ShootingVideoAnalysisResult>("/api/analysis/shooting-video", formData);
}

export async function analyzeDribblingVideo(file: File): Promise<DribblingVideoAnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);

  return postAnalysisUpload<DribblingVideoAnalysisResult>("/api/analysis/dribbling-video", formData);
}

async function postAnalysisUpload<T>(url: string, formData: FormData): Promise<T> {
  try {
    const response = await apiClient.post<T>(url, formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data as { detail?: string; error?: string } | undefined;
      throw new Error(responseData?.detail ?? responseData?.error ?? "Could not analyze that upload.");
    }
    throw error;
  }
}
