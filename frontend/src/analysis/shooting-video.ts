import type { AnalysisFeedbackItem, ShootingVideoAnalysisResult } from "../types.js";
import { createPoseDetector } from "./pose-loader.js";
import { angle, mean, poseMetrics, visible } from "./dribbling-metrics.js";
import { mediaEvent } from "./video-media.js";
import { createBallDetector } from "./ball-loader.js";
import { defaultCapture, legObservation, alignmentObservation, flightObservation, type CaptureSetup, type PoseFrame, type BallFrame, type BallPoint } from "./shooting-insights.js";
import { releaseCandidate, extensionHeld, type ArmFrame } from "./shooting-metrics.js";

export async function analyzeShooting(file: File, progress?: (message: string)=>void, setup:CaptureSetup=defaultCapture): Promise<ShootingVideoAnalysisResult> {
  if(!file.size || file.size>50*1024*1024)throw new Error("Choose a video under 50 MB.");
  const video=document.createElement("video"),url=URL.createObjectURL(file);
  video.muted=true;video.playsInline=true;video.preload="auto";
  let detector:Awaited<ReturnType<typeof createPoseDetector>> | undefined;
  let ballDetector:Awaited<ReturnType<typeof createBallDetector>> | undefined;
  try {
    progress?.("Reading video…");
    await mediaEvent(video,"loadeddata",()=>{video.src=url;video.load();});
    if(!Number.isFinite(video.duration) || video.duration<=0 || video.duration>10)throw new Error("Choose a single-player video of 10 seconds or less.");
    progress?.("Loading pose analysis. The first run may take a moment…");
    detector=await createPoseDetector("VIDEO");
    if(setup.view==="side" && setup.fixedCamera && setup.trackBall) {
      progress?.("Loading optional sports-ball tracking…");
      const pending=createBallDetector();
      let timer:ReturnType<typeof setTimeout> | undefined;
      try { ballDetector=await Promise.race([pending,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Ball model timed out")),30000);})]); }
      catch { void pending.then(model=>model.close()).catch(()=>{}); }
      finally { clearTimeout(timer); }
    }
    const canvas=document.createElement("canvas"),scale=Math.min(480/video.videoWidth,480/video.videoHeight);
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Your browser does not support video analysis.");
    const samples=Math.min(120,Math.max(3,Math.floor(video.duration*12)));
    const poseFrames:PoseFrame[]=[],ballFrames:BallFrame[]=[];
    const wristFrames:({x:number;y:number}|null)[][]=[[],[]];
    const arms:ArmFrame[][]=[[],[]],leans:(number|null)[]=[],knees:(number|null)[]=[],tilts:number[]=[];
    let poses=0,multiple=0;
    for(let i=0;i<samples;i++) {
      progress?.(`Analyzing frame ${i+1} of ${samples}…`);
      const time=video.duration*(i+0.5)/samples;
      await mediaEvent(video,"seeked",()=>{video.currentTime=time;});
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const result=detector.detectForVideo(canvas,time*1000);
      const p=result.landmarks.length===1?result.landmarks[0]:undefined;
      if(result.landmarks.length>1)multiple++;
      const pose=p?poseMetrics(p,canvas.width,canvas.height):null;
      const wrists:({x:number;y:number}|null)[]=[15,16].map(j=>p && visible(p[j])?{x:p[j].x*canvas.width,y:p[j].y*canvas.height}:null);
      wristFrames[0].push(wrists[0]);wristFrames[1].push(wrists[1]);
      let candidates:BallPoint[]=[];
      if(ballDetector) {
        try { candidates=ballDetector.detectForVideo(canvas,time*1000).detections.flatMap(d=>{
          const box=d.boundingBox,category=d.categories[0];
          if(!box || !category || category.score<.6 || box.width<=0 || box.height<=0 || box.width/box.height<.65 || box.width/box.height>1.5)return [];
          return [{time,x:box.originX+box.width/2,y:box.originY+box.height/2,radius:Math.max(box.width,box.height)/2,confidence:category.score}];
        }); }
        catch { ballDetector.close();ballDetector=undefined; }
      }
      ballFrames.push({time,candidates,wrist:null,torso:(pose?.torso ?? .2)*canvas.height});
      if(p && pose && pose.torso>.02) {
        poses++;leans.push(pose.lean);knees.push(pose.knee);tilts.push(Math.abs(p[11].y-p[12].y));
        poseFrames.push({time,points:p.map(v=>({x:v.x,y:v.y,visibility:v.visibility})),width:canvas.width,height:canvas.height});
        [[11,13,15],[12,14,16]].forEach(([shoulder,elbow,wrist],side)=>{
          if(![shoulder,elbow,wrist].every(j=>visible(p[j])))return;
          const bend=angle(p[shoulder],p[elbow],p[wrist],canvas.width,canvas.height);
          if(bend!==null)arms[side].push({time,elbow:bend,raised:(p[shoulder].y-p[wrist].y)/pose.torso});
        });
      }
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(multiple>samples*0.2)throw new Error("More than one player was detected. Crop the clip to one player.");
    if(poses<Math.max(3,Math.ceil(samples*0.3)))throw new Error("Not enough clear body landmarks. Keep one player's arms, shoulders and hips in frame.");
    // Keep one arm across the sequence; switching arms between frames invents motion.
    const motion=(a:ArmFrame[])=>a.length?Math.max(...a.map(f=>f.elbow))-Math.min(...a.map(f=>f.elbow)):0;
    const side=arms[1].length>arms[0].length || (arms[1].length===arms[0].length && motion(arms[1])>motion(arms[0]))?1:0;
    const arm=arms[side];if(arm.length<Math.max(3,poses*0.5))throw new Error("The shooting arm was obscured. Try a clearer side view with the whole arm visible.");
    const index=releaseCandidate(arm),release=index===null?null:arm[index].elbow,held=extensionHeld(arm,index);
    const releaseTime=index===null?null:arm[index].time;
    ballFrames.forEach((frame,i)=>frame.wrist=wristFrames[side][i]);
    const insights={setup:{...setup},sampleIntervalSeconds:video.duration/samples,
      legDrive:legObservation(poseFrames,releaseTime,setup),
      alignment:alignmentObservation(poseFrames,setup),
      ballFlight:flightObservation(ballFrames,releaseTime,canvas.width,canvas.height,setup,!!ballDetector)};
    const lean=mean(leans),tilt=mean(tilts),knee=mean(knees);
    const feedback:AnalysisFeedbackItem[]=[
      {category:"Release extension",status:release===null?"unknown":release>=155?"good":"needs_work",message:release===null?"No clear upward arm-extension sequence was detected, so release was not scored.":"A possible release phase was estimated from upward arm motion. This does not confirm that the ball was released."},
      {category:"Shoulder balance",status:tilt===null?"unknown":tilt<=0.04?"good":"needs_work",message:"Projected shoulder height is affected by camera tilt and body rotation."},
      {category:"Projected body lean",status:lean===null?"unknown":lean<=16?"good":"needs_work",message:"This is a 2D camera-view estimate of shoulder-to-hip alignment."},
      {category:"Knee bend",status:"unknown",message:"Knee angle changes through a shot. The visible average is shown without treating normal leg extension as a fault."},
      {category:"Arm extension after release",status:held===null?"unknown":held?"good":"needs_work",message:held===null?"Not enough clear frames after an estimated release to assess arm extension.":"This estimates whether the visible arm stayed extended; wrist and finger follow-through are not measured."}
    ];
    const known=feedback.filter(f=>f.status!=="unknown");
    if(!known.length)throw new Error("Not enough clear measurements to score this clip. Try a clearer side view.");
    const round=(n:number|null)=>n===null?null:Math.round(n*10)/10;
    return {analysisType:"shooting",insights,processing:"browser",score:Math.round(100*known.filter(f=>f.status==="good").length/known.length),summary:`${index===null?"Posture estimate only; no clear shooting release sequence was detected":"Possible shooting release estimated from visible arm motion"}. ${poses} of ${samples} sampled frames had a clear pose. Camera-view estimates are not a shooting-accuracy rating.`,feedback,measurements:{averageElbowAngle:round(mean(arm.map(f=>f.elbow))),releaseElbowAngle:round(release),shoulderTilt:tilt,bodyLean:round(lean),kneeBend:round(knee),followThroughHeld:held},createdAt:new Date().toISOString()};
  } finally {ballDetector?.close();detector?.close();video.removeAttribute("src");video.load();URL.revokeObjectURL(url);}
}
