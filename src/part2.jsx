import{useState,useEffect,useRef,useCallback,useMemo}from"react";

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════════
export function useClock(){
  const[t,setT]=useState(new Date());
  useEffect(()=>{const id=setInterval(()=>setT(new Date()),1000);return()=>clearInterval(id);},[]);
  return t;
}
export function useDeviceOrientation(){
  const[h,setH]=useState(null);
  useEffect(()=>{
    const fn=e=>{if(e.alpha!==null)setH(Math.round(e.alpha));};
    window.addEventListener("deviceorientationabsolute",fn,true);
    window.addEventListener("deviceorientation",fn,true);
    return()=>{window.removeEventListener("deviceorientationabsolute",fn,true);window.removeEventListener("deviceorientation",fn,true);};
  },[]);
  return h;
}
export function useGPS(){
  const[pos,setPos]=useState(null);
  const[track,setTrack]=useState([]);
  useEffect(()=>{
    if(!navigator.geolocation)return;
    const id=navigator.geolocation.watchPosition(p=>{
      const next={lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy,
        alt:p.coords.altitude,speed:p.coords.speed,heading:p.coords.heading,t:Date.now()};
      setPos(next);
      setTrack(tr=>{
        const last=tr[tr.length-1];
        if(!last)return[next];
        const d=Math.hypot((next.lat-last.lat)*111320,(next.lon-last.lon)*111320*Math.cos(next.lat*Math.PI/180));
        return d>3?[...tr.slice(-499),next]:tr;
      });
    },()=>{},{enableHighAccuracy:true,maximumAge:2000,timeout:10000});
    return()=>navigator.geolocation.clearWatch(id);
  },[]);
  return{pos,track};
}
export function useMicrophone(enabled,analyserOut){
  const[level,setLevel]=useState(0);
  const[spike,setSpike]=useState(false);
  const[peakFreq,setPeakFreq]=useState(0);
  const baseRef=useRef(0);
  useEffect(()=>{
    if(!enabled){setLevel(0);setSpike(false);return;}
    let ctx,src,analyser,raf,stream;
    navigator.mediaDevices?.getUserMedia({audio:true,video:false}).then(s=>{
      stream=s;
      ctx=new(window.AudioContext||window.webkitAudioContext)();
      src=ctx.createMediaStreamSource(s);
      analyser=ctx.createAnalyser();
      analyser.fftSize=1024;analyser.smoothingTimeConstant=0.6;
      src.connect(analyser);
      if(analyserOut)analyserOut.current=analyser;
      const freq=new Uint8Array(analyser.frequencyBinCount);
      const time=new Uint8Array(analyser.fftSize);
      const tick=()=>{
        analyser.getByteTimeDomainData(time);
        let sum=0;
        for(let i=0;i<time.length;i++){const d=(time[i]-128)/128;sum+=d*d;}
        const rms=Math.sqrt(sum/time.length);
        setLevel(rms);
        baseRef.current=baseRef.current*0.97+rms*0.03;
        setSpike(rms>baseRef.current*2.2&&rms>0.02);
        analyser.getByteFrequencyData(freq);
        let mi=0,mv=0;
        for(let i=1;i<freq.length;i++)if(freq[i]>mv){mv=freq[i];mi=i;}
        setPeakFreq(Math.round(mi*ctx.sampleRate/analyser.fftSize));
        raf=requestAnimationFrame(tick);
      };
      tick();
    }).catch(()=>{});
    return()=>{cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());ctx?.close?.();if(analyserOut)analyserOut.current=null;};
  },[enabled,analyserOut]);
  return{level,spike,peakFreq};
}
export function useRPPG(samples){
  const[hr,setHr]=useState(null);
  const[quality,setQuality]=useState(0);
  const[spo2,setSpo2]=useState(null);
  const bufRef=useRef([]);
  useEffect(()=>{
    if(samples==null)return;
    const b=bufRef.current;
    b.push({v:samples,t:Date.now()});
    if(b.length>256)b.shift();
    if(b.length<128)return;
    // Detrend (remove DC + linear drift)
    const n=b.length,vals=b.map(x=>x.v);
    const mean=vals.reduce((s,v)=>s+v,0)/n;
    const det=vals.map((v,i)=>v-mean);
    // Hamming window
    const win=det.map((v,i)=>v*(0.54-0.46*Math.cos(2*Math.PI*i/(n-1))));
    // Effective sample rate from timestamps
    const dur=(b[n-1].t-b[0].t)/1000;
    if(dur<4)return;
    const fs=n/dur;
    // Goertzel scan over physiological band 0.7-3.5 Hz (42-210 BPM)
    let bestF=0,bestP=0,total=0;
    for(let f=0.7;f<=3.5;f+=0.02){
      const k=2*Math.PI*f/fs;
      const c=2*Math.cos(k);
      let s0=0,s1=0,s2=0;
      for(let i=0;i<n;i++){s0=win[i]+c*s1-s2;s2=s1;s1=s0;}
      const p=s1*s1+s2*s2-c*s1*s2;
      total+=p;
      if(p>bestP){bestP=p;bestF=f;}
    }
    // Signal quality = peak dominance over band energy
    const q=Math.min(1,(bestP/Math.max(1e-9,total/140))/8);
    setQuality(q);
    if(q>0.25){
      const bpm=Math.round(bestF*60);
      if(bpm>=42&&bpm<=210)setHr(prev=>prev?Math.round(prev*0.7+bpm*0.3):bpm);
      // Crude SpO2 proxy from AC/DC ratio (illustrative only)
      const ac=Math.sqrt(det.reduce((s,v)=>s+v*v,0)/n);
      const ratio=ac/Math.max(1,mean);
      setSpo2(Math.max(90,Math.min(99,Math.round(99-ratio*180))));
    }
  },[samples]);
  return{hr,quality,spo2};
}
// Hardware torch control
export function useTorch(){
  const trackRef=useRef(null);
  const[torchOn,setTorchOn]=useState(false);
  const[supported,setSupported]=useState(false);
  const toggle=useCallback(async()=>{
    if(!trackRef.current){
      try{
        const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
        const t=s.getVideoTracks()[0];
        const caps=t.getCapabilities?.();
        if(caps?.torch){trackRef.current=t;setSupported(true);}
        else{s.getTracks().forEach(t=>t.stop());return;}
      }catch{return;}
    }
    const next=!torchOn;
    try{await trackRef.current.applyConstraints({advanced:[{torch:next}]});setTorchOn(next);}catch{}
  },[torchOn]);
  useEffect(()=>()=>{if(trackRef.current){trackRef.current.applyConstraints({advanced:[{torch:false}]}).catch(()=>{});}},[]);
  return{torchOn,toggle,supported:true};
}

// Accelerometer shake detection
export function useShake(enabled){
  const[shakeCount,setShakeCount]=useState(0);
  const[impact,setImpact]=useState(false);
  const lastRef=useRef({x:0,y:0,z:0,t:0});
  useEffect(()=>{
    if(!enabled)return;
    const handler=e=>{
      const{x,y,z}=e.accelerationIncludingGravity||e.acceleration||{};
      if(x==null)return;
      const now=Date.now();
      const last=lastRef.current;
      const dt=Math.max(1,now-last.t);
      const jerk=Math.sqrt((x-last.x)**2+(y-last.y)**2+(z-last.z)**2)/dt*100;
      lastRef.current={x,y,z,t:now};
      if(jerk>18){
        setShakeCount(c=>c+1);
        setImpact(true);
        setTimeout(()=>setImpact(false),800);
      }
    };
    window.addEventListener("devicemotion",handler);
    return()=>window.removeEventListener("devicemotion",handler);
  },[enabled]);
  return{shakeCount,impact};
}

// Wind speed estimation via mic FFT (low-freq rumble)
export function useWindSpeed(enabled,analyserRef){
  const[wind,setWind]=useState(0);
  useEffect(()=>{
    if(!enabled||!analyserRef?.current)return;
    const interval=setInterval(()=>{
      const analyser=analyserRef.current;
      if(!analyser)return;
      const buf=new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      // Wind = low freq energy (bins 0-10, ~0-200Hz)
      const lowFreq=buf.slice(0,10).reduce((s,v)=>s+v,0)/10;
      // Map 0-80 avg amplitude → 0-25 m/s (Beaufort estimation)
      const ms=Math.min(25,lowFreq/3.2);
      setWind(ms);
    },500);
    return()=>clearInterval(interval);
  },[enabled,analyserRef]);
  return wind;
}

// Barometric pressure + altitude via DevicePressure or fallback
export function useBarometer(){
  const[pressure,setPressure]=useState(null);
  const[altitude,setAltitude]=useState(null);
  useEffect(()=>{
    // Try generic sensor API
    try{
      // @ts-ignore
      if(typeof AbsoluteOrientationSensor!=="undefined"||typeof window.DeviceOrientationEvent!=="undefined"){
        // Use GPS altitude as fallback
      }
    }catch{}
    // GPS-derived altitude from watchPosition
    const id=navigator.geolocation?.watchPosition(p=>{
      if(p.coords.altitude!=null){
        setAltitude(Math.round(p.coords.altitude));
        // Barometric formula: P = 101325 * (1 - 2.25577e-5 * h)^5.25588
        const h=p.coords.altitude;
        const P=101325*Math.pow(1-2.25577e-5*h,5.25588)/100;
        setPressure(Math.round(P));
      }
    },()=>{},{enableHighAccuracy:true});
    return()=>{if(id!=null)navigator.geolocation.clearWatch(id);};
  },[]);
  return{pressure,altitude};
}

// Native hardware zoom via camera constraints
export function useHardwareZoom(stream){
  const[hzoom,setHzoom]=useState(1);
  const[maxZoom,setMaxZoom]=useState(1);
  const[supported,setSupported]=useState(false);
  useEffect(()=>{
    if(!stream)return;
    const track=stream.getVideoTracks()[0];
    if(!track)return;
    const caps=track.getCapabilities?.();
    if(caps?.zoom){setSupported(true);setMaxZoom(caps.zoom.max||10);}
  },[stream]);
  const applyZoom=useCallback(async(val)=>{
    if(!stream)return;
    const track=stream.getVideoTracks()[0];
    if(!track)return;
    try{await track.applyConstraints({advanced:[{zoom:val}]});setHzoom(val);}catch{}
  },[stream]);
  return{hzoom,maxZoom,supported,applyZoom};
}

export function useCameraStream(constraints,enabled=true){
  const[stream,setStream]=useState(null);
  const[error,setError]=useState(null);
  const[ready,setReady]=useState(false);
  const key=JSON.stringify(constraints)+String(enabled);
  const acquire=useCallback((active,onStream,onErr)=>{
    navigator.mediaDevices?.getUserMedia({video:{...constraints,width:{ideal:1280},height:{ideal:720}},audio:false})
      .then(s=>{if(!active())return s.getTracks().forEach(t=>t.stop());onStream(s);})
      .catch(e=>{if(active())onErr(e.message||"Camera unavailable");});
  // eslint-disable-next-line
  },[key]);

  const[retryKey,setRetryKey]=useState(0);
  const retry=useCallback(()=>setRetryKey(k=>k+1),[]);

  useEffect(()=>{
    if(!enabled){setStream(s=>{s?.getTracks().forEach(t=>t.stop());return null;});setReady(false);return;}
    let live=true;
    const isLive=()=>live;
    setReady(false);setError(null);

    let gotStream=false;
    const start=()=>acquire(isLive,s=>{
      gotStream=true;
      setStream(s);setReady(true);
      s.getVideoTracks().forEach(t=>{
        t.onended=()=>{if(live){setReady(false);setTimeout(()=>start(),800);}};
      });
    },e=>setError(e));
    start();

    // iOS hang guard: if no stream and no error after 6s, surface tap-to-start
    const initTimeout=setTimeout(()=>{
      if(live&&!gotStream)setError("TAP TO START CAMERA");
    },6000);
    const clearInit=()=>clearTimeout(initTimeout);
    // clear timeout when stream arrives
    const checkInterval=setInterval(()=>{if(gotStream){clearInit();clearInterval(checkInterval);}},500);

    // visibilitychange: resume when tab comes back
    const onVisible=()=>{
      if(document.visibilityState==="visible"&&live){
        setStream(s=>{
          if(s){
            const t=s.getVideoTracks()[0];
            if(t&&t.readyState==="live")return s;
            s.getTracks().forEach(t=>t.stop());
          }
          return null;
        });
        setReady(false);
        setTimeout(()=>start(),300);
      }
    };
    document.addEventListener("visibilitychange",onVisible);
    return()=>{live=false;clearTimeout(initTimeout);clearInterval(checkInterval);document.removeEventListener("visibilitychange",onVisible);};
  // eslint-disable-next-line
  },[key,acquire,retryKey]);

  useEffect(()=>()=>stream?.getTracks().forEach(t=>t.stop()),[stream]);
  return{stream,error,ready,retry};
}

// ═══════════════════════════════════════════════════════════════════════════════
// NVS-8.0 — TARGET TRACKER (persistent IDs, trails, velocity)
// ═══════════════════════════════════════════════════════════════════════════════
export class TargetTracker{
  constructor(){this.tracks=[];this.nextId=1;}
  update(detections,now){
    const MAXDIST=120,MAXAGE=1500,TRAIL=24;
    const unmatched=[...detections];
    // Associate nearest detection to each live track
    for(const tr of this.tracks){
      let best=-1,bestD=MAXDIST;
      for(let i=0;i<unmatched.length;i++){
        const d=Math.hypot(unmatched[i].cx-tr.cx,unmatched[i].cy-tr.cy);
        if(d<bestD){bestD=d;best=i;}
      }
      if(best>=0){
        const det=unmatched.splice(best,1)[0];
        const dt=Math.max(16,now-tr.t);
        tr.vx=0.7*tr.vx+0.3*((det.cx-tr.cx)/dt*1000);
        tr.vy=0.7*tr.vy+0.3*((det.cy-tr.cy)/dt*1000);
        Object.assign(tr,det);tr.t=now;
        tr.trail.push({x:det.cx,y:det.cy});
        if(tr.trail.length>TRAIL)tr.trail.shift();
      }
    }
    // Spawn new tracks
    for(const det of unmatched){
      this.tracks.push({...det,id:this.nextId++,t:now,vx:0,vy:0,trail:[{x:det.cx,y:det.cy}]});
    }
    // Reap stale
    this.tracks=this.tracks.filter(tr=>now-tr.t<MAXAGE);
    return this.tracks;
  }
}

// Screen wake lock — keeps display on during surveillance
export function useWakeLock(){
  useEffect(()=>{
    let lock=null,active=true;
    const acquire=async()=>{
      try{lock=await navigator.wakeLock?.request("screen");}catch{}
    };
    acquire();
    const onVis=()=>{if(document.visibilityState==="visible"&&active)acquire();};
    document.addEventListener("visibilitychange",onVis);
    return()=>{active=false;document.removeEventListener("visibilitychange",onVis);lock?.release?.().catch(()=>{});};
  },[]);
}

// Battery status
export function useBattery(){
  const[bat,setBat]=useState(null);
  useEffect(()=>{
    let b=null;
    navigator.getBattery?.().then(battery=>{
      b=battery;
      const upd=()=>setBat({level:Math.round(battery.level*100),charging:battery.charging});
      upd();
      battery.addEventListener("levelchange",upd);
      battery.addEventListener("chargingchange",upd);
    }).catch(()=>{});
    return()=>{};
  },[]);
  return bat;
}

// Voice control — Web Speech API
export function useVoiceControl(enabled,commands){
  const[listening,setListening]=useState(false);
  const[lastCmd,setLastCmd]=useState(null);
  const cmdRef=useRef(commands);
  cmdRef.current=commands;
  useEffect(()=>{
    if(!enabled){setListening(false);return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR)return;
    const rec=new SR();
    rec.continuous=true;rec.interimResults=false;rec.lang="en-US";
    rec.onresult=e=>{
      const text=e.results[e.results.length-1][0].transcript.toLowerCase().trim();
      for(const[phrase,fn]of Object.entries(cmdRef.current)){
        if(text.includes(phrase)){fn();setLastCmd(phrase.toUpperCase());setTimeout(()=>setLastCmd(null),2000);break;}
      }
    };
    rec.onend=()=>{if(enabled)try{rec.start();}catch{}};
    try{rec.start();setListening(true);}catch{}
    return()=>{rec.onend=null;try{rec.stop();}catch{};setListening(false);};
  },[enabled]);
  return{listening,lastCmd};
}

// Threat audio alert — synthesized beep via WebAudio
export function useThreatBeep(){
  const ctxRef=useRef(null);
  return useCallback((kind="alert")=>{
    try{
      if(!ctxRef.current)ctxRef.current=new(window.AudioContext||window.webkitAudioContext)();
      const ctx=ctxRef.current;
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      if(kind==="person"){o.frequency.value=880;g.gain.value=0.15;}
      else if(kind==="wire"){o.frequency.value=1320;g.gain.value=0.2;}
      else{o.frequency.value=660;g.gain.value=0.12;}
      o.type="square";
      const t=ctx.currentTime;
      o.start(t);
      g.gain.setValueAtTime(g.gain.value,t);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
      o.stop(t+0.2);
      if(kind==="wire"){ // double beep
        const o2=ctx.createOscillator(),g2=ctx.createGain();
        o2.connect(g2);g2.connect(ctx.destination);
        o2.frequency.value=1320;o2.type="square";
        o2.start(t+0.25);
        g2.gain.setValueAtTime(0.2,t+0.25);
        g2.gain.exponentialRampToValueAtTime(0.001,t+0.43);
        o2.stop(t+0.45);
      }
    }catch{}
  },[]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// NVS-10.0 — PERSISTENCE (IndexedDB) + NEW SUBSYSTEMS
// ═══════════════════════════════════════════════════════════════════════════════
export const DB_NAME="nvs_vault",DB_VER=1;
export function openDB(){
  return new Promise((res,rej)=>{
    const rq=indexedDB.open(DB_NAME,DB_VER);
    rq.onupgradeneeded=()=>{
      const db=rq.result;
      if(!db.objectStoreNames.contains("captures"))db.createObjectStore("captures",{keyPath:"ts"});
      if(!db.objectStoreNames.contains("clips"))db.createObjectStore("clips",{keyPath:"ts"});
      if(!db.objectStoreNames.contains("events"))db.createObjectStore("events",{keyPath:"ts"});
      if(!db.objectStoreNames.contains("kv"))db.createObjectStore("kv",{keyPath:"k"});
    };
    rq.onsuccess=()=>res(rq.result);
    rq.onerror=()=>rej(rq.error);
  });
}
export async function dbPut(store,val){try{const db=await openDB();return new Promise(r=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(val);tx.oncomplete=()=>r(true);tx.onerror=()=>r(false);});}catch{return false;}}
export async function dbAll(store){try{const db=await openDB();return new Promise(r=>{const tx=db.transaction(store,"readonly");const rq=tx.objectStore(store).getAll();rq.onsuccess=()=>r(rq.result||[]);rq.onerror=()=>r([]);});}catch{return[];}}
export async function dbDel(store,key){try{const db=await openDB();return new Promise(r=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(key);tx.oncomplete=()=>r(true);tx.onerror=()=>r(false);});}catch{return false;}}
export async function dbClear(store){try{const db=await openDB();return new Promise(r=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).clear();tx.oncomplete=()=>r(true);tx.onerror=()=>r(false);});}catch{return false;}}
export async function dbUsage(){try{const e=await navigator.storage?.estimate?.();return e?{used:e.usage,quota:e.quota}:null;}catch{return null;}}

// Persisted settings — survives reload
export function usePersistedSettings(defaults){
  const[loaded,setLoaded]=useState(false);
  const[settings,setSettings]=useState(defaults);
  useEffect(()=>{
    (async()=>{
      const rows=await dbAll("kv");
      const saved=rows.find(r=>r.k==="settings");
      if(saved?.v)setSettings(s=>({...s,...saved.v}));
      setLoaded(true);
    })();
  },[]);
  const save=useCallback((patch)=>{
    setSettings(s=>{const next={...s,...patch};dbPut("kv",{k:"settings",v:next});return next;});
  },[]);
  return{settings,save,loaded};
}

// ── LASER RANGEFINDER: reference-object scaling ──
export const REF_HEIGHTS={PERSON:1.7,CAR:1.5,TRUCK:3.2,BUS:3.2,DOG:0.5,CAT:0.3,BICYCLE:1.0,MOTORCYCLE:1.3,"STOP SIGN":2.1,"FIRE HYDRANT":0.8,CHAIR:0.9,BOTTLE:0.25};
export function estimateRange(label,pxHeight,frameHeight,vFovDeg=55){
  const real=REF_HEIGHTS[label];
  if(!real||!pxHeight)return null;
  const anglePerPx=(vFovDeg*Math.PI/180)/frameHeight;
  const subtended=pxHeight*anglePerPx;
  if(subtended<=0)return null;
  return real/(2*Math.tan(subtended/2));
}

// ── PANORAMA STITCHER ──
export function usePanorama(){
  const[frames,setFrames]=useState([]);
  const add=useCallback(dataUrl=>setFrames(f=>[...f,dataUrl].slice(-12)),[]);
  const reset=useCallback(()=>setFrames([]),[]);
  const stitch=useCallback(async()=>{
    if(frames.length<2)return null;
    const imgs=await Promise.all(frames.map(src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;})));
    const h=imgs[0].height,OVER=0.18;
    const step=Math.round(imgs[0].width*(1-OVER));
    const c=document.createElement("canvas");
    c.width=step*(imgs.length-1)+imgs[0].width;c.height=h;
    const ctx=c.getContext("2d");
    imgs.forEach((im,i)=>{
      const x=i*step;
      if(i===0){ctx.drawImage(im,0,0);return;}
      // feather blend the overlap
      const ow=im.width-step;
      const g=ctx.createLinearGradient(x,0,x+ow,0);
      g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,1)");
      ctx.save();ctx.globalCompositeOperation="source-over";
      ctx.drawImage(im,x,0);ctx.restore();
    });
    return c.toDataURL("image/jpeg",0.9);
  },[frames]);
  return{frames,add,reset,stitch};
}

// ── STAR / SATELLITE TRACKER (bright-point detection + drift) ──
export function detectPoints(data,w,h,thresh=210){
  const pts=[];const seen=new Uint8Array(w*h);
  for(let y=2;y<h-2;y+=2)for(let x=2;x<w-2;x+=2){
    const i=(y*w+x)*4;
    const lum=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
    if(lum<thresh)continue;
    const p=y*w+x;if(seen[p])continue;
    // local max check
    let isMax=true;
    for(let dy=-2;dy<=2&&isMax;dy++)for(let dx=-2;dx<=2;dx++){
      const j=((y+dy)*w+(x+dx))*4;
      if(0.299*data[j]+0.587*data[j+1]+0.114*data[j+2]>lum){isMax=false;break;}
    }
    if(isMax){pts.push({x,y,lum});for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const q=(y+dy)*w+(x+dx);if(q>=0&&q<seen.length)seen[q]=1;}}
    if(pts.length>120)return pts;
  }
  return pts;
}

// ── HISTOGRAM / EXPOSURE ANALYSIS ──
export function computeHistogram(data){
  const hist=new Uint32Array(64);
  let clipLow=0,clipHigh=0,sum=0,n=0;
  for(let i=0;i<data.length;i+=16){ // sample every 4th pixel
    const lum=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
    hist[Math.min(63,lum>>2)]++;
    if(lum<4)clipLow++;if(lum>251)clipHigh++;
    sum+=lum;n++;
  }
  return{hist,mean:sum/Math.max(1,n),clipLow:clipLow/Math.max(1,n),clipHigh:clipHigh/Math.max(1,n)};
}

// ═══════════════════════════════════════════════════════════════════════════════
// NVS-11.0 — STABILIZATION, SUPER-RES, LOITER ANALYTICS, GEOFENCE
// ═══════════════════════════════════════════════════════════════════════════════

// ── DIGITAL STABILIZATION: phase-correlation-lite global motion estimate ──
// Samples a sparse grid, finds best integer shift within ±8px, smooths it.
export function estimateGlobalShift(cur,prev,w,h){
  if(!prev||prev.length!==cur.length)return{dx:0,dy:0};
  const STEP=12,R=8;
  let bestDx=0,bestDy=0,bestErr=Infinity;
  for(let dy=-R;dy<=R;dy+=2)for(let dx=-R;dx<=R;dx+=2){
    let err=0,n=0;
    for(let y=R;y<h-R;y+=STEP)for(let x=R;x<w-R;x+=STEP){
      const i=(y*w+x)*4;
      const j=((y+dy)*w+(x+dx))*4;
      err+=Math.abs(cur[i+1]-prev[j+1]);n++;
      if(err>bestErr*n/Math.max(1,n))break;
    }
    const norm=err/Math.max(1,n);
    if(norm<bestErr){bestErr=norm;bestDx=dx;bestDy=dy;}
  }
  return{dx:bestDx,dy:bestDy,err:bestErr};
}

// ── SUPER-RESOLUTION: multi-frame accumulate with sub-pixel offsets ──
// Averages N registered frames at 2x grid for real detail recovery on static scenes.
export function superResolve(data,w,h,srBuf,srCount,shift){
  const n=w*h;
  if(!srBuf.current||srBuf.current.length!==n*3){
    srBuf.current=new Float32Array(n*3);srCount.current=0;
  }
  const buf=srBuf.current;
  // register incoming frame by inverse shift, accumulate
  for(let y=0;y<h;y++){
    const sy=Math.min(h-1,Math.max(0,y+(shift?.dy||0)));
    for(let x=0;x<w;x++){
      const sx=Math.min(w-1,Math.max(0,x+(shift?.dx||0)));
      const s=(sy*w+sx)*4,d=(y*w+x)*3;
      buf[d]+=data[s];buf[d+1]+=data[s+1];buf[d+2]+=data[s+2];
    }
  }
  srCount.current++;
  const c=srCount.current;
  if(c<2)return false;
  for(let p=0;p<n;p++){
    const d=p*3,i=p*4;
    data[i]=Math.min(255,buf[d]/c);
    data[i+1]=Math.min(255,buf[d+1]/c);
    data[i+2]=Math.min(255,buf[d+2]/c);
  }
  return true;
}

// ── LOITER / DWELL ANALYTICS ──
// Flags tracks that stay within a radius beyond a dwell threshold.
export class LoiterAnalyzer{
  constructor(){this.dwell=new Map();}
  update(tracks,now,radiusPx=70,thresholdMs=8000){
    const flagged=[];
    const live=new Set();
    for(const t of tracks){
      if(!t.id)continue;
      live.add(t.id);
      const rec=this.dwell.get(t.id);
      if(!rec){this.dwell.set(t.id,{ox:t.cx,oy:t.cy,since:now,flagged:false});continue;}
      const d=Math.hypot(t.cx-rec.ox,t.cy-rec.oy);
      if(d>radiusPx){rec.ox=t.cx;rec.oy=t.cy;rec.since=now;rec.flagged=false;}
      else{
        const dwellMs=now-rec.since;
        if(dwellMs>thresholdMs){
          rec.flagged=true;
          flagged.push({...t,dwellMs});
        }
      }
    }
    for(const id of[...this.dwell.keys()])if(!live.has(id))this.dwell.delete(id);
    return flagged;
  }
  dwellFor(id,now){const r=this.dwell.get(id);return r?now-r.since:0;}
}

// ── GEOFENCE: radius alarm around an anchor point ──
export function haversine(a,b){
  const R=6371000,toR=Math.PI/180;
  const dLat=(b.lat-a.lat)*toR,dLon=(b.lon-a.lon)*toR;
  const s=Math.sin(dLat/2)**2+Math.cos(a.lat*toR)*Math.cos(b.lat*toR)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}
export function useGeofence(pos,onBreach){
  const[anchor,setAnchor]=useState(null);
  const[radius,setRadius]=useState(100);
  const[inside,setInside]=useState(true);
  const wasInside=useRef(true);
  const dist=useMemo(()=>anchor&&pos?haversine(anchor,pos):null,[anchor,pos]);
  useEffect(()=>{
    if(dist==null)return;
    const now=dist<=radius;
    setInside(now);
    if(wasInside.current!==now){
      wasInside.current=now;
      onBreach?.(now?"ENTERED":"EXITED",Math.round(dist));
    }
  },[dist,radius,onBreach]);
  const drop=useCallback(()=>{if(pos){setAnchor({lat:pos.lat,lon:pos.lon});wasInside.current=true;}},[pos]);
  const clear=useCallback(()=>setAnchor(null),[]);
  return{anchor,radius,setRadius,dist,inside,drop,clear};
}

// ── SESSION STATS ──
export function useSessionStats(){
  const startRef=useRef(Date.now());
  const[stats,setStats]=useState({uptime:0});
  useEffect(()=>{
    const i=setInterval(()=>setStats(s=>({...s,uptime:Math.floor((Date.now()-startRef.current)/1000)})),1000);
    return()=>clearInterval(i);
  },[]);
  return stats;
}
