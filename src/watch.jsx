import{useState,useEffect,useRef}from"react";
import{useCastWatch}from"./part3.jsx";
import{Bezel}from"./part6.jsx";

// ═══════════════════════════════════════════════════════════════════════════════
// WATCH VIEW — standalone receiver page. Loaded when the app URL carries
// ?watch=<code>; renders instead of the full camera app (see main.jsx).
// No camera, no permissions requested — just joins the CAST room and shows
// whatever the broadcasting device sends.
// ═══════════════════════════════════════════════════════════════════════════════
const COLOR="#00ff50";

export default function WatchView({code}){
  const{stream,status}=useCastWatch(code);
  const videoRef=useRef(null);
  const[slowLink,setSlowLink]=useState(false);

  useEffect(()=>{
    if(videoRef.current)videoRef.current.srcObject=stream;
  },[stream]);

  useEffect(()=>{
    if(status!=="connecting")return setSlowLink(false);
    const t=setTimeout(()=>setSlowLink(true),12000);
    return()=>clearTimeout(t);
  },[status]);

  const label=
    status==="live"?null
    :status==="ended"?"CAST ENDED — the broadcasting device stopped or disconnected"
    :status==="error"?"CONNECTION ERROR — could not reach the signaling network"
    :slowLink?"STILL WAITING — make sure REMOTE CAST is started on the phone with this exact code"
    :"CONNECTING…";

  return(
    <div style={{position:"fixed",inset:0,background:"#000",overflow:"hidden",
      fontFamily:"'DM Mono',monospace",color:COLOR}}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <Bezel color={COLOR} op={0.5}/>

      <video ref={videoRef} autoPlay playsInline muted={false} style={{
        position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",
        background:"#000",opacity:status==="live"?1:0,transition:"opacity 0.4s ease",
      }}/>

      {status!=="live"&&(
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",gap:14,padding:24,textAlign:"center"}}>
          <span style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:900,color:COLOR,
            letterSpacing:6,textShadow:`0 0 20px ${COLOR}80`}}>NVS REMOTE</span>
          {status==="connecting"&&(
            <div style={{width:120,height:2,background:`${COLOR}18`,borderRadius:1,overflow:"hidden"}}>
              <div style={{height:"100%",width:"40%",background:COLOR,boxShadow:`0 0 8px ${COLOR}`,
                animation:"watch-scan 1.3s ease-in-out infinite"}}/>
            </div>
          )}
          <span style={{fontSize:9,letterSpacing:1,color:`${COLOR}90`,maxWidth:320,lineHeight:1.7}}>
            {label}
          </span>
          {code&&<span style={{fontSize:8,letterSpacing:3,color:`${COLOR}45`}}>ROOM {code}</span>}
        </div>
      )}

      {status==="live"&&(
        <div style={{position:"absolute",top:12,left:0,right:0,display:"flex",
          justifyContent:"center",pointerEvents:"none"}}>
          <span style={{fontSize:8,letterSpacing:2,color:`${COLOR}90`,
            background:"rgba(0,0,0,0.5)",border:`1px solid ${COLOR}40`,borderRadius:20,
            padding:"3px 12px"}}>
            🟢 LIVE — ROOM {code}
          </span>
        </div>
      )}

      <style>{`@keyframes watch-scan{0%{transform:translateX(-140%)}100%{transform:translateX(340%)}}`}</style>
    </div>
  );
}
