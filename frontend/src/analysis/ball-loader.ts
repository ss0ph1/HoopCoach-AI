/** Generic COCO sports-ball detector; not a validated basketball-flight model. */
export async function createBallDetector() {
  const {FilesetResolver,ObjectDetector}=await import("@mediapipe/tasks-vision");
  const wasm=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm");
  return ObjectDetector.createFromOptions(wasm,{
    baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",delegate:"CPU"},
    runningMode:"VIDEO",categoryAllowlist:["sports ball"],scoreThreshold:0.6,maxResults:5
  });
}
