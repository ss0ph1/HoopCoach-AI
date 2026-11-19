import type { ShootingInsights as Insights } from "../analysis/shooting-insights.js";
const card="rounded-xl border border-white/10 bg-[#11191d] p-5";
const number=(v:number|null|undefined,unit:string)=>v==null?"Unknown":`${v}${unit}`;
export function ShootingInsightsPanel({insights}:{insights:Insights}) {
  const leg=insights.legDrive,alignment=insights.alignment,flight=insights.ballFlight;
  return <section className="col-span-full" aria-label="Angle-specific shooting observations">
    <h3 className="text-xl font-extrabold text-white">Angle-specific observations</h3>
    <p className="mt-2 text-sm text-slate-400">{insights.setup.view} view · sampled about every {insights.sampleIntervalSeconds.toFixed(2)} s. Observations are experimental and are not added to the check index.</p>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <article className={card}><h4 className="font-extrabold text-orange-300">Leg extension</h4><p className="mt-2 text-sm leading-6 text-slate-300">{leg.reason}</p>
        {leg.data && <dl className="mt-4 grid gap-3 text-sm">{[
          ["Tracked side",leg.data.side],["Knee extension",number(leg.data.kneeExtension,"°")],["Hip extension",number(leg.data.hipExtension,"°")],["Ankle angle change",number(leg.data.ankleChange,"°")],["Hip rise",number(leg.data.hipRiseTorsoLengths," torso lengths")],["Observed interval",number(leg.data.durationSeconds," s")]
        ].map(([label,value])=><div key={label}><dt className="text-slate-400">{label}</dt><dd className="font-bold text-white">{value}</dd></div>)}</dl>}
        <p className="mt-4 text-xs leading-5 text-slate-400">No force in newtons, muscle effort, power, or leg contribution percentage is measured.</p>
      </article>
      <article className={card}><h4 className="font-extrabold text-orange-300">Ball flight and relative arc height</h4><p className="mt-2 text-sm leading-6 text-slate-300">{flight.reason}</p>
        {flight.data && <>
          <svg viewBox={`0 0 ${flight.data.width} ${flight.data.height}`} className="mt-4 w-full rounded-lg border border-white/10 bg-black/30" role="img" aria-label="Observed ball centers and fitted two-dimensional flight curve">
            <polyline points={flight.data.curve.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke="#fb923c" strokeWidth="2"/>
            {flight.data.points.map(p=><circle key={p.time} cx={p.x} cy={p.y} r="2.5" fill="#86efac"/>)}
          </svg>
          <p className="mt-2 text-xs text-slate-400">Green: detected centers. Orange: fitted 2D path. Image coordinates.</p>
          <dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-slate-400">Rise above first tracked flight point</dt><dd className="font-bold text-white">{flight.data.riseFramePercent}% of frame height</dd></div><div><dt className="text-slate-400">Early visible flight angle (projected)</dt><dd className="font-bold text-white">{flight.data.earlyFlightAngle}°</dd></div><div><dt className="text-slate-400">Tracked flight detections</dt><dd className="font-bold text-white">{flight.data.points.length}</dd></div></dl>
        </>}
        <p className="mt-4 text-xs leading-5 text-slate-400">No absolute height in meters, 3D launch angle, entry angle or make/miss prediction is inferred without calibration and sufficient tracking.</p>
      </article>
      <article className={card}><h4 className="font-extrabold text-orange-300">2D joint alignment</h4><p className="mt-2 text-sm leading-6 text-slate-300">{alignment.reason}</p>
        {alignment.data && <>
          <svg viewBox={`0 0 ${500*alignment.data.aspect} 500`} className="mt-4 max-h-64 w-full rounded-lg border border-white/10 bg-black/30" role="img" aria-label="Observed hip knee and ankle positions with reference lines">
            {alignment.data.frame.map(leg=><g key={leg.side}>
              <line x1={leg.hip.x*500*alignment.data!.aspect} y1={leg.hip.y*500} x2={leg.ankle.x*500*alignment.data!.aspect} y2={leg.ankle.y*500} stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 4"/>
              <polyline points={[leg.hip,leg.knee,leg.ankle].map(p=>`${p.x*500*alignment.data!.aspect},${p.y*500}`).join(" ")} fill="none" stroke="#fb923c" strokeWidth="2"/>
              {[leg.hip,leg.knee,leg.ankle].map((p,i)=><circle key={i} cx={p.x*500*alignment.data!.aspect} cy={p.y*500} r="4" fill="#86efac"/>)}
            </g>)}
          </svg>
          <p className="mt-2 text-xs text-slate-400">Dots are observed joints; dashed lines connect hip to ankle. These are reference lines, not force vectors.</p>
          <dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-slate-400">Left knee offset</dt><dd className="font-bold text-white">{number(alignment.data.leftOffsetPercent,"% of projected leg length")}</dd></div><div><dt className="text-slate-400">Right knee offset</dt><dd className="font-bold text-white">{number(alignment.data.rightOffsetPercent,"% of projected leg length")}</dd></div></dl>
        </>}
      </article>
    </div>
  </section>;
}

export function AnalysisMethods() {
  return <details className="mt-6 rounded-xl border border-white/10 bg-[#11191d] p-5 text-sm text-slate-300"><summary className="cursor-pointer font-extrabold text-orange-300">Methods, evidence & limitations</summary>
    <div className="mt-4 space-y-3 leading-6">
      <p>We use MediaPipe body landmarks and image-plane geometry. Optional EfficientDet sports-ball detections support an experimental 2D track. Neither model validates our basketball coaching rules.</p>
      <p>The check index and good/needs-work thresholds are engineering heuristics, not a validated professional score. We have not validated the app against force plates, calibrated motion capture, or an expert-labeled basketball dataset. Added observations do not grade strength, effort, injury risk or shooting accuracy.</p>
      <p>Joint movement is not muscle force. Ball rise in image coordinates is not height in meters. Projected joint alignment is not a ground-reaction-force line. Camera perspective, motion blur, occlusion and sampling rate can make results unavailable.</p>
      <ul className="list-disc space-y-2 pl-5">
        <li><a className="text-orange-300 underline" href="https://arxiv.org/abs/2006.10204" target="_blank" rel="noreferrer">BlazePose (2020)</a> — background on body-keypoint estimation.</li>
        <li><a className="text-orange-300 underline" href="https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2023.1208915/full" target="_blank" rel="noreferrer">Free-throw biomechanics study (2023)</a> — research with a calibrated multi-camera system; its findings do not validate our single-camera estimates.</li>
        <li><a className="text-orange-300 underline" href="https://doi.org/10.2478/hukin-2014-0062" target="_blank" rel="noreferrer">Jump-shot biomechanics study (2014)</a> — force-plate and motion-analysis methods for lower-limb kinetics.</li>
        <li><a className="text-orange-300 underline" href="https://developers.google.com/edge/mediapipe/solutions/vision/object_detector" target="_blank" rel="noreferrer">MediaPipe Object Detector</a> — generic object detection, not a basketball-flight accuracy guarantee.</li>
      </ul>
      <p>Sources guide the choice of observations. This implementation and its cutoffs still require independent validation.</p>
    </div>
  </details>;
}
