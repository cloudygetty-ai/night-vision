import{useState,useEffect,useRef,useCallback}from"react";
import{estimateRange,estimateGlobalShift,superResolve,computeHistogram,detectPoints}from"./part2.jsx";
import{applyTactical,applyDehaze,applyUnsharpMask,applyPolarize}from"./part3.jsx";

// ═══════════════════════════════════════════════════════════════════════════════
// LUT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════
export function buildLUT(fn){
  const l=new Uint8Array(256*3);
  for(let i=0;i<256;i++){
    const[r,g,b]=fn(i/255);
    l[i*3]=Math.min(255,Math.max(0,Math.round(r)));
    l[i*3+1]=Math.min(255,Math.max(0,Math.round(g)));
    l[i*3+2]=Math.min(255,Math.max(0,Math.round(b)));
  }
  return l;
}
export const LUTS={
  THERMAL:buildLUT(t=>{
    if(t<.2)return[0,0,t/.2*180];
    if(t<.4){const s=(t-.2)/.2;return[s*160,0,180-s*180];}
    if(t<.6){const s=(t-.4)/.2;return[160+s*95,s*60,0];}
    if(t<.8){const s=(t-.6)/.2;return[255,60+s*140,0];}
    const s=(t-.8)/.2;return[255,200+s*55,s*255];
  }),
  RAINBOW:buildLUT(t=>{
    if(t<.25)return[0,t/.25*255,255];
    if(t<.5){const s=(t-.25)/.25;return[0,255,255-s*255];}
    if(t<.75){const s=(t-.5)/.25;return[s*255,255,0];}
    const s=(t-.75)/.25;return[255,255-s*255,0];
  }),
  FUSION:buildLUT(t=>{
    if(t<.33){const s=t/.33;return[s*80,0,80+s*175];}
    if(t<.66){const s=(t-.33)/.33;return[80+s*175,s*100,255-s*200];}
    const s=(t-.66)/.34;return[255,100+s*155,55+s*200];
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════
export function sobelEdges(data,w,h){
  const e=new Float32Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const L=i=>{const d=i*4;return 0.299*data[d]+0.587*data[d+1]+0.114*data[d+2];};
    const tl=L((y-1)*w+(x-1)),t=L((y-1)*w+x),tr=L((y-1)*w+(x+1));
    const ml=L(y*w+(x-1)),mr=L(y*w+(x+1));
    const bl=L((y+1)*w+(x-1)),b=L((y+1)*w+x),br=L((y+1)*w+(x+1));
    const gx=-tl-2*ml-bl+tr+2*mr+br,gy=-tl-2*t-tr+bl+2*b+br;
    e[y*w+x]=Math.min(255,Math.sqrt(gx*gx+gy*gy)*.5);
  }
  return e;
}
export function applyCLAHE(data,w,h,tiles=6,clip=3.5){
  const tW=Math.floor(w/tiles),tH=Math.floor(h/tiles);
  for(let ty=0;ty<tiles;ty++)for(let tx=0;tx<tiles;tx++){
    const x0=tx*tW,y0=ty*tH,x1=tx===tiles-1?w:x0+tW,y1=ty===tiles-1?h:y0+tH;
    const hist=new Float32Array(256);let count=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=(y*w+x)*4;
      hist[Math.round(0.299*data[i]+0.587*data[i+1]+0.114*data[i+2])]++;count++;
    }
    const lim=(count/256)*clip;let ex=0;
    for(let i=0;i<256;i++){if(hist[i]>lim){ex+=hist[i]-lim;hist[i]=lim;}}
    const add=ex/256;for(let i=0;i<256;i++)hist[i]+=add;
    const cdf=new Float32Array(256);cdf[0]=hist[0];
    for(let i=1;i<256;i++)cdf[i]=cdf[i-1]+hist[i];
    const cMin=cdf[0];
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=(y*w+x)*4;
      const lum=Math.round(0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]);
      const eq=Math.round((cdf[lum]-cMin)/Math.max(1,count-cMin)*255);
      const sc=lum>2?eq/lum:1;
      data[i]=Math.min(255,data[i]*sc);data[i+1]=Math.min(255,data[i+1]*sc);data[i+2]=Math.min(255,data[i+2]*sc);
    }
  }
}

// NVG-specific extreme CLAHE — 10x10 tiles, high clip, on green channel only
export function applyNVGCLAHE(data,w,h){
  const tiles=8,clip=6.0;
  const tW=Math.floor(w/tiles),tH=Math.floor(h/tiles);
  // Extract green channel into temp array, equalize it, write back
  const green=new Uint8Array(w*h);
  for(let i=0;i<data.length;i+=4) green[i/4]=data[i+1];
  for(let ty=0;ty<tiles;ty++)for(let tx=0;tx<tiles;tx++){
    const x0=tx*tW,y0=ty*tH,x1=tx===tiles-1?w:x0+tW,y1=ty===tiles-1?h:y0+tH;
    const hist=new Float32Array(256);let count=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){hist[green[y*w+x]]++;count++;}
    const lim=(count/256)*clip;let ex=0;
    for(let i=0;i<256;i++){if(hist[i]>lim){ex+=hist[i]-lim;hist[i]=lim;}}
    const add=ex/256;for(let i=0;i<256;i++)hist[i]+=add;
    const cdf=new Float32Array(256);cdf[0]=hist[0];
    for(let i=1;i<256;i++)cdf[i]=cdf[i-1]+hist[i];
    const cMin=cdf[0],cRange=Math.max(1,count-cMin);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      green[y*w+x]=Math.round((cdf[green[y*w+x]]-cMin)/cRange*255);
    }
  }
  // Write equalized green back
  for(let i=0;i<data.length;i+=4) data[i+1]=green[i/4];
}

// Temporal frame stacking — accumulates N frames, extracts signal from noise
// Returns blended luminance map
export function stackFrames(data,stackBuf,stackIdx,stackSize){
  const n=data.length/4;
  if(!stackBuf.current||stackBuf.current.length!==stackSize*n){
    stackBuf.current=new Float32Array(stackSize*n);
    stackIdx.current=0;
  }
  const idx=stackIdx.current%stackSize;
  for(let i=0;i<n;i++){
    const d=i*4;
    stackBuf.current[idx*n+i]=0.299*data[d]+0.587*data[d+1]+0.114*data[d+2];
  }
  stackIdx.current++;
  const filled=Math.min(stackIdx.current,stackSize);
  if(filled<2)return null;
  // Average across stack
  const avg=new Float32Array(n);
  for(let f=0;f<filled;f++) for(let i=0;i<n;i++) avg[i]+=stackBuf.current[f*n+i];
  for(let i=0;i<n;i++) avg[i]/=filled;
  return avg;
}
export function temporalBlend(data,history,alpha=0.75){
  if(!history||history.length!==data.length)return;
  for(let i=0;i<data.length;i+=4){
    data[i]=data[i]*alpha+history[i]*(1-alpha);
    data[i+1]=data[i+1]*alpha+history[i+1]*(1-alpha);
    data[i+2]=data[i+2]*alpha+history[i+2]*(1-alpha);
  }
}

// Phosphor bloom: soft-glow on bright green pixels (real NVG has halation)
export function applyPhosphorBloom(data,w,h){
  const g=new Float32Array(w*h);
  for(let i=0;i<data.length;i+=4) g[i/4]=data[i+1];
  const r=4;
  // Separable box blur — horizontal then vertical
  const tmp=new Float32Array(w*h);
  const blurred=new Float32Array(w*h);
  for(let y=0;y<h;y++){
    let sum=0;
    for(let x=-r;x<=r;x++) sum+=g[y*w+Math.min(w-1,Math.max(0,x))];
    for(let x=0;x<w;x++){
      tmp[y*w+x]=sum/(r*2+1);
      sum+=g[y*w+Math.min(w-1,x+r+1)]-g[y*w+Math.max(0,x-r)];
    }
  }
  for(let x=0;x<w;x++){
    let sum=0;
    for(let y=-r;y<=r;y++) sum+=tmp[Math.min(h-1,Math.max(0,y))*w+x];
    for(let y=0;y<h;y++){
      blurred[y*w+x]=sum/(r*2+1);
      sum+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x];
    }
  }
  for(let i=0;i<data.length;i+=4){
    const pi=i/4;
    const glow=blurred[pi]*0.35;
    data[i+1]=Math.min(255,data[i+1]+glow);
    if(data[i+1]>200) data[i]=Math.min(255,data[i]+data[i+1]*0.04);
  }
}
export function findBlobs(motionMap,w,h,minSize=60){
  const visited=new Uint8Array(w*h);const blobs=[];
  for(let start=0;start<motionMap.length;start++){
    if(!motionMap[start]||visited[start])continue;
    const queue=[start];visited[start]=1;
    let minX=w,minY=h,maxX=0,maxY=0,size=0;
    while(queue.length){
      const idx=queue.pop();size++;
      const x=idx%w,y=Math.floor(idx/w);
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
      for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&nx<w&&ny>=0&&ny<h){const ni=ny*w+nx;if(motionMap[ni]&&!visited[ni]){visited[ni]=1;queue.push(ni);}}
      }
    }
    if(size>=minSize)blobs.push({x:minX,y:minY,w:maxX-minX,h:maxY-minY,size,cx:(minX+maxX)/2,cy:(minY+maxY)/2});
  }
  return blobs.sort((a,b)=>b.size-a.size).slice(0,8);
}

// Heuristic fallback classifier (used when TF model not yet loaded)
export function classifyBlobFallback(blob,sw,sh){
  const aspect=blob.w/(blob.h||1);
  const area=(blob.w*blob.h)/(sw*sh);
  const cy=blob.cy/sh;
  if(area>0.25)return{label:"VEHICLE",conf:72,icon:"🚗"};
  if(aspect>1.8&&area>0.05)return{label:"VEHICLE",conf:65,icon:"🚗"};
  if(aspect>0.5&&aspect<2.2&&area>0.02&&cy>0.3)return{label:"PERSON",conf:70,icon:"🧍"};
  if(area<0.005)return{label:"SMALL OBJ",conf:50,icon:"◈"};
  if(aspect>2.5)return{label:"ANIMAL",conf:45,icon:"🐾"};
  if(cy<0.25&&area>0.01)return{label:"DRONE/BIRD",conf:55,icon:"🦅"};
  return{label:"UNKNOWN",conf:40,icon:"?"};
}

// Icon map for COCO-SSD class names
export const COCO_ICONS={
  person:"🧍",car:"🚗",truck:"🚛",bus:"🚌",motorcycle:"🏍",bicycle:"🚲",
  dog:"🐕",cat:"🐈",bird:"🦅",horse:"🐎",cow:"🐄",sheep:"🐑",
  elephant:"🐘",bear:"🐻",zebra:"🦓",giraffe:"🦒",
  bottle:"🍾",cup:"☕",fork:"🍴",knife:"🔪",spoon:"🥄",
  chair:"🪑",couch:"🛋",bed:"🛏",toilet:"🚽",
  laptop:"💻","cell phone":"📱",keyboard:"⌨️",mouse:"🖱",
  tv:"📺",microwave:"📟",oven:"🍳",refrigerator:"🧊",
  book:"📚",clock:"🕐",vase:"🏺",scissors:"✂️",
  backpack:"🎒",umbrella:"☂️",handbag:"👜",suitcase:"🧳",
  "fire hydrant":"🚒","stop sign":"🛑","parking meter":"🅿️",
  bench:"🪑","traffic light":"🚦",
};

// useTFDetector — loads COCO-SSD once, exposes a detect() fn
export function useTFDetector(){
  const modelRef=useRef(null);
  const[modelReady,setModelReady]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    const kick=()=>(async()=>{
      try{
        const [tf,cocoSsd]=await Promise.all([
          import("@tensorflow/tfjs"),
          import("@tensorflow-models/coco-ssd"),
        ]);
        await tf.ready();
        const m=await cocoSsd.load({base:"lite_mobilenet_v2"});
        if(!cancelled){modelRef.current=m;setModelReady(true);}
      }catch(e){console.warn("COCO-SSD load failed:",e);}
    })();
    // let the camera and UI paint before pulling ~2MB of model code
    const id=window.requestIdleCallback
      ? window.requestIdleCallback(kick,{timeout:2500})
      : setTimeout(kick,1200);
    return()=>{cancelled=true;
      if(window.cancelIdleCallback&&window.requestIdleCallback)window.cancelIdleCallback(id);
      else clearTimeout(id);};
  },[]);
  const busyRef=useRef(false);
  const smallRef=useRef(null);
  const detect=useCallback(async(canvas)=>{
    if(!modelRef.current||!canvas||busyRef.current)return null;
    busyRef.current=true;
    try{
      // Downscale to 320px-wide canvas — 8x fewer pixels than 720p, model
      // internally resizes to 300x300 anyway so zero accuracy loss
      if(!smallRef.current)smallRef.current=document.createElement("canvas");
      const small=smallRef.current;
      const scale=320/canvas.width;
      small.width=320;small.height=Math.round(canvas.height*scale);
      small.getContext("2d").drawImage(canvas,0,0,small.width,small.height);
      const preds=await modelRef.current.detect(small,6,0.40);
      const inv=1/scale;
      return preds.map(p=>({
        x:p.bbox[0]*inv,y:p.bbox[1]*inv,w:p.bbox[2]*inv,h:p.bbox[3]*inv,
        cx:(p.bbox[0]+p.bbox[2]/2)*inv,cy:(p.bbox[1]+p.bbox[3]/2)*inv,
        size:p.bbox[2]*p.bbox[3]*inv*inv,
        label:p.class.toUpperCase(),
        conf:Math.round(p.score*100),
        icon:COCO_ICONS[p.class]||"◈",
      }));
    }catch{return null;}
    finally{busyRef.current=false;}
  },[]);
  return{detect,modelReady};
}

// Distance estimation (pinhole camera model approximation)
export function estimateDistance(blobHeightPx,canvasH,mode){
  // Assume avg human height 1.7m, typical phone VFOV ~60deg
  const vfovRad=60*(Math.PI/180);
  const focalPx=canvasH/(2*Math.tan(vfovRad/2));
  const realH=mode==="PERSON"?1.7:mode==="VEHICLE"?1.5:0.5;
  if(blobHeightPx<5)return null;
  const dist=(realH*focalPx)/blobHeightPx;
  return Math.max(0.5,Math.min(500,dist));
}

// rPPG heart-rate: sample green channel mean from face region over time
export function extractRPPG(data,w,h){
  // sample center 20% of frame (face region when selfie)
  const cx=Math.floor(w*0.4),cy=Math.floor(h*0.3);
  const rw=Math.floor(w*0.2),rh=Math.floor(h*0.2);
  let sum=0,count=0;
  for(let y=cy;y<cy+rh&&y<h;y+=2)for(let x=cx;x<cx+rw&&x<w;x+=2){
    const i=(y*w+x)*4;sum+=data[i+1];count++;
  }
  return count>0?sum/count:0;
}

export function processFrame(video,rawCanvas,dispCanvas,cfg,refs){
  const{mode,brightness,sensitivity,edgeOverlay,noiseReduction,lutName,tripwires,showRPPG}=cfg;
  const vw=video.videoWidth,vh=video.videoHeight;
  if(!vw||!vh||video.readyState<2)return null;
  // Cap processing resolution — massive speedup, display upscales via CSS
  const MAXW=854;
  const pScale=vw>MAXW?MAXW/vw:1;
  const sw=Math.round(vw*pScale),sh=Math.round(vh*pScale);
  if(rawCanvas.width!==sw){rawCanvas.width=sw;rawCanvas.height=sh;}
  if(dispCanvas.width!==sw){dispCanvas.width=sw;dispCanvas.height=sh;}
  const rawCtx=rawCanvas.getContext("2d",{willReadFrequently:true});
  rawCtx.drawImage(video,0,0,sw,sh);
  const imageData=rawCtx.getImageData(0,0,sw,sh);
  const data=imageData.data;
  if(noiseReduction&&refs.prev.current&&refs.prev.current.length===data.length)temporalBlend(data,refs.prev.current,0.78);
  if(!refs.prev.current||refs.prev.current.length!==data.length)refs.prev.current=new Uint8ClampedArray(data.length);
  refs.prev.current.set(data);
  const motionThresh=Math.round(15+(1-sensitivity)*40);
  const motionMap=new Uint8Array(sw*sh);let motionPixels=0;
  if(refs.motion.current&&refs.motion.current.length===data.length){
    for(let i=0;i<data.length;i+=4){
      const d=(Math.abs(data[i]-refs.motion.current[i])+Math.abs(data[i+1]-refs.motion.current[i+1])+Math.abs(data[i+2]-refs.motion.current[i+2]))/3;
      if(d>motionThresh){motionMap[i/4]=255;motionPixels++;}
    }
  }
  refs.motion.current=new Uint8ClampedArray(data);

  // rPPG sample
  const rppgVal=showRPPG?extractRPPG(data,sw,sh):0;

  let edges=null;
  if(edgeOverlay)edges=sobelEdges(data,sw,sh);

  const lut=LUTS[lutName]||null;
  const tempSamples=[];

  // Day vision modes skip NVG/thermal pipeline entirely
  const isDayMode=mode==="TACT"||mode==="HAZE"||mode==="POLAR"||mode==="RAW";
  const isAstro=mode==="ASTRO";

  // ASTRO: 30-frame additive long exposure — reveals stars & faint light
  if(mode==="ASTRO"){
    const stacked=stackFrames(data,refs.stackBuf,refs.stackIdx,30);
    if(stacked){
      for(let i=0;i<data.length;i+=4){
        // Additive gain ×3.5 + gamma 0.55 deep shadow lift, cool blue-white palette
        const v=Math.min(255,Math.pow(Math.min(255,stacked[i/4]*3.5)/255,0.55)*255);
        data[i]=Math.min(255,v*0.85);
        data[i+1]=Math.min(255,v*0.92);
        data[i+2]=Math.min(255,v*1.06);
      }
    }
  }

  // NVG: extreme processing pipeline
  let stackedLum=null;
  if(mode==="NVG"&&!isDayMode){
    // Step 1: frame stacking (8 frames) to pull signal from sensor noise
    stackedLum=stackFrames(data,refs.stackBuf,refs.stackIdx,4);
    // Step 2: apply stacked luminance back into green channel before CLAHE
    if(stackedLum){
      for(let i=0;i<data.length;i+=4){
        const sl=Math.min(255,stackedLum[i/4]*1.6);
        data[i]=sl*0.03; data[i+1]=sl; data[i+2]=sl*0.02;
      }
    }
    // Step 3: extreme CLAHE on green channel only
    applyNVGCLAHE(data,sw,sh);
  } else if((mode==="WHITE"||mode==="FUSION")&&!isDayMode){
    applyCLAHE(data,sw,sh,6,3.5);
  }

  const bri=isDayMode?1.0:(mode==="NVG"?4.5:mode==="WHITE"?3.0:2.0)+brightness*1.5;
  const con=isDayMode?1.0:(mode==="NVG"?2.8:mode==="WHITE"?2.4:2.1);
  const mid=128;

  for(let i=0;i<data.length;i+=4){
    const r=data[i],g=data[i+1],b=data[i+2];
    const lum=0.299*r+0.587*g+0.114*b;
    const boosted=Math.max(0,Math.min(255,(lum*bri-mid)*con+mid));
    const pIdx=i/4;
    if(mode==="NVG"){
      // High-clarity green channel — use stacked lum if available for cleaner signal
      const src=stackedLum?Math.min(255,stackedLum[pIdx]*1.8):boosted;
      // Gamma correction for shadow lift (gamma 0.7 pulls dark regions up)
      const gamma=Math.pow(src/255,0.70)*255;
      const v=Math.min(255,gamma);
      data[i]=Math.min(255,v*0.02);      // crush red near-zero
      data[i+1]=Math.min(255,v*1.08);   // green slightly above lum for punch
      data[i+2]=Math.min(255,v*0.015);  // crush blue
      // Noise: signal-adaptive — quiet at mid/high signal
      const noiseAmt=v<60?12:v<120?6:v<200?2:0;
      if(noiseAmt>0){const n=(Math.random()-.5)*noiseAmt;data[i+1]=Math.max(0,Math.min(255,data[i+1]+n));}
    }else if(mode==="THERMAL"||mode==="RAINBOW"||mode==="FUSION"){
      const al=lut||LUTS.THERMAL;const li=Math.min(255,Math.round(boosted));
      data[i]=al[li*3];data[i+1]=al[li*3+1];data[i+2]=al[li*3+2];
      const px=pIdx%sw,py=Math.floor(pIdx/sw);
      if(px%8===0&&py%8===0)tempSamples.push({lum,px,py});
    }else if(mode==="BLUE"){
      data[i]=Math.min(255,boosted*0.12);data[i+1]=Math.min(255,boosted*0.32);data[i+2]=Math.min(255,boosted*1.15+b*0.25);
      const n=(Math.random()-.5)*7;data[i+2]=Math.max(0,Math.min(255,data[i+2]+n));
    }else if(mode==="TACT"||mode==="HAZE"||mode==="POLAR"||mode==="RAW"||mode==="ASTRO"){
      // Day / raw / astro: already handled — pass through
      data[i]=r;data[i+1]=g;data[i+2]=b;
    }else{const w2=Math.min(255,boosted);data[i]=data[i+1]=data[i+2]=w2;}

    if(edgeOverlay&&edges){
      const e=edges[pIdx];
      if(e>40){
        const ef=(e-40)/215;
        const ec=mode==="NVG"?[0,255,80]:mode==="BLUE"?[0,160,255]:[255,255,200];
        data[i]=Math.min(255,data[i]*(1-ef)+ec[0]*ef);
        data[i+1]=Math.min(255,data[i+1]*(1-ef)+ec[1]*ef);
        data[i+2]=Math.min(255,data[i+2]*(1-ef)+ec[2]*ef);
      }
    }
    if(motionMap[pIdx]){
      data[i]=Math.min(255,data[i]*0.4+255*0.6);
      data[i+1]=Math.min(255,data[i+1]*0.4+100*0.6);
      data[i+2]=Math.min(255,data[i+2]*0.1);
    }
  }

  // Motion heatmap: accumulate motion into decaying heat buffer, blend as overlay
  if(refs.heatOn){
    if(!refs.heat.current||refs.heat.current.length!==sw*sh)refs.heat.current=new Float32Array(sw*sh);
    const heat=refs.heat.current;
    for(let p=0;p<sw*sh;p++){
      if(motionMap[p])heat[p]=Math.min(1,heat[p]+0.08);
      else heat[p]*=0.995; // slow decay — zones persist ~30s
    }
    for(let p=0;p<sw*sh;p++){
      const hv=heat[p];
      if(hv>0.05){
        const i=p*4;
        // cold→hot: blue→yellow→red
        data[i]  =Math.min(255,data[i]+hv*220);
        data[i+1]=Math.min(255,data[i+1]+(hv<0.5?hv*160:(1-hv)*160));
        data[i+2]=Math.min(255,data[i+2]+(hv<0.3?hv*200:0));
      }
    }
  }

  // Digital stabilization — estimate global shift, apply counter-translation
  let shift=null;
  if(refs.stabOn&&refs.stabPrev){
    shift=estimateGlobalShift(data,refs.stabPrev.current,sw,sh);
    if(!refs.stabSmooth.current)refs.stabSmooth.current={x:0,y:0};
    const sm=refs.stabSmooth.current;
    sm.x=sm.x*0.82+shift.dx*0.18;
    sm.y=sm.y*0.82+shift.dy*0.18;
    if(!refs.stabPrev.current||refs.stabPrev.current.length!==data.length)
      refs.stabPrev.current=new Uint8ClampedArray(data.length);
    refs.stabPrev.current.set(data);
  }

  // Super-resolution accumulate (static scene detail recovery)
  if(refs.srOn)superResolve(data,sw,sh,refs.srBuf,refs.srCount,shift);

  // Exposure histogram (every 15th frame, cheap sampled)
  let expo=null;
  if(refs.expoTick){
    refs.expoTick.current=(refs.expoTick.current||0)+1;
    if(refs.expoTick.current%15===0)expo=computeHistogram(data);
  }

  // Star/satellite point detection (ASTRO only)
  let starPts=null;
  if(mode==="ASTRO"&&refs.starsOn)starPts=detectPoints(data,sw,sh,200);

  // Phosphor bloom pass (NVG only) — after pixel processing, before output
  if(mode==="NVG") applyPhosphorBloom(data,sw,sh);

  // Day vision bulk passes (operate on full frame after pixel loop)
  if(mode==="TACT") applyTactical(data,sw,sh,brightness);
  if(mode==="HAZE") { applyDehaze(data,sw,sh,0.65); applyUnsharpMask(data,sw,sh,1.2,2); }
  if(mode==="POLAR") applyPolarize(data,sw,sh);

  rawCtx.putImageData(imageData,0,0);
  const dCtx=dispCanvas.getContext("2d");
  dCtx.drawImage(rawCanvas,0,0);

  if(mode==="NVG"){
    // Scanlines: alternating rows dark (real image intensifier tube artifact)
    dCtx.fillStyle="rgba(0,0,0,0.10)";
    for(let y=0;y<sh;y+=2)dCtx.fillRect(0,y,sw,1);
    // Center brightness falloff (tube curvature)
    const cg=dCtx.createRadialGradient(sw/2,sh/2,sh*0.05,sw/2,sh/2,sh*0.75);
    cg.addColorStop(0,"rgba(0,20,0,0)");
    cg.addColorStop(0.7,"rgba(0,10,0,0.1)");
    cg.addColorStop(1,"rgba(0,0,0,0.55)");
    dCtx.fillStyle=cg;dCtx.fillRect(0,0,sw,sh);
    // Subtle green ambient glow overlay
    dCtx.fillStyle="rgba(0,255,60,0.03)";dCtx.fillRect(0,0,sw,sh);
  } else if(mode==="RAW"){
    // No overlay — pure passthrough, minimal vignette only
  } else if(mode==="TACT"){
    // Tactical: amber HUD tint + faint grid overlay
    dCtx.fillStyle="rgba(255,220,50,0.03)";dCtx.fillRect(0,0,sw,sh);
    dCtx.strokeStyle="rgba(255,220,50,0.05)";dCtx.lineWidth=1;
    for(let x=0;x<sw;x+=40){dCtx.beginPath();dCtx.moveTo(x,0);dCtx.lineTo(x,sh);dCtx.stroke();}
    for(let y=0;y<sh;y+=40){dCtx.beginPath();dCtx.moveTo(0,y);dCtx.lineTo(sw,y);dCtx.stroke();}
    // Sharp vignette
    const tv=dCtx.createRadialGradient(sw/2,sh/2,sh*0.3,sw/2,sh/2,sh*0.75);
    tv.addColorStop(0,"rgba(0,0,0,0)");tv.addColorStop(1,"rgba(0,0,0,0.45)");
    dCtx.fillStyle=tv;dCtx.fillRect(0,0,sw,sh);
  } else if(mode==="HAZE"){
    // Dehaze: cool blue clarifying tint
    dCtx.fillStyle="rgba(80,200,255,0.04)";dCtx.fillRect(0,0,sw,sh);
    const hv=dCtx.createRadialGradient(sw/2,sh/2,sh*0.4,sw/2,sh/2,sh*0.85);
    hv.addColorStop(0,"rgba(0,0,0,0)");hv.addColorStop(1,"rgba(0,0,0,0.35)");
    dCtx.fillStyle=hv;dCtx.fillRect(0,0,sw,sh);
  } else if(mode==="POLAR"){
    // Polarize: pink-magenta frame tint
    dCtx.fillStyle="rgba(255,80,180,0.04)";dCtx.fillRect(0,0,sw,sh);
    const pv=dCtx.createRadialGradient(sw/2,sh/2,sh*0.35,sw/2,sh/2,sh*0.8);
    pv.addColorStop(0,"rgba(0,0,0,0)");pv.addColorStop(1,"rgba(0,0,0,0.40)");
    dCtx.fillStyle=pv;dCtx.fillRect(0,0,sw,sh);
  } else {
    dCtx.fillStyle="rgba(0,0,0,0.04)";
    for(let y=0;y<sh;y+=3)dCtx.fillRect(0,y,sw,1);
  }
  const vg=dCtx.createRadialGradient(sw/2,sh/2,sh*0.1,sw/2,sh/2,sh*0.9);
  vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(.7,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,0.75)");
  dCtx.fillStyle=vg;dCtx.fillRect(0,0,sw,sh);

  // Draw tripwires on canvas
  if(tripwires&&tripwires.length){
    for(const tw of tripwires){
      if(tw.points.length<2)continue;
      dCtx.beginPath();
      dCtx.moveTo(tw.points[0].x/100*sw,tw.points[0].y/100*sh);
      for(let i=1;i<tw.points.length;i++)dCtx.lineTo(tw.points[i].x/100*sw,tw.points[i].y/100*sh);
      dCtx.strokeStyle=tw.triggered?"rgba(255,30,30,0.9)":"rgba(255,200,0,0.7)";
      dCtx.lineWidth=2;dCtx.setLineDash([6,4]);dCtx.stroke();dCtx.setLineDash([]);
      // label
      const lx=tw.points[0].x/100*sw,ly=tw.points[0].y/100*sh;
      dCtx.fillStyle=tw.triggered?"#ff2222":"#ffcc00";
      dCtx.font="bold 9px DM Mono, monospace";
      dCtx.fillText(tw.label,lx+4,ly-4);
    }
  }

  let tempData=null;
  if(tempSamples.length>0){
    let hot=-Infinity,cold=Infinity,sum=0,hotPx=50,hotPy=50;
    for(const{lum,px,py}of tempSamples){
      const t=18+(lum/255)*22;
      if(t>hot){hot=t;hotPx=px/sw*100;hotPy=py/sh*100;}
      if(t<cold)cold=t;sum+=t;
    }
    tempData={hot,cold,avg:sum/tempSamples.length,hotX:hotPx,hotY:hotPy};
  }

  const blobs=motionPixels>20?findBlobs(motionMap,sw,sh,60):[];
  // Classify and add distance to each blob
  const enrichedBlobs=blobs.map(b=>{
    const cls=classifyBlobFallback(b,sw,sh);
    const dist=estimateRange(cls.label,b.h,sh)??estimateDistance(b.h,sh,cls.label);
    return{...b,...cls,dist};
  });

  // Check tripwire intersections
  const triggeredWires=[];
  if(tripwires&&blobs.length){
    for(const tw of tripwires){
      if(tw.points.length<2)continue;
      for(const blob of blobs){
        const bx=blob.cx/sw*100,by=blob.cy/sh*100;
        // Simple: check if blob center is near any wire segment
        for(let i=0;i<tw.points.length-1;i++){
          const p1=tw.points[i],p2=tw.points[i+1];
          const dx=p2.x-p1.x,dy=p2.y-p1.y;
          const len=Math.sqrt(dx*dx+dy*dy);
          if(len<0.1)continue;
          const t=Math.max(0,Math.min(1,((bx-p1.x)*dx+(by-p1.y)*dy)/(len*len)));
          const cx2=p1.x+t*dx,cy2=p1.y+t*dy;
          const dist2=Math.sqrt((bx-cx2)**2+(by-cy2)**2);
          if(dist2<4)triggeredWires.push(tw.id);
        }
      }
    }
  }

  return{motionFrac:motionPixels/(sw*sh),blobs:enrichedBlobs,tempData,sw,sh,triggeredWires,rppgVal,expo,starPts,shift:refs.stabSmooth?.current||null};
}
