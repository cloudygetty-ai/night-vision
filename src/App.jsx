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
import{MODE_META,MODE_KEYS,ZOOM_STEPS,PEER_ID,Bezel,SectionLabel,BootSequence}from"./part6.jsx";

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function NightVisionCamera(){
  const[booted,setBooted]=useState(false);
  const[stampOn,setStampOn]=useState(true);
  const[dualLayout,setDualLayout]=useState("pip");
  const[primaryCam,setPrimaryCam]=useState("rear");
  const[openGroups,setOpenGroups]=useState({vision:false,detect:false,alert:false,system:false});
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
  const{detect:tfDetect,modelReady}=useTFDetector();
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
        border:`1px solid ${color}18`,boxShadow:`inset 0 0 60px rgba(0,0,0,0.6),inset 0 0 1px ${color}25`,
        animation:booted?"fade-in 0.5s ease":"none",overflow:"hidden",position:"relative"}}>
        <Bezel color={color} op={.4}/>

        {/* HEADER */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",
          borderBottom:`1px solid ${color}15`,position:"relative",
          background:`linear-gradient(180deg,${color}06,transparent)`,backdropFilter:"blur(2px)"}}>
          <div style={{position:"absolute",left:0,right:0,bottom:-1,height:1,
            background:`linear-gradient(90deg,transparent,${color}50,transparent)`,
            backgroundSize:"200% 100%",animation:"header-sweep 5s linear infinite"}}/>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:color,boxShadow:`0 0 10px ${color}`,animation:"rec-blink 2s step-end infinite"}}/>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:900,color,letterSpacing:4,textShadow:`0 0 10px ${color}40`}}>NVS-7</span>
            {multiSync&&peers.length>0&&<span style={{fontSize:7,color:"#cc44ff",letterSpacing:1,border:"1px solid #cc44ff30",padding:"1px 4px",borderRadius:1}}>{peers.length}P</span>}
            {hasTripwire&&<span style={{fontSize:7,color:"#ffcc00",letterSpacing:1,animation:"rec-blink 0.4s step-end infinite",border:"1px solid #ffcc0050",padding:"1px 4px",borderRadius:1}}>⚠WIRE</span>}
            {audioSpike&&<span style={{fontSize:7,color:"#ff2222",letterSpacing:1,animation:"rec-blink 0.3s step-end infinite"}}>🔊!</span>}
            {torchOn&&<span style={{fontSize:9}}>🔦</span>}
            {modelReady?<span style={{fontSize:7,color:"rgba(0,255,80,0.7)",letterSpacing:1}}>AI✓</span>:<span style={{fontSize:7,color:"rgba(255,200,0,0.7)",letterSpacing:1,animation:"rec-blink 1s step-end infinite"}}>AI▸</span>}
            {listening&&<span style={{fontSize:7,color:"#ff88ff",letterSpacing:1,animation:"rec-blink 1.2s step-end infinite"}}>🎤VOX</span>}
            {lastCmd&&<span style={{fontSize:7,color:"#ffdd00",letterSpacing:1,fontWeight:700}}>»{lastCmd}</span>}
            {!online&&<span style={{fontSize:7,color:"#ffaa00",letterSpacing:1,fontWeight:700}}>⚠OFFLINE</span>}
            {timelapse.active&&<span style={{fontSize:7,color:"#ffcc44",letterSpacing:1,animation:"rec-blink 1s step-end infinite"}}>⏲{timelapse.count}</span>}
            {stabOn&&<span style={{fontSize:7,color:"#66ddff",letterSpacing:1}}>🎯STAB</span>}
            {srOn&&<span style={{fontSize:7,color:"#ffaaff",letterSpacing:1}}>🔬SR</span>}
            {geo.anchor&&<span style={{fontSize:7,color:geo.inside?"#00ddaa":"#ff4444",letterSpacing:1,fontWeight:700}}>📍{geo.inside?"SECURE":"BREACH"}</span>}
            {sentryOn&&<span style={{fontSize:7,color:"#ff3355",letterSpacing:1,fontWeight:700,border:"1px solid #ff335560",padding:"1px 4px",borderRadius:2}}>🛡SENTRY</span>}
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            <span style={{fontSize:6,color:`${color}45`,letterSpacing:1}}>{dateStr}</span>
            <span style={{fontSize:10,color,letterSpacing:2}}>{timeStr}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1}}>
            {heading!==null&&<span style={{fontSize:7,color:`${color}55`,letterSpacing:1}}>{String(heading).padStart(3,"0")}° {compassDir}</span>}
            {gps&&<span style={{fontSize:6,color:`${color}40`,letterSpacing:.5}}>{gps.lat.toFixed(3)}°N</span>}
            {altitude!=null&&<span style={{fontSize:6,color:`${color}35`,letterSpacing:.5}}>{altitude}m ASL</span>}
            {wind>1&&<span style={{fontSize:6,color:`${color}35`,letterSpacing:.5}}>💨{wind.toFixed(1)}m/s</span>}
            {battery&&<span style={{fontSize:6,color:battery.level<20?"#ff4444":`${color}35`,letterSpacing:.5}}>{battery.charging?"⚡":"🔋"}{battery.level}%</span>}
            {gps?.speed>0.5&&<span style={{fontSize:6,color:`${color}35`,letterSpacing:.5}}>🏃{(gps.speed*2.237).toFixed(1)}mph</span>}
            {showRPPG&&hr&&<span style={{fontSize:6,color:hrQ>0.5?"#ff6688":`${color}35`,letterSpacing:.5}}>❤️{hr}{spo2?` ${spo2}%`:""}</span>}
            {audioEnabled&&peakFreq>0&&<span style={{fontSize:6,color:`${color}30`,letterSpacing:.5}}>♪{peakFreq}Hz</span>}
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <SignalBars level={.8} color={color}/>
              {autoCapture&&<span style={{fontSize:6,color:"#ffdd00",animation:"rec-blink 1.5s step-end infinite"}}>AUTO</span>}
              {recording&&<span style={{fontSize:6,color:"#ff2222",animation:"rec-blink 1s step-end infinite"}}>●REC</span>}
            </div>
          </div>
        </div>

        {/* CAMERAS */}
        {dualMode?(
          dualLayout==="pip"?(
            /* PIP: primary full, secondary as draggable inset */
            <div style={{position:"relative",height:"45dvh",flexShrink:0}}>
              <CameraPanel {...(primaryCam==="rear"?
                {stream:rear.stream,ready:rear.ready,error:rear.error,label:"REAR",onRetry:rear.retry}:
                {stream:front.stream,ready:front.ready,error:front.error,label:"FRONT",onRetry:front.retry})}
                mode={mode} brightness={brightness} sensitivity={sensitivity} edgeOverlay={edgeOverlay}
              noiseReduction={noiseReduction} color={color} zoom={zoom} showReticle={showReticle}
              motionEnabled={motionEnabled} autoCapture={autoCapture} tripwires={tripwires}
              showRPPG={showRPPG} onCapture={handleCapture} onMotionEvent={handleMotionEvent}
              onTripwireHit={handleTripwireHit} onRPPG={setRppgSample}
              tfDetect={tfDetect} modelReady={modelReady} heatmapOn={heatmapOn}
              starsOn={starsOn} showHist={showHist} stabOn={stabOn} srOn={srOn}
              onLoiter={handleLoiter} onZoom={setZoom} onSwipeMode={cycleMode} onSwipeGain={bumpGain} compact={false} onTrackCount={setBlobsCount}/>
              <div style={{position:"absolute",bottom:10,right:10,width:"34%",aspectRatio:"3/4",
                zIndex:30,border:`1.5px solid ${color}55`,borderRadius:9,overflow:"hidden",
                boxShadow:`0 3px 14px rgba(0,0,0,0.7)`}}>
                <CameraPanel {...(primaryCam==="rear"?
                  {stream:front.stream,ready:front.ready,error:front.error,label:"FRONT",onRetry:front.retry}:
                  {stream:rear.stream,ready:rear.ready,error:rear.error,label:"REAR",onRetry:rear.retry})}
                  mode={mode} brightness={brightness} sensitivity={sensitivity} edgeOverlay={edgeOverlay}
              noiseReduction={noiseReduction} color={color} zoom={zoom} showReticle={showReticle}
              motionEnabled={motionEnabled} autoCapture={autoCapture} tripwires={tripwires}
              showRPPG={showRPPG} onCapture={handleCapture} onMotionEvent={handleMotionEvent}
              onTripwireHit={handleTripwireHit} onRPPG={setRppgSample}
              tfDetect={tfDetect} modelReady={modelReady} heatmapOn={heatmapOn}
              starsOn={starsOn} showHist={showHist} stabOn={stabOn} srOn={srOn}
              onLoiter={handleLoiter} onZoom={setZoom} onSwipeMode={cycleMode} onSwipeGain={bumpGain} compact={true}/>
              </div>
            </div>
          ):(
            /* SPLIT: side-by-side equal panes */
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1,background:`${color}08`,height:"38dvh",flexShrink:0}}>
              <CameraPanel stream={rear.stream} ready={rear.ready} error={rear.error} label="REAR"
                onRetry={rear.retry} mode={mode} brightness={brightness} sensitivity={sensitivity} edgeOverlay={edgeOverlay}
              noiseReduction={noiseReduction} color={color} zoom={zoom} showReticle={showReticle}
              motionEnabled={motionEnabled} autoCapture={autoCapture} tripwires={tripwires}
              showRPPG={showRPPG} onCapture={handleCapture} onMotionEvent={handleMotionEvent}
              onTripwireHit={handleTripwireHit} onRPPG={setRppgSample}
              tfDetect={tfDetect} modelReady={modelReady} heatmapOn={heatmapOn}
              starsOn={starsOn} showHist={showHist} stabOn={stabOn} srOn={srOn}
              onLoiter={handleLoiter} onZoom={setZoom} onSwipeMode={cycleMode} onSwipeGain={bumpGain} compact={true} onTrackCount={setBlobsCount}/>
              <CameraPanel stream={front.stream} ready={front.ready} error={front.error} label="FRONT"
                onRetry={front.retry} mode={mode} brightness={brightness} sensitivity={sensitivity} edgeOverlay={edgeOverlay}
              noiseReduction={noiseReduction} color={color} zoom={zoom} showReticle={showReticle}
              motionEnabled={motionEnabled} autoCapture={autoCapture} tripwires={tripwires}
              showRPPG={showRPPG} onCapture={handleCapture} onMotionEvent={handleMotionEvent}
              onTripwireHit={handleTripwireHit} onRPPG={setRppgSample}
              tfDetect={tfDetect} modelReady={modelReady} heatmapOn={heatmapOn}
              starsOn={starsOn} showHist={showHist} stabOn={stabOn} srOn={srOn}
              onLoiter={handleLoiter} onZoom={setZoom} onSwipeMode={cycleMode} onSwipeGain={bumpGain} compact={true}/>
            </div>
          )
        ):(
          <div style={{height:"45dvh",flexShrink:0,display:"flex",flexDirection:"column"}}>
            <CameraPanel stream={rear.stream} ready={rear.ready} error={rear.error} label="REAR"
              onRetry={rear.retry} mode={mode} brightness={brightness} sensitivity={sensitivity} edgeOverlay={edgeOverlay}
              noiseReduction={noiseReduction} color={color} zoom={zoom} showReticle={showReticle}
              motionEnabled={motionEnabled} autoCapture={autoCapture} tripwires={tripwires}
              showRPPG={showRPPG} onCapture={handleCapture} onMotionEvent={handleMotionEvent}
              onTripwireHit={handleTripwireHit} onRPPG={setRppgSample}
              tfDetect={tfDetect} modelReady={modelReady} heatmapOn={heatmapOn}
              starsOn={starsOn} showHist={showHist} stabOn={stabOn} srOn={srOn}
              onLoiter={handleLoiter} onZoom={setZoom} onSwipeMode={cycleMode} onSwipeGain={bumpGain} compact={false} onTrackCount={setBlobsCount}/>
            {(showRPPG||audioEnabled)&&(
              <BiometricHUD hr={hr} audioLevel={audioLevel} audioSpike={audioSpike} color={color}/>
            )}
          </div>
        )}
        {dualMode&&(
          <div style={{display:"flex",gap:6,padding:"6px 12px 0",alignItems:"center"}}>
            {["split","pip"].map(l=>(
              <button key={l} onClick={()=>setDualLayout(l)} style={{flex:1,padding:"8px 4px",
                background:dualLayout===l?`${color}14`:"rgba(255,255,255,0.02)",
                border:`1px solid ${dualLayout===l?color:`${color}22`}`,borderRadius:7,
                fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:1.5,
                color:dualLayout===l?color:`${color}55`,fontWeight:dualLayout===l?700:400}}>
                {l==="split"?"◫ SPLIT":"⬓ PIP"}
              </button>
            ))}
            {dualLayout==="pip"&&(
              <button onClick={()=>setPrimaryCam(c=>c==="rear"?"front":"rear")} style={{flex:1,padding:"8px 4px",
                background:"rgba(255,255,255,0.02)",border:`1px solid ${color}22`,borderRadius:7,
                fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:1.5,color:`${color}70`}}>
                ⇄ {primaryCam.toUpperCase()}
              </button>
            )}
          </div>
        )}
        {dualMode&&front.error&&!front.stream&&(
          <div style={{margin:"8px 12px 0",padding:"10px 12px",borderRadius:8,
            border:"1px solid rgba(255,170,0,0.4)",background:"rgba(255,170,0,0.07)"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#ffaa00",letterSpacing:1,marginBottom:4}}>
              ⚠ SECOND CAMERA UNAVAILABLE
            </div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"rgba(255,170,0,0.7)",lineHeight:1.5}}>
              This device can only run one camera at a time (common on iOS Safari and most Android browsers).
              Use ⇄ SWAP below to switch which camera is active, or turn DUAL CAM off.
            </div>
            <button onClick={()=>{setDualMode(false);front.retry?.();}} style={{marginTop:8,padding:"7px 12px",
              background:"transparent",border:"1px solid rgba(255,170,0,0.4)",borderRadius:6,
              color:"#ffaa00",fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:1.5}}>
              USE SINGLE CAMERA
            </button>
          </div>
        )}

        {/* CONTROLS — scrollable deck below fixed camera */}
        <div style={{
          padding:"12px 12px 24px",
          borderTop:`1px solid ${color}18`,
          display:"flex",flexDirection:"column",gap:10,
          background:"rgba(0,0,0,0.85)",
          flex:1,minHeight:0,overflowY:"auto",
          WebkitOverflowScrolling:"touch",
        }}>

          {/* ── MODE SELECTOR ── */}
          {/* ── PRESETS ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {[
              {n:"SURVEIL",i:"🛡",d:"NVG + sentry + heat"},
              {n:"RECON",i:"🔭",d:"Tactical day + edges"},
              {n:"ASTRO",i:"✨",d:"Long exposure + stars"},
              {n:"SEARCH",i:"🔍",d:"White-hot + auto-cap"},
            ].map(({n,i})=>(
              <button key={n} onClick={()=>applyPreset(n)} style={{
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 3px",
                background:activePreset===n?`${color}16`:"rgba(255,255,255,0.02)",
                border:`1px solid ${activePreset===n?color:`${color}20`}`,borderRadius:9,
                boxShadow:activePreset===n?`0 0 8px ${color}25`:"none",transition:"all 0.12s",
              }}>
                <span style={{fontSize:13,lineHeight:1}}>{i}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,letterSpacing:1,
                  color:activePreset===n?color:`${color}60`,fontWeight:activePreset===n?700:400}}>{n}</span>
              </button>
            ))}
          </div>

          {/* ── QUICK BAR — the four things you actually reach for ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {[
              {l:"📷",sub:"SHOT",f:manualSnap,c:color},
              {l:recording?"■":"●",sub:recording?"STOP":"REC",f:toggleRecord,c:recording?"#ff2222":"#ff5555"},
              {l:"🔦",sub:"TORCH",f:toggleTorch,c:"#ffdd88",on:torchOn},
              {l:"🛡",sub:"SENTRY",f:()=>setSentryOn(s=>!s),c:"#ff3355",on:sentryOn},
            ].map(({l,sub,f,c,on})=>(
              <button key={sub} onClick={f} style={{
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                padding:"12px 4px",
                background:on?`${c}1a`:"rgba(255,255,255,0.03)",
                border:`1.5px solid ${on?c:`${c}30`}`,borderRadius:10,
                boxShadow:on?`0 0 10px ${c}30`:"none",transition:"all 0.12s",
              }}>
                <span style={{fontSize:16,lineHeight:1,color:c}}>{l}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,letterSpacing:1.5,
                  color:on?c:`${c}70`,fontWeight:on?700:400}}>{sub}</span>
              </button>
            ))}
          </div>

          {/* ── GESTURE HINT ── */}
          <div style={{display:"flex",gap:10,justifyContent:"center",padding:"2px 0 0",flexWrap:"wrap"}}>
            {["◀▶ swipe: mode","▲▼ swipe: gain","pinch: zoom","2-tap: magnify"].map(h=>(
              <span key={h} style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:`${color}30`,letterSpacing:.5}}>{h}</span>
            ))}
          </div>

          <div style={{padding:"9px 10px",border:`1px solid ${color}12`,borderRadius:9,background:`${color}03`}}>
            <SectionLabel color={color}>MODE</SectionLabel>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {MODE_KEYS.map(m=>{
                const mc=MODE_META[m].color;
                return(
                  <button key={m} onClick={()=>setMode(m)} style={{
                    flex:"1 1 auto",minWidth:44,padding:"9px 2px",
                    background:mode===m?`${mc}20`:"rgba(0,0,0,0.4)",
                    border:`1.5px solid ${mode===m?mc:`${mc}28`}`,
                    borderRadius:6,fontSize:8,fontWeight:700,
                    color:mode===m?mc:`${mc}55`,
                    letterSpacing:.5,transition:"all 0.15s",
                    boxShadow:mode===m?`0 0 8px ${mc}30`:"none",
                  }}>
                    {MODE_META[m].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── ZOOM ── */}
          <div style={{padding:"9px 10px",border:`1px solid ${color}12`,borderRadius:9,background:`${color}03`}}>
            <SectionLabel color={color}>ZOOM</SectionLabel>
            <div style={{display:"flex",gap:5}}>
              {ZOOM_STEPS.map(z=>(
                <button key={z} onClick={()=>setZoom(z)} style={{
                  flex:1,padding:"10px 2px",
                  background:zoom===z?`${color}18`:"rgba(0,0,0,0.4)",
                  border:`1.5px solid ${zoom===z?color:`${color}20`}`,
                  borderRadius:6,fontSize:9,fontWeight:700,
                  color:zoom===z?color:`${color}45`,
                  transition:"all 0.12s",
                  boxShadow:zoom===z?`0 0 6px ${color}25`:"none",
                }}>
                  {z}×
                </button>
              ))}
            </div>
            {hardZoom&&hzoomSupported&&(
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8}}>
                <span style={{fontSize:9,color:`${color}60`,letterSpacing:1,whiteSpace:"nowrap"}}>HW ZOOM</span>
                <input type="range" min="1" max={maxZoom} step="0.1" value={hzoom}
                  onChange={e=>applyZoom(parseFloat(e.target.value))}
                  style={{flex:1,accentColor:color,height:4}}/>
                <span style={{fontSize:9,color:color,minWidth:34,fontWeight:700}}>{hzoom.toFixed(1)}×</span>
              </div>
            )}
          </div>

          {/* ── SLIDERS ── */}
          <div style={{display:"flex",flexDirection:"column",gap:8,padding:"9px 10px",
            border:`1px solid ${color}12`,borderRadius:9,background:`${color}03`}}>
            <SectionLabel color={color}>SIGNAL</SectionLabel>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:9,color:`${color}60`,letterSpacing:1,minWidth:36}}>SENS</span>
              <input type="range" min="0" max="1" step="0.05" value={sensitivity}
                onChange={e=>setSensitivity(parseFloat(e.target.value))}
                style={{flex:1,accentColor:color,height:4}}/>
              <span style={{fontSize:9,color:color,minWidth:32,fontWeight:700,textAlign:"right"}}>{Math.round(sensitivity*100)}%</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:9,color:`${color}60`,letterSpacing:1,minWidth:36}}>GAIN</span>
              <div style={{flex:1,display:"flex",gap:4,alignItems:"flex-end",height:22}}>
                {[-2,-1,0,1,2].map((v,i)=>(
                  <div key={i} onClick={()=>setBrightness(v*0.75)} style={{
                    flex:1,height:10+i*3,borderRadius:2,cursor:"pointer",
                    background:brightness>=v*0.75?color:`${color}20`,
                    transition:"background 0.1s",
                    boxShadow:brightness>=v*0.75?`0 0 4px ${color}50`:"none",
                  }}/>
                ))}
              </div>
              <span style={{fontSize:9,color:color,minWidth:32,fontWeight:700,textAlign:"right"}}>
                {brightness>0?"+":""}{(brightness).toFixed(1)}
              </span>
            </div>
          </div>

          {/* ── FEATURE TOGGLES — grouped & collapsible ── */}
          {[
            {id:"vision",label:"VISION",items:[
              {l:"EDGE",v:edgeOverlay,f:()=>setEdgeOverlay(e=>!e)},
              {l:"NOISE RED",v:noiseReduction,f:()=>setNoiseReduction(n=>!n)},
              {l:"RETICLE",v:showReticle,f:()=>setShowReticle(r=>!r)},
              {l:"🎯 STAB",v:stabOn,f:()=>setStabOn(s=>!s),c:"#66ddff"},
              {l:"🔬 SUPER-R",v:srOn,f:()=>setSrOn(s=>!s),c:"#ffaaff"},
              {l:"📊 HISTOGRAM",v:showHist,f:()=>setShowHist(h=>!h),c:"#88ff88"},
              {l:"✨ STARS",v:starsOn,f:()=>setStarsOn(s=>!s),c:"#a0d8ff"},
              {l:"🔦 TORCH",v:torchOn,f:toggleTorch,c:"#ffdd88"},
              {l:"HW ZOOM",v:hardZoom,f:()=>setHardZoom(h=>!h),c:"#44ffcc"},
              {l:"DUAL CAM",v:dualMode,f:()=>setDualMode(d=>!d)},
            ]},
            {id:"detect",label:"DETECTION",items:[
              {l:"MOTION",v:motionEnabled,f:()=>setMotionEnabled(m=>!m)},
              {l:"FACE",v:faceDetect,f:()=>setFaceDetect(fd=>!fd)},
              {l:"🌡 HEATMAP",v:heatmapOn,f:()=>setHeatmapOn(h=>!h),c:"#ff7700"},
              {l:"🎤 MIC",v:audioEnabled,f:()=>setAudioEnabled(a=>!a)},
              {l:"❤️ rPPG",v:showRPPG,f:()=>setShowRPPG(r=>!r),c:"#ff6688"},
              {l:"💥 SHAKE",v:shakeEnabled,f:()=>setShakeEnabled(s=>!s),c:"#ff8844"},
            ]},
            {id:"alert",label:"ALERTS & AUTOMATION",items:[
              {l:"🛡 SENTRY",v:sentryOn,f:()=>setSentryOn(s=>!s),c:"#ff3355"},
              {l:"🔔 ALERTS",v:alertsOn,f:()=>setAlertsOn(a=>!a),c:"#ffaa00"},
              {l:"🎯 AUTO-CAP",v:autoCapture,f:()=>setAutoCapture(a=>!a),c:"#ffdd00"},
            ]},
            {id:"system",label:"SYSTEM",items:[
              {l:"💾 VAULT",v:vaultOn,f:()=>setVaultOn(v=>!v),c:"#00ddaa"},
              {l:"🎤 VOICE",v:voiceOn,f:()=>setVoiceOn(v=>!v),c:"#ff88ff"},
              {l:"🔗 SYNC",v:multiSync,f:()=>setMultiSync(s=>!s),c:"#cc44ff"},
              {l:"🏷 GEO-STAMP",v:stampOn,f:()=>setStampOn(s=>!s),c:"#00ddaa"},
              {l:"🔴 NIGHT-SAFE UI",v:redUI,f:()=>setRedUI(r=>!r),c:"#ff2200"},
              {l:"🌑 STEALTH",v:stealth,f:()=>setStealth(true),c:"#666666"},
            ]},
          ].map(group=>{
            const open=openGroups[group.id];
            const activeCount=group.items.filter(i=>i.v).length;
            return(
              <div key={group.id} style={{border:`1px solid ${color}12`,borderRadius:9,background:`${color}03`,overflow:"hidden"}}>
                <button onClick={()=>setOpenGroups(g=>({...g,[group.id]:!g[group.id]}))}
                  style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"11px 12px",background:"transparent",border:"none",cursor:"pointer"}}>
                  <span style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:`${color}75`,letterSpacing:2.5,fontWeight:600}}>{group.label}</span>
                    {activeCount>0&&(
                      <span style={{fontSize:7,color:"#000",background:color,borderRadius:8,
                        padding:"1px 6px",fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{activeCount}</span>
                    )}
                  </span>
                  <span style={{fontSize:9,color:`${color}50`,transform:open?"rotate(90deg)":"none",transition:"transform 0.15s"}}>▶</span>
                </button>
                {open&&(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,padding:"0 10px 11px"}}>
                    {group.items.map(({l,v,f,c})=>(
                      <button key={l} onClick={f} style={{
                        display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,
                        padding:"12px 11px",
                        background:v?`${c||color}14`:"rgba(255,255,255,0.02)",
                        border:`1px solid ${v?(c||color):`${c||color}20`}`,
                        borderRadius:8,fontSize:9,fontWeight:v?700:400,
                        color:v?(c||color):`${c||color}55`,
                        letterSpacing:.3,transition:"all 0.12s",
                        boxShadow:v?`0 0 8px ${c||color}22`:"none",
                      }}>
                        <span style={{textAlign:"left",lineHeight:1.2}}>{l}</span>
                        <span style={{width:22,height:12,borderRadius:7,flexShrink:0,
                          background:v?(c||color):`${c||color}25`,position:"relative",transition:"background 0.15s"}}>
                          <span style={{position:"absolute",top:2,left:v?12:2,width:8,height:8,borderRadius:"50%",
                            background:v?"#000":`${c||color}70`,transition:"left 0.15s"}}/>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── CAPTURE ACTIONS ── */}
          <div style={{padding:"9px 10px",border:`1px solid ${color}12`,borderRadius:9,background:`${color}03`}}>
            <SectionLabel color={color}>CAPTURE</SectionLabel>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:5}}>
              <button onClick={()=>setAutoCapture(a=>!a)} style={{
                padding:"12px 6px",
                background:autoCapture?"rgba(255,221,0,0.15)":"rgba(0,0,0,0.35)",
                border:`1.5px solid ${autoCapture?"#ffdd00":"rgba(255,221,0,0.25)"}`,
                borderRadius:7,fontSize:9,fontWeight:700,
                color:autoCapture?"#ffdd00":"rgba(255,221,0,0.45)",
                boxShadow:autoCapture?"0 0 8px rgba(255,221,0,0.2)":"none",
                transition:"all 0.12s",
              }}>
                🎯 AUTO {autoCapture?"ON":"OFF"}
              </button>
              <button onClick={manualSnap} style={{
                padding:"12px 4px",background:"rgba(0,0,0,0.35)",
                border:`1.5px solid ${color}30`,borderRadius:7,
                fontSize:14,color,
              }}>📷</button>
              <button onClick={burstSnap} style={{
                padding:"12px 4px",
                background:burstMode?"rgba(255,68,170,0.15)":"rgba(0,0,0,0.35)",
                border:"1.5px solid rgba(255,68,170,0.35)",
                borderRadius:7,fontSize:9,fontWeight:700,
                color:"rgba(255,68,170,0.8)",
              }}>×5</button>
              <button onClick={toggleRecord} style={{
                padding:"12px 4px",
                background:recording?"rgba(255,34,34,0.15)":"rgba(0,0,0,0.35)",
                border:`1.5px solid ${recording?"#ff2222":"rgba(255,34,34,0.25)"}`,
                borderRadius:7,fontSize:9,fontWeight:700,
                color:recording?"#ff2222":"rgba(255,34,34,0.45)",
                boxShadow:recording?"0 0 8px rgba(255,34,34,0.2)":"none",
              }}>
                {recording?"■ STOP":"● REC"}
              </button>
            </div>
          </div>

          {/* ── TOOLS ── */}
          <div style={{padding:"9px 10px",border:`1px solid ${color}12`,borderRadius:9,background:`${color}03`}}>
            <SectionLabel color={color}>TOOLS</SectionLabel>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
              {[
                {l:"📁 Gallery",m:"gallery",c:newCapCount>0?color:undefined,badge:newCapCount>0?newCapCount:null},
                {l:"🗺 Map",m:"map",c:"#00ccff"},
                {l:"⏱ Log",m:"timeline",c:"#cc44ff",badge:newEventCount>0?newEventCount:null},
                {l:"⚡ Tripwire",m:"tripwire",c:hasTripwire?"#ffcc00":"#ffcc0080"},
                {l:"📷 QR Scan",m:"qrscan",c:"#44ffc8"},
                {l:"📄 Report",m:"report",c:"#b464ff"},
                {l:`🎞 Clips${clips.length?` (${clips.length})`:""}`,m:"clips",c:"#ff5588"},
                {l:`🌐 Pano${pano.frames.length?` (${pano.frames.length})`:""}`,m:"panoadd",c:"#ffcc44"},
                {l:"📊 Sensors",m:"sensors",c:"#44ffcc"},
                {l:"📡 Cast",m:"cast",c:castOn?"#00ff88":"#00ff8880"},
                {l:"? Manual",m:"manual",c:`${color}80`},
              ].map(({l,m,c,badge})=>(
                <button key={m} onClick={()=>{
                  if(m==="qrscan"){scanQR();return;}
                  if(m==="panoadd"){
                    const cv=document.querySelector("canvas[data-primary='true']");
                    if(cv)pano.add(cv.toDataURL("image/jpeg",0.85));
                    addEvent("pano",{label:`PANO FRAME ${pano.frames.length+1}/12 CAPTURED`});
                    return;
                  }
                  if(m==="report"){exportPDF();return;}
                  setModal(m);
                }} style={{
                  padding:"11px 4px",
                  background:modal===m?`${c||color}15`:"rgba(0,0,0,0.35)",
                  border:`1.5px solid ${c||color}${modal===m?"":"30"}`,
                  borderRadius:7,fontSize:9,fontWeight:500,
                  color:c||`${color}60`,
                  letterSpacing:.2,transition:"all 0.12s",
                  position:"relative",
                }}>
                  {l}
                  {badge&&<span style={{
                    position:"absolute",top:3,right:4,
                    background:c||color,color:"#000",
                    fontSize:6,fontWeight:700,borderRadius:8,
                    padding:"1px 4px",lineHeight:1.2,
                  }}>{badge}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Timelapse */}
          <div style={{display:"flex",gap:6,alignItems:"center",padding:"8px 10px",
            border:`1px solid ${timelapse.active?"rgba(255,204,68,0.45)":`${color}18`}`,borderRadius:8,
            background:timelapse.active?"rgba(255,204,68,0.06)":"transparent"}}>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,
              color:timelapse.active?"#ffcc44":`${color}60`,flex:1,letterSpacing:.5}}>
              ⏲ {timelapse.active?`TIMELAPSE · ${timelapse.count} SHOTS`:"TIMELAPSE OFF"}
            </span>
            <select value={timelapse.interval} onChange={e=>timelapse.setIntervalSec(+e.target.value)}
              style={{background:"rgba(0,0,0,0.6)",border:`1px solid ${color}25`,borderRadius:5,
                color:color,fontFamily:"'DM Mono',monospace",fontSize:9,padding:"5px 4px"}}>
              {[2,5,10,30,60,300].map(s=><option key={s} value={s}>{s<60?`${s}s`:`${s/60}m`}</option>)}
            </select>
            <button onClick={timelapse.active?timelapse.stop:timelapse.start} style={{padding:"7px 12px",
              background:"transparent",border:`1px solid ${timelapse.active?"rgba(255,68,68,0.4)":`${color}30`}`,
              borderRadius:6,color:timelapse.active?"rgba(255,68,68,0.8)":color,
              fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:1}}>
              {timelapse.active?"STOP":"START"}
            </button>
          </div>

          {/* Geofence control */}
          <div style={{display:"flex",gap:5,alignItems:"center",padding:"8px 10px",
            border:`1px solid ${geo.anchor?(geo.inside?"rgba(0,221,170,0.35)":"rgba(255,68,68,0.5)"):`${color}18`}`,
            borderRadius:7,background:geo.anchor?(geo.inside?"rgba(0,221,170,0.05)":"rgba(255,68,68,0.08)"):"transparent"}}>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,
              color:geo.anchor?(geo.inside?"#00ddaa":"#ff4444"):`${color}55`,flex:1}}>
              📍 {geo.anchor?`GEOFENCE ${geo.inside?"SECURE":"BREACH"} · ${geo.dist!=null?Math.round(geo.dist)+"m":"--"}/${geo.radius}m`:"GEOFENCE OFF"}
            </span>
            {geo.anchor&&(
              <input type="range" min="25" max="500" step="25" value={geo.radius}
                onChange={e=>geo.setRadius(parseInt(e.target.value))}
                style={{width:70,accentColor:color,height:4}}/>
            )}
            <button onClick={geo.anchor?geo.clear:geo.drop} disabled={!gps} style={{padding:"6px 10px",
              background:"transparent",border:`1px solid ${geo.anchor?"rgba(255,68,68,0.3)":`${color}30`}`,
              borderRadius:4,color:geo.anchor?"rgba(255,68,68,0.7)":color,
              fontFamily:"'DM Mono',monospace",fontSize:9,cursor:"pointer",opacity:gps?1:0.4}}>
              {geo.anchor?"✕":"DROP"}
            </button>
          </div>

          {pano.frames.length>0&&(
            <div style={{display:"flex",gap:5,alignItems:"center",padding:"8px 10px",
              border:"1px solid rgba(255,204,68,0.3)",borderRadius:7,background:"rgba(255,204,68,0.05)"}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#ffcc44",flex:1}}>
                🌐 PANORAMA — {pano.frames.length}/12 frames
              </span>
              <button onClick={async()=>{
                const url=await pano.stitch();
                if(url){handleCapture(url,"PANORAMA",0,false);pano.reset();addEvent("pano",{label:"PANORAMA STITCHED"});}
              }} disabled={pano.frames.length<2} style={{padding:"6px 10px",background:"transparent",
                border:"1px solid rgba(255,204,68,0.4)",borderRadius:4,color:"#ffcc44",
                fontFamily:"'DM Mono',monospace",fontSize:9,cursor:"pointer",
                opacity:pano.frames.length<2?0.4:1}}>STITCH</button>
              <button onClick={pano.reset} style={{padding:"6px 10px",background:"transparent",
                border:"1px solid rgba(255,68,68,0.3)",borderRadius:4,color:"rgba(255,68,68,0.7)",
                fontFamily:"'DM Mono',monospace",fontSize:9,cursor:"pointer"}}>✕</button>
            </div>
          )}

          {/* QR result */}
          {qrResult&&(
            <div style={{
              padding:"10px 12px",
              background:"rgba(68,255,200,0.06)",
              border:"1px solid rgba(68,255,200,0.3)",
              borderRadius:7,display:"flex",alignItems:"center",gap:8,
            }}>
              <span style={{fontSize:9,color:"rgba(68,255,200,0.6)",letterSpacing:1,flexShrink:0}}>QR:</span>
              <span style={{fontSize:9,color:"rgba(68,255,200,0.95)",flex:1,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{qrResult}</span>
              <button onClick={()=>setQrResult(null)} style={{
                background:"transparent",border:"1px solid rgba(68,255,200,0.3)",
                color:"rgba(68,255,200,0.6)",fontSize:9,cursor:"pointer",
                borderRadius:4,padding:"2px 8px",
              }}>✕</button>
            </div>
          )}

          {/* PEER STATUS */}
          {multiSync&&(
            <div style={{
              padding:"8px 12px",
              border:"1px solid rgba(204,68,255,0.2)",
              borderRadius:7,background:"rgba(204,68,255,0.05)",
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:9,color:"#cc44ff",letterSpacing:1}}>SYNC — ID:{PEER_ID.slice(-4)}</span>
                <span style={{fontSize:8,color:"rgba(204,68,255,0.6)"}}>{peers.length} PEER{peers.length!==1?"S":""}</span>
              </div>
              {syncAlerts.slice(0,2).map((a,i)=>(
                <div key={i} style={{fontSize:8,color:"rgba(204,68,255,0.7)",marginTop:3}}>
                  ↳ {a.from.slice(-4)}: {a.payload?.label||"ALERT"}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{padding:"4px 12px",borderTop:`1px solid ${color}08`,display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:6,color:`${color}18`,letterSpacing:1}}>CLOUDYGETTY-AI // ENTROPY-ZERO</span>
          <span style={{fontSize:6,color:`${color}18`,letterSpacing:1}}>NVS-7.5 // CLASSIFIED</span>
        </div>
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
