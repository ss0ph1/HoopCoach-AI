export async function createPoseDetector(mode: "IMAGE" | "VIDEO") {
  try {
  const {FilesetResolver,PoseLandmarker}=await import("@mediapipe/tasks-vision");
  const wasm=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm");
  return await PoseLandmarker.createFromOptions(wasm,{
    baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",delegate:"CPU"},
    runningMode:mode,numPoses:2,minPoseDetectionConfidence:0.6,minPosePresenceConfidence:0.6,minTrackingConfidence:0.6
  });
  } catch { throw new Error("Could not load pose analysis. Check your connection and allow the model download, then retry."); }
}
