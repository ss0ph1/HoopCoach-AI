import { useEffect, useRef, useState } from 'react';
import { accountScope, type AnalysisRecord } from '../api/account.js';
import { loadVideo, saveVideo, videoThumbnail, type StoredVideo } from '../analysis/video-library.js';

function useVideoUrl(file:Blob|null) {
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!file){setUrl('');return;}const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);
  return url;
}
function VideoPlayer({file,name,close}:{file:Blob|null;name:string;close:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null),url=useVideoUrl(file);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} onClose={close} onClick={e=>{if(e.target===e.currentTarget)ref.current?.close();}} className="m-auto w-[min(900px,94vw)] rounded-xl border border-white/15 bg-[#11191d] p-5 text-white backdrop:bg-black/80" aria-label={`Video: ${name}`}>
    <div className="mb-4 flex items-start justify-between gap-4"><h2 className="min-w-0 break-words font-extrabold">{name}</h2><button autoFocus type="button" onClick={()=>ref.current?.close()} className="shrink-0 rounded-md bg-white/10 px-3 py-2 hover:bg-white/20" aria-label="Close video">Close ✕</button></div>
    {url && <video src={url} controls autoPlay playsInline onError={()=>setFailed(true)} className="max-h-[70vh] w-full rounded-lg bg-black"/>}
    {failed && <p role="alert" className="mt-3 text-red-300">This browser could not play this video. Try an MP4 encoded with H.264.</p>}
  </dialog>;
}
export function SelectedVideoPreview({file}:{file:File}) {
  const [thumbnail,setThumbnail]=useState(''),[open,setOpen]=useState(false);
  useEffect(()=>{let active=true;setThumbnail('');void videoThumbnail(file).then(value=>{if(active)setThumbnail(value);}).catch(()=>{});return()=>{active=false;};},[file]);
  return <div className="mt-4">
    <button type="button" onClick={()=>setOpen(true)} aria-label={`Watch ${file.name}`} className="group relative block w-full overflow-hidden rounded-lg border border-white/15 bg-black focus-visible:outline focus-visible:outline-orange-400">
      {thumbnail?<img src={thumbnail} alt={`Thumbnail of ${file.name}`} className="max-h-64 w-full object-contain"/>:<div className="grid h-40 place-items-center text-sm text-slate-400">Video preview</div>}
      <span className="absolute inset-0 grid place-items-center bg-black/15 group-hover:bg-black/30"><span className="grid h-12 w-12 place-items-center rounded-full bg-orange-600 text-xl text-white">▶</span></span>
    </button><p className="mt-2 text-xs text-slate-400">Click to watch video</p>
    {open && <VideoPlayer file={file} name={file.name} close={()=>setOpen(false)}/>}
  </div>;
}
export function SavedVideoCard({record}:{record:AnalysisRecord}) {
  const scope=accountScope(),[media,setMedia]=useState<StoredVideo|null>(null),[open,setOpen]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setMedia(null);setLoading(true);void loadVideo(scope,record.id).then(value=>{if(active)setMedia(value??null);}).catch(()=>{}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[scope,record.id]);
  async function reattach(file:File|undefined) {
    if(!file)return;setError('');
    if(file.size>50*1024*1024){setError('Choose a video under 50 MB.');return;}
    try {const value=await saveVideo(scope,record.id,file);setMedia(value);}catch{setError('Could not save this video preview. Try a playable MP4 and check available browser storage.');}
  }
  return <article className="min-w-0 rounded-xl border border-white/10 bg-[#11191d] p-4">
    <button type="button" disabled={loading} onClick={()=>setOpen(true)} aria-label={`Watch ${record.fileName}`} className="flex min-w-0 w-full items-center gap-4 text-left disabled:opacity-60">
      <span className="relative grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-orange-500/15">
        {media?.thumbnail && <img src={media.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover"/>}<span className="relative grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white">▶</span>
      </span>
      <span className="min-w-0 flex-1"><span className="block truncate font-extrabold text-white">{record.fileName}</span><span className="block text-sm text-slate-400">{record.analysisType === 'shooting'?'Shooting':'Dribbling'} analysis · {new Date(record.uploadedAt).toLocaleDateString()}</span><span className="block text-xs text-orange-300">{loading?'Loading preview…':media?'Click to watch':'Select original video to watch'}</span></span>
      <span className="shrink-0 text-sm font-bold text-orange-300">{record.score}</span>
    </button>
    {open && (media?<VideoPlayer file={media.file} name={record.fileName} close={()=>setOpen(false)}/>:<MissingVideo name={record.fileName} close={()=>setOpen(false)} choose={reattach} error={error}/>)}
  </article>;
}
function MissingVideo({name,close,choose,error}:{name:string;close:()=>void;choose:(file:File|undefined)=>Promise<void>;error:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} onClose={close} className="m-auto w-[min(500px,94vw)] rounded-xl border border-white/15 bg-[#11191d] p-5 text-white backdrop:bg-black/80" aria-label="Select original video">
    <h2 className="break-words font-extrabold">{name}</h2><p className="mt-3 text-sm text-slate-300">This video is not stored on this device. Select the original video to restore its thumbnail and playback. Videos stay in this browser; account history syncs the analysis summary.</p>
    <label className="mt-4 block text-sm text-orange-300">Original video<input type="file" accept="video/*" className="mt-2 block w-full text-sm" onChange={e=>void choose(e.target.files?.[0])}/></label>
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}<button autoFocus type="button" onClick={()=>ref.current?.close()} className="mt-5 rounded-md bg-white/10 px-4 py-2">Close</button>
  </dialog>;
}
