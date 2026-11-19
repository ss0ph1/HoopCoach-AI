import { angle, visible, type Landmark } from "./dribbling-metrics.js";

export type CameraView = "unknown" | "side" | "front" | "oblique";
export type CaptureSetup = { view: CameraView; fixedCamera: boolean; trackBall: boolean };
export const defaultCapture: CaptureSetup = { view:"unknown", fixedCamera:false, trackBall:true };
export type Observation<T> = { status:"observed" | "unavailable"; reason:string; data:T | null };
export type PoseFrame = { time:number; points:Landmark[]; width:number; height:number };
export type BallPoint = {time:number;x:number;y:number;radius:number;confidence:number};
export type BallFrame = {time:number; candidates:BallPoint[]; wrist:{x:number;y:number} | null; torso:number};
export type LegData = { side:string; kneeExtension:number; hipExtension:number|null; ankleChange:number|null; hipRiseTorsoLengths:number; durationSeconds:number; samples:number };
export type AlignmentData = { leftOffsetPercent:number|null;rightOffsetPercent:number|null;frame:{side:string;hip:Landmark;knee:Landmark;ankle:Landmark}[];aspect:number;samples:number };
export type FlightData = { riseFramePercent:number;earlyFlightAngle:number;fitErrorPixels:number;points:BallPoint[];curve:{x:number;y:number}[];width:number;height:number };
export type ShootingInsights = { setup:CaptureSetup;sampleIntervalSeconds:number;legDrive:Observation<LegData>;alignment:Observation<AlignmentData>;ballFlight:Observation<FlightData> };
const unavailable=<T>(reason:string):Observation<T>=>({status:"unavailable",reason,data:null});
const median=(a:number[])=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:null;};
const round=(n:number)=>Math.round(n*10)/10;

export function legObservation(frames:PoseFrame[], releaseTime:number|null, setup:CaptureSetup):Observation<LegData> {
  if(setup.view!=="side" || !setup.fixedCamera)return unavailable("Choose a fixed side view to observe knee/hip extension. Oblique or moving-camera footage cannot establish this sequence reliably.");
  if(releaseTime===null)return unavailable("No clear shooting-arm extension phase was found. Leg contribution cannot be linked to a shot from this clip.");
  const sequences=[{side:"Left",ids:[11,23,25,27,31]},{side:"Right",ids:[12,24,26,28,32]}].map(({side,ids})=>({side,values:frames.filter(f=>f.time>=releaseTime-1.5 && f.time<=releaseTime+0.2).flatMap(f=>{
    const [shoulder,hip,knee,ankle,foot]=ids.map(i=>f.points[i]);
    const k=angle(hip,knee,ankle,f.width,f.height);if(k===null)return [];
    const torso=Math.abs((f.points[23].y+f.points[24].y-f.points[11].y-f.points[12].y)/2);
    if(torso<.03)return [];
    return [{time:f.time,knee:k,hip:angle(shoulder,hip,knee,f.width,f.height),ankle:angle(knee,ankle,foot,f.width,f.height),hipY:(f.points[23].y+f.points[24].y)/2,torso}];
  })})).sort((a,b)=>b.values.length-a.values.length);
  const {side,values}=sequences[0];
  if(values.length<5)return unavailable("Too few clear hip–knee–ankle observations. Keep the full leg and foot visible.");
  const smooth=values.map((v,i)=>({...v,knee:median(values.slice(Math.max(0,i-1),i+2).map(p=>p.knee))!}));
  const before=smooth.filter(v=>v.time<=releaseTime-.1);if(before.length<2)return unavailable("The clip does not show enough of the loading phase before arm extension.");
  const load=before.reduce((a,b)=>a.knee<b.knee?a:b),after=smooth.filter(v=>v.time>load.time && v.time<=releaseTime+.2);
  if(!after.length)return unavailable("The clip ends before leg extension can be assessed.");
  const end=after.reduce((a,b)=>a.knee>b.knee?a:b),delta=end.knee-load.knee;
  // This is an engineering noise gate, not an optimal knee-angle standard.
  if(delta<15 || end.time-load.time<.15)return unavailable("No clear loading-to-extension change was resolved. This does not prove the legs were inactive or that force was insufficient.");
  return {status:"observed",reason:"Visible joint extension is a movement proxy. Force, power, muscle effort and leg contribution percentage are not measured.",data:{side,kneeExtension:round(delta),hipExtension:load.hip===null||end.hip===null?null:round(end.hip-load.hip),ankleChange:load.ankle===null||end.ankle===null?null:round(end.ankle-load.ankle),hipRiseTorsoLengths:Math.round((load.hipY-end.hipY)/load.torso*100)/100,durationSeconds:round(end.time-load.time),samples:values.length}};
}

export function alignmentObservation(frames:PoseFrame[], setup:CaptureSetup):Observation<AlignmentData> {
  if(setup.view!=="front" || !setup.fixedCamera)return unavailable("Choose a fixed front view for projected hip–knee–ankle alignment. A side or oblique view cannot establish frontal alignment.");
  const valid=frames.filter(f=>[11,12,23,24,25,26,27,28].every(i=>visible(f.points[i])));
  if(valid.length<5)return unavailable("Keep both hips, knees and ankles visible for several frames.");
  const offset=(f:PoseFrame,ids:number[])=>{
    const [h,k,a]=ids.map(i=>({x:f.points[i].x*f.width,y:f.points[i].y*f.height}));
    const dx=a.x-h.x,dy=a.y-h.y,len=Math.hypot(dx,dy);
    if(len<20)return null;
    return Math.abs(dx*(k.y-h.y)-dy*(k.x-h.x))/(len*len)*100;
  };
  const left=median(valid.map(f=>offset(f,[23,25,27])).filter((v):v is number=>v!==null));
  const right=median(valid.map(f=>offset(f,[24,26,28])).filter((v):v is number=>v!==null));
  if(left===null && right===null)return unavailable("The projected leg length was too small to estimate alignment.");
  const f=valid[Math.floor(valid.length/2)];
  return {status:"observed",reason:"Median 2D knee offset from the hip–ankle line, normalized by projected leg length. This is not a force vector, valgus diagnosis, injury-risk estimate or ideal-alignment grade.",data:{leftOffsetPercent:left===null?null:round(left),rightOffsetPercent:right===null?null:round(right),aspect:f.width/f.height,samples:valid.length,frame:[{side:"Left",hip:f.points[23],knee:f.points[25],ankle:f.points[27]},{side:"Right",hip:f.points[24],knee:f.points[26],ankle:f.points[28]}]}};
}

// Least-squares quadratic fit with pivoted elimination; time is centered for stability.
export function fitQuadratic(points:{time:number;y:number}[]):[number,number,number]|null {
  if(points.length<3)return null;
  const s=(power:number)=>points.reduce((sum,p)=>sum+p.time**power,0);
  const y=(power:number)=>points.reduce((sum,p)=>sum+p.y*p.time**power,0);
  const m=[[s(4),s(3),s(2),y(2)],[s(3),s(2),s(1),y(1)],[s(2),s(1),s(0),y(0)]];
  for(let i=0;i<3;i++){
    let pivot=i;for(let j=i+1;j<3;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;
    [m[i],m[pivot]]=[m[pivot],m[i]];if(Math.abs(m[i][i])<1e-9)return null;
    const div=m[i][i];for(let k=i;k<4;k++)m[i][k]/=div;
    for(let j=0;j<3;j++)if(j!==i){const factor=m[j][i];for(let k=i;k<4;k++)m[j][k]-=factor*m[i][k];}
  }
  return [m[0][3],m[1][3],m[2][3]];
}

export function flightObservation(observations:BallFrame[], releaseTime:number|null, width:number,height:number,setup:CaptureSetup,modelAvailable=true):Observation<FlightData> {
  if(setup.view!=="side" || !setup.fixedCamera)return unavailable("A fixed, level side view with the whole ball flight is required. Other angles do not support a projected launch angle or arc height.");
  if(!setup.trackBall)return unavailable("Enable ball-flight tracking to estimate the visible 2D arc.");
  if(!modelAvailable)return unavailable("The ball detector could not be loaded. Pose observations are still available; retry with a network connection.");
  if(releaseTime===null)return unavailable("A shooting-arm extension phase was not resolved, so a ball-flight segment could not be associated with this shot.");
  const track:BallPoint[]=[];let lastNearHand=-1,separated=-1;
  for(const f of observations){
    if(f.time<releaseTime-1 || f.time>releaseTime+2.5)continue;
    const candidates=f.candidates.filter(p=>p.confidence>=.6 && p.radius>=2 && p.radius<=Math.min(width,height)*.13 && p.x-p.radius>0 && p.y-p.radius>0 && p.x+p.radius<width && p.y+p.radius<height);
    if(!track.length){
      if(!f.wrist || f.time>releaseTime+.25)continue;
      const near=candidates.filter(p=>Math.hypot(p.x-f.wrist!.x,p.y-f.wrist!.y)<=Math.max(p.radius*3,f.torso*.4));
      if(near.length!==1)continue;
      track.push(near[0]);lastNearHand=0;continue;
    }
    const prev=track[track.length-1],dt=f.time-prev.time;if(dt>.3)break;
    const earlier=track[track.length-2];
    const prediction=earlier?{x:prev.x+(prev.x-earlier.x)*dt/(prev.time-earlier.time),y:prev.y+(prev.y-earlier.y)*dt/(prev.time-earlier.time)}:prev;
    const ranked=candidates.map(p=>({p,d:Math.hypot(p.x-prediction.x,p.y-prediction.y)})).filter(c=>c.d<Math.max(prev.radius*6,f.torso*1.5)*Math.max(1,dt/.1)).sort((a,b)=>a.d-b.d);
    if(!ranked.length)continue;
    if(ranked[1] && ranked[1].d-ranked[0].d<prev.radius*2)return unavailable("Multiple plausible balls were detected. The shot association is ambiguous.");
    const point=ranked[0].p;track.push(point);
    if(f.wrist){
      const distance=Math.hypot(point.x-f.wrist.x,point.y-f.wrist.y);
      if(distance<=Math.max(point.radius*3,f.torso*.35) && separated<0)lastNearHand=track.length-1;
      else if(separated<0 && f.time>=releaseTime-.4 && lastNearHand>=0)separated=track.length-1;
    }
  }
  if(separated<0)return unavailable("A ball separating from the visible shooting hand was not tracked. A held ball or orange clothing is not treated as a flight arc.");
  const flight=track.slice(Math.max(0,separated-1));
  if(flight.length<5 || flight[flight.length-1].time-flight[0].time<.4)return unavailable("Too few consistent ball detections. Keep the release, apex and descending flight in frame.");
  const t0=flight[0].time,points=flight.map(p=>({...p,time:p.time-t0})),fit=fitQuadratic(points);
  if(!fit || fit[0]<=0)return unavailable("The visible track does not support a consistent ascending-and-descending ball arc.");
  const [a,b,c]=fit,apex=-b/(2*a),end=points[points.length-1].time;
  if(apex<=0 || apex>=end || points.filter(p=>p.time<apex).length<2 || points.filter(p=>p.time>apex).length<2)return unavailable("The apex and both flight phases were not observed. Arc height is not extrapolated outside the clip.");
  const radius=median(points.map(p=>p.radius))!,apexY=a*apex*apex+b*apex+c,rise=c-apexY;
  const error=Math.sqrt(points.reduce((sum,p)=>sum+(p.y-(a*p.time*p.time+b*p.time+c))**2,0)/points.length);
  const tMean=points.reduce((s,p)=>s+p.time,0)/points.length,xMean=points.reduce((s,p)=>s+p.x,0)/points.length;
  const vx=points.reduce((s,p)=>s+(p.time-tMean)*(p.x-xMean),0)/points.reduce((s,p)=>s+(p.time-tMean)**2,0);
  const x0=xMean-vx*tMean,xError=Math.sqrt(points.reduce((s,p)=>s+(p.x-x0-vx*p.time)**2,0)/points.length);
  if(rise<radius*2 || error>Math.max(2,radius*.8) || xError>Math.max(2,radius) || Math.abs(vx)*end<radius*3)return unavailable("The track is too noisy, too small, or inconsistent with a side-view flight to estimate an arc.");
  const angle=Math.atan2(-b,Math.abs(vx))*180/Math.PI;
  if(angle<=0 || angle>=90)return unavailable("The early visible flight direction could not be estimated reliably.");
  return {status:"observed",reason:"Projected 2D flight only. Rise is above the first tracked flight point, not ground or release height. The initial visible direction is not a calibrated 3D release angle. No height in meters is reported.",data:{riseFramePercent:round(rise/height*100),earlyFlightAngle:round(angle),fitErrorPixels:round(error),points:flight,width,height,curve:Array.from({length:31},(_,i)=>{const t=end*i/30;return{x:x0+vx*t,y:a*t*t+b*t+c};})}};
}
