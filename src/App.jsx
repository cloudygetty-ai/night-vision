import{useState,useEffect,useRef,useCallback,useMemo}from"react";
import{useTFDetector}from"./part1.jsx";
import{
  useClock,useDeviceOrientation,useGPS,useMicrophone,useRPPG,useTorch,useShake,
  useWindSpeed,useBarometer,useHardwareZoom,useCameraStream,useWakeLock,useBattery,
  useVoiceControl,useThreatBeep,dbAll,dbClear,dbPut,dbDel,dbUsage,useGeofence,useSessionStats,
  usePanorama,watermarkCapture,hashDataUrl,useTimelapse,shareCapture,useOnline,
}from"./part2.jsx";
import{useMultiSync,useTimeline,genCastCode,useCastBroadcast}from"./part3.jsx";
import{GPSMap,TimelineModal,TripwireEditor,InstructionsModal,BiometricHUD,CastModal}from"./part4.jsx";
import{CameraPanel,SignalBars}from"./part5.jsx";
import{StatusStrip,ModeWheel,ShutterBar,Sheet,Row,Tile,Slider,GroupTitle,glass}from"./part7.jsx";
import{MODE_META,MODE_KEYS,ZOOM_STEPS,PEER_ID,Bezel,SectionLabel,BootSequence}from"./part6.jsx";

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function NightVisionCamera(){
  const[booted,setBooted]=useState(false);
  const[q,setQ]=useState("");
  const[sheet,setSheet]=useState(false);
  const[sheetTab,setSheetTab]=useState("vision");
  const[stampOn,setStampOn]=useState(true);
  const[dualLayout,setDualLayout]=useState("pip");
  const[primaryCam,setPrimaryCam]=useState("rear");
  const[openGroups,setOpenGroups]=useState({vision:true,detect:true,alert:true,system:true});
  const cycleMode=useCallback(d=>setMode(m=>{
    const i=MODE_KEYS.indexOf(m);
    return MODE_KEYS[(i+d+MODE_KEYS.length)%MODE_KEYS.length];
  }),[]);
  const[activePreset,setActivePreset]=useState(null);
  const[stealth,setStealth]=useState(false);
  const[redUI,setRedUI]=useState(false);

  const bumpGain=useCallback(d=>setBrightness(b=>Math.max(-1.5,Math.min(1.5,b+d*0.375))),[]);
  const[mode,setMode]=useState("NVG");
  const[zoom,setZoom]=useState(1);
  const[brightness,setBrightness]=useState(0);
  const[sensitivity,setSensitivity]=useState(0.6);
  const[edgeOverlay,setEdgeOverlay]=useState(false);
  const[noiseReduction,setNoiseReduction]=useState(true);
  const[motionEnabled,setMotionEnabled]=useState(true);
  const[autoCapture,setAutoCapture]=useState(false);
  const[showReticle,setShowReticle]=useState(true);
  const[dualMode,setDualMode]=useState(false);
  const[recording,setRecording]=useState(false);
  const[captures,setCaptures]=useState([]);
  const[clips,setClips]=useState([]);
  const[vaultOn,setVaultOn]=useState(true);
  const[storageInfo,setStorageInfo]=useState(null);

  useEffect(()=>{(async()=>{
    const[cap,cl]=await Promise.all([dbAll("captures"),dbAll("clips")]);
    if(cap.length)setCaptures(cap.sort((a,b)=>b.ts-a.ts).slice(0,200));
    if(cl.length)setClips(cl.sort((a,b)=>b.ts-a.ts));
    setStorageInfo(await dbUsage());
    try{await navigator.storage?.persist?.();}catch{}
  })();},[]);

  const clearGallery=useCallback(()=>{setCaptures([]);dbClear("captures");},[]);
  const clearClips=useCallback(()=>{setClips([]);dbClear("clips");},[]);
  const downloadAll=useCallback(()=>{captures.forEach((c,i)=>setTimeout(()=>{const a=document.createElement('a');a.href=c.url;a.download=`nvs-${c.ts}.png`;a.click();},i*250));},[captures]);
  const[tripwires,setTripwires]=useState([]);
  const[showRPPG,setShowRPPG]=useState(false);
  const[audioEnabled,setAudioEnabled]=useState(false);
  const[multiSync,setMultiSync]=useState(false);
  const[castOn,setCastOn]=useState(false);
  const[castCode,setCastCode]=useState(null);
  const[modal,setModal]=useState(null);
  const[rppgSample,setRppgSample]=useState(0);
  const[faceDetect,setFaceDetect]=useState(false);
  const[faces,setFaces]=useState([]);
  const[shakeEnabled,setShakeEnabled]=useState(false);
  const[hardZoom,setHardZoom]=useState(false);
  const[burstMode,setBurstMode]=useState(false);
  const[qrResult,setQrResult]=useState(null);
  const mediaRecRef=useRef(null);
  const micAnalyserRef=useRef(null);

  const clock=useClock();
  const heading=useDeviceOrientation();
  const{pos:gps,track:gpsTrack}=useGPS();
  const{level:audioLevel,spike:audioSpike,peakFreq}=useMicrophone(audioEnabled,micAnalyserRef);
  const{hr,quality:hrQ,spo2}=useRPPG(showRPPG?rppgSample:null);
  const{peers,alerts:syncAlerts,broadcast}=useMultiSync(multiSync,PEER_ID);
  const{viewers:castViewers,status:castStatus}=useCastBroadcast(castOn,castCode);
  const startCast=useCallback(()=>{setCastCode(genCastCode());setCastOn(true);},[]);
  const stopCast=useCallback(()=>setCastOn(false),[]);
  const{events,add:addEvent}=useTimeline();

  const applyPreset=useCallback(name=>{
    const P={
      SURVEIL:{mode:"NVG",brightness:1.125,sensitivity:0.7,motionEnabled:true,autoCapture:true,
        sentryOn:true,alertsOn:true,heatmapOn:true,stabOn:true,noiseReduction:true,
        edgeOverlay:false,srOn:false,starsOn:false,showRPPG:false,zoom:1},
      RECON:{mode:"TACT",brightness:0,sensitivity:0.5,motionEnabled:true,autoCapture:false,
        sentryOn:false,alertsOn:false,heatmapOn:false,stabOn:true,noiseReduction:false,
        edgeOverlay:true,srOn:false,starsOn:false,showRPPG:false,zoom:2},
      ASTRO:{mode:"ASTRO",brightness:1.5,sensitivity:0.3,motionEnabled:false,autoCapture:false,
        sentryOn:false,alertsOn:false,heatmapOn:false,stabOn:true,noiseReduction:true,
        edgeOverlay:false,srOn:true,starsOn:true,showRPPG:false,zoom:1},
      SEARCH:{mode:"WHITE",brightness:0.75,sensitivity:0.8,motionEnabled:true,autoCapture:true,
        sentryOn:false,alertsOn:true,heatmapOn:false,stabOn:true,noiseReduction:true,
        edgeOverlay:true,srOn:false,starsOn:false,showRPPG:false,zoom:1},
    }[name];
    if(!P)return;
    setMode(P.mode);setBrightness(P.brightness);setSensitivity(P.sensitivity);
    setMotionEnabled(P.motionEnabled);setAutoCapture(P.autoCapture);setSentryOn(P.sentryOn);
    setAlertsOn(P.alertsOn);setHeatmapOn(P.heatmapOn);setStabOn(P.stabOn);
    setNoiseReduction(P.noiseReduction);setEdgeOverlay(P.edgeOverlay);setSrOn(P.srOn);
    setStarsOn(P.starsOn);setShowRPPG(P.showRPPG);setZoom(P.zoom);
    setActivePreset(name);
    addEvent("preset",{label:`PRESET LOADED — ${name}`,icon:"⚡"});
  },[addEvent]);
  useEffect(()=>{ // hydrate events from vault once
    (async()=>{const ev=await dbAll("events");
      if(ev.length)ev.sort((a,b)=>b.ts-a.ts).slice(0,200).forEach(e=>addEvent(e.type,e.data,e.ts));
    })();
  // eslint-disable-next-line
  },[]);
  const{torchOn,toggle:toggleTorch}=useTorch();
  const{shakeCount,impact:shakeImpact}=useShake(shakeEnabled);
  const wind=useWindSpeed(audioEnabled,micAnalyserRef);
  const{pressure,altitude}=useBarometer();

  const rear=useCameraStream({facingMode:"environment"},true);
  const front=useCameraStream({facingMode:"user"},dualMode);
  const{hzoom,maxZoom,supported:hzoomSupported,applyZoom}=useHardwareZoom(hardZoom?rear.stream:null);
  const{detect:tfDetect,modelReady}=useTFDetector(motionEnabled);
  useWakeLock();
  const battery=useBattery();
  const beep=useThreatBeep();
  const[voiceOn,setVoiceOn]=useState(false);
  const[sentryOn,setSentryOn]=useState(false);
  const[heatmapOn,setHeatmapOn]=useState(false);
  const[blobsCount,setBlobsCount]=useState(0);
  const[starsOn,setStarsOn]=useState(false);
  const[showHist,setShowHist]=useState(false);
  const pano=usePanorama();
  const[stabOn,setStabOn]=useState(false);
  const[srOn,setSrOn]=useState(false);
  const sessionStats=useSessionStats();
  const online=useOnline();
  const timelapse=useTimelapse(()=>manualSnapRef.current?.());
  const geo=useGeofence(gps,useCallback((dir,d)=>{
    addEvent("geofence",{label:`GEOFENCE ${dir} — ${d}m FROM ANCHOR`,icon:"📍"});
    if(alertsOnRef.current)beepRef.current?.("wire");
  },[addEvent]));
  const handleLoiter=useCallback((flagged,label)=>{
    flagged.forEach(f=>{
      addEvent("loiter",{label:`${label} LOITER — ${f.label} #${f.id} ${Math.round(f.dwellMs/1000)}s`,conf:f.conf,icon:"⏳"});
    });
    if(alertsOnRef.current)beepRef.current?.("alert");
  },[addEvent]);
  const alertsOnRef=useRef(true),beepRef=useRef(null);
  useEffect(()=>{panoRef.current=pano;geoRef.current=geo;presetRef.current=applyPreset;});
  const sentryRecUntil=useRef(0);
  const[alertsOn,setAlertsOn]=useState(true);
  const{listening,lastCmd}=useVoiceControl(voiceOn,{
    "night vision":()=>setMode("NVG"),
    "thermal":()=>setMode("THERMAL"),
    "raw":()=>setMode("RAW"),
    "astro":()=>setMode("ASTRO"),
    "tactical":()=>setMode("TACT"),
    "capture":()=>manualSnapRef.current?.(),
    "burst":()=>burstSnapRef.current?.(),
    "record":()=>toggleRecordRef.current?.(),
    "torch":()=>toggleTorch(),
    "zoom in":()=>setZoom(z=>Math.min(12,z*2)),
    "zoom out":()=>setZoom(z=>Math.max(1,z/2)),
    "dehaze":()=>setMode("HAZE"),
    "polarize":()=>setMode("POLAR"),
    "rainbow":()=>setMode("RAINBOW"),
    "arctic":()=>setMode("BLUE"),
    "white hot":()=>setMode("WHITE"),
    "fusion":()=>setMode("FUSION"),
    "sentry on":()=>setSentryOn(true),
    "sentry off":()=>setSentryOn(false),
    "heat map":()=>setHeatmapOn(h=>!h),
    "auto capture":()=>setAutoCapture(a=>!a),
    "gain up":()=>setBrightness(b=>Math.min(1.5,b+0.375)),
    "gain down":()=>setBrightness(b=>Math.max(-1.5,b-0.375)),
    "show map":()=>setModal("map"),
    "show log":()=>setModal("timeline"),
    "gallery":()=>setModal("gallery"),
    "sensors":()=>setModal("sensors"),
    "report":()=>exportPDFRef.current?.(),
    "scan code":()=>scanQRRef.current?.(),
    "close":()=>setModal(null),
    "silence":()=>setAlertsOn(false),
    "stars":()=>setStarsOn(s=>!s),
    "histogram":()=>setShowHist(h=>!h),
    "clips":()=>setModal("clips"),
    "surveillance mode":()=>presetRef.current?.("SURVEIL"),
    "recon mode":()=>presetRef.current?.("RECON"),
    "astro mode":()=>presetRef.current?.("ASTRO"),
    "search mode":()=>presetRef.current?.("SEARCH"),
    "stealth":()=>setStealth(true),
    "night safe":()=>setRedUI(r=>!r),
    "stabilize":()=>setStabOn(s=>!s),
    "super resolution":()=>setSrOn(s=>!s),
    "drop anchor":()=>geoRef.current?.drop(),
    "clear anchor":()=>geoRef.current?.clear(),
    "panorama":()=>{const cv=document.querySelector("canvas[data-primary='true']");if(cv)panoRef.current?.add(cv.toDataURL("image/jpeg",0.85));},
  });
  const panoRef=useRef(null),geoRef=useRef(null),presetRef=useRef(null);
  const manualSnapRef=useRef(null),burstSnapRef=useRef(null),toggleRecordRef=useRef(null);
  const recordingRef=useRef(false);
  const exportPDFRef=useRef(null),scanQRRef=useRef(null);

  const color=redUI?"#ff2200":MODE_META[mode].color;
  const timeStr=clock.toLocaleTimeString("en-US",{hour12:false});
  const dateStr=clock.toLocaleDateString("en-US",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase();
  const dirs=["N","NE","E","SE","S","SW","W","NW"];
  const compassDir=heading!==null?dirs[Math.round(heading/45)%8]:"--";

  // Handle captures
  const handleCapture=useCallback(async(url,label,targets,auto=false)=>{
    if(!url||url==="data:,")return;
    const now=new Date();
    let finalUrl=url;
    const meta={utc:now.toISOString().replace("T"," ").slice(0,19)+"Z",mode:modeRef.current,
      gps:gpsRef.current,heading:headingRef.current,alt:gpsRef.current?.alt!=null?Math.round(gpsRef.current.alt):null,label};
    if(stampRef.current){
      try{finalUrl=await watermarkCapture(url,meta);}catch{}
    }
    const hash=await hashDataUrl(finalUrl);
    const entry={url:finalUrl,label,targets,auto,hash,utc:meta.utc,
      lat:gpsRef.current?.lat,lon:gpsRef.current?.lon,mode:meta.mode,
      time:now.toLocaleTimeString("en-US",{hour12:false}),ts:now.getTime()};
    setCaptures(p=>[entry,...p].slice(0,200));
    if(vaultRef.current){dbPut("captures",entry).then(async()=>setStorageInfo(await dbUsage()));}
    addEvent("capture",{label,targets,auto,url:finalUrl,time:entry.time,hash});
  },[addEvent]);
  const stampRef=useRef(true),gpsRef=useRef(null),headingRef=useRef(null);
  const vaultRef=useRef(true);
  useEffect(()=>{vaultRef.current=vaultOn;},[vaultOn]);
  useEffect(()=>{alertsOnRef.current=alertsOn;beepRef.current=beep;},[alertsOn,beep]);
  useEffect(()=>{stampRef.current=stampOn;gpsRef.current=gps;headingRef.current=heading;},[stampOn,gps,heading]);

  // Handle motion events → timeline + GPS pin + multicast
  // Beep when a PERSON track appears (throttled 4s)
  const lastPersonBeep=useRef(0);
  useEffect(()=>{
    // handled inside handleMotionEvent below
  },[]);

  const handleMotionEvent=useCallback((blob,label)=>{
    const evt={label:`${label} ${blob.label||"MOTION"}`,conf:blob.conf,lat:gps?.lat,lon:gps?.lon,icon:blob.icon||"🎯"};
    addEvent("motion",evt);
    broadcast("MOTION_ALERT",evt);
    if(alertsOn&&blob.label==="PERSON"&&Date.now()-lastPersonBeep.current>4000){
      lastPersonBeep.current=Date.now();beep("person");
    }
    // SENTRY: person detected → auto-record 10s clip
    if(sentryOn&&blob.label==="PERSON"){
      const now=Date.now();
      sentryRecUntil.current=now+10000;
      if(!recordingRef.current){
        toggleRecordRef.current?.();
        addEvent("sentry",{label:"SENTRY AUTO-REC — PERSON DETECTED"});
        const checkStop=()=>{
          if(Date.now()>=sentryRecUntil.current){
            if(recordingRef.current)toggleRecordRef.current?.();
          }else setTimeout(checkStop,1000);
        };
        setTimeout(checkStop,10000);
      }
    }
  },[addEvent,broadcast,gps,alertsOn,beep,sentryOn]);

  // Handle tripwire hits
  const handleTripwireHit=useCallback((ids,label)=>{
    if(alertsOn)beep("wire");
    setTripwires(tw=>tw.map(t=>ids.includes(t.id)?{...t,triggered:true}:t));
    ids.forEach(id=>{
      const tw=tripwires.find(t=>t.id===id);
      addEvent("tripwire",{label:`${label} CROSSED ${tw?.label||id}`});
    });
    // Auto-reset trigger after 3s
    setTimeout(()=>setTripwires(tw=>tw.map(t=>({...t,triggered:false}))),3000);
  },[addEvent,tripwires]);

  // Audio spike events
  useEffect(()=>{
    if(audioSpike)addEvent("audio",{label:"AUDIO SPIKE",level:audioLevel});
  },[audioSpike]);// eslint-disable-line

  // Sync alerts → timeline
  useEffect(()=>{
    if(syncAlerts.length){
      const a=syncAlerts[0];
      addEvent("peer",{label:`PEER ${a.from.slice(-4)}: ${a.payload?.label||"MOTION"}`});
    }
  },[syncAlerts]);// eslint-disable-line

  const manualSnap=()=>{
    const c=document.querySelector("canvas[data-primary='true']");
    if(c)handleCapture(c.toDataURL("image/png"),"REAR",0,false);
  };

  const burstSnap=useCallback(()=>{
    const c=document.querySelector("canvas[data-primary='true']");
    if(!c)return;
    let i=0;
    const shoot=()=>{
      if(i>=5)return;
      handleCapture(c.toDataURL("image/png"),`BURST-${i+1}`,0,false);
      i++;setTimeout(shoot,300);
    };
    shoot();
  },[handleCapture]);

  const exportPDF=useCallback(()=>{
    const lines=[];
    const now=new Date();
    lines.push(`NVS-7.5 SESSION REPORT`);
    lines.push(`Generated: ${now.toLocaleString()}`);
    lines.push(`Mode: ${mode} | Zoom: ${zoom}x | Sensitivity: ${Math.round(sensitivity*100)}%`);
    if(gps)lines.push(`GPS: ${gps.lat.toFixed(5)}°N ${gps.lon.toFixed(5)}°W ±${gps.acc?.toFixed(0)}m`);
    if(gps?.speed!=null)lines.push(`Speed: ${(gps.speed*2.237).toFixed(1)} mph  Heading: ${gps.heading!=null?Math.round(gps.heading)+"°":"--"}`);
    if(gpsTrack.length>1){
      let d=0;for(let i=1;i<gpsTrack.length;i++){const a=gpsTrack[i-1],b=gpsTrack[i];
        d+=Math.hypot((b.lat-a.lat)*111320,(b.lon-a.lon)*111320*Math.cos(b.lat*Math.PI/180));}
      lines.push(`Track: ${gpsTrack.length} points, ${d<1000?Math.round(d)+"m":(d/1000).toFixed(2)+"km"} traveled`);
    }
    if(hr)lines.push(`Heart rate: ${hr} BPM (quality ${Math.round(hrQ*100)}%)${spo2?`, SpO2 ~${spo2}%`:""}`);
    lines.push(`AI model: ${modelReady?"COCO-SSD active":"not loaded"}`);
    lines.push(`Systems: ${[sentryOn&&"SENTRY",heatmapOn&&"HEATMAP",voiceOn&&"VOICE",alertsOn&&"ALERTS",autoCapture&&"AUTOCAP",torchOn&&"TORCH"].filter(Boolean).join(", ")||"none"}`);
    if(altitude!=null)lines.push(`Altitude: ${altitude}m`);
    if(pressure!=null)lines.push(`Pressure: ${pressure}hPa`);
    lines.push(`\nEVENT LOG (${events.length} events):`);
    events.slice(0,100).forEach((e,i)=>{
      const t=new Date(e.ts).toLocaleTimeString("en-US",{hour12:false});
      lines.push(`  [${t}] ${e.type.toUpperCase()}: ${e.data?.label||""}`);
    });
    lines.push(`\nCAPTURES: ${captures.length} images`);
    captures.slice(0,20).forEach((c,i)=>{
      lines.push(`  [${c.time}] ${c.label} ${c.auto?"[AUTO]":"[SNAP]"}${c.targets>0?` — ${c.targets} targets`:""}`);
    });
    lines.push(`\nTRIPWIRES: ${tripwires.length} zones`);
    tripwires.forEach(tw=>lines.push(`  ${tw.label}: ${tw.points.length} points`));
    lines.push(`\n— CLOUDYGETTY-AI // ENTROPY-ZERO // NVS-7.5 // CLASSIFIED —`);

    // Build simple text-based PDF using data URI
    const text=lines.join("\n");
    const blob=new Blob([text],{type:"text/plain"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`nvs7-report-${now.getTime()}.txt`;a.click();
    addEvent("export",{label:`Session report exported — ${events.length} events, ${captures.length} captures`});
  },[mode,zoom,sensitivity,gps,altitude,pressure,events,captures,tripwires,addEvent]);

  // Voice command refs (fns defined above)
  useEffect(()=>{manualSnapRef.current=manualSnap;burstSnapRef.current=burstSnap;toggleRecordRef.current=toggleRecord;recordingRef.current=recording;exportPDFRef.current=exportPDF;scanQRRef.current=scanQR;});

  // Shake → burst capture
  useEffect(()=>{
    if(shakeImpact&&burstMode)burstSnap();
  },[shakeImpact,burstMode,burstSnap]);

  // QR scan via BarcodeDetector API
  const scanQR=useCallback(async()=>{
    if(!("BarcodeDetector" in window)){setQrResult("BarcodeDetector not supported on this browser");return;}
    const c=document.querySelector("canvas[data-primary='true']");
    if(!c)return;
    try{
      // @ts-ignore
      const detector=new BarcodeDetector({formats:["qr_code","code_128","ean_13","data_matrix"]});
      const barcodes=await detector.detect(c);
      if(barcodes.length>0){
        setQrResult(barcodes[0].rawValue);
        addEvent("qr",{label:`QR: ${barcodes[0].rawValue.slice(0,40)}`});
      } else setQrResult("NO CODE DETECTED");
    }catch(e){setQrResult("SCAN FAILED: "+e.message);}
  },[addEvent]);

  const toggleRecord=()=>{
    const c=document.querySelector("canvas[data-primary='true']");
    if(!c)return;
    if(!recording){
      const cs=c.captureStream(30);
      const rec=new MediaRecorder(cs,{mimeType:"video/webm"});
      const chunks=[];
      rec.ondataavailable=e=>chunks.push(e.data);
      const startedAt=Date.now();
      rec.onstop=async()=>{
        const b=new Blob(chunks,{type:"video/webm"});
        const ts=Date.now();
        const entry={ts,blob:b,size:b.size,dur:Math.round((ts-startedAt)/1000),
          mode:modeRef.current,auto:sentryRecUntil.current>startedAt,
          time:new Date(ts).toLocaleTimeString("en-US",{hour12:false})};
        if(vaultRef.current){
          await dbPut("clips",entry);
          setClips(c=>[entry,...c]);
          setStorageInfo(await dbUsage());
          addEvent("clip",{label:`CLIP SAVED — ${entry.dur}s, ${(b.size/1048576).toFixed(1)}MB`});
        }else{
          const u=URL.createObjectURL(b);const a=document.createElement("a");
          a.href=u;a.download=`nvs-${ts}.webm`;a.click();URL.revokeObjectURL(u);
        }
      };
      rec.start();mediaRecRef.current=rec;setRecording(true);
    }else{mediaRecRef.current?.stop();setRecording(false);}
  };

  const modeRef=useRef(mode);
  useEffect(()=>{modeRef.current=mode;},[mode]);
  const newCapCount=captures.length;
  const newEventCount=events.length;
  const hasTripwire=tripwires.some(t=>t.triggered);

  const camProps={
    mode,brightness,sensitivity,edgeOverlay,noiseReduction,color,zoom,showReticle,
    motionEnabled,autoCapture,tripwires,showRPPG,
    onCapture:handleCapture,onMotionEvent:handleMotionEvent,onTripwireHit:handleTripwireHit,
    onRPPG:setRppgSample,tfDetect,modelReady,heatmapOn,starsOn,showHist,stabOn,srOn,
    onLoiter:handleLoiter,onZoom:setZoom,onSwipeMode:cycleMode,onSwipeGain:bumpGain,
  };

  return(
    <div style={{height:"100dvh",background:"#000",display:"flex",flexDirection:"column",fontFamily:"'DM Mono',monospace",overflow:"hidden"}}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes nvg-scan{0%{top:-3px;opacity:0}5%{opacity:.9}95%{opacity:.5}100%{top:100%;opacity:0}}
        @keyframes rec-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
        @keyframes tgt-pulse{0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)}50%{opacity:.3;transform:translate(-50%,-50%) scale(1.9)}}
        @keyframes fade-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes flash-out{0%{opacity:.38}100%{opacity:0}}
        @keyframes lock-flash{0%,49%{border-color:#ff220088}50%,100%{border-color:#ff2200}}
        @keyframes header-sweep{0%{background-position:-200% 0}100%{background-position:200% 0}}
        *{box-sizing:border-box}
        button{font-family:"DM Mono",monospace;cursor:pointer;transition:transform .1s ease,filter .12s ease,box-shadow .15s ease}
        button:hover{filter:brightness(1.22)}
        button:active{transform:scale(.94)}
        button:focus-visible{outline:1.5px solid ${color}90;outline-offset:1px}
        input[type=range]:focus-visible{outline:1.5px solid ${color}90;outline-offset:3px}
        ::-webkit-scrollbar{display:none}
      `}</style>

      {!booted&&<BootSequence color={color} onDone={()=>setBooted(true)}/>}

      {modal==="map"&&<GPSMap pos={gps} track={gpsTrack} events={events} color={color} onClose={()=>setModal(null)}/>}
      {modal==="timeline"&&<TimelineModal events={events} captures={captures} color={color} onClose={()=>setModal(null)}/>}
      {modal==="tripwire"&&<TripwireEditor tripwires={tripwires} onUpdate={setTripwires} color={color} onClose={()=>setModal(null)}/>}
      {modal==="manual"&&<InstructionsModal color={color} onClose={()=>setModal(null)}/>}
      {modal==="cast"&&<CastModal color={color} code={castCode} on={castOn} viewers={castViewers} status={castStatus} onStart={startCast} onStop={stopCast} onClose={()=>setModal(null)}/>}

      <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",background:"#000",
        boxShadow:`inset 0 0 90px rgba(0,0,0,0.55)`,
        animation:booted?"fade-in 0.5s ease":"none",overflow:"hidden",position:"relative"}}>
        <Bezel color={color} op={.4}/>

        {/* ══ FULL-BLEED CAMERA ══ */}
        <div style={{position:"absolute",inset:0,zIndex:1}}>
          {dualMode?(
            dualLayout==="pip"?(
              <div style={{position:"relative",width:"100%",height:"100%"}}>
                <CameraPanel {...(primaryCam==="rear"?
                  {stream:rear.stream,ready:rear.ready,error:rear.error,label:"REAR",onRetry:rear.retry}:
                  {stream:front.stream,ready:front.ready,error:front.error,label:"FRONT",onRetry:front.retry})}
                  {...camProps} compact={false} onTrackCount={setBlobsCount}/>
                <div style={{position:"absolute",top:"calc(env(safe-area-inset-top,0px) + 58px)",right:10,
                  width:"31%",aspectRatio:"3/4",zIndex:40,border:`1.5px solid ${color}55`,
                  borderRadius:12,overflow:"hidden",boxShadow:"0 4px 18px rgba(0,0,0,.8)"}}>
                  <CameraPanel {...(primaryCam==="rear"?
                    {stream:front.stream,ready:front.ready,error:front.error,label:"FRONT",onRetry:front.retry}:
                    {stream:rear.stream,ready:rear.ready,error:rear.error,label:"REAR",onRetry:rear.retry})}
                    {...camProps} compact={true}/>
                </div>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateRows:"1fr 1fr",gap:1,width:"100%",height:"100%",background:`${color}0a`}}>
                <CameraPanel stream={rear.stream} ready={rear.ready} error={rear.error} label="REAR"
                  onRetry={rear.retry} {...camProps} compact={true} onTrackCount={setBlobsCount}/>
                <CameraPanel stream={front.stream} ready={front.ready} error={front.error} label="FRONT"
                  onRetry={front.retry} {...camProps} compact={true}/>
              </div>
            )
          ):(
            <CameraPanel stream={rear.stream} ready={rear.ready} error={rear.error} label="REAR"
              onRetry={rear.retry} {...camProps} compact={false} onTrackCount={setBlobsCount}/>
          )}
        </div>

        {/* ══ TOP STATUS ══ */}
        <StatusStrip color={color} clock={timeStr} battery={battery}
          badges={<>
            {recording&&<span style={{fontSize:9,color:"#ff4444",letterSpacing:1.4,animation:"rec-blink 1s step-end infinite"}}>● REC</span>}
            {sentryOn&&<span style={{fontSize:9,color:"#ff3b62",letterSpacing:1.4,fontWeight:700}}>🛡ARMED</span>}
            {timelapse.active&&<span style={{fontSize:9,color:"#ffcc44",letterSpacing:1.2}}>⏲{timelapse.count}</span>}
            {hasTripwire&&<span style={{fontSize:9,color:"#ffcc00",letterSpacing:1.2,animation:"rec-blink .4s step-end infinite"}}>⚠WIRE</span>}
            {geo.anchor&&<span style={{fontSize:9,color:geo.inside?"#00ddaa":"#ff4444",letterSpacing:1.2,fontWeight:700}}>📍{geo.inside?"OK":"BREACH"}</span>}
            {castOn&&<span style={{fontSize:9,color:"#66ddff",letterSpacing:1.2}}>📡{castViewers}</span>}
            {!online&&<span style={{fontSize:9,color:"#ffaa00",letterSpacing:1.2}}>⚠OFF</span>}
            {listening&&<span style={{fontSize:9,color:"#ff88ff",letterSpacing:1.2,animation:"rec-blink 1.2s step-end infinite"}}>🎤</span>}
            {lastCmd&&<span style={{fontSize:9,color:"#ffdd00",fontWeight:700}}>»{lastCmd}</span>}
            {!modelReady
              ?<span style={{fontSize:9,color:"rgba(255,200,0,.8)",letterSpacing:1,animation:"rec-blink 1s step-end infinite"}}>AI▸</span>
              :blobsCount>0&&<span style={{fontSize:9,color:`${color}cc`,letterSpacing:1}}>◎{blobsCount}</span>}
            {heading!=null&&<span style={{fontSize:9,color:`${color}72`,letterSpacing:1}}>{String(heading).padStart(3,"0")}°</span>}
          </>}/>

        {/* ══ BOTTOM CONTROL ISLAND ══ */}
        <div style={{position:"absolute",left:0,right:0,bottom:0,zIndex:60,
          paddingBottom:"calc(env(safe-area-inset-bottom,0px) + 6px)",
          background:"linear-gradient(to top,rgba(0,0,0,.97) 0%,rgba(0,0,0,.88) 45%,rgba(0,0,0,.55) 78%,transparent)"}}>

          {/* preset chips */}
          <div style={{display:"flex",gap:7,padding:"0 14px 8px",overflowX:"auto"}}>
            {[{n:"SURVEIL",i:"🛡"},{n:"RECON",i:"🔭"},{n:"ASTRO",i:"✨"},{n:"SEARCH",i:"🔍"}].map(({n,i})=>(
              <button key={n} onClick={()=>applyPreset(n)} style={{flexShrink:0,
                padding:"10px 15px",borderRadius:22,
                ...glass(color,activePreset===n?.6:.3),
                border:`1px solid ${activePreset===n?color:`${color}26`}`,
                fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:1.4,
                fontWeight:activePreset===n?800:600,
                color:activePreset===n?color:`${color}c8`,
                boxShadow:activePreset===n?`0 0 12px ${color}44`:"none"}}>
                {i} {n}
              </button>
            ))}
          </div>

          {/* ALWAYS-VISIBLE TOOL STRIP */}
          <div style={{display:"flex",gap:7,padding:"0 14px 9px",overflowX:"auto"}}>
            {[
              {i:"⚙",l:"SETTINGS",f:()=>{setSheetTab("vision");setSheet(true);},hi:true},
              {i:"📁",l:"GALLERY",f:()=>setModal("gallery"),n:captures.length},
              {i:"🎞",l:"CLIPS",f:()=>setModal("clips"),n:clips.length},
              {i:"🗺",l:"MAP",f:()=>setModal("map")},
              {i:"⏱",l:"LOG",f:()=>setModal("timeline"),n:events.length},
              {i:"📊",l:"SENSORS",f:()=>setModal("sensors")},
              {i:"⚡",l:"TRIPWIRE",f:()=>setModal("tripwire")},
              {i:"📡",l:"CAST",f:()=>setModal("cast")},
              {i:"📄",l:"REPORT",f:exportPDF},
              {i:"?",l:"MANUAL",f:()=>setModal("manual")},
            ].map(({i,l,f,n,hi})=>(
              <button key={l} onClick={f} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,
                padding:"12px 16px",borderRadius:12,position:"relative",
                ...glass(color,hi?.62:.34),
                border:`1.5px solid ${hi?color:`${color}2e`}`,
                boxShadow:hi?`0 0 14px ${color}44`:"none"}}>
                <span style={{fontSize:18,lineHeight:1}}>{i}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,letterSpacing:1.3,
                  fontWeight:hi?800:600,color:hi?color:`${color}e0`}}>{l}</span>
                {n>0&&<span style={{background:color,color:"#000",borderRadius:9,padding:"0 5px",
                  fontSize:9.5,fontWeight:800,fontFamily:"'DM Mono',monospace"}}>{n}</span>}
              </button>
            ))}
          </div>

          <ModeWheel modes={MODE_KEYS} meta={MODE_META} value={mode} onChange={setMode} color={color}/>
          <ShutterBar color={color} zoom={zoom}
            onShot={manualSnap} onRec={toggleRecord} recording={recording}
            onTorch={toggleTorch} torchOn={torchOn}
            onSentry={()=>setSentryOn(s=>!s)} sentryOn={sentryOn}
            onZoomCycle={()=>setZoom(z=>{const i=ZOOM_STEPS.indexOf(z);return ZOOM_STEPS[(i+1)%ZOOM_STEPS.length];})}/>
          <div style={{textAlign:"center",fontFamily:"'DM Mono',monospace",fontSize:9,
            color:`${color}6a`,letterSpacing:.8,paddingBottom:2}}>
            swipe ◀▶ mode · ▲▼ gain · pinch zoom · 2-tap magnify
          </div>
        </div>

        {/* ══ SHEET ══ */}
        <Sheet open={sheet} onClose={()=>setSheet(false)} color={color}
          tab={sheetTab} onTab={setSheetTab}
          tabs={[
            {id:"vision",icon:"👁",label:"VISION"},
            {id:"detect",icon:"◎",label:"DETECT"},
            {id:"capture",icon:"📸",label:"CAPTURE",badge:captures.length},
            {id:"data",icon:"🗂",label:"DATA",badge:events.length},
            {id:"system",icon:"⚙",label:"SYSTEM"},
          ]}>

          {sheetTab==="vision"&&<>
            <Slider color={color} label="GAIN" value={brightness} min={-1.5} max={1.5} step={0.375}
              onChange={setBrightness} fmt={v=>`${v>0?"+":""}${v.toFixed(1)}`}/>
            <Slider color={color} label="ZOOM" value={zoom} min={1} max={12} step={0.5}
              onChange={setZoom} fmt={v=>`${v}×`}/>
            {hardZoom&&hzoomSupported&&(
              <Slider color={color} label="HW-Z" value={hzoom} min={1} max={maxZoom} step={0.1}
                onChange={applyZoom} fmt={v=>`${v.toFixed(1)}×`}/>
            )}
            <GroupTitle color={color}>IMAGE</GroupTitle>
            <Row color={color} label="STABILIZATION" hint="cancels handshake at high zoom" on={stabOn} onClick={()=>setStabOn(s=>!s)} c="#66ddff"/>
            <Row color={color} label="SUPER-RESOLUTION" hint="hold still — recovers real detail" on={srOn} onClick={()=>setSrOn(s=>!s)} c="#ffaaff"/>
            <Row color={color} label="NOISE REDUCTION" hint="temporal blend" on={noiseReduction} onClick={()=>setNoiseReduction(n=>!n)}/>
            <Row color={color} label="EDGE OVERLAY" hint="sobel outlines" on={edgeOverlay} onClick={()=>setEdgeOverlay(e=>!e)}/>
            <GroupTitle color={color}>OVERLAYS</GroupTitle>
            <Row color={color} label="RETICLE" on={showReticle} onClick={()=>setShowReticle(r=>!r)}/>
            <Row color={color} label="HISTOGRAM" hint="exposure graph + warnings" on={showHist} onClick={()=>setShowHist(h=>!h)} c="#88ff88"/>
            <Row color={color} label="STAR TRACKER" hint="marks bright point sources" on={starsOn} onClick={()=>setStarsOn(s=>!s)} c="#a0d8ff"/>
            <GroupTitle color={color}>CAMERA</GroupTitle>
            <Row color={color} label="TORCH" on={torchOn} onClick={toggleTorch} c="#ffd27a"/>
            <Row color={color} label="HARDWARE ZOOM" hint="true optical zoom if supported" on={hardZoom} onClick={()=>setHardZoom(h=>!h)} c="#44ffcc"/>
            <Row color={color} label="DUAL CAMERA" hint="front + rear together" on={dualMode} onClick={()=>setDualMode(d=>!d)}/>
            {dualMode&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
                <Tile color={color} icon="◫" label="SPLIT" active={dualLayout==="split"} onClick={()=>setDualLayout("split")}/>
                <Tile color={color} icon="⬓" label="PIP" active={dualLayout==="pip"} onClick={()=>setDualLayout("pip")}/>
                <Tile color={color} icon="⇄" label={primaryCam.toUpperCase()} onClick={()=>setPrimaryCam(c=>c==="rear"?"front":"rear")}/>
              </div>
            )}
            {dualMode&&front.error&&!front.stream&&(
              <div style={{padding:"11px 13px",borderRadius:11,border:"1px solid rgba(255,170,0,.4)",
                background:"rgba(255,170,0,.07)",fontFamily:"'DM Mono',monospace"}}>
                <div style={{fontSize:10,color:"#ffaa00",letterSpacing:1,marginBottom:4}}>⚠ SECOND CAMERA UNAVAILABLE</div>
                <div style={{fontSize:8.5,color:"rgba(255,170,0,.75)",lineHeight:1.55}}>
                  This device can only run one camera at a time (common on iOS Safari). Use ⇄ to switch, or turn DUAL off.
                </div>
              </div>
            )}
          </>}

          {sheetTab==="detect"&&<>
            <Slider color={color} label="SENS" value={sensitivity} min={0} max={1} step={0.05}
              onChange={setSensitivity} fmt={v=>`${Math.round(v*100)}%`}/>
            <GroupTitle color={color}>DETECTION</GroupTitle>
            <Row color={color} label="MOTION TRACKING" hint="blobs, IDs, trails, velocity" on={motionEnabled} onClick={()=>setMotionEnabled(m=>!m)}/>
            <Row color={color} label="FACE DETECTION" on={faceDetect} onClick={()=>setFaceDetect(f=>!f)}/>
            <Row color={color} label="HEATMAP" hint="where activity happened" on={heatmapOn} onClick={()=>setHeatmapOn(h=>!h)} c="#ff7700"/>
            <GroupTitle color={color}>SENSORS</GroupTitle>
            <Row color={color} label="MICROPHONE" hint="audio spikes + wind estimate" on={audioEnabled} onClick={()=>setAudioEnabled(a=>!a)}/>
            <Row color={color} label="HEART RATE (rPPG)" hint="fingertip on lens + torch" on={showRPPG} onClick={()=>setShowRPPG(r=>!r)} c="#ff6688"/>
            <Row color={color} label="SHAKE / IMPACT" on={shakeEnabled} onClick={()=>setShakeEnabled(s=>!s)} c="#ff8844"/>
            <GroupTitle color={color}>AUTOMATION</GroupTitle>
            <Row color={color} label="SENTRY" hint="auto-record when a person appears" on={sentryOn} onClick={()=>setSentryOn(s=>!s)} c="#ff3b62"/>
            <Row color={color} label="AUTO CAPTURE" hint="snapshot on motion" on={autoCapture} onClick={()=>setAutoCapture(a=>!a)} c="#ffdd00"/>
            <Row color={color} label="ALERT SOUNDS" on={alertsOn} onClick={()=>setAlertsOn(a=>!a)} c="#ffaa00"/>
            <Tile color={color} icon="⚡" label="TRIPWIRES" sub={`${tripwires.length} zones`} onClick={()=>{setSheet(false);setModal("tripwire");}} c="#ffcc00"/>
            <GroupTitle color={color}>GEOFENCE</GroupTitle>
            <div style={{display:"flex",gap:8,alignItems:"center",padding:"11px 13px",borderRadius:12,
              background:"rgba(255,255,255,.04)",border:`1px solid ${geo.anchor?(geo.inside?"#00ddaa66":"#ff444488"):`${color}1c`}`}}>
              <span style={{flex:1,fontFamily:"'DM Mono',monospace",fontSize:10,
                color:geo.anchor?(geo.inside?"#00ddaa":"#ff4444"):`${color}80`}}>
                {geo.anchor?`${geo.inside?"SECURE":"BREACH"} · ${Math.round(geo.dist||0)}m / ${geo.radius}m`:"NO ANCHOR SET"}
              </span>
              {geo.anchor&&<input type="range" min="25" max="500" step="25" value={geo.radius}
                onChange={e=>geo.setRadius(+e.target.value)} style={{width:66,accentColor:color,height:4}}/>}
              <button onClick={geo.anchor?geo.clear:geo.drop} disabled={!gps}
                style={{padding:"8px 13px",borderRadius:9,background:"transparent",
                  border:`1px solid ${geo.anchor?"#ff444455":`${color}33`}`,
                  color:geo.anchor?"#ff6666":color,fontFamily:"'DM Mono',monospace",
                  fontSize:9.5,letterSpacing:1,opacity:gps?1:.4}}>
                {geo.anchor?"CLEAR":"DROP"}
              </button>
            </div>
          </>}

          {sheetTab==="capture"&&<>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
              <Tile color={color} icon="📷" label="SHOT" onClick={manualSnap}/>
              <Tile color={color} icon="⚡" label="BURST" sub="×5" onClick={burstSnap} c="#ff44aa"/>
              <Tile color={color} icon={recording?"⏹":"⏺"} label={recording?"STOP":"RECORD"} active={recording} onClick={toggleRecord} c="#ff4444"/>
            </div>
            <GroupTitle color={color}>TIMELAPSE</GroupTitle>
            <div style={{display:"flex",gap:8,alignItems:"center",padding:"11px 13px",borderRadius:12,
              background:"rgba(255,255,255,.04)",border:`1px solid ${timelapse.active?"#ffcc4466":`${color}1c`}`}}>
              <span style={{flex:1,fontFamily:"'DM Mono',monospace",fontSize:10,
                color:timelapse.active?"#ffcc44":`${color}80`}}>
                {timelapse.active?`RUNNING · ${timelapse.count} shots`:"STOPPED"}
              </span>
              <select value={timelapse.interval} onChange={e=>timelapse.setIntervalSec(+e.target.value)}
                style={{background:"rgba(0,0,0,.6)",border:`1px solid ${color}2a`,borderRadius:8,
                  color,fontFamily:"'DM Mono',monospace",fontSize:10,padding:"6px 5px"}}>
                {[2,5,10,30,60,300].map(s=><option key={s} value={s}>{s<60?`${s}s`:`${s/60}m`}</option>)}
              </select>
              <button onClick={timelapse.active?timelapse.stop:timelapse.start}
                style={{padding:"8px 13px",borderRadius:9,background:"transparent",
                  border:`1px solid ${timelapse.active?"#ff444455":`${color}33`}`,
                  color:timelapse.active?"#ff6666":color,fontFamily:"'DM Mono',monospace",fontSize:9.5,letterSpacing:1}}>
                {timelapse.active?"STOP":"START"}
              </button>
            </div>
            <GroupTitle color={color}>PANORAMA</GroupTitle>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              <Tile color={color} icon="🌐" label="ADD FRAME" sub={`${pano.frames.length}/12`} c="#ffcc44"
                onClick={()=>{const cv=document.querySelector("canvas[data-primary='true']");if(cv)pano.add(cv.toDataURL("image/jpeg",.85));}}/>
              <Tile color={color} icon="🧵" label="STITCH" sub={pano.frames.length<2?"need 2+":"build"} c="#ffcc44"
                onClick={async()=>{const u=await pano.stitch();if(u){handleCapture(u,"PANORAMA",0,false);pano.reset();}}}/>
            </div>
            <GroupTitle color={color}>EVIDENCE</GroupTitle>
            <Row color={color} label="GEO-STAMP" hint="burn UTC + GPS + SHA-256 into every shot" on={stampOn} onClick={()=>setStampOn(s=>!s)} c="#00ddaa"/>
            <Row color={color} label="VAULT" hint="keep photos & clips after reload" on={vaultOn} onClick={()=>setVaultOn(v=>!v)} c="#00ddaa"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              <Tile color={color} icon="📁" label="GALLERY" sub={`${captures.length} shots`} badge={captures.length} onClick={()=>{setSheet(false);setModal("gallery");}}/>
              <Tile color={color} icon="🎞" label="CLIPS" sub={`${clips.length} videos`} badge={clips.length} c="#ff5588" onClick={()=>{setSheet(false);setModal("clips");}}/>
            </div>
          </>}

          {sheetTab==="data"&&<>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              <Tile color={color} icon="🗺" label="TACTICAL MAP" sub={gps?"GPS locked":"no fix"} c="#00ccff" onClick={()=>{setSheet(false);setModal("map");}}/>
              <Tile color={color} icon="⏱" label="EVENT LOG" sub={`${events.length} events`} badge={events.length} c="#cc44ff" onClick={()=>{setSheet(false);setModal("timeline");}}/>
              <Tile color={color} icon="📊" label="SENSORS" sub="live readouts" c="#44ffcc" onClick={()=>{setSheet(false);setModal("sensors");}}/>
              <Tile color={color} icon="📄" label="REPORT" sub="export .txt" c="#b464ff" onClick={exportPDF}/>
              <Tile color={color} icon="📷" label="QR / BARCODE" sub="scan frame" c="#44ffc8" onClick={scanQR}/>
              <Tile color={color} icon="📡" label="REMOTE CAST" sub={castOn?`${castViewers} viewing`:"off"} active={castOn} c="#66ddff" onClick={()=>{setSheet(false);setModal("cast");}}/>
            </div>
            {qrResult&&(
              <div style={{padding:"11px 13px",borderRadius:11,background:"rgba(68,255,200,.07)",
                border:"1px solid rgba(68,255,200,.3)",display:"flex",gap:9,alignItems:"center"}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(68,255,200,.95)",
                  flex:1,overflow:"hidden",textOverflow:"ellipsis"}}>{qrResult}</span>
                <button onClick={()=>setQrResult(null)} style={{background:"transparent",
                  border:"1px solid rgba(68,255,200,.3)",borderRadius:7,color:"rgba(68,255,200,.8)",
                  fontSize:10,padding:"4px 9px"}}>✕</button>
              </div>
            )}
            <GroupTitle color={color}>SESSION</GroupTitle>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              {[["UPTIME",`${Math.floor(sessionStats.uptime/60)}m ${sessionStats.uptime%60}s`],
                ["TRACKS",`${blobsCount}`],
                ["STORAGE",storageInfo?`${(storageInfo.used/1048576).toFixed(1)} MB`:"--"],
                ["GPS TRACK",`${gpsTrack.length} pts`]].map(([k,v])=>(
                <div key={k} style={{padding:"11px 13px",borderRadius:11,background:"rgba(255,255,255,.035)",
                  border:`1px solid ${color}18`,display:"flex",flexDirection:"column",gap:3}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:8.5,color:`${color}66`,letterSpacing:1.4}}>{k}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:700,color}}>{v}</span>
                </div>
              ))}
            </div>
          </>}

          {sheetTab==="system"&&<>
            <Row color={color} label="VOICE CONTROL" hint="41 spoken commands" on={voiceOn} onClick={()=>setVoiceOn(v=>!v)} c="#ff88ff"/>
            <Row color={color} label="NIGHT-SAFE RED UI" hint="preserves dark adaptation" on={redUI} onClick={()=>setRedUI(r=>!r)} c="#ff2200"/>
            <Row color={color} label="DEVICE SYNC" hint="link tabs on this device" on={multiSync} onClick={()=>setMultiSync(s=>!s)} c="#cc44ff"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              <Tile color={color} icon="🌑" label="STEALTH" sub="dark screen, keeps running" c="#888888" onClick={()=>{setSheet(false);setStealth(true);}}/>
              <Tile color={color} icon="?" label="MANUAL" sub="full operator guide" onClick={()=>{setSheet(false);setModal("manual");}}/>
            </div>
            <GroupTitle color={color}>STATUS</GroupTitle>
            <div style={{padding:"12px 13px",borderRadius:11,background:"rgba(255,255,255,.035)",
              border:`1px solid ${color}18`,display:"flex",flexDirection:"column",gap:7}}>
              {[["AI MODEL",modelReady?"COCO-SSD READY":"LOADING…"],
                ["CONNECTION",online?"ONLINE":"OFFLINE"],
                ["CAMERA",rear.ready?"REAR ACTIVE":"ACQUIRING"],
                ["MODE",MODE_META[mode].label]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:9.5,color:`${color}6a`,letterSpacing:1.2}}>{k}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:9.5,color:`${color}dd`}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{textAlign:"center",padding:"10px 0 2px",fontFamily:"'DM Mono',monospace",
              fontSize:7.5,color:`${color}30`,letterSpacing:1.4}}>
              CLOUDYGETTY-AI · ENTROPY-ZERO · NVS-14
            </div>
          </>}
        </Sheet>
      </div>

      {/* STEALTH — screen dark, systems keep running */}
      {stealth&&(
        <div onClick={()=>setStealth(false)} style={{position:"fixed",inset:0,zIndex:500,
          background:"#000",display:"flex",alignItems:"center",justifyContent:"center",
          flexDirection:"column",gap:14,cursor:"pointer"}}>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"rgba(0,255,80,0.16)",letterSpacing:3}}>
            STEALTH — TAP TO WAKE
          </span>
          <div style={{display:"flex",gap:14}}>
            {recording&&<span style={{fontSize:8,color:"rgba(255,34,34,0.35)",letterSpacing:2,animation:"rec-blink 1.5s step-end infinite"}}>● REC</span>}
            {sentryOn&&<span style={{fontSize:8,color:"rgba(255,51,85,0.3)",letterSpacing:2}}>🛡 ARMED</span>}
          </div>
        </div>
      )}

      {/* Clips vault modal */}
      {modal==="clips"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",zIndex:200,display:"flex",flexDirection:"column",animation:"fade-in 0.2s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:`1px solid ${color}15`,flexShrink:0}}>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:900,color,letterSpacing:4}}>CLIP VAULT ({clips.length})</span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={clearClips} style={{padding:"6px 10px",background:"transparent",border:"1px solid rgba(255,68,68,0.3)",borderRadius:4,color:"rgba(255,68,68,0.7)",fontFamily:"'DM Mono',monospace",fontSize:9,cursor:"pointer"}}>CLEAR</button>
              <button onClick={()=>setModal(null)} style={{padding:"6px 12px",background:"transparent",border:`1px solid ${color}30`,borderRadius:4,color:`${color}70`,fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:2,cursor:"pointer"}}>CLOSE</button>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:10}}>
            {clips.length===0&&<div style={{padding:24,textAlign:"center",fontFamily:"'DM Mono',monospace",fontSize:9,color:`${color}40`}}>NO CLIPS — RECORD OR ARM SENTRY</div>}
            {clips.map(c=>(
              <div key={c.ts} style={{border:`1px solid ${color}15`,borderRadius:7,overflow:"hidden",background:`${color}04`}}>
                <video src={URL.createObjectURL(c.blob)} controls playsInline style={{width:"100%",display:"block",background:"#000"}}/>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",gap:8}}>
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:`${color}90`}}>
                      {c.auto?"🛡 SENTRY":"⏺ MANUAL"} · {c.mode} · {c.dur}s
                    </span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:`${color}45`}}>
                      {c.time} · {(c.size/1048576).toFixed(1)}MB
                    </span>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{const u=URL.createObjectURL(c.blob);const a=document.createElement("a");a.href=u;a.download=`nvs-${c.ts}.webm`;a.click();}}
                      style={{padding:"6px 10px",background:"transparent",border:`1px solid ${color}30`,borderRadius:4,color,fontFamily:"'DM Mono',monospace",fontSize:9,cursor:"pointer"}}>↓</button>
                    <button onClick={async()=>{await dbDel("clips",c.ts);setClips(x=>x.filter(y=>y.ts!==c.ts));setStorageInfo(await dbUsage());}}
                      style={{padding:"6px 10px",background:"transparent",border:"1px solid rgba(255,68,68,0.3)",borderRadius:4,color:"rgba(255,68,68,0.7)",fontFamily:"'DM Mono',monospace",fontSize:9,cursor:"pointer"}}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sensors modal */}
      {modal==="sensors"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",zIndex:200,
          display:"flex",flexDirection:"column",animation:"fade-in 0.2s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"10px 14px",borderBottom:`1px solid ${color}15`,flexShrink:0}}>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:900,color,letterSpacing:4}}>SYSTEM SENSORS</span>
            <button onClick={()=>setModal(null)} style={{padding:"4px 10px",background:"transparent",
              border:`1px solid ${color}30`,borderRadius:2,color:`${color}70`,
              fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:2,cursor:"pointer"}}>CLOSE</button>
          </div>
          <div style={{flex:1,padding:16,display:"flex",flexDirection:"column",gap:8,overflowY:"auto"}}>
            {[
              {l:"GPS LAT",v:gps?`${gps.lat.toFixed(6)}°N`:"--",c:"#00ccff"},
              {l:"GPS LON",v:gps?`${gps.lon.toFixed(6)}°W`:"--",c:"#00ccff"},
              {l:"GPS ACC",v:gps?`±${gps.acc?.toFixed(0)}m`:"--",c:"#00ccff"},
              {l:"ALTITUDE",v:altitude!=null?`${altitude}m ASL`:"GPS acquiring",c:"#44ffcc"},
              {l:"PRESSURE",v:pressure!=null?`${pressure} hPa`:"GPS acquiring",c:"#44ffcc"},
              {l:"COMPASS",v:heading!=null?`${heading}° ${compassDir}`:"--",c:"#ffcc44"},
              {l:"WIND EST",v:audioEnabled?`${wind.toFixed(1)} m/s`:"Enable mic",c:"#88ccff"},
              {l:"rPPG HR",v:hr?`${hr} BPM`:"Enable rPPG",c:"#ff6688"},
              {l:"HR QUALITY",v:showRPPG?`${Math.round(hrQ*100)}%`:"--",c:"#ff6688"},
              {l:"SpO2 EST",v:spo2?`${spo2}%`:"--",c:"#ff6688"},
              {l:"GPS SPEED",v:gps?.speed!=null?`${(gps.speed*2.237).toFixed(1)} mph`:"--",c:"#00ccff"},
              {l:"GPS HEADING",v:gps?.heading!=null?`${Math.round(gps.heading)}°`:"--",c:"#00ccff"},
              {l:"TRACK PTS",v:`${gpsTrack.length}`,c:"#00ccff"},
              {l:"AUDIO PEAK",v:audioEnabled?`${peakFreq} Hz`:"Enable mic",c:"#88ccff"},
              {l:"AI MODEL",v:modelReady?"COCO-SSD READY":"LOADING…",c:modelReady?"#00ff50":"#ffcc00"},
              {l:"ACTIVE TRACKS",v:`${blobsCount}`,c:color},
              {l:"VAULT CLIPS",v:`${clips.length}`,c:"#ff5588"},
              {l:"VAULT PHOTOS",v:`${captures.length}`,c:"#00ddaa"},
              {l:"STORAGE USED",v:storageInfo?`${(storageInfo.used/1048576).toFixed(1)} MB`:"--",c:"#00ddaa"},
              {l:"STORAGE QUOTA",v:storageInfo?`${(storageInfo.quota/1073741824).toFixed(2)} GB`:"--",c:"#00ddaa"},
              {l:"SESSION UPTIME",v:`${Math.floor(sessionStats.uptime/60)}m ${sessionStats.uptime%60}s`,c:color},
              {l:"STABILIZATION",v:stabOn?"ACTIVE":"OFF",c:"#66ddff"},
              {l:"SUPER-RES",v:srOn?"ACCUMULATING":"OFF",c:"#ffaaff"},
              {l:"GEOFENCE",v:geo.anchor?`${geo.inside?"SECURE":"BREACH"} ${Math.round(geo.dist||0)}m/${geo.radius}m`:"NOT SET",c:geo.anchor?(geo.inside?"#00ddaa":"#ff4444"):`${color}50`},
              {l:"TORCH",v:torchOn?"ON":"OFF",c:"#ffdd88"},
              {l:"HW ZOOM",v:hardZoom&&hzoomSupported?`${hzoom.toFixed(1)}× / ${maxZoom}× max`:"CSS only",c:"#44ffcc"},
              {l:"SHAKE",v:`${shakeCount} events`,c:"#ff8844"},
              {l:"CAPTURES",v:`${captures.length}`,c:color},
              {l:"EVENTS",v:`${events.length}`,c:color},
              {l:"TRIPWIRES",v:`${tripwires.length}`,c:"#ffcc00"},
            ].map(({l,v,c})=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"8px 10px",border:`1px solid ${c}15`,borderRadius:2,background:`${c}05`}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:`${c}70`,letterSpacing:2}}>{l}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:c,letterSpacing:1}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gallery modal inline */}
      {modal==="gallery"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",zIndex:200,
          display:"flex",flexDirection:"column",animation:"fade-in 0.2s ease",overflowY:"auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"10px 14px",borderBottom:`1px solid ${color}15`,flexShrink:0}}>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:900,color,letterSpacing:4}}>
              CAPTURE LOG — {captures.length}
            </span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={downloadAll} style={{padding:"6px 10px",background:"transparent",border:`1px solid ${color}30`,borderRadius:4,color:`${color}70`,fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:1,cursor:"pointer"}}>↓ ALL</button>
              <button onClick={clearGallery} style={{padding:"6px 10px",background:"transparent",border:"1px solid rgba(255,68,68,0.3)",borderRadius:4,color:"rgba(255,68,68,0.7)",fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:1,cursor:"pointer"}}>CLEAR</button>
              <button onClick={()=>setModal(null)} style={{padding:"4px 10px",background:"transparent",
              border:`1px solid ${color}30`,borderRadius:2,color:`${color}70`,
              fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:2,cursor:"pointer"}}>CLOSE</button>
            </div>
          </div>
          <div style={{padding:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,overflowY:"auto"}}>
            {captures.length===0&&(
              <div style={{gridColumn:"1/-1",textAlign:"center",padding:40,fontFamily:"'DM Mono',monospace",fontSize:9,color:`${color}35`,letterSpacing:1}}>
                NO CAPTURES — ENABLE AUTO-CAP OR TAP 📷
              </div>
            )}
            {captures.map((c,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",gap:3}}>
                <img src={c.url} style={{width:"100%",borderRadius:2,border:`1px solid ${color}18`,display:"block"}} alt="cap"/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:7,color:`${color}70`,fontFamily:"'DM Mono',monospace",letterSpacing:1}}>{c.label} {c.auto?"[AUTO]":"[SNAP]"}</div>
                    <div style={{fontSize:6,color:`${color}40`,fontFamily:"'DM Mono',monospace"}}>{c.time}{c.targets>0?` • ${c.targets}TGT`:""}</div>
                  </div>
                  <a href={c.url} download={`nvs7-${c.ts}.png`} style={{fontSize:8,color,textDecoration:"none",border:`1px solid ${color}30`,padding:"2px 6px",borderRadius:1,fontFamily:"'DM Mono',monospace"}}>↓</a>
                  <button onClick={async()=>{const r=await shareCapture(c.url,`NVS ${c.utc||c.time} ${c.lat?`@${c.lat.toFixed(5)},${c.lon.toFixed(5)}`:""}`);if(r==="unsupported")addEvent("share",{label:"SHARE NOT SUPPORTED ON THIS BROWSER"});}}
                    style={{fontSize:8,color,background:"transparent",border:`1px solid ${color}30`,padding:"2px 6px",borderRadius:3,fontFamily:"'DM Mono',monospace",cursor:"pointer"}}>⤴</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
