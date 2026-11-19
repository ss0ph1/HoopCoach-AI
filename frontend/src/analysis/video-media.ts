export function mediaEvent(video: HTMLVideoElement, event: string, action: () => void) {
  return new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>done(new Error("The browser could not decode this video. Try a short MP4 (H.264).")),15000);
    function done(error?: Error) {clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener("error",bad);error?reject(error):resolve();}
    const ok=()=>done(),bad=()=>done(new Error("This video format could not be decoded. Try an MP4 (H.264)."));
    video.addEventListener(event,ok,{once:true});video.addEventListener("error",bad,{once:true});
    try { action(); } catch (error) {done(error instanceof Error ? error : new Error("Could not read this video."));}
  });
}
