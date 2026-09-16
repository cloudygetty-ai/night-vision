import{useState,useEffect,useRef}from"react";

/* ══════════════════════════════════════════════════════════════════════════
   NVS-14 LAYOUT — full-bleed camera, floating HUD, bottom sheet
   ══════════════════════════════════════════════════════════════════════════ */

/* Frosted glass surface used by every floating element */
export const glass=(color,alpha=0.42)=>({
  background:`rgba(4,8,6,${alpha})`,
  backdropFilter:"blur(18px) saturate(1.3)",
  WebkitBackdropFilter:"blur(18px) saturate(1.3)",
  border:`1px solid ${color}22`,
});

/* ── TOP STATUS STRIP — one line, only live data ─────────────────────────── */
export function StatusStrip({color,clock,badges,battery,onOpenSheet}){
  return(
    <div style={{position:"absolute",top:0,left:0,right:0,zIndex:60,
      padding:"calc(env(safe-area-inset-top,0px) + 8px) 12px 8px",
      display:"flex",alignItems:"center",gap:10,
      background:"linear-gradient(to bottom,rgba(0,0,0,.82),rgba(0,0,0,.35) 60%,transparent)"}}>
      <span style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:900,color,
        letterSpacing:3,textShadow:`0 0 14px ${color}66`,flexShrink:0}}>NVS</span>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:`${color}cc`,
        letterSpacing:1,flexShrink:0}}>{clock}</span>
      <div style={{flex:1,display:"flex",gap:7,alignItems:"center",overflow:"hidden",flexWrap:"nowrap"}}>
        {badges}
      </div>
      {battery&&(
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,flexShrink:0,
          color:battery.level<20?"#ff5555":`${color}88`}}>
          {battery.charging?"⚡":""}{battery.level}%
        </span>
      )}
      <button onClick={onOpenSheet} style={{flexShrink:0,width:34,height:34,borderRadius:10,
        ...glass(color,.5),color,fontSize:15,display:"grid",placeItems:"center"}}>☰</button>
    </div>
  );
}

/* ── MODE WHEEL — horizontal snap carousel, iOS-camera style ─────────────── */
export function ModeWheel({modes,meta,value,onChange,color}){
  const ref=useRef(null);
  useEffect(()=>{
    const el=ref.current?.querySelector(`[data-m="${value}"]`);
    try{el?.scrollIntoView?.({behavior:"smooth",inline:"center",block:"nearest"});}catch{}
  },[value]);
  return(
    <div ref={ref} style={{display:"flex",gap:0,overflowX:"auto",scrollSnapType:"x mandatory",
      padding:"0 42vw",WebkitOverflowScrolling:"touch"}}>
      {modes.map(m=>{
        const on=m===value, mc=meta[m].color;
        return(
          <button key={m} data-m={m} onClick={()=>onChange(m)}
            style={{scrollSnapAlign:"center",flexShrink:0,padding:"9px 15px",
              background:"transparent",border:"none",
              fontFamily:"'DM Mono',monospace",
              fontSize:on?13:11,fontWeight:on?700:400,
              letterSpacing:on?2.4:1.4,
              color:on?mc:`${mc}52`,
              textShadow:on?`0 0 16px ${mc}99`:"none",
              transition:"all .18s ease",whiteSpace:"nowrap"}}>
            {meta[m].label}
          </button>
        );
      })}
    </div>
  );
}

/* ── SHUTTER BAR — the only always-visible controls ──────────────────────── */
export function ShutterBar({color,onShot,onRec,recording,onTorch,torchOn,onSentry,sentryOn,onZoomCycle,zoom}){
  const Side=({onClick,active,c,children,label})=>(
    <button onClick={onClick} style={{width:52,height:52,borderRadius:16,
      ...glass(c||color,active?.5:.34),
      border:`1.5px solid ${active?(c||color):`${c||color}2e`}`,
      boxShadow:active?`0 0 18px ${c||color}55`:"none",
      display:"grid",placeItems:"center",gap:0,position:"relative"}}>
      <span style={{fontSize:19,lineHeight:1,filter:active?"none":"grayscale(.45) opacity(.8)"}}>{children}</span>
      {label&&<span style={{position:"absolute",bottom:4,fontFamily:"'DM Mono',monospace",
        fontSize:6,letterSpacing:1,color:active?(c||color):`${c||color}77`}}>{label}</span>}
    </button>
  );
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"10px 16px 4px",gap:10}}>
      <Side onClick={onTorch} active={torchOn} c="#ffd27a" label="TORCH">🔦</Side>
      <Side onClick={onZoomCycle} active={zoom>1} label={`${zoom}×`}>🔎</Side>

      {/* shutter */}
      <button onClick={onShot} style={{width:76,height:76,borderRadius:"50%",
        background:"transparent",border:`3px solid ${color}`,
        boxShadow:`0 0 26px ${color}55, inset 0 0 0 4px rgba(0,0,0,.6)`,
        display:"grid",placeItems:"center",flexShrink:0}}>
        <span style={{width:58,height:58,borderRadius:"50%",background:color,
          boxShadow:`0 0 18px ${color}aa`}}/>
      </button>

      <Side onClick={onRec} active={recording} c="#ff4444" label={recording?"STOP":"REC"}>
        {recording?"⏹":"⏺"}
      </Side>
      <Side onClick={onSentry} active={sentryOn} c="#ff3b62" label="SENTRY">🛡</Side>
    </div>
  );
}

/* ── BOTTOM SHEET — drag handle, tabbed, everything else lives here ──────── */
export function Sheet({open,onClose,color,tabs,tab,onTab,children}){
  const startY=useRef(0),dy=useRef(0);
  const[drag,setDrag]=useState(0);
  if(!open)return null;
  return(
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:150,
        background:"rgba(0,0,0,.55)",animation:"fade-in .18s ease"}}/>
      <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:151,
        maxHeight:"82dvh",display:"flex",flexDirection:"column",
        transform:`translateY(${drag}px)`,transition:drag?"none":"transform .2s ease",
        borderRadius:"20px 20px 0 0",overflow:"hidden",
        ...glass(color,.93),
        borderBottom:"none",
        boxShadow:`0 -14px 50px rgba(0,0,0,.75), 0 0 0 1px ${color}1e`}}>

        {/* drag handle */}
        <div
          onTouchStart={e=>{startY.current=e.touches[0].clientY;}}
          onTouchMove={e=>{dy.current=Math.max(0,e.touches[0].clientY-startY.current);setDrag(dy.current);}}
          onTouchEnd={()=>{if(dy.current>90)onClose();setDrag(0);dy.current=0;}}
          style={{padding:"11px 0 7px",display:"grid",placeItems:"center",flexShrink:0,cursor:"grab"}}>
          <span style={{width:42,height:4,borderRadius:3,background:`${color}44`}}/>
        </div>

        {/* tabs */}
        <div style={{display:"flex",gap:6,padding:"0 12px 10px",overflowX:"auto",flexShrink:0}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>onTab(t.id)} style={{flexShrink:0,
              padding:"9px 14px",borderRadius:11,
              background:tab===t.id?`${color}1c`:"rgba(255,255,255,.045)",
              border:`1px solid ${tab===t.id?color:`${color}22`}`,
              fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:1.6,
              fontWeight:tab===t.id?700:400,
              color:tab===t.id?color:`${color}7a`,display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:12}}>{t.icon}</span>{t.label}
              {t.badge>0&&<span style={{background:color,color:"#000",borderRadius:8,
                padding:"0 5px",fontSize:8,fontWeight:700}}>{t.badge}</span>}
            </button>
          ))}
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"0 12px calc(env(safe-area-inset-bottom,0px) + 18px)",
          display:"flex",flexDirection:"column",gap:9}}>
          {children}
        </div>
      </div>
    </>
  );
}

/* ── Reusable sheet pieces ───────────────────────────────────────────────── */
export function Row({color,label,hint,on,onClick,c}){
  const cc=c||color;
  return(
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:12,
      padding:"13px 14px",borderRadius:12,textAlign:"left",
      background:on?`${cc}16`:"rgba(255,255,255,.04)",
      border:`1px solid ${on?cc:`${cc}22`}`,
      boxShadow:on?`0 0 12px ${cc}26`:"none"}}>
      <span style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,letterSpacing:.6,
          fontWeight:on?700:500,color:on?cc:`${cc}b0`}}>{label}</span>
        {hint&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:8.5,
          color:`${cc}66`,letterSpacing:.2}}>{hint}</span>}
      </span>
      <span style={{width:40,height:22,borderRadius:12,flexShrink:0,position:"relative",
        background:on?cc:`${cc}2a`,transition:"background .16s"}}>
        <span style={{position:"absolute",top:3,left:on?21:3,width:16,height:16,
          borderRadius:"50%",background:on?"#04120a":`${cc}88`,transition:"left .16s"}}/>
      </span>
    </button>
  );
}

export function Tile({color,icon,label,sub,onClick,active,c,badge}){
  const cc=c||color;
  return(
    <button onClick={onClick} style={{display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",gap:5,padding:"15px 8px",
      borderRadius:13,position:"relative",
      background:active?`${cc}18`:"rgba(255,255,255,.045)",
      border:`1px solid ${active?cc:`${cc}24`}`,
      boxShadow:active?`0 0 13px ${cc}2e`:"none"}}>
      <span style={{fontSize:21,lineHeight:1}}>{icon}</span>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:9.5,letterSpacing:1.1,
        fontWeight:active?700:500,color:active?cc:`${cc}a8`}}>{label}</span>
      {sub&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:7.5,color:`${cc}62`}}>{sub}</span>}
      {badge>0&&<span style={{position:"absolute",top:6,right:7,background:cc,color:"#000",
        borderRadius:9,padding:"1px 5px",fontSize:8,fontWeight:700,
        fontFamily:"'DM Mono',monospace"}}>{badge}</span>}
    </button>
  );
}

export function Slider({color,label,value,min,max,step,onChange,fmt}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",
      borderRadius:12,background:"rgba(255,255,255,.04)",border:`1px solid ${color}1c`}}>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:1.6,
        color:`${color}92`,minWidth:52}}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(parseFloat(e.target.value))}
        style={{flex:1,accentColor:color,height:4}}/>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,
        color,minWidth:44,textAlign:"right"}}>{fmt?fmt(value):value}</span>
    </div>
  );
}

export function GroupTitle({color,children}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:9,padding:"8px 2px 1px"}}>
      <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:700,color:`${color}9a`,
        letterSpacing:3.2}}>{children}</span>
      <span style={{flex:1,height:1,background:`linear-gradient(to right,${color}26,transparent)`}}/>
    </div>
  );
}
