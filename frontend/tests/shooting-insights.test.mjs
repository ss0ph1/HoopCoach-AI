import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=await mkdtemp(join(tmpdir(),'hoop-insights-'));
await writeFile(join(dir,'package.json'),'{"type":"module"}');
for(const name of ['dribbling-metrics','shooting-insights']){
 const source=await readFile(new URL(`../src/analysis/${name}.ts`,import.meta.url),'utf8');
 await writeFile(join(dir,name+'.js'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText);
}
after(()=>rm(dir,{recursive:true,force:true}));
const {fitQuadratic,flightObservation,alignmentObservation,legObservation}=await import(pathToFileURL(join(dir,'shooting-insights.js')));
const side={view:'side',fixedCamera:true,trackBall:true};
const front={...side,view:'front'};
const trace=()=>Array.from({length:15},(_,i)=>{
 const time=i/10;
 return {time,candidates:[{time,x:100+60*time,y:150-100*time+80*time*time,radius:3,confidence:.9}],wrist:{x:100,y:150},torso:60};
});
test('quadratic fit recovers a known projected flight and rejects singular samples',()=>{
 const fit=fitQuadratic(trace().map(f=>f.candidates[0]));
 fit.forEach((v,i)=>assert.ok(Math.abs(v-[80,-100,150][i])<1e-7));
 assert.equal(fitQuadratic([{time:0,y:1},{time:0,y:2},{time:0,y:3}]),null);
});
test('visible ascent, apex and descent give relative rise and early visible direction',()=>{
 const result=flightObservation(trace(),.2,480,270,side);
 assert.equal(result.status,'observed');
 assert.ok(Math.abs(result.data.riseFramePercent-5.35)<.1);
 assert.ok(Math.abs(result.data.earlyFlightAngle-48.6)<.1);
 assert.ok(result.data.points.length>=5);
});
test('flight stays unavailable for wrong view, moving camera, disabled model or absent shot phase',()=>{
 for(const setup of [front,{...side,view:'oblique'},{...side,view:'unknown'},{...side,fixedCamera:false},{...side,trackBall:false}])
  assert.equal(flightObservation(trace(),.2,480,270,setup).data,null);
 assert.equal(flightObservation(trace(),null,480,270,side).data,null);
 assert.equal(flightObservation(trace(),.2,480,270,side,false).data,null);
});
test('held ball, unseen apex and ambiguous balls never produce an arc',()=>{
 const held=trace().map(f=>({...f,candidates:f.candidates.map(p=>({...p,x:100,y:150}))}));
 assert.equal(flightObservation(held,.2,480,270,side).data,null);
 assert.equal(flightObservation(trace().slice(0,6),.2,480,270,side).data,null);
 const ambiguous=trace().map((f,i)=>({...f,candidates:i>2?[...f.candidates,{...f.candidates[0],x:f.candidates[0].x+1}]:f.candidates}));
 assert.equal(flightObservation(ambiguous,.2,480,270,side).data,null);
});
const point=(x,y)=>({x,y,visibility:1});
const frames=()=>Array.from({length:12},(_,i)=>{
 const points=Array.from({length:33},()=>point(.5,.5));
 points[11]=point(.4,.15);points[12]=point(.6,.15);
 for(const [hip,knee,ankle,x] of [[23,25,27,.4],[24,26,28,.6]]){
  points[hip]=point(x,.4);points[knee]=point(x,.6);points[ankle]=point(x,.8);
 }
 return {time:i/10,points,width:480,height:270};
});
test('front alignment uses projected geometry and requires visible joints',()=>{
 const f=frames();
 assert.equal(alignmentObservation(f,front).data.leftOffsetPercent,0);
 f.forEach(v=>v.points[25].x+=.05);
 assert.ok(alignmentObservation(f,front).data.leftOffsetPercent>20);
 assert.equal(alignmentObservation(f,side).data,null);
 f.forEach(v=>v.points[27].visibility=.1);
 assert.equal(alignmentObservation(f,front).data,null);
});
test('leg extension requires a visible loading sequence and never estimates force',()=>{
 const f=frames();
 f.forEach((v,i)=>{for(const knee of [25,26])v.points[knee].x+=Math.max(0,.16-i*.018);});
 const result=legObservation(f,.9,side);
 assert.equal(result.status,'observed');
 assert.ok(result.data.kneeExtension>=15);
 assert.ok(!('force' in result.data));
 assert.equal(legObservation(frames(),.9,side).data,null);
 assert.equal(legObservation(f,null,side).data,null);
 assert.equal(legObservation(f,.9,front).data,null);
});
