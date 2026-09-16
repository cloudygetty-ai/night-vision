import{useState,useEffect,useRef,useMemo,useCallback}from"react";

// ═══════════════════════════════════════════════════════════════════════════════
// INSTRUCTIONS MODAL
// ═══════════════════════════════════════════════════════════════════════════════
export function InstructionsModal({color,onClose}){
  const[tab,setTab]=useState("start");
  const tabs={
    start:"START",
    modes:"MODES",
    ai:"AI/TRACK",
    auto:"AUTOMATION",
    tools:"TOOLS",
    voice:"VOICE",
    vault:"STORAGE",
  };
  const content={
    vault:[
      {icon:"💾",title:"WHERE EVERYTHING GOES",body:"With VAULT on (default), photos and video clips are written to IndexedDB on this device and survive reloads, tab closes, and phone restarts. Nothing is ever uploaded — no server, no cloud."},
      {icon:"🎞",title:"CLIP VAULT",body:"Tools → Clips: every recording (manual ⏺ REC and 🛡 SENTRY auto-clips) with inline playback, duration, size, and mode. ↓ saves to your device Downloads, ✕ deletes one, CLEAR wipes all."},
      {icon:"📁",title:"PHOTO VAULT",body:"Gallery holds up to 200 stills across sessions. ↓ ALL downloads every shot, CLEAR wipes the store."},
      {icon:"📊",title:"STORAGE BUDGET",body:"Sensors panel shows MB used and total quota (usually several GB). The app requests persistent storage so the browser will not silently evict your vault."},
      {icon:"⬇",title:"GETTING DATA OUT",body:"Photos/clips: ↓ buttons. Events: ↓ CSV in the Event Log. Full session: 📄 Report. Turn VAULT off to revert to instant-download-on-stop behavior instead of storing."},
    ],
    start:[
      {icon:"📷",title:"ALLOW CAMERA",body:"Open in Chrome/Safari and tap Allow on the camera prompt. Also Allow location (GPS map, altitude) and microphone (audio spike, wind) when asked. iOS: Settings → Safari → Camera → Allow."},
      {icon:"▶",title:"IF CAMERA WON'T START",body:"After 6s a TAP TO START CAMERA button appears — tap it. Any error screen also has a ↻ RETRY button. Tapping counts as a user gesture, which iOS always honors."},
      {icon:"📱",title:"INSTALL AS APP",body:"Share button → Add to Home Screen for full-screen with no browser chrome. Screen stays awake automatically while the app is open (wake lock)."},
      {icon:"👆",title:"GESTURES",body:"Swipe ◀▶ across the camera to cycle modes. Swipe ▲▼ to change gain. Pinch to zoom. Double-tap for the 3x magnifier. Single tap drops a focus ring. No buttons needed for the common moves."},
      {icon:"⚡",title:"MISSION PRESETS",body:"Four one-tap profiles configure every setting at once. SURVEIL: NVG + sentry + heatmap + auto-capture. RECON: tactical day + edges + 2x. ASTRO: long exposure + super-res + star tracker. SEARCH: white-hot + high sensitivity + auto-capture."},
      {icon:"🌑",title:"STEALTH MODE",body:"Blacks the screen almost completely while recording, sentry, and all detection keep running underneath. Dim indicators show what is still armed. Tap anywhere to wake. Say \"stealth\" to trigger hands-free."},
      {icon:"🔴",title:"NIGHT-SAFE UI",body:"Switches the entire interface to deep red, which preserves your eyes dark adaptation during long night operations. Toggle in SYSTEM or say \"night safe\"."},
      {icon:"🔍",title:"TAP TO MAGNIFY",body:"Tap anywhere on the camera view for a live 3× magnified inset of that spot (top-right, with crosshair). Tap the inset to close. Works in every mode."},
      {icon:"🌙",title:"SEEING IN THE DARK",body:"NVG mode + GAIN at +2. Hold steady — 4-frame stacking pulls signal from noise. For extreme darkness or stars use ASTRO (30-frame long exposure, hold very still or brace the phone)."},
      {icon:"🔋",title:"HUD READOUTS",body:"Header shows battery %, compass bearing, GPS, altitude, wind estimate, AI status (AI▸ loading / AI✓ ready), and active systems: 🔦 torch, 🎤VOX voice, 🛡SENTRY."},
    ],
    modes:[
      {icon:"⬜",title:"RAW",body:"Pure passthrough. Zero processing — exactly what the sensor sees."},
      {icon:"🟢",title:"NVG",body:"Realistic night vision: 4-frame temporal stacking, extreme green-channel CLAHE, 4.5× gain, gamma shadow lift, phosphor bloom, tube vignette, scanlines. Use GAIN bars to push further."},
      {icon:"🔥",title:"THERMAL / RAINBOW / FUSION / ARCTIC / WHT-HOT",body:"False-color luminance palettes. THERMAL maps brightness to heat colors; WHT-HOT is classic military white-hot; FUSION blends thermal with edge data."},
      {icon:"☀️",title:"TACT",body:"Daytime tactical: per-channel auto-levels, unsharp sharpening, military CMOS tint, amber grid HUD."},
      {icon:"🌫",title:"DEHAZE",body:"Dark-channel-prior haze removal — cuts fog, mist, and atmospheric scatter, then sharpens."},
      {icon:"🕶",title:"POLARIZ",body:"Polarized-lens simulation: crushes specular glare from water/glass/metal, boosts saturation 60%."},
      {icon:"✨",title:"ASTRO",body:"30-frame additive long exposure with deep shadow lift — reveals stars and faint light invisible to the eye. Brace the phone; motion blurs the stack."},
    ],
    ai:[
      {icon:"🧠",title:"REAL OBJECT NAMES",body:"TensorFlow COCO-SSD (loads once, ~3MB — AI▸ becomes AI✓) identifies 80 object types by name: PERSON, CAR, DOG, LAPTOP, CELL PHONE, BIRD… Detection runs every 500ms without slowing the feed."},
      {icon:"#",title:"PERSISTENT TRACK IDs",body:"Every target keeps its ID (#1, #2…) as it moves. Boxes are color-ranked by threat order. Main target gets the large label."},
      {icon:"〰",title:"MOTION TRAILS",body:"Dashed line shows each target's last 24 positions — see patrol routes and movement history at a glance."},
      {icon:"➤",title:"VELOCITY VECTORS",body:"Yellow-tipped arrow shows direction and speed of moving targets, smoothed with momentum. Longer arrow = faster."},
      {icon:"📏",title:"DISTANCE ESTIMATE",body:"Pinhole-model range estimate under each label (assumes human-scale target). Rough guide, not a rangefinder."},
      {icon:"📏",title:"REFERENCE RANGEFINDER",body:"Distance now comes from known real-world object heights (person 1.7m, car 1.5m, stop sign 2.1m…) against pixel height and camera FOV — far more accurate than the old generic estimate."},
      {icon:"✨",title:"STAR / SATELLITE TRACKER",body:"Toggle STARS (best with ASTRO): finds bright point sources via local-maxima detection, circles each with its brightness value. Watch a marked point drift between frames to identify a satellite."},
      {icon:"📊",title:"LIVE HISTOGRAM",body:"Toggle HIST for a 64-bin luminance histogram bottom-left. Blue bars = crushed shadows, red = blown highlights. An ⚠ banner warns when the frame is badly under- or over-exposed."},
      {icon:"🌐",title:"PANORAMA",body:"Tools → Pano captures a frame each tap (up to 12). Pan roughly 15% between shots. Press STITCH to blend them into one wide image saved to Gallery."},
      {icon:"🎯",title:"DIGITAL STABILIZATION",body:"Toggle STAB: estimates global frame-to-frame shift via sparse phase correlation and counter-translates the view with 1.08x overscan. Cancels handshake — essential at 8x+ zoom and for ASTRO."},
      {icon:"🔬",title:"SUPER-RESOLUTION",body:"Toggle SUPER-R on a static scene: registers and averages successive frames to recover real detail and crush sensor noise. Keeps improving the longer you hold still. Resets on mode change."},
      {icon:"⏳",title:"LOITER DETECTION",body:"Any tracked target that stays within ~70px for over 8 seconds is flagged as loitering and logged with its dwell time. Fires an alert beep. Catches someone casing a location."},
      {icon:"📍",title:"GEOFENCE",body:"DROP plants an anchor at your current GPS position with an adjustable 25-500m radius. Crossing the boundary either way fires a double beep, a header BREACH indicator, and a log entry with distance."},
      {icon:"🌡",title:"HEAT OVERLAY",body:"Toggle HEAT: motion accumulates into a decaying blue→yellow→red heatmap showing WHERE activity happened over the last ~30s. Stacks with any mode."},
    ],
    auto:[
      {icon:"🛡",title:"SENTRY MODE",body:"Arm SENTRY and walk away. When a PERSON is detected: alert beep + auto-record starts. Recording extends while the person remains, stops 10s after last sighting. Every trigger is logged. HUD is burned into the clip."},
      {icon:"🎯",title:"AUTO CAPTURE",body:"AUTO ON: any significant motion → 600ms lock → white flash → PNG saved to Gallery. 3s cooldown per camera."},
      {icon:"⚡",title:"TRIPWIRES",body:"Tools → Tripwire: draw lines on the scene. Any tracked object crossing a line triggers a double beep, ⚠WIRE header alert, and a log entry. Auto-resets after 3s."},
      {icon:"🔔",title:"THREAT BEEPS",body:"880Hz beep when a PERSON appears (4s throttle), double 1320Hz on tripwire cross. Toggle ALERTS to silence everything."},
      {icon:"💥",title:"SHAKE + BURST",body:"SHAKE detects impacts via accelerometer. With BURST also on, a hard shake fires a 5-shot burst — shake-to-shoot."},
      {icon:"⏺",title:"RECORDING",body:"● REC captures the processed view as WebM — every filter, box, trail, and label is in the video. SENTRY uses the same recorder."},
    ],
    tools:[
      {icon:"📁",title:"GALLERY",body:"All captures (manual, auto, burst, sentry) with timestamps and target counts. Tap to view full-screen, ↓ to download."},
      {icon:"🗺",title:"TACTICAL MAP",body:"Live OSM map in night-ops green: your position, accuracy ring, motion-event pins. Drag to pan, +/− zoom, ◎ recenter."},
      {icon:"⏱",title:"EVENT LOG",body:"Timestamped feed of everything: motion, tripwires, sentry triggers, QR reads, captures. Last 200 events."},
      {icon:"📷",title:"QR SCAN",body:"Reads QR / Code-128 / EAN-13 / DataMatrix from the live view (Chrome Android). Result shows inline and logs."},
      {icon:"📄",title:"SESSION REPORT",body:"Downloads a .txt report: mode, GPS, altitude, pressure, full event log, capture list, tripwire inventory."},
      {icon:"📊",title:"SENSORS",body:"Live readout: GPS, altitude, barometric pressure, compass, wind, heart rate, torch, zoom, shake count, totals."},
      {icon:"❤️",title:"rPPG HEART RATE",body:"Fingertip over the rear lens with torch on → BPM in ~8s via Goertzel frequency analysis with Hamming windowing. Shows signal quality % and an estimated SpO2 proxy. Hold still; quality above 50% is reliable."},
      {icon:"🧭",title:"GPS BREADCRUMB TRACK",body:"Your movement path is logged (3m resolution, last 500 points) and drawn as a dashed trail on the map with total distance. Speed and heading appear in the HUD when moving."},
      {icon:"📊",title:"CSV EXPORT",body:"Event Log → ↓ CSV exports every event with ISO timestamp, type, label, GPS coords, and confidence for spreadsheet analysis."},
      {icon:"🗂",title:"GALLERY BULK ACTIONS",body:"↓ ALL downloads every capture in sequence. CLEAR wipes the gallery. Filter chips in the Event Log narrow by event type."},
      {icon:"🔦",title:"TORCH / HW ZOOM",body:"TORCH drives the phone flashlight. HW ZOOM exposes true optical/sensor zoom via slider where the device supports it."},
    ],
    voice:[
      {icon:"🎤",title:"ENABLE VOICE",body:"Toggle 🎤 VOICE and allow the mic. 🎤VOX blinks in the header while listening. Recognized commands flash as »COMMAND."},
      {icon:"🗣",title:"MODE COMMANDS",body:'"night vision" · "thermal" · "raw" · "astro" · "tactical" · "dehaze" · "polarize" · "rainbow" · "arctic" · "white hot" · "fusion"'},
      {icon:"📸",title:"CAPTURE COMMANDS",body:'"capture" · "burst" · "record" · "auto capture" · "scan code" · "report"'},
      {icon:"⚙️",title:"SYSTEM COMMANDS",body:'"torch" · "zoom in" · "zoom out" · "gain up" · "gain down" · "sentry on" · "sentry off" · "heat map" · "silence"'},
      {icon:"📂",title:"NAVIGATION COMMANDS",body:'"show map" · "show log" · "gallery" · "sensors" · "close"'},
      {icon:"🔗",title:"SAME-DEVICE SYNC",body:"SYNC links tabs on the same device via BroadcastChannel — motion alerts propagate between them. Cross-device: open the URL on each device independently; WebRTC streaming is planned."},
      {icon:"⚠️",title:"BROWSER SUPPORT",body:"Voice uses Web Speech API — best on Chrome (Android/desktop) and iOS Safari 16+. If 🎤VOX never appears, the browser lacks speech recognition."},
    ],
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",zIndex:200,display:"flex",flexDirection:"column",animation:"fade-in 0.2s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:`1px solid ${color}15`,flexShrink:0}}>
        <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:900,color,letterSpacing:4}}>NVS-12.0 OPERATOR MANUAL</span>
        <button onClick={onClose} style={{padding:"6px 12px",background:"transparent",border:`1px solid ${color}30`,borderRadius:4,color:`${color}70`,fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:2,cursor:"pointer"}}>CLOSE</button>
      </div>
      <div style={{display:"flex",gap:4,padding:"8px 12px",borderBottom:`1px solid ${color}10`,flexShrink:0,overflowX:"auto"}}>
        {Object.entries(tabs).map(([k,label])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:"8px 12px",whiteSpace:"nowrap",
            background:tab===k?`${color}12`:"transparent",border:`1px solid ${tab===k?color:`${color}20`}`,
            borderRadius:5,fontSize:8,letterSpacing:1,color:tab===k?color:`${color}45`,
            fontFamily:"'DM Mono',monospace",cursor:"pointer",fontWeight:tab===k?700:400}}>
            {label}
          </button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
        {content[tab].map((item,i)=>(
          <div key={i} style={{display:"flex",gap:12,padding:"12px",border:`1px solid ${color}12`,borderRadius:7,background:`${color}04`}}>
            <span style={{fontSize:18,flexShrink:0,lineHeight:1}}>{item.icon}</span>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:700,color,letterSpacing:1.5}}>{item.title}</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:`${color}75`,lineHeight:1.65}}>{item.body}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tile helpers for OSM slippy map
export function latLonToTile(lat,lon,z){
  const n=Math.pow(2,z);
  const x=Math.floor((lon+180)/360*n);
  const y=Math.floor((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n);
  return{x,y,z};
}
export function tileToLatLon(tx,ty,z){
  const n=Math.pow(2,z);
  const lon=tx/n*360-180;
  const latRad=Math.atan(Math.sinh(Math.PI*(1-2*ty/n)));
  return{lat:latRad*180/Math.PI,lon};
}

export function GPSMap({pos,events,track=[],color,onClose}){
  const mapRef=useRef(null);
  const canvasRef=useRef(null);
  const[zoom,setZoom]=useState(16);
  const[center,setCenter]=useState(null);
  const[pins,setPins]=useState([]);
  const trackDist=useMemo(()=>{
    if(!track||track.length<2)return 0;
    let d=0;
    for(let i=1;i<track.length;i++){
      const a=track[i-1],b=track[i];
      d+=Math.hypot((b.lat-a.lat)*111320,(b.lon-a.lon)*111320*Math.cos(b.lat*Math.PI/180));
    }
    return d;
  },[track]);
  const tileCache=useRef({});
  const dragging=useRef(null);
  const centerRef=useRef(null);

  // sync center ref
  useEffect(()=>{centerRef.current=center;},[center]);

  // init center from GPS
  useEffect(()=>{
    if(pos&&!center)setCenter({lat:pos.lat,lon:pos.lon});
  },[pos]);// eslint-disable-line

  // update pins from events
  useEffect(()=>{
    const m=events.filter(e=>e.type==="motion"&&e.data?.lat).slice(0,50);
    setPins(m.map(e=>({lat:e.data.lat,lon:e.data.lon,label:e.data.label||"MOT"})));
  },[events]);

  const draw=useCallback(()=>{
    const c=canvasRef.current;
    if(!c)return;
    const ctr=centerRef.current;
    const ctx=c.getContext("2d");
    const W=c.parentElement?.clientWidth||window.innerWidth;
    const H=c.parentElement?.clientHeight||400;
    c.width=W;c.height=H;
    ctx.fillStyle="#0a0f0a";ctx.fillRect(0,0,W,H);

    if(!ctr){
      ctx.fillStyle=color;ctx.font="bold 11px DM Mono,monospace";ctx.textAlign="center";
      ctx.fillText("GPS ACQUIRING...",W/2,H/2-8);
      ctx.font="9px DM Mono,monospace";ctx.fillStyle=`${color}60`;
      ctx.fillText("Allow location permission",W/2,H/2+10);
      return;
    }

    // tile size in pixels
    const TILE=256;
    const z=zoom;
    const cTile=latLonToTile(ctr.lat,ctr.lon,z);
    // pixel offset of center within its tile
    const n=Math.pow(2,z);
    const cx_exact=(ctr.lon+180)/360*n;
    const cy_exact=(1-Math.log(Math.tan(ctr.lat*Math.PI/180)+1/Math.cos(ctr.lat*Math.PI/180))/Math.PI)/2*n;
    const offX=(cx_exact-cTile.x)*TILE;
    const offY=(cy_exact-cTile.y)*TILE;

    // how many tiles needed
    const tilesX=Math.ceil(W/TILE)+2;
    const tilesY=Math.ceil(H/TILE)+2;
    const startTX=cTile.x-Math.floor(tilesX/2);
    const startTY=cTile.y-Math.floor(tilesY/2);

    // draw tiles
    for(let ty=0;ty<tilesY;ty++){
      for(let tx=0;tx<tilesX;tx++){
        const tileX=((startTX+tx)%n+n)%n;
        const tileY=startTY+ty;
        if(tileY<0||tileY>=n)continue;
        const px=W/2-offX+(tx-Math.floor(tilesX/2))*TILE;
        const py=H/2-offY+(ty-Math.floor(tilesY/2))*TILE;
        const key=`${z}/${tileX}/${tileY}`;
        if(tileCache.current[key]&&tileCache.current[key].complete){
          ctx.drawImage(tileCache.current[key],px,py,TILE,TILE);
          // NVG green tint over tile
          ctx.fillStyle="rgba(0,30,0,0.55)";ctx.fillRect(px,py,TILE,TILE);
          // green channel boost via globalCompositeOperation already applied above
        } else if(!tileCache.current[key]){
          const img=new Image();img.crossOrigin="anonymous";
          img.src=`https://tile.openstreetmap.org/${z}/${tileX}/${tileY}.png`;
          img.onload=()=>draw();
          tileCache.current[key]=img;
          ctx.fillStyle="#0a120a";ctx.fillRect(px,py,TILE,TILE);
          ctx.strokeStyle="rgba(0,255,80,0.06)";ctx.strokeRect(px,py,TILE,TILE);
        } else {
          ctx.fillStyle="#0a120a";ctx.fillRect(px,py,TILE,TILE);
        }
      }
    }

    // Grid overlay
    ctx.strokeStyle="rgba(0,255,80,0.07)";ctx.lineWidth=1;
    for(let x=0;x<W;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    // lat/lon to pixel helper
    const toScreen=(lat,lon)=>{
      const lx=(lon+180)/360*n;
      const ly=(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n;
      return{x:W/2+(lx-cx_exact)*TILE,y:H/2+(ly-cy_exact)*TILE};
    };

    // Breadcrumb track (movement history)
    if(track&&track.length>1){
      ctx.strokeStyle=color;ctx.globalAlpha=0.5;ctx.lineWidth=2;ctx.setLineDash([6,4]);
      ctx.beginPath();
      track.forEach((p,i)=>{const s=toScreen(p.lat,p.lon);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y);});
      ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      // start marker
      const s0=toScreen(track[0].lat,track[0].lon);
      ctx.beginPath();ctx.arc(s0.x,s0.y,4,0,Math.PI*2);
      ctx.fillStyle=`${color}90`;ctx.fill();
    }

    // Motion pins
    for(const pin of pins){
      const{x,y}=toScreen(pin.lat,pin.lon);
      ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);
      ctx.fillStyle="#ff5500";ctx.fill();
      ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);
      ctx.strokeStyle="rgba(255,85,0,0.5)";ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle="#ff8800";ctx.font="bold 8px DM Mono,monospace";ctx.textAlign="left";
      ctx.fillText(pin.label,x+7,y+3);
    }

    // GPS position dot (live)
    if(pos){
      const{x,y}=toScreen(pos.lat,pos.lon);
      // Accuracy circle
      if(pos.acc){
        const metersPerPx=156543.03392*Math.cos(pos.lat*Math.PI/180)/Math.pow(2,z);
        const r=Math.min(80,(pos.acc/metersPerPx));
        ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
        ctx.fillStyle="rgba(0,255,80,0.07)";ctx.fill();
        ctx.strokeStyle="rgba(0,255,80,0.25)";ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);
      }
      // Outer ring pulse
      ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);
      ctx.strokeStyle=`${color}60`;ctx.lineWidth=1.5;ctx.stroke();
      // Inner dot
      ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);
      ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=12;ctx.fill();
      ctx.shadowBlur=0;
      // You-are-here label
      ctx.fillStyle=color;ctx.font="bold 8px DM Mono,monospace";ctx.textAlign="center";
      ctx.fillText("YOU",x,y-18);
    }

    // Crosshair center
    ctx.strokeStyle=`${color}30`;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(W/2-20,H/2);ctx.lineTo(W/2+20,H/2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(W/2,H/2-20);ctx.lineTo(W/2,H/2+20);ctx.stroke();

    // Coords footer
    ctx.fillStyle=`${color}80`;ctx.font="9px DM Mono,monospace";ctx.textAlign="left";
    ctx.fillText(`${ctr.lat.toFixed(5)}°N  ${ctr.lon.toFixed(5)}°W`,8,H-8);
    ctx.textAlign="right";
    ctx.fillText(`Z${z}`,W-8,H-8);
  },[zoom,pins,pos,color,track]);

  // Redraw on any change
  useEffect(()=>{draw();},[draw,center]);

  // ResizeObserver so canvas fills container correctly
  useEffect(()=>{
    const el=canvasRef.current?.parentElement;
    if(!el)return;
    const ro=new ResizeObserver(()=>draw());
    ro.observe(el);
    return()=>ro.disconnect();
  },[draw]);

  // Touch/mouse pan
  const onPointerDown=e=>{
    dragging.current={x:e.clientX,y:e.clientY,center:{...centerRef.current}};
  };
  const onPointerMove=e=>{
    if(!dragging.current)return;
    const dx=e.clientX-dragging.current.x;
    const dy=e.clientY-dragging.current.y;
    const n=Math.pow(2,zoom);
    const metersPerPx=156543.03392*Math.cos(dragging.current.center.lat*Math.PI/180)/Math.pow(2,zoom);
    const degPerPx=metersPerPx/111320;
    const newLat=dragging.current.center.lat+dy*degPerPx;
    const newLon=dragging.current.center.lon-dx*degPerPx*Math.cos(dragging.current.center.lat*Math.PI/180);
    setCenter({lat:newLat,lon:newLon});
  };
  const onPointerUp=()=>{dragging.current=null;};

  return(
    <div style={{position:"fixed",inset:0,background:"#0a0f0a",zIndex:200,
      display:"flex",flexDirection:"column",animation:"fade-in 0.2s ease"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"8px 14px",borderBottom:`1px solid ${color}15`,flexShrink:0,
        background:"rgba(0,0,0,0.8)"}}>
        <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:900,color,letterSpacing:4}}>
          GPS TACTICAL MAP
        </span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {pos&&<span style={{fontSize:7,color:`${color}60`,fontFamily:"'DM Mono',monospace",letterSpacing:1}}>
            {pos.lat.toFixed(4)}°N {pos.lon.toFixed(4)}°W ±{pos.acc?.toFixed(0)}m
          </span>}
          {/* Zoom controls */}
          <button onClick={()=>setZoom(z=>Math.min(19,z+1))} style={{width:24,height:24,background:`${color}15`,
            border:`1px solid ${color}40`,borderRadius:2,color,fontSize:14,cursor:"pointer",lineHeight:1}}>+</button>
          <span style={{fontSize:8,color:`${color}70`,fontFamily:"'DM Mono',monospace",minWidth:20,textAlign:"center"}}>Z{zoom}</span>
          <button onClick={()=>setZoom(z=>Math.max(2,z-1))} style={{width:24,height:24,background:`${color}15`,
            border:`1px solid ${color}40`,borderRadius:2,color,fontSize:14,cursor:"pointer",lineHeight:1}}>−</button>
          {pos&&<button onClick={()=>setCenter({lat:pos.lat,lon:pos.lon})} style={{padding:"2px 8px",background:`${color}10`,
            border:`1px solid ${color}30`,borderRadius:2,color:`${color}90`,
            fontFamily:"'DM Mono',monospace",fontSize:7,letterSpacing:1,cursor:"pointer"}}>
            ◎ CTR
          </button>}
          <button onClick={onClose} style={{padding:"4px 10px",background:"transparent",
            border:`1px solid ${color}30`,borderRadius:2,color:`${color}70`,
            fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:2,cursor:"pointer"}}>
            ✕
          </button>
        </div>
      </div>
      {/* Map canvas */}
      <div style={{flex:1,position:"relative",overflow:"hidden",cursor:"grab"}}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <canvas ref={canvasRef} style={{display:"block",width:"100%",height:"100%"}}/>
      </div>
      {/* Footer */}
      <div style={{padding:"5px 14px",borderTop:`1px solid ${color}10`,
        display:"flex",justifyContent:"space-between",background:"rgba(0,0,0,0.8)",flexShrink:0}}>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:`${color}40`,letterSpacing:1}}>
          🟠 {pins.length} PINS • {trackDist>0?`${trackDist<1000?Math.round(trackDist)+"m":(trackDist/1000).toFixed(2)+"km"} TRACK • `:""}DRAG TO PAN
        </span>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:`${color}25`,letterSpacing:1}}>
          OSM TILES
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE MODAL
// ═══════════════════════════════════════════════════════════════════════════════
export function TimelineModal({events,captures,color,onClose}){
  const[filter,setFilter]=useState("all");
  const types=useMemo(()=>{
    const t={};events.forEach(e=>{t[e.type]=(t[e.type]||0)+1;});
    return t;
  },[events]);
  const shown=useMemo(()=>filter==="all"?events:events.filter(e=>e.type===filter),[events,filter]);
  const ICON={motion:"🎯",tripwire:"⚡",sentry:"🛡",qr:"📷",export:"📄",capture:"📸"};
  const exportCSV=()=>{
    const rows=[["timestamp","type","label","lat","lon","confidence"]];
    events.forEach(e=>rows.push([
      new Date(e.ts).toISOString(),e.type,
      (e.data?.label||"").replace(/,/g,";"),
      e.data?.lat??"",e.data?.lon??"",e.data?.conf??""]));
    const csv=rows.map(r=>r.join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    const a=document.createElement("a");
    a.href=url;a.download=`nvs-events-${Date.now()}.csv`;a.click();
    URL.revokeObjectURL(url);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",zIndex:200,display:"flex",flexDirection:"column",animation:"fade-in 0.2s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:`1px solid ${color}15`,flexShrink:0}}>
        <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:900,color,letterSpacing:4}}>EVENT LOG</span>
        <div style={{display:"flex",gap:6}}>
          <button onClick={exportCSV} style={{padding:"6px 12px",background:"transparent",border:`1px solid ${color}30`,borderRadius:4,color:`${color}70`,fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:1,cursor:"pointer"}}>↓ CSV</button>
          <button onClick={onClose} style={{padding:"6px 12px",background:"transparent",border:`1px solid ${color}30`,borderRadius:4,color:`${color}70`,fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:2,cursor:"pointer"}}>CLOSE</button>
        </div>
      </div>
      <div style={{display:"flex",gap:5,padding:"8px 12px",borderBottom:`1px solid ${color}10`,overflowX:"auto",flexShrink:0}}>
        {[["all",`ALL ${events.length}`],...Object.entries(types).map(([t,c])=>[t,`${ICON[t]||"•"} ${t.toUpperCase()} ${c}`])].map(([k,label])=>(
          <button key={k} onClick={()=>setFilter(k)} style={{padding:"6px 10px",whiteSpace:"nowrap",
            background:filter===k?`${color}12`:"transparent",border:`1px solid ${filter===k?color:`${color}20`}`,
            borderRadius:5,fontSize:8,color:filter===k?color:`${color}45`,fontFamily:"'DM Mono',monospace",cursor:"pointer"}}>
            {label}
          </button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:4}}>
        {shown.length===0&&<div style={{padding:24,textAlign:"center",fontFamily:"'DM Mono',monospace",fontSize:9,color:`${color}40`}}>NO EVENTS</div>}
        {shown.map((e,i)=>(
          <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 10px",border:`1px solid ${color}10`,borderRadius:5,background:`${color}03`}}>
            <span style={{fontSize:13,flexShrink:0}}>{e.data?.icon||ICON[e.type]||"•"}</span>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:`${color}90`,lineHeight:1.4}}>{e.data?.label||e.type}</span>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:`${color}45`}}>
                  {new Date(e.ts).toLocaleTimeString("en-US",{hour12:false})}
                </span>
                {e.data?.conf&&<span style={{fontSize:7,color:`${color}40`}}>{e.data.conf}%</span>}
                {e.data?.lat&&<span style={{fontSize:7,color:`${color}40`}}>📍{e.data.lat.toFixed(4)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAST MODAL — pair this device's live feed to a viewer on another device
// ═══════════════════════════════════════════════════════════════════════════════
export function CastModal({color,code,on,viewers,status,onStart,onStop,onClose}){
  const[copied,setCopied]=useState(false);
  const link=code?`${window.location.origin}${window.location.pathname}?watch=${code}`:"";
  const copyLink=async()=>{
    try{await navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1800);}
    catch{}
  };
  const statusLine=status==="connecting"?"CONNECTING…"
    :status==="unsupported"?"CASTING NOT SUPPORTED ON THIS BROWSER"
    :status==="error"?"CONNECTION ERROR — TRY AGAIN"
    :viewers>0?`🟢 LIVE — ${viewers} WATCHING`
    :"🟡 ROOM OPEN — WAITING FOR VIEWER";
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",zIndex:200,
      display:"flex",flexDirection:"column",animation:"fade-in 0.2s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"10px 14px",borderBottom:`1px solid ${color}15`,flexShrink:0}}>
        <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:900,color,letterSpacing:4}}>
          📡 REMOTE CAST
        </span>
        <button onClick={onClose} style={{padding:"6px 12px",background:"transparent",border:`1px solid ${color}30`,
          borderRadius:4,color:`${color}70`,fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:2,cursor:"pointer"}}>
          CLOSE
        </button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:24,display:"flex",flexDirection:"column",gap:16,
        alignItems:"center",justifyContent:"center",textAlign:"center"}}>
        {!on?(<>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:`${color}80`,maxWidth:300,lineHeight:1.7}}>
            Stream this device's live camera feed to another device — open the link on a computer or another phone to watch in real time. No account, no app install.
          </div>
          <button onClick={onStart} style={{padding:"14px 30px",background:`${color}15`,border:`1.5px solid ${color}`,
            borderRadius:8,color,fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:2,fontWeight:700,
            cursor:"pointer",boxShadow:`0 0 12px ${color}30`}}>
            ▶ START CAST
          </button>
        </>):(<>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:`${color}70`,letterSpacing:2}}>{statusLine}</div>
          {code&&<div style={{fontFamily:"'Cinzel',serif",fontSize:32,fontWeight:900,color,letterSpacing:8,
            textShadow:`0 0 20px ${color}60`}}>{code}</div>}
          <div style={{display:"flex",alignItems:"center",gap:6,width:"100%",maxWidth:320}}>
            <div style={{flex:1,padding:"8px 10px",background:"rgba(0,0,0,0.4)",border:`1px solid ${color}25`,
              borderRadius:6,fontFamily:"'DM Mono',monospace",fontSize:9,color:`${color}90`,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {link}
            </div>
            <button onClick={copyLink} style={{padding:"8px 12px",
              background:copied?"rgba(0,255,80,0.15)":`${color}10`,
              border:`1px solid ${copied?"#00ff50":color}`,borderRadius:6,
              color:copied?"#00ff50":color,fontFamily:"'DM Mono',monospace",fontSize:9,
              cursor:"pointer",flexShrink:0}}>
              {copied?"✓":"COPY"}
            </button>
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:`${color}45`,maxWidth:280,lineHeight:1.6}}>
            On the other device, paste the link above, or open this app's URL with <b>?watch={code}</b> added to it. Works over WiFi or mobile data.
          </div>
          <button onClick={onStop} style={{padding:"10px 22px",background:"rgba(255,68,68,0.1)",
            border:"1.5px solid rgba(255,68,68,0.5)",borderRadius:8,color:"#ff6666",
            fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:1,cursor:"pointer"}}>
            ■ STOP CAST
          </button>
        </>)}
      </div>
    </div>
  );
}

export function TripwireEditor({tripwires,onUpdate,color,onClose}){
  const[drawing,setDrawing]=useState(false);
  const[current,setCurrent]=useState([]);
  const svgRef=useRef(null);
  const handleSVGClick=e=>{
    if(!drawing)return;
    const rect=svgRef.current.getBoundingClientRect();
    const x=((e.clientX-rect.left)/rect.width)*100;
    const y=((e.clientY-rect.top)/rect.height)*100;
    setCurrent(p=>[...p,{x,y}]);
  };
  const finishWire=()=>{
    if(current.length<2){setDrawing(false);setCurrent([]);return;}
    const id=Date.now().toString();
    onUpdate([...tripwires,{id,label:`ZONE-${tripwires.length+1}`,points:current,triggered:false}]);
    setDrawing(false);setCurrent([]);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",zIndex:200,
      display:"flex",flexDirection:"column",animation:"fade-in 0.2s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"10px 14px",borderBottom:`1px solid ${color}15`,flexShrink:0}}>
        <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:900,color,letterSpacing:4}}>
          TRIPWIRE EDITOR
        </span>
        <div style={{display:"flex",gap:6}}>
          {!drawing?(
            <button onClick={()=>setDrawing(true)} style={{padding:"4px 10px",background:`${color}10`,
              border:`1px solid ${color}`,borderRadius:2,color,
              fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:1,cursor:"pointer"}}>
              + DRAW
            </button>
          ):(
            <button onClick={finishWire} style={{padding:"4px 10px",background:"rgba(0,255,80,0.15)",
              border:"1px solid #00ff50",borderRadius:2,color:"#00ff50",
              fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:1,cursor:"pointer"}}>
              ✓ DONE ({current.length}pts)
            </button>
          )}
          {tripwires.length>0&&(
            <button onClick={()=>onUpdate([])} style={{padding:"4px 10px",background:"transparent",
              border:"1px solid rgba(255,50,50,0.4)",borderRadius:2,color:"rgba(255,50,50,0.7)",
              fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:1,cursor:"pointer"}}>
              CLR ALL
            </button>
          )}
          <button onClick={onClose} style={{padding:"4px 10px",background:"transparent",
            border:`1px solid ${color}30`,borderRadius:2,color:`${color}70`,
            fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:2,cursor:"pointer"}}>
            CLOSE
          </button>
        </div>
      </div>
      <div style={{flex:1,position:"relative",background:"#0a0f0a"}}>
        <svg ref={svgRef} onClick={handleSVGClick}
          style={{width:"100%",height:"100%",cursor:drawing?"crosshair":"default"}}>
          {/* Grid */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,255,80,0.06)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)"/>
          {/* Existing wires */}
          {tripwires.map(tw=>(
            <g key={tw.id}>
              {tw.points.length>1&&(
                <polyline
                  points={tw.points.map(p=>`${p.x}%,${p.y}%`).join(" ")}
                  fill="none" stroke={tw.triggered?"#ff2222":"#ffcc00"} strokeWidth="2"
                  strokeDasharray="6,4"/>
              )}
              {tw.points.map((p,i)=>(
                <circle key={i} cx={`${p.x}%`} cy={`${p.y}%`} r="4"
                  fill={tw.triggered?"#ff2222":"#ffcc00"} opacity="0.8"/>
              ))}
              {tw.points.length>0&&(
                <text x={`${tw.points[0].x}%`} y={`${tw.points[0].y - 2}%`}
                  fill="#ffcc00" fontSize="9" fontFamily="DM Mono, monospace">{tw.label}</text>
              )}
            </g>
          ))}
          {/* Current drawing */}
          {current.length>1&&(
            <polyline points={current.map(p=>`${p.x}%,${p.y}%`).join(" ")}
              fill="none" stroke={`${color}90`} strokeWidth="2" strokeDasharray="4,3"/>
          )}
          {current.map((p,i)=>(
            <circle key={i} cx={`${p.x}%`} cy={`${p.y}%`} r="4" fill={color} opacity="0.9"/>
          ))}
        </svg>
        {drawing&&(
          <div style={{position:"absolute",bottom:14,left:"50%",transform:"translateX(-50%)",
            fontFamily:"'DM Mono',monospace",fontSize:8,color:`${color}80`,letterSpacing:2,
            background:"rgba(0,0,0,0.7)",padding:"4px 10px",borderRadius:2}}>
            TAP TO ADD POINTS → TAP ✓ DONE WHEN FINISHED
          </div>
        )}
      </div>
      <div style={{padding:"8px 14px",borderTop:`1px solid ${color}10`,
        display:"flex",gap:6,overflowX:"auto"}}>
        {tripwires.map(tw=>(
          <div key={tw.id} style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,
            padding:"3px 8px",border:`1px solid ${tw.triggered?"#ff2222":"#ffcc0040"}`,
            borderRadius:2,background:tw.triggered?"rgba(255,34,34,0.1)":"transparent"}}>
            <span style={{fontSize:7,fontFamily:"'DM Mono',monospace",
              color:tw.triggered?"#ff2222":"#ffcc00",letterSpacing:1}}>{tw.label}</span>
            <button onClick={()=>onUpdate(tripwires.filter(t=>t.id!==tw.id))}
              style={{background:"transparent",border:"none",color:"rgba(255,50,50,0.6)",
                fontSize:9,cursor:"pointer",lineHeight:1,padding:0}}>×</button>
          </div>
        ))}
        {!tripwires.length&&<span style={{fontSize:7,color:`${color}30`,fontFamily:"'DM Mono',monospace",letterSpacing:1}}>
          NO TRIPWIRES — TAP + DRAW
        </span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BIOMETRIC HUD
// ═══════════════════════════════════════════════════════════════════════════════
export function BiometricHUD({hr,audioLevel,audioSpike,color}){
  const hrColor=!hr?"#444":hr<60?"#0088ff":hr<100?"#00ff50":hr<140?"#ffaa00":"#ff3333";
  const hrLabel=!hr?"--":hr<60?"BRADYCARDIA":hr<100?"NORMAL":hr<140?"ELEVATED":"TACHYCARDIA";
  return(
    <div style={{
      position:"absolute",bottom:50,left:"50%",transform:"translateX(-50%)",
      zIndex:26,display:"flex",gap:10,alignItems:"flex-end",
    }}>
      {/* HR */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,
        padding:"4px 8px",background:"rgba(0,0,0,0.75)",border:`1px solid ${hrColor}30`,
        borderRadius:3}}>
        <span style={{fontSize:6,color:`${hrColor}80`,letterSpacing:1,fontFamily:"'DM Mono',monospace"}}>rPPG HR</span>
        <span style={{fontSize:16,color:hrColor,fontFamily:"'DM Mono',monospace",fontWeight:700,lineHeight:1,
          textShadow:`0 0 8px ${hrColor}60`}}>
          {hr||"--"}
        </span>
        <span style={{fontSize:5,color:`${hrColor}70`,letterSpacing:1,fontFamily:"'DM Mono',monospace"}}>{hrLabel}</span>
      </div>
      {/* Audio */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,
        padding:"4px 8px",background:"rgba(0,0,0,0.75)",
        border:`1px solid ${audioSpike?"#ff2222":"rgba(0,204,255,0.2)"}`,
        borderRadius:3,animation:audioSpike?"rec-blink 0.3s step-end infinite":"none"}}>
        <span style={{fontSize:6,color:"rgba(0,204,255,0.7)",letterSpacing:1,fontFamily:"'DM Mono',monospace"}}>
          {audioSpike?"⚡ SPIKE":"AUDIO"}
        </span>
        <div style={{display:"flex",gap:1,alignItems:"flex-end",height:14}}>
          {Array.from({length:8},(_,i)=>(
            <div key={i} style={{
              width:3,height:2+i*1.5,borderRadius:.5,
              background:(audioLevel/255)*8>i?(audioSpike?"#ff2222":"#00ccff"):"rgba(0,204,255,0.15)",
            }}/>
          ))}
        </div>
      </div>
    </div>
  );
}
