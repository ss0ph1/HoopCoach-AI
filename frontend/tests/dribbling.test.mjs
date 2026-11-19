import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/analysis/dribbling-metrics.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}});
const {angle,poseMetrics,detectBall,summarizeBallMotion}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const point=(x,y,visibility=1)=>({x,y,visibility});
function pose(){const p=Array.from({length:33},()=>point(.5,.5));p[11]=point(.4,.25);p[12]=point(.6,.25);p[23]=point(.42,.55);p[24]=point(.58,.55);p[25]=point(.42,.72);p[26]=point(.58,.72);p[27]=point(.42,.95);p[28]=point(.58,.95);return p;}
function frame(){return new Uint8ClampedArray(200*200*4);}
function rect(data,x1,y1,x2,y2){for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++){const i=(y*200+x)*4;data.set([235,118,18,255],i);}}
function ball(data,cx,cy){for(let y=cy-7;y<=cy+7;y++)for(let x=cx-7;x<=cx+7;x++)if((x-cx)**2+(y-cy)**2<=49)data.set([235,118,18,255],(y*200+x)*4);}
test('joint angles use pixel geometry for non-square video',()=>{assert.ok(Math.abs(angle(point(.3,.1),point(.5,.5),point(.7,.1),200,100)-90)<.001);});
test('occluded joints and torsos remain unknown',()=>{assert.equal(angle(point(.3,.1,0),point(.5,.5),point(.7,.1),200,100),null);const p=pose();p[11].visibility=0;assert.equal(poseMetrics(p,200,100),null);});
test('orange clothing is not selected as a basketball',()=>{const data=frame();rect(data,80,50,120,110);assert.equal(detectBall(data,200,200,pose()),null);ball(data,146,157);assert.equal(detectBall(data,200,200,pose())?.height,'low');});
test('ambiguous orange objects and hidden knees remain unknown',()=>{const data=frame();ball(data,146,157);ball(data,50,157);assert.equal(detectBall(data,200,200,pose()),null);const p=pose();p[25].visibility=0;assert.equal(detectBall(data,200,200,p),null);});
test('a still photo or camera pan is not confirmed as dribbling',()=>{const samples=Array.from({length:20},()=>({ball:{x:.7,y:.8,height:'low'},relativeY:.7}));assert.equal(summarizeBallMotion(samples,20),null);samples.forEach((s,i)=>s.relativeY=i%2?.4:.8);assert.equal(summarizeBallMotion(samples,20),'low');assert.equal(summarizeBallMotion(samples.slice(0,3),20),null);});
