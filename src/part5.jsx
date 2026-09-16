import{useRef,useState,useEffect,useCallback}from"react";
import{classifyBlobFallback}from"./part1.jsx";
import{processFrame}from"./part1.jsx";
import{LoiterAnalyzer,TargetTracker}from"./part2.jsx";

// ═══════════════════════════════════════════════════════════════════════════════
// COMMON HUD COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
export function Corners({color}){
  const s={position:"absolute",width:20,height:20,opacity:.8};
  return(<>
    <div style={{...s,top:10,left:10,borderTop:`2px solid ${color}`,borderLeft:`2px solid ${color}`}}/>
    <div style={{...s,top:10,right:10,borderTop:`2px solid ${color}`,borderRight:`2px solid ${color}`}}/>
    <div style={{...s,bottom:10,left:10,borderBottom:`2px solid ${color}`,borderLeft:`2px solid ${color}`}}/>
    <div style={{...s,bottom:10,right:10,borderBottom:`2px solid ${color}`,borderRight:`2px solid ${color}`}}/>
  </>);
}
export function Reticle({color}){
  return(
    <svg width={64} height={64} viewBox="0 0 64 64" style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",pointerEvents:"none",zIndex:15}}>
      <circle cx={32} cy={32} r={20} fill="none" stroke={color} strokeWidth={.8} opacity={.45}/>
      <circle cx={32} cy={32} r={8} fill="none" stroke={color} strokeWidth={.5} strokeDasharray="2 3" opacity={.4}/>
      <circle cx={32} cy={32} r={1.8} fill={color} opacity={.9}/>
      {[[32,4,32,16],[32,48,32,60],[4,32,16,32],[48,32,60,32]].map(([x1,y1,x2,y2],i)=>
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1} opacity={.5}/>
      )}
    </svg>
  );
}
export function SignalBars({level=.8,color}){
  return(
    <div style={{display:"flex",gap:1,alignItems:"flex-end",height:12}}>
      {[.2,.4,.6,.8,1].map((t,i)=>(
        <div key={i} style={{width:3,height:3+i*2,borderRadius:.5,background:level>=t?color:`${color}20`}}/>
      ))}
    </div>
  );
}

// AI Object boxes
export const THREAT_L=["CRITICAL","HIGH","MED","LOW","TRACE","TRACK","--","--"];
export const THREAT_C=["#ff2222","#ff5500","#ffaa00","#ffdd00","#aaffaa","#00ffcc","#00ccff","#aaaaaa"];
// PIP Magnifier — 3x zoomed inset of tapped region, live
export function MagnifierPIP({source,fx,fy,color,onClose}){
  const pipRef=useRef(null);
  useEffect(()=>{
    let raf;
    const draw=()=>{
      const src=source.current,pip=pipRef.current;
      if(src&&pip&&src.width>0){
        const ctx=pip.getContext("2d");
        const MAG=3,VW=src.width/MAG,VH=src.height/MAG;
        const sx=Math.max(0,Math.min(src.width-VW,fx*src.width-VW/2));
        const sy=Math.max(0,Math.min(src.height-VH,fy*src.height-VH/2));
        pip.width=300;pip.height=300*(VH/VW);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(src,sx,sy,VW,VH,0,0,pip.width,pip.height);
        // crosshair
        ctx.strokeStyle=color;ctx.lineWidth=1;ctx.globalAlpha=0.7;
        ctx.beginPath();ctx.moveTo(pip.width/2,0);ctx.lineTo(pip.width/2,pip.height);
        ctx.moveTo(0,pip.height/2);ctx.lineTo(pip.width,pip.height/2);ctx.stroke();
        ctx.globalAlpha=1;
      }
      raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);
    return()=>cancelAnimationFrame(raf);
  },[source,fx,fy,color]);
  return(
    <div onClick={onClose} style={{position:"absolute",top:8,right:8,zIndex:40,
      border:`2px solid ${color}`,borderRadius:8,overflow:"hidden",
      boxShadow:`0 0 16px ${color}50`,cursor:"pointer",width:"42%",maxWidth:220}}>
      <canvas ref={pipRef} style={{width:"100%",display:"block"}}/>
      <div style={{position:"absolute",top:3,left:6,fontSize:8,color,fontFamily:"'DM Mono',monospace",
        letterSpacing:1,textShadow:"0 0 4px #000"}}>3× MAG — TAP TO CLOSE</div>
    </div>
  );
}

export function TargetBoxes({blobs,cw,ch,color,autoCapPending}){
  if(!blobs||!blobs.length)return null;
  return(
    <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:22}}>
      {/* Motion trails + velocity vectors */}
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%"}} viewBox={`0 0 ${cw} ${ch}`} preserveAspectRatio="none">
        {blobs.map((b,i)=>{
          const tc=THREAT_C[Math.min(i,7)];
          return(
            <g key={`tr${b.id||i}`}>
              {b.trail&&b.trail.length>1&&(
                <polyline points={b.trail.map(p=>`${p.x},${p.y}`).join(" ")}
                  fill="none" stroke={tc} strokeWidth={cw/300} strokeOpacity="0.55"
                  strokeDasharray={`${cw/150},${cw/300}`} strokeLinecap="round"/>
              )}
              {(Math.abs(b.vx)>15||Math.abs(b.vy)>15)&&(
                <line x1={b.cx} y1={b.cy}
                  x2={b.cx+Math.max(-cw/4,Math.min(cw/4,b.vx*0.8))}
                  y2={b.cy+Math.max(-ch/4,Math.min(ch/4,b.vy*0.8))}
                  stroke={tc} strokeWidth={cw/250} strokeOpacity="0.85"
                  markerEnd="url(#vhead)"/>
              )}
            </g>
          );
        })}
        <defs>
          <marker id="vhead" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#ffdd00"/>
          </marker>
        </defs>
      </svg>
      {blobs.map((b,i)=>{
        const x=(b.x/cw)*100,y=(b.y/ch)*100,bw=(b.w/cw)*100,bh=(b.h/ch)*100,pad=1.2;
        const tc=THREAT_C[Math.min(i,7)],thr=THREAT_L[Math.min(i,7)];
        const isMain=i===0;
        return(
          <div key={i} style={{position:"absolute",left:`${x-pad}%`,top:`${y-pad}%`,
            width:`${bw+pad*2}%`,height:`${bh+pad*2}%`,
            border:`${isMain?"2px":"1px"} solid ${tc}`,
            boxShadow:`0 0 ${isMain?10:4}px ${tc}${isMain?"50":"25"}`,
            boxSizing:"border-box",
            animation:isMain&&autoCapPending?"lock-flash 0.3s step-end infinite":"none"}}>
            {[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy],ci)=>(
              <div key={ci} style={{position:"absolute",width:7,height:7,
                top:sy<0?-1:"auto",bottom:sy>0?-1:"auto",
                left:sx<0?-1:"auto",right:sx>0?-1:"auto",
                borderTop:sy<0?`2px solid ${tc}`:"none",borderBottom:sy>0?`2px solid ${tc}`:"none",
                borderLeft:sx<0?`2px solid ${tc}`:"none",borderRight:sx>0?`2px solid ${tc}`:"none"}}/>
            ))}
            {/* AI label */}
            {/* Object name label — positioned above box */}
            <div style={{
              position:"absolute",top:-38,left:0,
              display:"flex",flexDirection:"column",gap:2,
            }}>
              <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{
                  fontSize:isMain?10:8,fontWeight:700,
                  color:"#000",letterSpacing:.5,
                  background:tc,
                  padding:isMain?"2px 6px":"1px 4px",
                  borderRadius:3,fontFamily:"'DM Mono',monospace",
                  boxShadow:`0 0 8px ${tc}60`,
                  whiteSpace:"nowrap",
                }}>
                  {b.icon} {b.label}{b.id?` #${b.id}`:""}
                </span>
                <span style={{
                  fontSize:isMain?9:7,fontWeight:600,
                  color:tc,background:"rgba(0,0,0,0.85)",
                  padding:"1px 4px",borderRadius:3,
                  fontFamily:"'DM Mono',monospace",border:`1px solid ${tc}50`,
                }}>
                  {b.conf}%
                </span>
                {isMain&&autoCapPending&&(
                  <span style={{fontSize:8,color:"#fff",background:"rgba(255,34,34,0.9)",
                    padding:"2px 5px",borderRadius:3,animation:"rec-blink 0.3s step-end infinite",
                    fontFamily:"'DM Mono',monospace",fontWeight:700}}>📷</span>
                )}
              </div>
              {b.dist&&(
                <span style={{
                  fontSize:isMain?8:7,color:`${tc}`,fontWeight:600,
                  background:"rgba(0,0,0,0.8)",
                  padding:"1px 5px",borderRadius:3,fontFamily:"'DM Mono',monospace",
                  letterSpacing:1,border:`1px solid ${tc}30`,width:"fit-content",
                }}>
                  📏 ~{b.dist<10?b.dist.toFixed(1):Math.round(b.dist)}m
                </span>
              )}
            </div>
            <div style={{position:"absolute",top:"50%",left:"50%",width:4,height:4,borderRadius:"50%",
              transform:"translate(-50%,-50%)",background:tc,boxShadow:`0 0 6px ${tc}`,
              animation:"tgt-pulse 1.2s ease-in-out infinite"}}/>
          </div>
        );
      })}
    </div>
  );
}
export function ThermalOverlay({tempData,mode}){
  if(!tempData||(mode!=="THERMAL"&&mode!=="RAINBOW"&&mode!=="FUSION"))return null;
  const{hot,cold,avg,hotX,hotY}=tempData;
  const gm={THERMAL:"linear-gradient(90deg,#000080,#800080,#ff0000,#ff8800,#ffff00,#fff)",RAINBOW:"linear-gradient(90deg,#0000ff,#00ffff,#00ff00,#ffff00,#ff0000)",FUSION:"linear-gradient(90deg,#1400ff,#8800ff,#ff4400,#ff8800,#ffe0c0)"};
  return(
    <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:24}}>
      <div style={{position:"absolute",left:`${hotX}%`,top:`${hotY}%`,transform:"translate(-50%,-50%)",zIndex:25,
        display:"flex",flexDirection:"column",alignItems:"center",gap:2,animation:"tgt-pulse 1s ease-in-out infinite"}}>
        <div style={{width:12,height:12,borderRadius:"50%",border:"2px solid #fff",boxShadow:"0 0 16px #ff5500,0 0 6px #fff"}}/>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#fff",background:"rgba(0,0,0,0.75)",
          padding:"1px 4px",borderRadius:2,letterSpacing:1,whiteSpace:"nowrap"}}>{hot.toFixed(1)}°C ▲</span>
      </div>
      <div style={{position:"absolute",bottom:14,left:"50%",transform:"translateX(-50%)",
        display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
        <div style={{width:100,height:7,borderRadius:3,border:"1px solid rgba(255,255,255,0.15)",background:gm[mode]||gm.THERMAL}}/>
        <div style={{display:"flex",justifyContent:"space-between",width:100}}>
          <span style={{fontSize:7,color:"rgba(255,255,255,0.55)",fontFamily:"'DM Mono',monospace"}}>{cold.toFixed(0)}°C</span>
          <span style={{fontSize:7,color:"rgba(255,255,255,0.7)",fontFamily:"'DM Mono',monospace"}}>~{avg.toFixed(1)}°</span>
          <span style={{fontSize:7,color:"#ff8800",fontFamily:"'DM Mono',monospace"}}>{hot.toFixed(0)}°C</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMERA PANEL
// ═══════════════════════════════════════════════════════════════════════════════
export function CameraPanel({stream,ready,error,label,mode,brightness,sensitivity,edgeOverlay,
  noiseReduction,color,zoom,showReticle,motionEnabled,autoCapture,tripwires,showRPPG,
  onCapture,onMotionEvent,onTripwireHit,onRPPG,compact=false,tfDetect,modelReady,onRetry,heatmapOn=false,onTrackCount,starsOn=false,showHist=false,stabOn=false,srOn=false,onLoiter,onZoom,onSwipeMode,onSwipeGain}){
  const videoRef=useRef(null),rawRef=useRef(null),dispRef=useRef(null),rafRef=useRef(null);
  const prevRef=useRef(null),motRef=useRef(null),cooldown=useRef(0),fpsRef=useRef({frames:0,last:performance.now()});
  const stackBuf=useRef(null),stackIdx=useRef(0);
  const lastTfRef=useRef(0);const lastMlRef=useRef(0);const expoTick=useRef(0);
  const stabPrev=useRef(null),stabSmooth=useRef({x:0,y:0}),srBuf=useRef(null),srCount=useRef(0);
  const loiterRef=useRef(new LoiterAnalyzer());
  const[expo,setExpo]=useState(null);const[stars,setStars]=useState(null);
  useEffect(()=>{srBuf.current=null;srCount.current=0;},[srOn,mode]);
  const trackerRef=useRef(new TargetTracker());
  const heatRef=useRef(null);
  const[magnify,setMagnify]=useState(null);
  const[tapFocus,setTapFocus]=useState(null);
  const gRef=useRef({mode:null,lastTap:0,hadTouch:false});
  useEffect(()=>{
    const mark=()=>{gRef.current.hadTouch=true;};
    window.addEventListener("touchstart",mark,{once:true,passive:true});
    return()=>window.removeEventListener("touchstart",mark);
  },[]);
  const[blobs,setBlobs]=useState([]);const[motionLevel,setMotionLevel]=useState(0);
  const[tempData,setTempData]=useState(null);const[cameraSize,setCameraSize]=useState({w:1280,h:720});
  const[fps,setFps]=useState(0);const[flash,setFlash]=useState(false);const[autoCapPending,setAutoCapPending]=useState(false);
  const MODE_LUT={NVG:null,THERMAL:"THERMAL",RAINBOW:"RAINBOW",FUSION:"FUSION",BLUE:null,WHITE:null,ASTRO:null};

  useEffect(()=>{
    if(!videoRef.current||!stream)return;
    const v=videoRef.current;
    v.srcObject=stream;
    v.play().catch(()=>{});
    // stall watchdog: replay after 2 stalls, full rebind after 4
    let lastTime=-1,stallCount=0;
    const watchdog=setInterval(()=>{
      if(!v.srcObject)return;
      if(v.currentTime===lastTime&&v.readyState>=2){
        stallCount++;
        if(stallCount===2){
          v.play().catch(()=>{});
        } else if(stallCount>=4){
          stallCount=0;
          // Hard rebind — detach and re-attach the stream
          const s=v.srcObject;
          v.srcObject=null;
          requestAnimationFrame(()=>{v.srcObject=s;v.play().catch(()=>{});});
        }
      } else { stallCount=0; }
      lastTime=v.currentTime;
    },2000);
    return()=>clearInterval(watchdog);
  },[stream]);

  const renderLoop=useCallback(()=>{
    try{
    const video=videoRef.current,raw=rawRef.current,disp=dispRef.current;
    if(video&&raw&&disp){
      const result=processFrame(video,raw,disp,
        {mode,brightness,sensitivity,edgeOverlay,noiseReduction,lutName:MODE_LUT[mode]||null,tripwires,showRPPG},
        {prev:prevRef,motion:motRef,stackBuf,stackIdx,heat:heatRef,heatOn:heatmapOn,expoTick,starsOn,stabOn,stabPrev,stabSmooth,srOn,srBuf,srCount}
      );
      if(result){
        setCameraSize(cs=>cs.w===result.sw&&cs.h===result.sh?cs:{w:result.sw,h:result.sh});
        if(result.expo)setExpo(result.expo);
        if(result.starPts)setStars(result.starPts);
        if(stabOn&&result.shift&&disp){
          disp.style.transform=`scale(${zoom*1.08}) translate(${-result.shift.x}px,${-result.shift.y}px)`;
        }
        if(motionEnabled){
          const nowMl=performance.now();
          if(nowMl-lastMlRef.current>200){lastMlRef.current=nowMl;setMotionLevel(result.motionFrac);}
          // TF detection: time-throttled (500ms), non-blocking, busy-guarded
          const nowTf=performance.now();
          if(modelReady&&tfDetect&&disp&&nowTf-lastTfRef.current>500){
            lastTfRef.current=nowTf;
            tfDetect(disp).then(preds=>{
              const nowTr=performance.now();
              if(preds&&preds.length>0){
                const sx=result.sw/disp.width,sy=result.sh/disp.height;
                const dets=preds.map(p=>({...p,
                  x:p.x*sx,y:p.y*sy,w:p.w*sx,h:p.h*sy,cx:p.cx*sx,cy:p.cy*sy}));
                const t=trackerRef.current.update(dets,nowTr).slice();setBlobs(t);onTrackCount?.(t.length);
                const loit=loiterRef.current.update(t,nowTr);
                if(loit.length)onLoiter?.(loit,label);
              } else if(preds){
                const dets=result.blobs.map(b=>({...b,...classifyBlobFallback(b,result.sw,result.sh)}));
                const t=trackerRef.current.update(dets,nowTr).slice();setBlobs(t);onTrackCount?.(t.length);
                const loit=loiterRef.current.update(t,nowTr);
                if(loit.length)onLoiter?.(loit,label);
              }
            }).catch(()=>{});
          } else if(!modelReady){
            const dets=result.blobs.map(b=>({...b,...classifyBlobFallback(b,result.sw,result.sh)}));
            const t2=trackerRef.current.update(dets,performance.now()).slice();setBlobs(t2);onTrackCount?.(t2.length);
          }
          const now=Date.now();
          if(autoCapture&&result.blobs.length>0&&result.motionFrac>0.008&&now-cooldown.current>3000){
            cooldown.current=now;setAutoCapPending(true);
            onMotionEvent&&onMotionEvent(result.blobs[0],label);
            setTimeout(()=>{
              if(disp){setFlash(true);setTimeout(()=>setFlash(false),400);
                onCapture&&onCapture(disp.toDataURL("image/png"),label,result.blobs.length,true);}
              setAutoCapPending(false);
            },600);
          }
          if(result.triggeredWires?.length)onTripwireHit&&onTripwireHit(result.triggeredWires,label);
        }
        if(result.tempData)setTempData(result.tempData);
        if(showRPPG&&result.rppgVal)onRPPG&&onRPPG(result.rppgVal);
        const fc=fpsRef.current;fc.frames++;
        const n=performance.now();if(n-fc.last>=1000){setFps(fc.frames);fc.frames=0;fc.last=n;}
      }
    }
    }catch(e){/* never let one bad frame kill the loop */}
    rafRef.current=requestAnimationFrame(renderLoop);
  // eslint-disable-next-line
  },[mode,brightness,sensitivity,edgeOverlay,noiseReduction,motionEnabled,autoCapture,showRPPG,JSON.stringify(tripwires)]);

  useEffect(()=>{rafRef.current=requestAnimationFrame(renderLoop);return()=>cancelAnimationFrame(rafRef.current);},[renderLoop]);

  return(
    <div style={{position:"relative",width:"100%",flex:1,minHeight:0,background:"#010801",overflow:"hidden",border:`1px solid ${color}12`}}>
      <video ref={videoRef} muted playsInline autoPlay style={{position:"absolute",opacity:0,pointerEvents:"none",width:"100%",height:"100%",objectFit:"cover"}}/>
      <canvas ref={rawRef} style={{display:"none"}}/>
      <canvas ref={dispRef} data-primary={label==="REAR"?"true":undefined}
        onTouchStart={e=>{
          if(e.touches.length===2){
            const[a,b]=e.touches;
            gRef.current.pinchStart=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);
            gRef.current.zoomStart=zoom;
            gRef.current.mode="pinch";
          }else if(e.touches.length===1){
            gRef.current.x0=e.touches[0].clientX;
            gRef.current.y0=e.touches[0].clientY;
            gRef.current.t0=Date.now();
            gRef.current.mode="tap";
          }
        }}
        onTouchMove={e=>{
          const g=gRef.current;
          if(g.mode==="pinch"&&e.touches.length===2&&onZoom){
            const[a,b]=e.touches;
            const d=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);
            const ratio=d/Math.max(1,g.pinchStart);
            onZoom(Math.max(1,Math.min(12,g.zoomStart*ratio)));
          }
        }}
        onTouchEnd={e=>{
          const g=gRef.current;
          if(g.mode!=="tap"){g.mode=null;return;}
          const t=e.changedTouches[0];
          const dx=t.clientX-g.x0, dy=t.clientY-g.y0, dt=Date.now()-g.t0;
          g.mode=null;
          // Horizontal swipe → cycle mode
          if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.6&&dt<600){
            onSwipeMode?.(dx<0?1:-1);
            return;
          }
          // Vertical swipe → gain
          if(Math.abs(dy)>55&&Math.abs(dy)>Math.abs(dx)*1.6&&dt<600){
            onSwipeGain?.(dy<0?1:-1);
            return;
          }
          // Tap / double-tap
          if(Math.abs(dx)<14&&Math.abs(dy)<14&&dt<400){
            const now=Date.now();
            const r=e.currentTarget.getBoundingClientRect();
            const fx=(t.clientX-r.left)/r.width, fy=(t.clientY-r.top)/r.height;
            if(now-(g.lastTap||0)<300){
              g.lastTap=0;
              setMagnify(m=>m?null:{fx,fy});
            }else{
              g.lastTap=now;
              g.pendingFocus={fx,fy};
              setTapFocus({fx,fy,t:now});
              setTimeout(()=>setTapFocus(f=>f&&f.t===now?null:f),700);
            }
          }
        }}
        onClick={e=>{
          // desktop fallback — no touch events
          if(gRef.current.hadTouch)return;
          const r=e.currentTarget.getBoundingClientRect();
          const fx=(e.clientX-r.left)/r.width,fy=(e.clientY-r.top)/r.height;
          setMagnify(m=>m?null:{fx,fy});
        }}
        style={{width:"100%",height:"100%",display:"block",
        transform:`scale(${zoom})`,transformOrigin:"center",transition:"transform 0.15s ease",
        imageRendering:zoom>=4?"pixelated":"auto",cursor:"crosshair"}}/>
      {starsOn&&stars&&stars.length>0&&(
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:21}}
          viewBox={`0 0 ${cameraSize.w} ${cameraSize.h}`} preserveAspectRatio="none">
          {stars.map((s,i)=>(
            <g key={i}>
              <circle cx={s.x} cy={s.y} r={cameraSize.w/180} fill="none" stroke="#a0d8ff" strokeWidth={cameraSize.w/700} opacity="0.8"/>
              {i<12&&<text x={s.x+cameraSize.w/140} y={s.y-cameraSize.w/220} fill="#a0d8ff" fontSize={cameraSize.w/70} opacity="0.75" fontFamily="DM Mono,monospace">{Math.round(s.lum)}</text>}
            </g>
          ))}
        </svg>
      )}
      {showHist&&expo&&(
        <div style={{position:"absolute",bottom:6,left:6,zIndex:26,background:"rgba(0,0,0,0.7)",
          border:`1px solid ${color}30`,borderRadius:5,padding:"5px 6px",display:"flex",flexDirection:"column",gap:3}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:1,height:28}}>
            {Array.from(expo.hist).map((v,i)=>{
              const mx=Math.max(...expo.hist)||1;
              return <div key={i} style={{width:2,height:`${Math.max(1,(v/mx)*28)}px`,
                background:i<3?"#4488ff":i>60?"#ff4444":color,opacity:.85}}/>;
            })}
          </div>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:6,color:`${color}70`,letterSpacing:.5}}>
            μ{Math.round(expo.mean)} ▼{(expo.clipLow*100).toFixed(0)}% ▲{(expo.clipHigh*100).toFixed(0)}%
          </span>
        </div>
      )}
      {expo&&(expo.clipLow>0.55||expo.clipHigh>0.30)&&(
        <div style={{position:"absolute",top:6,left:"50%",transform:"translateX(-50%)",zIndex:27,
          background:"rgba(0,0,0,0.75)",border:"1px solid rgba(255,170,0,0.5)",borderRadius:4,
          padding:"3px 8px",fontFamily:"'DM Mono',monospace",fontSize:7,color:"#ffaa00",letterSpacing:1}}>
          {expo.clipLow>0.55?"⚠ UNDEREXPOSED — RAISE GAIN":"⚠ OVEREXPOSED — LOWER GAIN"}
        </div>
      )}
      {tapFocus&&(
        <div style={{position:"absolute",left:`${tapFocus.fx*100}%`,top:`${tapFocus.fy*100}%`,
          transform:"translate(-50%,-50%)",zIndex:28,pointerEvents:"none",
          width:54,height:54,border:`2px solid ${color}`,borderRadius:"50%",
          animation:"focus-pulse 0.7s ease-out forwards"}}/>
      )}
      {magnify&&<MagnifierPIP source={dispRef} fx={magnify.fx} fy={magnify.fy} color={color} onClose={()=>setMagnify(null)}/>}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:10,overflow:"hidden"}}>
        <div style={{position:"absolute",left:0,right:0,height:2,
          background:`linear-gradient(180deg,transparent,${color}12,transparent)`,
          animation:"nvg-scan 6s linear infinite"}}/>
      </div>
      {flash&&<div style={{position:"absolute",inset:0,zIndex:50,pointerEvents:"none",
        background:"rgba(255,255,255,0.38)",animation:"flash-out 0.4s ease-out forwards"}}/>}
      {ready&&(
        <>
          <Corners color={color}/>
          {showReticle&&!blobs.length&&<Reticle color={color}/>}
          <TargetBoxes blobs={blobs} cw={cameraSize.w} ch={cameraSize.h} color={color} autoCapPending={autoCapPending}/>
          <ThermalOverlay tempData={tempData} mode={mode}/>
          <div style={{position:"absolute",top:8,left:8,zIndex:20,display:"flex",flexDirection:"column",gap:2}}>
            <div style={{fontSize:7,color,letterSpacing:2,padding:"1px 4px",border:`1px solid ${color}30`,background:`${color}08`,borderRadius:1}}>{label}</div>
            <div style={{fontSize:6,color:`${color}45`,letterSpacing:1,paddingLeft:2}}>{fps}fps</div>
            {blobs.length>0&&<div style={{fontSize:7,color:"#ff5500",letterSpacing:1,animation:"rec-blink 0.8s step-end infinite",paddingLeft:2}}>{blobs.length} TGT{blobs.length>1?"S":""}</div>}
            {autoCapPending&&<div style={{fontSize:7,color:"#ffdd00",letterSpacing:1,paddingLeft:2,animation:"rec-blink 0.3s step-end infinite"}}>📷AUTO</div>}
          </div>
          {motionLevel>0.004&&(
            <div style={{position:"absolute",bottom:8,left:8,zIndex:20,display:"flex",alignItems:"center",gap:3,
              padding:"2px 5px",background:motionLevel>0.025?"rgba(255,30,30,0.18)":"rgba(255,165,0,0.12)",
              border:`1px solid ${motionLevel>0.025?"#ff2222":"#ffaa00"}`,borderRadius:1}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:motionLevel>0.025?"#ff2222":"#ffaa00"}}/>
              <span style={{fontSize:6,letterSpacing:1,fontFamily:"'DM Mono',monospace",color:motionLevel>0.025?"#ff2222":"#ffaa00"}}>
                {motionLevel>0.025?"ALERT":"MOT"} {(motionLevel*100).toFixed(1)}%
              </span>
            </div>
          )}
          {tempData&&(mode==="THERMAL"||mode==="RAINBOW"||mode==="FUSION")&&(
            <div style={{position:"absolute",bottom:8,right:8,zIndex:20}}>
              <span style={{fontSize:7,color:"#ff8800",fontFamily:"'DM Mono',monospace",letterSpacing:1}}>▲{tempData.hot.toFixed(1)}°C</span>
            </div>
          )}
        </>
      )}
      {!ready&&!error&&(
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,zIndex:30}}>
          <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${color}20`,borderTop:`2px solid ${color}`,animation:"spin 1s linear infinite"}}/>
          <span style={{fontSize:8,color:`${color}60`,letterSpacing:2}}>INIT {label}</span>
        </div>
      )}
      {error&&(
        <div onClick={onRetry} style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,zIndex:30,background:"rgba(0,0,0,0.92)",cursor:"pointer"}}>
          <span style={{fontSize:28}}>📷</span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:error==="TAP TO START CAMERA"?color:"#ff4444",letterSpacing:2,fontWeight:700}}>
            {error==="TAP TO START CAMERA"?"▶ TAP TO START CAMERA":`${label} OFFLINE`}
          </span>
          {error!=="TAP TO START CAMERA"&&(
            <span style={{fontSize:8,color:"rgba(255,100,100,0.6)",textAlign:"center",maxWidth:220,letterSpacing:.5,fontFamily:"'DM Mono',monospace"}}>
              {error.toLowerCase().includes("denied")?"ALLOW CAMERA IN BROWSER SETTINGS, THEN TAP":error.slice(0,60).toUpperCase()}
            </span>
          )}
          <span style={{fontSize:8,color:`${color}70`,letterSpacing:2,border:`1px solid ${color}40`,padding:"6px 16px",borderRadius:6,fontFamily:"'DM Mono',monospace"}}>
            ↻ RETRY
          </span>
        </div>
      )}
    </div>
  );
}
