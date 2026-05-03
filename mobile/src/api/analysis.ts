import { apiClient } from "./client";
import axios from "axios";
import type {
  DribblingVideoAnalysisResult,
  ShootingPhotoAnalysisResult,
  ShootingVideoAnalysisResult
} from "@/types";

type UploadFile = {
  uri: string;
  name: string;
  type: string;
};

function buildFormData(file: UploadFile) {
  const formData = new FormData();
  formData.append("file", file as unknown as Blob);
  return formData;
}

export async function analyzeShootingPhoto(file: UploadFile): Promise<ShootingPhotoAnalysisResult> {
  return postAnalysisUpload<ShootingPhotoAnalysisResult>("/api/analysis/shooting-photo", buildFormData(file));
}

export async function analyzeShootingVideo(file: UploadFile): Promise<ShootingVideoAnalysisResult> {
  return postAnalysisUpload<ShootingVideoAnalysisResult>("/api/analysis/shooting-video", buildFormData(file));
}

export async function analyzeDribblingVideo(file: UploadFile): Promise<DribblingVideoAnalysisResult> {
  return postAnalysisUpload<DribblingVideoAnalysisResult>("/api/analysis/dribbling-video", buildFormData(file));
}

async function postAnalysisUpload<T>(url: string, formData: FormData): Promise<T> {
  try {
    const response = await apiClient.post<T>(url, formData, {
      headers: { "Content-Type": "multipart/form-data" }
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
