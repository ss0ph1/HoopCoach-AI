import { ResizeMode, Video } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { analyzeDribblingVideo, analyzeShootingPhoto, analyzeShootingVideo } from "@/api/analysis";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { useHoopCoach } from "@/context/HoopCoachContext";
import type { AnalysisFeedbackItem, VideoAnalysisResult, ShootingPhotoAnalysisResult } from "@/types";
import { formatStatus, makeUploadFile, titleCase } from "@/utils/format";

type AnalysisMode = "photo" | "shooting" | "dribbling";
type AnalysisResult = VideoAnalysisResult | ShootingPhotoAnalysisResult;

export default function AnalysisScreen() {
  const { saveAnalysisRecord } = useHoopCoach();
  const [mode, setMode] = useState<AnalysisMode>("photo");
  const [selectedAsset, setSelectedAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function chooseMedia() {
    setResult(null);
    setError("");

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Media permission is required to upload training photos or videos.");
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mode === "photo" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
      videoMaxDuration: 10
    });

    if (!pickerResult.canceled) {
      setSelectedAsset(pickerResult.assets[0]);
    }
  }

  async function handleAnalyze() {
    if (!selectedAsset) {
      setError("Choose a file first.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const info = await FileSystem.getInfoAsync(selectedAsset.uri);
      if (!info.exists) {
        throw new Error("Could not read the selected file.");
      }

      const name = selectedAsset.fileName ?? selectedAsset.uri.split("/").pop() ?? "training-upload";
      const mimeType = mode === "photo" ? "image/jpeg" : "video/mp4";
      const uploadFile = makeUploadFile(selectedAsset.uri, name, mimeType);
      const analysisResult = mode === "photo"
        ? await analyzeShootingPhoto(uploadFile)
        : mode === "shooting"
          ? await analyzeShootingVideo(uploadFile)
          : await analyzeDribblingVideo(uploadFile);

      setResult(analysisResult);
      await saveAnalysisRecord({
        id: `${Date.now()}-${name}`,
        fileName: name,
        analysisType: mode,
        score: analysisResult.score,
        uploadedAt: new Date().toISOString()
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not analyze that file.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Screen>
      <Text className="text-3xl font-extrabold text-white">Form Analysis</Text>
      <Text className="mt-2 text-slate-400">Upload a photo or short single-player training video.</Text>

      <View className="my-5 flex-row flex-wrap gap-2">
        <ModeChip selected={mode === "photo"} label="Photo" onPress={() => { setMode("photo"); setSelectedAsset(null); setResult(null); }} />
        <ModeChip selected={mode === "shooting"} label="Shooting Video" onPress={() => { setMode("shooting"); setSelectedAsset(null); setResult(null); }} />
        <ModeChip selected={mode === "dribbling"} label="Dribbling Video" onPress={() => { setMode("dribbling"); setSelectedAsset(null); setResult(null); }} />
      </View>

      <Card title={mode === "photo" ? "Shooting Photo Analysis" : `${titleCase(mode)} Video Analysis`}>
        <View className="min-h-64 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/20 p-4">
          {selectedAsset ? (
            mode === "photo" ? (
              <Image source={{ uri: selectedAsset.uri }} className="h-64 w-full rounded-xl" resizeMode="contain" />
            ) : (
              <Video source={{ uri: selectedAsset.uri }} className="h-64 w-full rounded-xl" resizeMode={ResizeMode.CONTAIN} useNativeControls />
            )
          ) : (
            <Text className="text-center text-slate-400">Choose a clear side or front view. Videos should be under 10 seconds.</Text>
          )}
        </View>
        {selectedAsset ? <Text className="mt-3 font-bold text-orange-300">{selectedAsset.fileName ?? "Selected upload"}</Text> : null}
        {error ? <Text className="mt-3 font-bold text-red-300">{error}</Text> : null}
        <View className="mt-4 flex-row gap-3">
          <Pressable className="flex-1 rounded-xl border border-white/10 bg-white/5 p-4" onPress={chooseMedia}>
            <Text className="text-center font-extrabold text-white">Choose</Text>
          </Pressable>
          <Pressable className="flex-1 rounded-xl bg-court p-4" disabled={isLoading} onPress={handleAnalyze}>
            <Text className="text-center font-extrabold text-white">{isLoading ? "Analyzing..." : "Analyze"}</Text>
          </Pressable>
        </View>
      </Card>

      {result ? <AnalysisResultCards result={result} /> : null}
    </Screen>
  );
}

function ModeChip({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable className={selected ? "rounded-lg bg-court px-4 py-2" : "rounded-lg border border-white/10 bg-white/5 px-4 py-2"} onPress={onPress}>
      <Text className={selected ? "font-bold text-white" : "font-bold text-slate-300"}>{label}</Text>
    </Pressable>
  );
}

function AnalysisResultCards({ result }: { result: AnalysisResult }) {
  return (
    <>
      <Card title="Overall Score">
        <Text className="text-5xl font-extrabold text-green-400">{result.score}</Text>
        <Text className="mt-3 leading-6 text-slate-300">{result.summary}</Text>
      </Card>
      {"s3Url" in result && result.s3Url ? (
        <Card title="Cloud Storage">
          <Text className="font-bold text-green-300">Video stored securely in AWS S3.</Text>
          <Text className="mt-2 text-xs text-slate-500">Dev URL: {result.s3Url}</Text>
        </Card>
      ) : null}
      <Card title="Feedback">
        {result.feedback.map((item) => <FeedbackRow item={item} key={item.category} />)}
      </Card>
      <Card title="Measurements">
        {Object.entries(result.measurements).map(([key, value]) => (
          <View className="mb-3 rounded-xl bg-white/5 p-3" key={key}>
            <Text className="text-sm text-slate-400">{titleCase(key.replace(/([A-Z])/g, " $1"))}</Text>
            <Text className="mt-1 font-extrabold text-white">{value === null ? "Unknown" : String(value)}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function FeedbackRow({ item }: { item: AnalysisFeedbackItem }) {
  const tone = item.status === "good" ? "text-green-300" : item.status === "needs_work" ? "text-orange-300" : "text-slate-300";

  return (
    <View className="mb-3 rounded-xl bg-white/5 p-3">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 font-extrabold text-white">{item.category}</Text>
        <Text className={`text-xs font-bold ${tone}`}>{formatStatus(item.status)}</Text>
      </View>
      <Text className="mt-2 leading-5 text-slate-300">{item.message}</Text>
    </View>
  );
}
