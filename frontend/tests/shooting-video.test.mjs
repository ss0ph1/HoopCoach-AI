import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function load(path){const source=await readFile(new URL(path,import.meta.url),'utf8');const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}});return import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));}
const {releaseCandidate,extensionHeld}=await load('../src/analysis/shooting-metrics.ts');
const {errorMessage}=await load('../src/api/error-message.ts');
test('nested service errors and validation arrays become readable text',()=>{
 assert.equal(errorMessage({detail:{message:'Choose a valid MP4.'}}),'Choose a valid MP4.');
 assert.equal(errorMessage({detail:[{loc:['body','file'],msg:'A video is required.'},{msg:'File is empty.'}]}),'A video is required. File is empty.');
 assert.equal(errorMessage(new Error('Video is too long.')),'Video is too long.');
 assert.equal(errorMessage({message:'Request failed with status code 503',response:{data:{error:{message:'Upload unavailable.'}}}}),'Upload unavailable.');
});
test('opaque and circular objects never render as object Object',()=>{
 const circular={};circular.error=circular;
 for(const value of [{},circular,'[object Object]',null])assert.equal(errorMessage(value,'Try a clear video.'),'Try a clear video.');
});
test('stationary poses and moving cameras do not invent a shot release',()=>{
 const frames=Array.from({length:20},(_,i)=>({time:i*.2,elbow:95,raised:.5}));
 assert.equal(releaseCandidate(frames),null);assert.equal(extensionHeld(frames,null),null);
});
test('an upward extension can identify a possible release and subsequent held arm',()=>{
 const frames=[{time:0,elbow:90,raised:0},{time:.2,elbow:110,raised:.1},{time:.4,elbow:150,raised:.4},{time:.6,elbow:165,raised:.6},{time:.8,elbow:170,raised:.6},{time:1,elbow:165,raised:.6},{time:1.2,elbow:165,raised:.6}];
 assert.equal(releaseCandidate(frames),4);assert.equal(extensionHeld(frames,4),true);
 assert.equal(extensionHeld(frames.slice(0,3),2),null);
});
test('lowering the arm after estimated release is distinguished from insufficient evidence',()=>{
 const frames=[{time:0,elbow:150,raised:.5},{time:.2,elbow:90,raised:0},{time:.5,elbow:90,raised:0}];
 assert.equal(extensionHeld(frames,0),false);
});
