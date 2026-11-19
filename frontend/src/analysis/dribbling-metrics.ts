export type Landmark = { x: number; y: number; visibility?: number };
export type Ball = { x: number; y: number; height: "low" | "medium" | "high" };
export const visible = (p: Landmark | undefined): p is Landmark => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= 0.6;
export const mean = (a: (number | null)[]) => { const values = a.filter((v): v is number => v !== null && Number.isFinite(v)); return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null; };
export function angle(a: Landmark, b: Landmark, c: Landmark, width: number, height: number): number | null {
  if (![a,b,c].every(visible)) return null;
  const u = [(a.x-b.x)*width,(a.y-b.y)*height], v = [(c.x-b.x)*width,(c.y-b.y)*height];
  const n = Math.hypot(...u)*Math.hypot(...v);
  return n ? Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/n)))*180/Math.PI : null;
}
export function poseMetrics(p: Landmark[], width: number, height: number) {
  if (![11,12,23,24].every(i => visible(p[i]))) return null;
  const hip = { x:(p[23].x+p[24].x)/2, y:(p[23].y+p[24].y)/2 };
  const shoulder = { x:(p[11].x+p[12].x)/2, y:(p[11].y+p[12].y)/2 };
  const torso = (hip.y-shoulder.y)*height;
  return { knee:mean([angle(p[23],p[25],p[27],width,height),angle(p[24],p[26],p[28],width,height)]),
    lean:torso > 0 ? Math.atan2(Math.abs(hip.x-shoulder.x)*width,torso)*180/Math.PI : null,
    hip, torso:Math.abs(torso)/height };
}
// Color alone cannot identify a basketball. Filter connected components by shape,
// scale, location, and torso overlap; return unknown when the candidate is ambiguous.
export function detectBall(data: Uint8ClampedArray, width: number, height: number, p: Landmark[]): Ball | null {
  if (![11,12,23,24,25,26].every(i => visible(p[i]))) return null;
  const hipY=(p[23].y+p[24].y)/2, kneeY=(p[25].y+p[26].y)/2;
  if (kneeY <= hipY) return null;
  const bodyTop=Math.min(p[11].y,p[12].y), bodyBottom=Math.max(p[27]?.y ?? kneeY,p[28]?.y ?? kneeY);
  const bodyHeight=Math.max(0.15,bodyBottom-bodyTop);
  const bodyX=(p[23].x+p[24].x)/2;
  const mask=new Uint8Array(width*height), seen=new Uint8Array(width*height);
  for(let i=0;i<mask.length;i++) {
    const [r,g,b]=[data[i*4],data[i*4+1],data[i*4+2]];
    mask[i]=r>110 && g>45 && g<r*0.88 && b<g*0.85 ? 1 : 0;
  }
  const candidates: {x:number;y:number;area:number}[]=[];
  const queue=new Int32Array(mask.length);
  for(let start=0;start<mask.length;start++) {
    if(!mask[start] || seen[start]) continue;
    let head=0,tail=1,area=0,minX=width,minY=height,maxX=0,maxY=0;
    queue[0]=start;seen[start]=1;
    while(head<tail) {
      const i=queue[head++],x=i%width,y=Math.floor(i/width);area++;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const j of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1]) {
        if(j>=0 && mask[j] && !seen[j]) {seen[j]=1;queue[tail++]=j;}
      }
    }
    const w=maxX-minX+1,h=maxY-minY+1,x=(minX+maxX)/2/width,y=(minY+maxY)/2/height;
    const diameter=Math.max(w/width,h/height)/bodyHeight;
    const torsoLeft=Math.min(p[11].x,p[12].x,p[23].x,p[24].x),torsoRight=Math.max(p[11].x,p[12].x,p[23].x,p[24].x);
    if(area<12 || w/h<0.7 || w/h>1.4 || area/(w*h)<0.55 || diameter<0.04 || diameter>0.3
      || Math.abs(x-bodyX)>bodyHeight*0.9 || y<bodyTop-bodyHeight*0.25 || y>bodyBottom+bodyHeight*0.2
      || (x>=torsoLeft && x<=torsoRight && y>=bodyTop && y<=hipY)) continue;
    candidates.push({x,y,area});
  }
  candidates.sort((a,b)=>b.area-a.area);
  if(!candidates.length || (candidates[1] && candidates[1].area>candidates[0].area*0.65)) return null;
  const c=candidates[0];return {x:c.x,y:c.y,height:c.y>kneeY?"low":c.y>hipY?"medium":"high"};
}

export function summarizeBallMotion(samples: {ball:Ball;relativeY:number}[], poseCount: number): Ball["height"] | null {
  if(samples.length < Math.max(3,poseCount*0.4))return null;
  const ys=samples.map(item=>item.relativeY);
  if(Math.max(...ys)-Math.min(...ys)<=0.15)return null;
  const heights:Ball["height"][]=["low","medium","high"];
  return heights.sort((a,b)=>samples.filter(s=>s.ball.height===b).length-samples.filter(s=>s.ball.height===a).length)[0];
}
