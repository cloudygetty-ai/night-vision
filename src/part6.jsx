import{useState,useEffect}from"react";

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
export const MODE_META={
  RAW:    {label:"RAW",    color:"#ffffff"},
  NVG:    {label:"NVG",    color:"#00ff50"},
  THERMAL:{label:"THERMAL",color:"#ff5500"},
  RAINBOW:{label:"RAINBOW",color:"#00ccff"},
  FUSION: {label:"FUSION", color:"#cc44ff"},
  BLUE:   {label:"ARCTIC", color:"#0088ff"},
  WHITE:  {label:"WHT-HOT",color:"#dddddd"},
  TACT:   {label:"TACT",   color:"#f0e060"},
  HAZE:   {label:"DEHAZE", color:"#60d0ff"},
  POLAR:  {label:"POLARIZ",color:"#ff60d0"},
  ASTRO:  {label:"ASTRO",  color:"#a0b8ff"},
};
export const MODE_KEYS=Object.keys(MODE_META);
export const ZOOM_STEPS=[1,1.5,2,3,4,6,8,12];
export const PEER_ID=Math.random().toString(36).slice(2,10);

// ═══════════════════════════════════════════════════════════════════════════════
// CHROME PRIMITIVES — corner bezel, section labels, boot sequence
// ═══════════════════════════════════════════════════════════════════════════════
export const CORNER_POS={
  tl:{top:5,left:5,borderTop:"2px solid",borderLeft:"2px solid"},
  tr:{top:5,right:5,borderTop:"2px solid",borderRight:"2px solid"},
  bl:{bottom:5,left:5,borderBottom:"2px solid",borderLeft:"2px solid"},
  br:{bottom:5,right:5,borderBottom:"2px solid",borderRight:"2px solid"},
};
export function Corner({pos,color,size=12,op=.55}){
  return(
    <div style={{position:"absolute",width:size,height:size,borderColor:`${color}`,
      opacity:op,pointerEvents:"none",...CORNER_POS[pos]}}/>
  );
}
export function Bezel({color,op}){
  return(<>
    <Corner pos="tl" color={color} op={op}/>
    <Corner pos="tr" color={color} op={op}/>
    <Corner pos="bl" color={color} op={op}/>
    <Corner pos="br" color={color} op={op}/>
  </>);
}
export function SectionLabel({children,color}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
      <div style={{width:3,height:9,background:color,opacity:.65,borderRadius:1,boxShadow:`0 0 4px ${color}60`}}/>
      <span style={{fontSize:9,color:`${color}60`,letterSpacing:2,fontWeight:500}}>{children}</span>
      <div style={{flex:1,height:1,background:`linear-gradient(90deg,${color}18,transparent)`}}/>
    </div>
  );
}
export const BOOT_LINES=[
  "PWR RAIL ─────── NOMINAL",
  "OPTIC ARRAY ──── LINKED",
  "IMG PROCESSOR ── ONLINE",
  "AI INFERENCE ─── LOADING",
  "SENSOR BUS ───── SYNCED",
  "HUD OVERLAY ──── READY",
];
export function BootSequence({color,onDone}){
  const[exiting,setExiting]=useState(false);
  useEffect(()=>{
    const t1=setTimeout(()=>setExiting(true),1750);
    const t2=setTimeout(onDone,2150);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
  // eslint-disable-next-line
  },[]);
  return(
    <div style={{position:"fixed",inset:0,background:"#000",zIndex:500,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      opacity:exiting?0:1,transition:"opacity 0.4s ease",fontFamily:"'DM Mono',monospace",
      overflow:"hidden"}}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes boot-flicker{0%{opacity:0}6%{opacity:.55}9%{opacity:.08}14%{opacity:.75}18%{opacity:.15}24%{opacity:1}100%{opacity:1}}
        @keyframes boot-word{from{opacity:0;letter-spacing:18px;filter:blur(10px)}to{opacity:1;letter-spacing:8px;filter:blur(0)}}
        @keyframes boot-line{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        @keyframes boot-bar{from{width:0%}to{width:100%}}
        @keyframes boot-corner{from{opacity:0}to{opacity:.6}}
      `}</style>
      <div style={{position:"absolute",inset:0,animation:"boot-flicker 0.9s steps(14) both"}}>
        <Bezel color={color} op={1}/>
        <div style={{position:"absolute",inset:18,border:`1px solid ${color}12`,animation:"boot-corner 1s ease .3s both"}}/>
      </div>
      <span style={{fontFamily:"'Cinzel',serif",fontSize:24,fontWeight:900,color,
        textShadow:`0 0 20px ${color}90,0 0 44px ${color}40`,
        animation:"boot-word 0.9s cubic-bezier(.16,1,.3,1) both"}}>NVS</span>
      <span style={{fontSize:7,color:`${color}55`,letterSpacing:4,marginTop:7,
        animation:"boot-line .5s ease .45s both"}}>ENTROPY-ZERO TACTICAL IMAGING SYSTEM</span>
      <div style={{marginTop:26,width:216,display:"flex",flexDirection:"column",gap:5}}>
        {BOOT_LINES.map((l,i)=>(
          <div key={l} style={{fontSize:8,letterSpacing:1,color:`${color}85`,
            animation:`boot-line .3s ease ${0.65+i*0.15}s both`}}>{l}</div>
        ))}
      </div>
      <div style={{marginTop:18,width:216,height:2,background:`${color}15`,borderRadius:1,overflow:"hidden"}}>
        <div style={{height:"100%",background:color,boxShadow:`0 0 8px ${color}`,
          animation:"boot-bar 1.6s cubic-bezier(.4,0,.2,1) .5s both"}}/>
      </div>
    </div>
  );
}
