import type { ShootingPhotoAnalysisResult, ShootingPhotoFeedbackItem } from "../types.js";
import { angle, poseMetrics, visible } from "./dribbling-metrics.js";
import { createPoseDetector } from "./pose-loader.js";

export async function analyzePhoto(file: File): Promise<ShootingPhotoAnalysisResult> {
  if(!file.size || file.size>20*1024*1024)throw new Error("Choose a JPG or PNG photo under 20 MB.");
  const url=URL.createObjectURL(file),image=new Image();
  let detector:Awaited<ReturnType<typeof createPoseDetector>> | undefined;
  try {
    image.src=url;
    try {await image.decode();}catch{throw new Error("The photo could not be decoded. Choose a JPG or PNG.");}
    detector=await createPoseDetector("IMAGE");
    const {landmarks}=detector.detect(image);
    if(landmarks.length>1)throw new Error("More than one player was detected. Crop the photo to one player.");
    const p=landmarks[0];
    if(!p)throw new Error("No clear pose was detected. Try a front or side photo with your arms and hips visible.");
    const sides=[[11,13,15],[12,14,16]].filter(ids=>ids.every(i=>visible(p[i])));
    sides.sort((a,b)=>p[a[2]].y-p[b[2]].y);
    const arm=sides[0];
    const elbow=arm?angle(p[arm[0]],p[arm[1]],p[arm[2]],image.naturalWidth,image.naturalHeight):null;
    const tilt=visible(p[11]) && visible(p[12])?Math.abs(p[11].y-p[12].y):null;
    const lean=poseMetrics(p,image.naturalWidth,image.naturalHeight)?.lean ?? null;
    const feedback:ShootingPhotoFeedbackItem[]=[
      {category:"Shooting elbow angle",status:elbow===null?"unknown":elbow>=80 && elbow<=120?"good":"needs_work",message:elbow===null?"The shooting arm was obscured.":"This is the visible arm's angle in one frame. An extended release and a bent shot pocket are different phases; a photo cannot establish the full motion."},
      {category:"Shoulder balance",status:tilt===null?"unknown":tilt<=0.04?"good":"needs_work",message:"Shoulder height difference is measured relative to the image height. Camera tilt can affect it."},
      {category:"Projected body lean",status:lean===null?"unknown":lean<=12?"good":"needs_work",message:lean===null?"Shoulders or hips were not visible enough to estimate lean.":"This is a 2D camera-view estimate of shoulder-to-hip alignment."}
    ];
    const known=feedback.filter(f=>f.status!=="unknown");
    if(!known.length)throw new Error("Not enough clear landmarks to estimate posture. Try a clearer photo.");
    const round=(n:number|null)=>n===null?null:Math.round(n*10)/10;
    return {score:Math.round(100*known.filter(f=>f.status==="good").length/known.length),summary:"Single-photo posture estimate. Camera angle and shot phase affect the result; this is not a shooting-accuracy rating.",feedback,measurements:{shootingElbowAngle:round(elbow),shoulderTilt:tilt,bodyLean:round(lean)}};
  } finally {detector?.close();URL.revokeObjectURL(url);}
}
