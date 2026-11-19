import { mediaEvent } from './video-media.js';
export type StoredVideo = { file:Blob; thumbnail:string };
function database():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('hoopcoach-video-library',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('videos');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('Video storage is unavailable in this browser.'));
  });
}
export async function loadVideo(scope:string,id:string):Promise<StoredVideo|undefined> {
  const db=await database();
  try { return await new Promise((resolve,reject)=>{
    const request=db.transaction('videos').objectStore('videos').get(`${scope}:${id}`);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  }); } finally { db.close(); }
}
export async function saveVideo(scope:string,id:string,file:Blob):Promise<StoredVideo> {
  const thumbnail=await videoThumbnail(file);
  const db=await database(),value={file,thumbnail};
  try { await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('videos','readwrite');
    tx.objectStore('videos').put(value,`${scope}:${id}`);
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(new Error('Could not keep the video on this device. Browser storage may be full.'));
    tx.onerror=()=>reject(new Error('Could not keep the video on this device. Browser storage may be full.'));
  });return value; } finally { db.close(); }
}
export async function videoThumbnail(file:Blob):Promise<string> {
  const video=document.createElement('video'),url=URL.createObjectURL(file);
  video.muted=true;video.playsInline=true;
  try {
    await mediaEvent(video,'loadeddata',()=>{video.src=url;video.load();});
    const time=Math.min(.2,video.duration/2);
    if(Number.isFinite(time) && time>0)await mediaEvent(video,'seeked',()=>{video.currentTime=time;});
    const canvas=document.createElement('canvas'),scale=Math.min(320/video.videoWidth,180/video.videoHeight);
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Video previews are unavailable.');
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.8);
  } finally {video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
