export type ArmFrame = { time: number; elbow: number; raised: number };
/** An image-plane extension candidate, not proof that a basketball was released. */
export function releaseCandidate(frames: ArmFrame[]): number | null {
  if(frames.length<5) return null;
  for(let i=2;i<frames.length;i++) {
    const now=frames[i];
    if(now.raised<0.25 || now.elbow<140) continue;
    const before=frames.slice(0,i).filter(frame=>now.time-frame.time<=2);
    if(before.some(frame=>now.raised-frame.raised>=0.25 && now.elbow-frame.elbow>=20)) {
      // Use the peak extension within this phase, rather than the first partially
      // extended frame, which would systematically under-report release angle.
      let peak=i;
      for(let j=i+1;j<frames.length && frames[j].time<=now.time+0.4;j++) {
        if(frames[j].raised>=0.25 && frames[j].elbow>frames[peak].elbow)peak=j;
      }
      return peak;
    }
  }
  return null;
}
export function extensionHeld(frames: ArmFrame[], index: number | null): boolean | null {
  if(index===null) return null;
  const after=frames.slice(index+1).filter(frame=>frame.time-frames[index].time<=0.8);
  if(after.length<2 || after[after.length-1].time-frames[index].time<0.35) return null;
  return after.filter(frame=>frame.elbow>=150 && frame.raised>=0.25).length/after.length>=0.7;
}
