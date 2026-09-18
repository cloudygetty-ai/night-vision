import{useState,useEffect,useRef,useCallback}from"react";

// ═══════════════════════════════════════════════════════════════════════════════
// DAY VISION PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

// Unsharp mask — sharpens fine detail (tactical clarity enhancement)
export function applyUnsharpMask(data,w,h,amount=1.8,radius=2){
  const n=w*h;
  const lum=new Float32Array(n);
  for(let i=0;i<data.length;i+=4)
    lum[i/4]=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
  // Separable box blur: horizontal pass then vertical pass — O(n) not O(n*r^2)
  const tmp=new Float32Array(n);
  const blurred=new Float32Array(n);
  for(let y=0;y<h;y++){
    let sum=0;
    for(let x=-radius;x<=radius;x++) sum+=lum[y*w+Math.min(w-1,Math.max(0,x))];
    for(let x=0;x<w;x++){
      tmp[y*w+x]=sum/(radius*2+1);
      const add=lum[y*w+Math.min(w-1,x+radius+1)];
      const rem=lum[y*w+Math.max(0,x-radius)];
      sum+=add-rem;
    }
  }
  for(let x=0;x<w;x++){
    let sum=0;
    for(let y=-radius;y<=radius;y++) sum+=tmp[Math.min(h-1,Math.max(0,y))*w+x];
    for(let y=0;y<h;y++){
      blurred[y*w+x]=sum/(radius*2+1);
      const add=tmp[Math.min(h-1,y+radius+1)*w+x];
      const rem=tmp[Math.max(0,y-radius)*w+x];
      sum+=add-rem;
    }
  }
  for(let i=0;i<data.length;i+=4){
    const pi=i/4;
    const diff=lum[pi]-blurred[pi];
    const scale=lum[pi]>0?(lum[pi]+diff*amount)/lum[pi]:1;
    data[i]  =Math.max(0,Math.min(255,data[i]  *scale));
    data[i+1]=Math.max(0,Math.min(255,data[i+1]*scale));
    data[i+2]=Math.max(0,Math.min(255,data[i+2]*scale));
  }
}

// Dark channel prior dehaze — removes atmospheric haze/glare
export function applyDehaze(data,w,h,strength=0.7){
  // Fast approximate dark-channel: downsample to 1/4 resolution grid,
  // patch radius reduced, then upsample transmission map
  const step=4; // sample every 4th pixel
  const patch=2; // small patch on downsampled grid (~8px effective)
  const gw=Math.ceil(w/step),gh=Math.ceil(h/step);
  const dark=new Float32Array(gw*gh);
  for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){
    let minV=255;
    for(let dy=-patch;dy<=patch;dy++)for(let dx=-patch;dx<=patch;dx++){
      const sx=Math.min(w-1,Math.max(0,(gx+dx)*step));
      const sy=Math.min(h-1,Math.max(0,(gy+dy)*step));
      const i=(sy*w+sx)*4;
      const m=Math.min(data[i],data[i+1],data[i+2]);
      if(m<minV)minV=m;
    }
    dark[gy*gw+gx]=minV;
  }
  // Estimate atmospheric light: max of dark channel grid (approximation)
  let A=0;
  for(let i=0;i<dark.length;i++) if(dark[i]>A)A=dark[i];
  A=Math.max(A,10);
  // Apply transmission per-pixel using nearest grid sample (no expensive interpolation)
  for(let i=0;i<data.length;i+=4){
    const pi=i/4;
    const x=pi%w,y=(pi-x)/w|0;
    const gx=Math.min(gw-1,x/step|0),gy=Math.min(gh-1,y/step|0);
    const t=Math.max(0.15,1-(strength*dark[gy*gw+gx]/A));
    data[i]  =Math.min(255,Math.max(0,(data[i]  -A)/t+A));
    data[i+1]=Math.min(255,Math.max(0,(data[i+1]-A)/t+A));
    data[i+2]=Math.min(255,Math.max(0,(data[i+2]-A)/t+A));
  }
}

// Polarize: cut specular highlights, boost saturation (polarized lens simulation)
export function applyPolarize(data,w,h){
  for(let i=0;i<data.length;i+=4){
    let r=data[i],g=data[i+1],b=data[i+2];
    // Convert to HSL, boost S, reduce L on highlights
    const max=Math.max(r,g,b)/255,min=Math.min(r,g,b)/255;
    const l=(max+min)/2;
    const d=max-min;
    let s=d===0?0:d/(1-Math.abs(2*l-1));
    // Boost saturation by 60%, crush glare (highlights above 0.85 L)
    s=Math.min(1,s*1.6);
    const lAdj=l>0.85?(l-0.85)*0.4+0.85*0.9:l; // compress highlights
    // Back to RGB
    const c=(1-Math.abs(2*lAdj-1))*s;
    const hue=max===min?0:max===r/255?((g-b)/255/d+6)%6:max===g/255?(b-r)/255/d+2:(r-g)/255/d+4;
    const x=c*(1-Math.abs(hue%2-1));
    let r2=0,g2=0,b2=0;
    if(hue<1){r2=c;g2=x;}else if(hue<2){r2=x;g2=c;}
    else if(hue<3){g2=c;b2=x;}else if(hue<4){g2=x;b2=c;}
    else if(hue<5){r2=x;b2=c;}else{r2=c;b2=x;}
    const m=lAdj-c/2;
    data[i]  =Math.min(255,Math.max(0,Math.round((r2+m)*255)));
    data[i+1]=Math.min(255,Math.max(0,Math.round((g2+m)*255)));
    data[i+2]=Math.min(255,Math.max(0,Math.round((b2+m)*255)));
  }
}

// Tactical day enhancement: contrast stretch + color fidelity + HUD-safe palette
export function applyTactical(data,w,h,brightness){
  // Auto-levels: stretch histogram per channel
  const rMin=new Array(3).fill(255),rMax=new Array(3).fill(0);
  for(let i=0;i<data.length;i+=4){
    for(let c=0;c<3;c++){
      if(data[i+c]<rMin[c])rMin[c]=data[i+c];
      if(data[i+c]>rMax[c])rMax[c]=data[i+c];
    }
  }
  // Apply levels + brightness boost + slight yellow-green tint (military CMOS filter)
  const bBoost=1.15+brightness*0.5;
  for(let i=0;i<data.length;i+=4){
    const stretch=c=>{
      const range=Math.max(1,rMax[c]-rMin[c]);
      return Math.min(255,Math.max(0,Math.round(((data[i+c]-rMin[c])/range)*255*bBoost)));
    };
    data[i]  =Math.min(255,stretch(0)*0.88); // slight red reduction
    data[i+1]=Math.min(255,stretch(1)*1.05); // slight green boost
    data[i+2]=Math.min(255,stretch(2)*0.92); // slight blue reduction
  }
  // Unsharp mask for tactical clarity
  applyUnsharpMask(data,w,h,1.4,2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-DEVICE SYNC (WebRTC signaling via BroadcastChannel + PeerJS-less peer)
// Uses localStorage as simple signaling bus for same-device tabs
// ═══════════════════════════════════════════════════════════════════════════════
export function useMultiSync(enabled,myId){
  const[peers,setPeers]=useState([]);
  const[alerts,setAlerts]=useState([]);
  const chRef=useRef(null);
  useEffect(()=>{
    if(!enabled||typeof BroadcastChannel==="undefined")return;
    const ch=new BroadcastChannel("nvs7_sync");
    chRef.current=ch;
    ch.onmessage=e=>{
      const{type,from,payload}=e.data;
      if(from===myId)return;
      if(type==="HEARTBEAT")setPeers(p=>{const exists=p.find(x=>x.id===from);if(exists)return p.map(x=>x.id===from?{...x,ts:Date.now()}:x);return[...p,{id:from,ts:Date.now(),label:payload?.label||from}];});
      if(type==="MOTION_ALERT")setAlerts(a=>[{from,payload,ts:Date.now()},...a].slice(0,20));
    };
    const beat=setInterval(()=>ch.postMessage({type:"HEARTBEAT",from:myId,payload:{label:`NVS-${myId.slice(-4)}`}})
    ,3000);
    const prune=setInterval(()=>setPeers(p=>p.filter(x=>Date.now()-x.ts<10000)),5000);
    return()=>{ch.close();clearInterval(beat);clearInterval(prune);};
  },[enabled,myId]);
  const broadcast=useCallback((type,payload)=>{
    chRef.current?.postMessage({type,from:myId,payload});
  },[myId]);
  return{peers,alerts,broadcast};
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE STORE
// ═══════════════════════════════════════════════════════════════════════════════
export function useTimeline(){
  const[events,setEvents]=useState([]);
  const add=useCallback((type,data)=>setEvents(e=>[{id:Date.now(),type,data,ts:Date.now()},...e].slice(0,200)),[]);
  return{events,add};
}

// ═══════════════════════════════════════════════════════════════════════════════
// GPS MAP MODAL
// ═══════════════════════════════════════════════════════════════════════════════
// Face detection using Canvas + heuristic skin-tone blob analysis
// (No ML model — uses YCbCr skin tone range detection)
export function detectFaces(data,w,h){
  const mask=new Uint8Array(w*h);
  // YCbCr skin tone: Y>80, Cb 85-135, Cr 135-180
  for(let i=0;i<data.length;i+=4){
    const r=data[i],g=data[i+1],b=data[i+2];
    const Y=0.299*r+0.587*g+0.114*b;
    const Cb=-0.168736*r-0.331264*g+0.5*b+128;
    const Cr=0.5*r-0.418688*g-0.081312*b+128;
    if(Y>80&&Cb>85&&Cb<135&&Cr>135&&Cr<180)mask[i/4]=1;
  }
  // Find largest connected skin blob
  const visited=new Uint8Array(w*h);const faces=[];
  for(let start=0;start<mask.length;start++){
    if(!mask[start]||visited[start])continue;
    const queue=[start];visited[start]=1;
    let minX=w,minY=h,maxX=0,maxY=0,size=0;
    while(queue.length){
      const idx=queue.pop();size++;
      const x=idx%w,y=Math.floor(idx/w);
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
      for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&nx<w&&ny>=0&&ny<h){const ni=ny*w+nx;if(mask[ni]&&!visited[ni]){visited[ni]=1;queue.push(ni);}}
      }
    }
    // Face-like: roughly square, not too small/large, upper half of frame preferred
    const bw=maxX-minX,bh=maxY-minY,aspect=bw/Math.max(1,bh);
    const area=(bw*bh)/(w*h);
    if(size>300&&area>0.005&&area<0.4&&aspect>0.5&&aspect<2.0)
      faces.push({x:minX,y:minY,w:bw,h:bh,cx:(minX+maxX)/2,cy:(minY+maxY)/2});
  }
  return faces.sort((a,b)=>b.w*b.h-a.w*a.h).slice(0,4);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REMOTE CAST — stream this device's live camera feed to another device
// (phone → PC, phone → phone, anywhere). Signaling rides free public Nostr
// relays so no server of ours is involved; once connected, video is
// straight peer-to-peer WebRTC. The whole module is loaded on demand via
// dynamic import so devices that never use CAST don't pay for it.
// ═══════════════════════════════════════════════════════════════════════════════
const CAST_APP_ID="nvs7-cast-v1";
const CAST_CHARS="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
export function genCastCode(){
  let s="";for(let i=0;i<6;i++)s+=CAST_CHARS[Math.floor(Math.random()*CAST_CHARS.length)];
  return s;
}

// Broadcaster side — run on the device holding the camera. Grabs the
// primary NVS display canvas (see data-primary attr in CameraPanel) and
// pushes it as a live stream to every peer that joins the room.
export function useCastBroadcast(enabled,code){
  const[viewers,setViewers]=useState(0);
  const[status,setStatus]=useState("idle"); // idle | connecting | ready | unsupported | error
  useEffect(()=>{
    if(!enabled||!code){setViewers(0);setStatus("idle");return;}
    let cancelled=false,room=null;
    setStatus("connecting");
    (async()=>{
      try{
        // wait for the display canvas to exist and have pixels (up to 6s)
        let cv=null;
        for(let i=0;i<60&&!cancelled;i++){
          cv=document.querySelector("canvas[data-primary='true']");
          if(cv&&cv.width>0&&typeof cv.captureStream==="function")break;
          await new Promise(r=>setTimeout(r,100));
        }
        if(cancelled)return;
        if(!cv||typeof cv.captureStream!=="function"){setStatus("unsupported");return;}
        const{joinRoom}=await import("trystero/nostr");
        if(cancelled)return;
        const stream=cv.captureStream(24);
        room=joinRoom({appId:CAST_APP_ID},`nvs7-${code}`);
        // trystero handlers are FUNCTIONS, not assignable properties
        room.addStream(stream);                    // serve peers already in the room
        room.onPeerJoin(peerId=>{
          try{room.addStream(stream,peerId);}catch{}   // serve each new peer
          setViewers(v=>v+1);
        });
        room.onPeerLeave(()=>setViewers(v=>Math.max(0,v-1)));
        setStatus("ready");
      }catch{if(!cancelled)setStatus("error");}
    })();
    return()=>{cancelled=true;room?.leave();setViewers(0);};
  },[enabled,code]);
  return{viewers,status};
}

// Viewer side — run on the watching device (e.g. a PC browser). Has no
// camera of its own; just joins the same room and displays whatever
// stream the broadcaster sends.
export function useCastWatch(code){
  const[stream,setStream]=useState(null);
  const[status,setStatus]=useState("connecting"); // connecting | live | ended | error
  useEffect(()=>{
    if(!code)return;
    let cancelled=false,room=null;
    setStatus("connecting");
    (async()=>{
      try{
        const{joinRoom}=await import("trystero/nostr");
        if(cancelled)return;
        room=joinRoom({appId:CAST_APP_ID},`nvs7-${code}`);
        room.onPeerStream(s=>{setStream(s);setStatus("live");});
        room.onPeerJoin(()=>setStatus(st=>st==="connecting"?"handshake":st));
        room.onPeerLeave(()=>{setStream(null);setStatus("ended");});
      }catch{if(!cancelled)setStatus("error");}
    })();
    return()=>{cancelled=true;room?.leave();};
  },[code]);
  return{stream,status};
}
