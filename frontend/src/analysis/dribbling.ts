import type { DribblingVideoAnalysisResult, AnalysisFeedbackItem } from "../types.js";
import { createPoseDetector } from "./pose-loader.js";
import { detectBall, mean, poseMetrics, summarizeBallMotion, type Ball } from "./dribbling-metrics.js";

import { mediaEvent } from "./video-media.js";

export async function analyzeDribbling(file: File, progress?: (message: string)=>void): Promise<DribblingVideoAnalysisResult> {
  if(!file.size || file.size>50*1024*1024) throw new Error("Choose a video under 50 MB.");
  const video=document.createElement("video"),url=URL.createObjectURL(file);
  video.muted=true;video.playsInline=true;video.preload="auto";
  let detector: import("@mediapipe/tasks-vision").PoseLandmarker | undefined;
  try {
    progress?.("Reading video…");
    await mediaEvent(video,"loadeddata",()=>{video.src=url;video.load();});
    if(!Number.isFinite(video.duration) || video.duration<=0 || video.duration>10) throw new Error("Choose a single-player video of 10 seconds or less.");
    progress?.("Loading pose analysis. The first run may take a moment…");
    detector=await createPoseDetector("VIDEO");
    const canvas=document.createElement("canvas");
    const scale=Math.min(480/video.videoWidth,480/video.videoHeight);
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)throw new Error("Your browser does not support video analysis.");
    const samples=Math.min(30,Math.max(3,Math.floor(video.duration*6)));
    const knees:(number|null)[]=[],leans:(number|null)[]=[],balls:{ball:Ball;relativeY:number}[]=[];
    let poses=0,multiple=0;
    for(let i=0;i<samples;i++) {
      progress?.(`Analyzing frame ${i+1} of ${samples}…`);
      const timestamp=video.duration*(i+0.5)/samples;
      await mediaEvent(video,"seeked",()=>{video.currentTime=timestamp;});
      context.drawImage(video,0,0,canvas.width,canvas.height);
      const result=detector.detectForVideo(canvas,timestamp*1000);
      if(result.landmarks.length>1) {multiple++;continue;}
      const p=result.landmarks[0];if(!p)continue;
      const metrics=poseMetrics(p,canvas.width,canvas.height);if(!metrics)continue;
      poses++;knees.push(metrics.knee);leans.push(metrics.lean);
      const image=context.getImageData(0,0,canvas.width,canvas.height);
      const ball=detectBall(image.data,canvas.width,canvas.height,p);
      if(ball && metrics.torso>0)balls.push({ball,relativeY:(ball.y-metrics.hip.y)/metrics.torso});
      // Yield between inference calls so loading feedback and controls can repaint.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(multiple>samples*0.2)throw new Error("More than one player was detected. Crop the clip to one player.");
    if(poses<Math.max(3,Math.ceil(samples*0.3)))throw new Error("Not enough clear body landmarks. Keep one player's shoulders, hips, knees and ankles in frame.");
    const knee=mean(knees),lean=mean(leans);
    const ballHeight=summarizeBallMotion(balls,poses);
    const feedback:AnalysisFeedbackItem[]=[
      {category:"Knee bend",status:knee===null?"unknown":knee>=105 && knee<=165?"good":"needs_work",message:knee===null?"Knees or ankles were obscured, so stance was not scored.":knee>=105 && knee<=165?"The visible knee angle suggests an athletic bend.":"Try a balanced knee bend. A side view gives a more useful estimate."},
      {category:"Projected body lean",status:lean===null?"unknown":lean<=16?"good":"needs_work",message:"This is a 2D camera-view estimate; camera angle affects the result."},
      {category:"Head position",status:"unknown",message:"Eye direction cannot be determined reliably from body landmarks. Review whether you are looking ahead."},
      {category:"Stance stability",status:"unknown",message:"Side-to-side movement can be intentional; it is not treated as a technique fault."},
      {category:"Ball height",status:ballHeight===null?"unknown":ballHeight==="high"?"needs_work":"good",message:ballHeight===null?"A moving basketball was not tracked consistently. Ball control was not scored.":`The moving ball appears mostly ${ballHeight} relative to your hips and knees. This color-based estimate can miss occluded or non-orange balls.`}
    ];
    const known=feedback.filter(item=>item.status!=="unknown");
    if(!known.length)throw new Error("The visible landmarks were insufficient to score this clip. Try a clearer side view.");
    const round=(n:number|null)=>n===null?null:Math.round(n*10)/10;
    return {analysisType:"dribbling",score:Math.round(100*known.filter(f=>f.status==="good").length/known.length),summary:`${ballHeight?"Pose and ball-height estimate":"Posture estimate only; dribbling motion was not confirmed"}. ${poses} of ${samples} sampled frames had a clear pose. This is not a ball-handling skill rating.`,feedback,measurements:{averageKneeBend:round(knee),averageBodyLean:round(lean),headDownPercentage:null,stanceStability:null,estimatedBallHeight:ballHeight},processing:"browser",createdAt:new Date().toISOString()};
  } catch(error) {
    if(error instanceof Error && /fetch|wasm|model|network/i.test(error.message))throw new Error("Could not load pose analysis. Check your connection and allow the analysis model download, then retry.");
    throw error;
  } finally {detector?.close();video.removeAttribute("src");video.load();URL.revokeObjectURL(url);}
}
