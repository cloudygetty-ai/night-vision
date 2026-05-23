import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// PALETTES & LUTS
// ═══════════════════════════════════════════════════════════════════════════════

function buildLUT(fn) {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = fn(i / 255);
    lut[i * 3] = Math.min(255, Math.max(0, Math.round(r)));
    lut[i * 3 + 1] = Math.min(255, Math.max(0, Math.round(g)));
    lut[i * 3 + 2] = Math.min(255, Math.max(0, Math.round(b)));
  }
  return lut;
}

const LUTS = {
  THERMAL: buildLUT(t => {
    if (t < 0.20) return [0, 0, t / 0.20 * 180];
    if (t < 0.40) { const s = (t - 0.20) / 0.20; return [s * 160, 0, 180 - s * 180]; }
    if (t < 0.60) { const s = (t - 0.40) / 0.20; return [160 + s * 95, s * 60, 0]; }
    if (t < 0.80) { const s = (t - 0.60) / 0.20; return [255, 60 + s * 140, 0]; }
    const s = (t - 0.80) / 0.20; return [255, 200 + s * 55, s * 255];
  }),
  RAINBOW: buildLUT(t => {
    if (t < 0.25) return [0, t / 0.25 * 255, 255];
    if (t < 0.50) { const s = (t - 0.25) / 0.25; return [0, 255, 255 - s * 255]; }
    if (t < 0.75) { const s = (t - 0.50) / 0.25; return [s * 255, 255, 0]; }
    const s = (t - 0.75) / 0.25; return [255, 255 - s * 255, 0];
  }),
  FUSION: buildLUT(t => {
    if (t < 0.33) { const s = t / 0.33; return [s * 80, 0, 80 + s * 175]; }
    if (t < 0.66) { const s = (t - 0.33) / 0.33; return [80 + s * 175, s * 100, 255 - s * 200]; }
    const s = (t - 0.66) / 0.34; return [255, 100 + s * 155, 55 + s * 200];
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE PROCESSING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// Sobel edge detection → writes edge strength into alpha channel temp
function sobelEdges(data, w, h) {
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const lum = (i) => {
        const idx = i * 4;
        return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      };
      const tl = lum((y-1)*w+(x-1)), t = lum((y-1)*w+x), tr = lum((y-1)*w+(x+1));
      const ml = lum(y*w+(x-1)),                           mr = lum(y*w+(x+1));
      const bl = lum((y+1)*w+(x-1)), b = lum((y+1)*w+x), br = lum((y+1)*w+(x+1));
      const gx = -tl - 2*ml - bl + tr + 2*mr + br;
      const gy = -tl - 2*t - tr + bl + 2*b + br;
      edges[y * w + x] = Math.min(255, Math.sqrt(gx*gx + gy*gy) * 0.5);
    }
  }
  return edges;
}

// CLAHE — 6×6 tile grid, clip=3.5
function applyCLAHE(data, w, h, tiles = 6, clip = 3.5) {
  const tW = Math.floor(w / tiles), tH = Math.floor(h / tiles);
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const x0 = tx * tW, y0 = ty * tH;
      const x1 = tx === tiles-1 ? w : x0 + tW;
      const y1 = ty === tiles-1 ? h : y0 + tH;
      const hist = new Float32Array(256);
      let count = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const idx = (y * w + x) * 4;
        hist[Math.round(0.299*data[idx] + 0.587*data[idx+1] + 0.114*data[idx+2])]++;
        count++;
      }
      const lim = (count / 256) * clip;
      let ex = 0;
      for (let i = 0; i < 256; i++) { if (hist[i] > lim) { ex += hist[i] - lim; hist[i] = lim; } }
      const add = ex / 256;
      for (let i = 0; i < 256; i++) hist[i] += add;
      const cdf = new Float32Array(256);
      cdf[0] = hist[0];
      for (let i = 1; i < 256; i++) cdf[i] = cdf[i-1] + hist[i];
      const cMin = cdf[0];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const idx = (y * w + x) * 4;
        const lum = Math.round(0.299*data[idx] + 0.587*data[idx+1] + 0.114*data[idx+2]);
        const eq = Math.round((cdf[lum] - cMin) / Math.max(1, count - cMin) * 255);
        const sc = lum > 2 ? eq / lum : 1;
        data[idx]   = Math.min(255, data[idx]   * sc);
        data[idx+1] = Math.min(255, data[idx+1] * sc);
        data[idx+2] = Math.min(255, data[idx+2] * sc);
      }
    }
  }
}

// Temporal noise reduction — blend with previous N frames
function temporalBlend(data, history, alpha = 0.72) {
  if (!history || history.length !== data.length) return;
  for (let i = 0; i < data.length; i += 4) {
    data[i]   = data[i]   * alpha + history[i]   * (1 - alpha);
    data[i+1] = data[i+1] * alpha + history[i+1] * (1 - alpha);
    data[i+2] = data[i+2] * alpha + history[i+2] * (1 - alpha);
  }
}

// Connected component labeling — find distinct motion blobs
function findBlobs(motionMap, w, h, minSize = 80) {
  const visited = new Uint8Array(w * h);
  const blobs = [];
  for (let start = 0; start < motionMap.length; start++) {
    if (!motionMap[start] || visited[start]) continue;
    // BFS
    const queue = [start]; visited[start] = 1;
    let minX = w, minY = h, maxX = 0, maxY = 0, size = 0;
    while (queue.length) {
      const idx = queue.pop(); size++;
      const x = idx % w, y = Math.floor(idx / w);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = x+dx, ny = y+dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const ni = ny*w+nx;
          if (motionMap[ni] && !visited[ni]) { visited[ni] = 1; queue.push(ni); }
        }
      }
    }
    if (size >= minSize) blobs.push({ x: minX, y: minY, w: maxX-minX, h: maxY-minY, size, cx: (minX+maxX)/2, cy: (minY+maxY)/2 });
  }
  return blobs.sort((a, b) => b.size - a.size).slice(0, 6);
}

// ─── Main frame processor ──────────────────────────────────────────────────────
function processFrame(video, rawCanvas, displayCanvas, settings, refs) {
  const { mode, brightness, sensitivity, edgeOverlay, noiseReduction, lutName } = settings;
  const sw = video.videoWidth, sh = video.videoHeight;
  if (!sw || !sh || video.readyState < 2) return null;

  rawCanvas.width = sw; rawCanvas.height = sh;
  displayCanvas.width = sw; displayCanvas.height = sh;

  const rawCtx = rawCanvas.getContext("2d", { willReadFrequently: true });
  rawCtx.drawImage(video, 0, 0, sw, sh);
  const imageData = rawCtx.getImageData(0, 0, sw, sh);
  const data = imageData.data;

  // ── Temporal noise reduction ──────────────────────────────────────────────
  if (noiseReduction && refs.prevFrame.current) {
    temporalBlend(data, refs.prevFrame.current, 0.78);
  }
  refs.prevFrame.current = new Uint8ClampedArray(data);

  // ── Motion detection ──────────────────────────────────────────────────────
  const motionThresh = Math.round(15 + (1 - sensitivity) * 40);
  const motionMap = new Uint8Array(sw * sh);
  let motionPixels = 0;
  if (refs.motionRef.current && refs.motionRef.current.length === data.length) {
    for (let i = 0; i < data.length; i += 4) {
      const d = (Math.abs(data[i] - refs.motionRef.current[i]) +
                 Math.abs(data[i+1] - refs.motionRef.current[i+1]) +
                 Math.abs(data[i+2] - refs.motionRef.current[i+2])) / 3;
      if (d > motionThresh) { motionMap[i/4] = 255; motionPixels++; }
    }
  }
  refs.motionRef.current = new Uint8ClampedArray(data);

  // ── Sobel edge detection ──────────────────────────────────────────────────
  let edges = null;
  if (edgeOverlay) edges = sobelEdges(data, sw, sh);

  // ── CLAHE ─────────────────────────────────────────────────────────────────
  if (mode === "NVG" || mode === "WHITE" || mode === "FUSION") {
    applyCLAHE(data, sw, sh, 6, 3.5);
  }

  // ── Per-pixel color transform ─────────────────────────────────────────────
  const bri = (mode === "NVG" ? 2.8 : mode === "WHITE" ? 3.0 : 2.0) + brightness;
  const con = mode === "NVG" ? 1.9 : mode === "WHITE" ? 2.4 : 2.1;
  const mid = 128;
  const lut = LUTS[lutName] || null;

  // For thermal temp sampling
  const tempSamples = [];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const lum = 0.299*r + 0.587*g + 0.114*b;
    const boosted = Math.max(0, Math.min(255, (lum * bri - mid) * con + mid));
    const pIdx = i / 4;

    if (mode === "NVG") {
      data[i]   = Math.min(255, boosted * 0.06);
      data[i+1] = Math.min(255, boosted * 1.05 + g * 0.12);
      data[i+2] = Math.min(255, boosted * 0.05);
      const n = (Math.random() - 0.5) * 5;
      data[i+1] = Math.max(0, Math.min(255, data[i+1] + n));
    } else if (mode === "THERMAL" || mode === "RAINBOW" || mode === "FUSION") {
      const activeLut = lut || LUTS.THERMAL;
      const li = Math.min(255, Math.round(boosted));
      data[i]   = activeLut[li * 3];
      data[i+1] = activeLut[li * 3 + 1];
      data[i+2] = activeLut[li * 3 + 2];
      // Sample center region for temp
      const px = pIdx % sw, py = Math.floor(pIdx / sw);
      if (px % 8 === 0 && py % 8 === 0) tempSamples.push({ lum, px, py });
    } else if (mode === "BLUE") {
      data[i]   = Math.min(255, boosted * 0.12);
      data[i+1] = Math.min(255, boosted * 0.32);
      data[i+2] = Math.min(255, boosted * 1.15 + b * 0.25);
      const n = (Math.random() - 0.5) * 7;
      data[i+2] = Math.max(0, Math.min(255, data[i+2] + n));
    } else { // WHITE
      const w = Math.min(255, boosted);
      data[i] = data[i+1] = data[i+2] = w;
    }

    // Sobel edge overlay (bright white edges)
    if (edgeOverlay && edges) {
      const e = edges[pIdx];
      if (e > 40) {
        const ef = (e - 40) / 215;
        const ec = mode === "NVG" ? [0, 255, 80] : mode === "BLUE" ? [0, 160, 255] : [255, 255, 200];
        data[i]   = Math.min(255, data[i]   * (1 - ef) + ec[0] * ef);
        data[i+1] = Math.min(255, data[i+1] * (1 - ef) + ec[1] * ef);
        data[i+2] = Math.min(255, data[i+2] * (1 - ef) + ec[2] * ef);
      }
    }

    // Motion highlight — bright orange-red bloom
    if (motionMap[pIdx]) {
      data[i]   = Math.min(255, data[i]   * 0.4 + 255 * 0.6);
      data[i+1] = Math.min(255, data[i+1] * 0.4 + 120 * 0.6);
      data[i+2] = Math.min(255, data[i+2] * 0.1);
    }
  }

  rawCtx.putImageData(imageData, 0, 0);

  // ── Composite to display canvas ───────────────────────────────────────────
  const dCtx = displayCanvas.getContext("2d");
  dCtx.drawImage(rawCanvas, 0, 0);

  // Scanlines
  dCtx.fillStyle = "rgba(0,0,0,0.04)";
  for (let y = 0; y < sh; y += 3) dCtx.fillRect(0, y, sw, 1);

  // Vignette
  const vg = dCtx.createRadialGradient(sw/2, sh/2, sh*0.1, sw/2, sh/2, sh*0.9);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(0.7, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.75)");
  dCtx.fillStyle = vg;
  dCtx.fillRect(0, 0, sw, sh);

  // Compute temp stats
  let tempData = null;
  if (tempSamples.length > 0) {
    let hot = -Infinity, cold = Infinity, sum = 0;
    let hotPx = 0.5, hotPy = 0.5;
    for (const { lum, px, py } of tempSamples) {
      const t = 18 + (lum / 255) * 22;
      if (t > hot) { hot = t; hotPx = px / sw * 100; hotPy = py / sh * 100; }
      if (t < cold) cold = t;
      sum += t;
    }
    tempData = { hot, cold, avg: sum / tempSamples.length, hotX: hotPx, hotY: hotPy };
  }

  // Find motion blobs
  const blobs = motionPixels > 20 ? findBlobs(motionMap, sw, sh, 60) : [];
  const motionFrac = motionPixels / (sw * sh);

  return { motionFrac, blobs, tempData, sw, sh };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

function useCameraStream(facing) {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    setReady(false); setError(null);
    navigator.mediaDevices?.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(s => {
      if (!active) { s.getTracks().forEach(t => t.stop()); return; }
      setStream(s); setReady(true);
    }).catch(e => { if (active) setError(e.message || "Camera unavailable"); });
    return () => { active = false; };
  }, [facing]);
  useEffect(() => () => stream?.getTracks().forEach(t => t.stop()), [stream]);
  return { stream, error, ready };
}

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return t;
}

function useDeviceOrientation() {
  const [heading, setHeading] = useState(null);
  useEffect(() => {
    const handler = e => { if (e.alpha !== null) setHeading(Math.round(e.alpha)); };
    window.addEventListener("deviceorientationabsolute", handler, true);
    window.addEventListener("deviceorientation", handler, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler, true);
      window.removeEventListener("deviceorientation", handler, true);
    };
  }, []);
  return heading;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HUD COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function Corners({ color, size = 20, thickness = 2 }) {
  const s = { position: "absolute", width: size, height: size, opacity: 0.8 };
  return (
    <>
      <div style={{ ...s, top: 10, left: 10, borderTop: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }} />
      <div style={{ ...s, top: 10, right: 10, borderTop: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }} />
      <div style={{ ...s, bottom: 10, left: 10, borderBottom: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }} />
      <div style={{ ...s, bottom: 10, right: 10, borderBottom: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }} />
    </>
  );
}

function Reticle({ color }) {
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" style={{
      position: "absolute", top: "50%", left: "50%",
      transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 15,
    }}>
      <circle cx={32} cy={32} r={20} fill="none" stroke={color} strokeWidth={0.8} opacity={0.45} />
      <circle cx={32} cy={32} r={8} fill="none" stroke={color} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.4} />
      <circle cx={32} cy={32} r={1.8} fill={color} opacity={0.9} />
      {[[32,4,32,16],[32,48,32,60],[4,32,16,32],[48,32,60,32]].map(([x1,y1,x2,y2],i) =>
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1} opacity={0.5}/>
      )}
      <circle cx={32} cy={32} r={30} fill="none" stroke={color} strokeWidth={0.4} strokeDasharray="3 8" opacity={0.2} />
    </svg>
  );
}

// Multi-target blob boxes with ID + threat classification
function TargetBoxes({ blobs, cw, ch, color }) {
  if (!blobs || !blobs.length) return null;
  const THREAT = ["CRITICAL", "HIGH", "MED", "LOW", "TRACE", "TRACK"];
  const TCOL   = ["#ff2222", "#ff5500", "#ffaa00", "#ffdd00", "#aaffaa", color];
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 22 }}>
      {blobs.map((b, i) => {
        const x = (b.x / cw) * 100, y = (b.y / ch) * 100;
        const w = (b.w / cw) * 100, h = (b.h / ch) * 100;
        const pad = 1.5;
        const tc = TCOL[Math.min(i, TCOL.length-1)];
        const thr = THREAT[Math.min(i, THREAT.length-1)];
        return (
          <div key={i} style={{ position: "absolute", left: `${x - pad}%`, top: `${y - pad}%`,
            width: `${w + pad*2}%`, height: `${h + pad*2}%`, border: `1px solid ${tc}`,
            boxShadow: `0 0 8px ${tc}40`, boxSizing: "border-box" }}>
            {/* Corners */}
            {[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy],ci) => (
              <div key={ci} style={{
                position:"absolute", width:8, height:8,
                top: sy < 0 ? -1 : "auto", bottom: sy > 0 ? -1 : "auto",
                left: sx < 0 ? -1 : "auto", right: sx > 0 ? -1 : "auto",
                borderTop:    sy<0?`2px solid ${tc}`:"none",
                borderBottom: sy>0?`2px solid ${tc}`:"none",
                borderLeft:   sx<0?`2px solid ${tc}`:"none",
                borderRight:  sx>0?`2px solid ${tc}`:"none",
              }}/>
            ))}
            {/* Label */}
            <div style={{
              position:"absolute", top:-14, left:0,
              display:"flex", gap:4, alignItems:"center",
            }}>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:7, color:tc,
                letterSpacing:1, background:"rgba(0,0,0,0.7)", padding:"1px 3px", borderRadius:1 }}>
                TGT-{String(i+1).padStart(2,"0")}
              </span>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:6, color:tc, opacity:0.8,
                background:"rgba(0,0,0,0.5)", padding:"1px 3px", borderRadius:1, letterSpacing:1 }}>
                {thr}
              </span>
            </div>
            {/* Size indicator */}
            <div style={{
              position:"absolute", bottom:-13, right:0,
              fontFamily:"'DM Mono',monospace", fontSize:6,
              color:`${tc}90`, letterSpacing:1,
              background:"rgba(0,0,0,0.5)", padding:"1px 3px", borderRadius:1,
            }}>{b.size}px</div>
            {/* Center pip */}
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              width:4, height:4, borderRadius:"50%",
              transform:"translate(-50%,-50%)",
              background:tc, boxShadow:`0 0 6px ${tc}`,
              animation:"tgt-pulse 1.2s ease-in-out infinite",
            }}/>
          </div>
        );
      })}
    </div>
  );
}

function ThermalOverlay({ tempData, mode }) {
  if (!tempData || (mode !== "THERMAL" && mode !== "RAINBOW" && mode !== "FUSION")) return null;
  const { hot, cold, avg, hotX, hotY } = tempData;
  const gradMap = {
    THERMAL: "linear-gradient(90deg,#000080,#800080,#ff0000,#ff8800,#ffff00,#fff)",
    RAINBOW: "linear-gradient(90deg,#0000ff,#00ffff,#00ff00,#ffff00,#ff0000)",
    FUSION:  "linear-gradient(90deg,#1400ff,#8800ff,#ff4400,#ff8800,#ffe0c0)",
  };
  return (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:24 }}>
      {/* Hot spot */}
      <div style={{
        position:"absolute", left:`${hotX}%`, top:`${hotY}%`,
        transform:"translate(-50%,-50%)", zIndex:25,
        display:"flex", flexDirection:"column", alignItems:"center", gap:2,
        animation:"tgt-pulse 1s ease-in-out infinite",
      }}>
        <div style={{ width:12, height:12, borderRadius:"50%",
          border:"2px solid #fff", boxShadow:"0 0 16px #ff5500, 0 0 6px #fff" }}/>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:8, color:"#fff",
          background:"rgba(0,0,0,0.75)", padding:"1px 4px", borderRadius:2,
          letterSpacing:1, whiteSpace:"nowrap" }}>{hot.toFixed(1)}°C ▲</span>
      </div>
      {/* Legend bar */}
      <div style={{ position:"absolute", bottom:14, left:"50%", transform:"translateX(-50%)",
        display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
        <div style={{ width:100, height:7, borderRadius:3, border:"1px solid rgba(255,255,255,0.15)",
          background: gradMap[mode] || gradMap.THERMAL }}/>
        <div style={{ display:"flex", justifyContent:"space-between", width:100 }}>
          <span style={{ fontSize:7, color:"rgba(255,255,255,0.55)", fontFamily:"'DM Mono',monospace" }}>{cold.toFixed(0)}°C</span>
          <span style={{ fontSize:7, color:"rgba(255,255,255,0.7)", fontFamily:"'DM Mono',monospace" }}>~{avg.toFixed(1)}°</span>
          <span style={{ fontSize:7, color:"#ff8800", fontFamily:"'DM Mono',monospace" }}>{hot.toFixed(0)}°C</span>
        </div>
      </div>
    </div>
  );
}

function CompassHUD({ heading, color }) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  const dir = heading !== null ? dirs[Math.round(heading / 45) % 8] : "---";
  return (
    <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)",
      zIndex:20, display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:8, color, letterSpacing:2 }}>
        {heading !== null ? `${String(heading).padStart(3,"0")}°` : "---"}
      </div>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:7, color:`${color}70`, letterSpacing:1 }}>{dir}</div>
    </div>
  );
}

function SignalBars({ level = 0.7, color }) {
  return (
    <div style={{ display:"flex", gap:1, alignItems:"flex-end", height:12 }}>
      {[0.2,0.4,0.6,0.8,1.0].map((t,i) => (
        <div key={i} style={{
          width:3, height:3 + i * 2, borderRadius:0.5,
          background: level >= t ? color : `${color}20`,
        }}/>
      ))}
    </div>
  );
}

function MotionAlert({ level, color }) {
  if (level < 0.004) return null;
  const high = level > 0.025;
  return (
    <div style={{
      position:"absolute", top:14, left:"50%", transform:"translateX(-50%)",
      zIndex:30, display:"flex", alignItems:"center", gap:5,
      padding:"3px 8px",
      background: high ? "rgba(255,30,30,0.18)" : "rgba(255,165,0,0.12)",
      border:`1px solid ${high?"#ff2222":"#ffaa00"}`,
      borderRadius:2,
      animation: high ? "rec-blink 0.4s step-end infinite" : "none",
    }}>
      <div style={{ width:5, height:5, borderRadius:"50%",
        background: high ? "#ff2222" : "#ffaa00",
        boxShadow:`0 0 8px ${high?"#ff2222":"#ffaa00"}` }}/>
      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:8, letterSpacing:2,
        color: high?"#ff2222":"#ffaa00" }}>
        {high ? "⚠ MOTION ALERT" : "● MOTION"}
      </span>
      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:7,
        color:`${high?"#ff2222":"#ffaa00"}80` }}>
        {(level * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const MODE_META = {
  NVG:     { label:"NVG",     desc:"Night Vision Green", color:"#00ff50", lut:null },
  THERMAL: { label:"THERMAL", desc:"FLIR Iron-Bow",      color:"#ff5500", lut:"THERMAL" },
  RAINBOW: { label:"RAINBOW", desc:"Rainbow IR",         color:"#00ccff", lut:"RAINBOW" },
  FUSION:  { label:"FUSION",  desc:"Fusion IR",          color:"#cc44ff", lut:"FUSION" },
  BLUE:    { label:"ARCTIC",  desc:"Arctic Blue",        color:"#0088ff", lut:null },
  WHITE:   { label:"WHT-HOT", desc:"White Hot",          color:"#dddddd", lut:null },
};
const MODE_KEYS = Object.keys(MODE_META);
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 12];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════

export default function NightVisionCamera() {
  const [mode, setMode]           = useState("NVG");
  const [facing, setFacing]       = useState("environment");
  const [brightness, setBrightness] = useState(0);
  const [zoom, setZoom]           = useState(1);
  const [sensitivity, setSensitivity] = useState(0.6);
  const [showReticle, setShowReticle] = useState(true);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [edgeOverlay, setEdgeOverlay]     = useState(false);
  const [noiseReduction, setNoiseReduction] = useState(true);
  const [recording, setRecording]   = useState(false);
  const [snapshot, setSnapshot]     = useState(null);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [blobs, setBlobs]           = useState([]);
  const [motionLevel, setMotionLevel] = useState(0);
  const [tempData, setTempData]     = useState(null);
  const [cameraSize, setCameraSize] = useState({ w: 1280, h: 720 });
  const [fps, setFps]               = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const videoRef      = useRef(null);
  const rawCanvasRef  = useRef(null);
  const dispCanvasRef = useRef(null);
  const rafRef        = useRef(null);
  const prevFrameRef  = useRef(null);
  const motionRef     = useRef(null);
  const mediaRecRef   = useRef(null);
  const fpsCountRef   = useRef({ frames: 0, last: performance.now() });

  const clock   = useClock();
  const heading = useDeviceOrientation();
  const { stream, error, ready } = useCameraStream(facing);

  const meta  = MODE_META[mode];
  const color = meta.color;

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {});
  }, [stream]);

  const renderLoop = useCallback(() => {
    const video = videoRef.current;
    const raw   = rawCanvasRef.current;
    const disp  = dispCanvasRef.current;
    if (video && raw && disp) {
      const result = processFrame(video, raw, disp, {
        mode, brightness, sensitivity,
        edgeOverlay, noiseReduction,
        lutName: meta.lut,
      }, { prevFrame: prevFrameRef, motionRef });

      if (result) {
        setCameraSize({ w: result.sw, h: result.sh });
        if (motionEnabled) {
          setMotionLevel(result.motionFrac);
          setBlobs(result.blobs);
        }
        if (result.tempData) setTempData(result.tempData);

        // FPS counter
        const fc = fpsCountRef.current;
        fc.frames++;
        const now = performance.now();
        if (now - fc.last >= 1000) {
          setFps(fc.frames);
          fc.frames = 0; fc.last = now;
        }
      }
    }
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [mode, brightness, sensitivity, edgeOverlay, noiseReduction, motionEnabled, meta.lut]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderLoop]);

  const flipCamera = () => {
    setFacing(f => f === "environment" ? "user" : "environment");
    prevFrameRef.current = null; motionRef.current = null;
    setBlobs([]); setMotionLevel(0);
  };

  const takeSnapshot = () => {
    const canvas = dispCanvasRef.current;
    if (!canvas) return;
    setSnapshot(canvas.toDataURL("image/png"));
    setShowSnapshot(true);
  };

  const toggleRecord = () => {
    const canvas = dispCanvasRef.current;
    if (!canvas) return;
    if (!recording) {
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks = [];
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `nvs7-${Date.now()}.webm`; a.click();
      };
      rec.start();
      mediaRecRef.current = rec;
      setRecording(true);
    } else {
      mediaRecRef.current?.stop();
      setRecording(false);
    }
  };

  const timeStr = clock.toLocaleTimeString("en-US", { hour12: false });
  const dateStr = clock.toLocaleDateString("en-US", { day:"2-digit", month:"short", year:"numeric" }).toUpperCase();

  return (
    <div style={{ minHeight:"100vh", background:"#000", display:"flex",
      alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes nvg-scan { 0%{top:-3px;opacity:0} 5%{opacity:0.9} 95%{opacity:0.5} 100%{top:100%;opacity:0} }
        @keyframes rec-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes tgt-pulse { 0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)} 50%{opacity:0.35;transform:translate(-50%,-50%) scale(1.8)} }
        @keyframes fade-in { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
        @keyframes sweep { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing:border-box; } button { font-family:"DM Mono",monospace; cursor:pointer; }
        ::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Snapshot lightbox */}
      {showSnapshot && snapshot && (
        <div onClick={() => setShowSnapshot(false)} style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:100,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12,
          animation:"fade-in 0.2s ease",
        }}>
          <img src={snapshot} style={{ maxWidth:"90vw", maxHeight:"75vh", border:`1px solid ${color}30`, borderRadius:2 }} alt="snapshot"/>
          <div style={{ display:"flex", gap:10 }}>
            <a href={snapshot} download={`nvs7-${Date.now()}.png`} onClick={e => e.stopPropagation()}
              style={{ padding:"6px 16px", border:`1px solid ${color}50`, borderRadius:2, color,
                fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:2, textDecoration:"none" }}>
              SAVE
            </a>
            <button onClick={() => setShowSnapshot(false)} style={{
              padding:"6px 16px", border:"1px solid rgba(255,100,100,0.4)", borderRadius:2,
              color:"rgba(255,100,100,0.8)", background:"transparent", fontSize:9, letterSpacing:2 }}>
              CLOSE
            </button>
          </div>
        </div>
      )}

      <div style={{ width:"100%", maxWidth:480, display:"flex", flexDirection:"column",
        background:"#000", border:`1px solid ${color}18`, animation:"fade-in 0.4s ease" }}>

        {/* ── HEADER ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"8px 14px", borderBottom:`1px solid ${color}15` }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:color,
              boxShadow:`0 0 10px ${color}`, animation:"rec-blink 2s step-end infinite" }}/>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:10, fontWeight:900,
              color, letterSpacing:4, textShadow:`0 0 10px ${color}40` }}>NVS-7</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:0 }}>
            <span style={{ fontSize:7, color:`${color}50`, letterSpacing:1 }}>{dateStr}</span>
            <span style={{ fontSize:10, color, letterSpacing:2 }}>{timeStr}</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:1 }}>
            <span style={{ fontSize:7, color:`${color}60`, letterSpacing:1 }}>{meta.desc}</span>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <SignalBars level={0.8} color={color}/>
              <span style={{ fontSize:7, color:`${color}50` }}>{fps}fps</span>
            </div>
          </div>
        </div>

        {/* ── VIEWPORT ── */}
        <div style={{ position:"relative", width:"100%", aspectRatio:"4/3",
          background:"#010801", overflow:"hidden" }}>

          {/* Hidden elements */}
          <video ref={videoRef} muted playsInline autoPlay
            style={{ position:"absolute", opacity:0, pointerEvents:"none", width:1, height:1 }}/>
          <canvas ref={rawCanvasRef} style={{ display:"none" }}/>

          {/* Display canvas */}
          <canvas ref={dispCanvasRef} style={{
            width:"100%", height:"100%", display:"block",
            transform:`scale(${zoom}) ${facing==="user"?"scaleX(-1)":""}`,
            transformOrigin:"center",
            transition:"transform 0.15s ease",
            imageRendering: zoom >= 4 ? "pixelated" : "auto",
          }}/>

          {/* Scanline sweep */}
          <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:10, overflow:"hidden" }}>
            <div style={{
              position:"absolute", left:0, right:0, height:2,
              background:`linear-gradient(180deg,transparent,${color}12,transparent)`,
              animation:"nvg-scan 6s linear infinite",
            }}/>
          </div>

          {ready && (
            <>
              <Corners color={color}/>
              {showReticle && !blobs.length && <Reticle color={color}/>}
              <TargetBoxes blobs={blobs} cw={cameraSize.w} ch={cameraSize.h} color={color}/>
              <ThermalOverlay tempData={tempData} mode={mode}/>
              {motionEnabled && blobs.length === 0 && <MotionAlert level={motionLevel} color={color}/>}
              <CompassHUD heading={heading} color={color}/>

              {/* TOP-LEFT */}
              <div style={{ position:"absolute", top:12, left:12, zIndex:20,
                display:"flex", flexDirection:"column", gap:2 }}>
                <div style={{ fontSize:8, color, letterSpacing:2, padding:"2px 5px",
                  border:`1px solid ${color}30`, background:`${color}06`, borderRadius:2 }}>
                  {mode}
                </div>
                <div style={{ fontSize:7, color:`${color}55`, letterSpacing:1, paddingLeft:2 }}>
                  {zoom}× ZOOM
                </div>
                {blobs.length > 0 && (
                  <div style={{ fontSize:7, color:"#ff5500", letterSpacing:1,
                    animation:"rec-blink 0.8s step-end infinite", paddingLeft:2 }}>
                    {blobs.length} TGT{blobs.length>1?"S":""}
                  </div>
                )}
                {edgeOverlay && (
                  <div style={{ fontSize:7, color:`${color}70`, letterSpacing:1, paddingLeft:2 }}>EDGE:ON</div>
                )}
                {noiseReduction && (
                  <div style={{ fontSize:7, color:`${color}50`, letterSpacing:1, paddingLeft:2 }}>NR:ON</div>
                )}
              </div>

              {/* TOP-RIGHT */}
              <div style={{ position:"absolute", top:12, right:12, zIndex:20,
                display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                {recording && (
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:"#ff2222",
                      boxShadow:"0 0 8px #ff2222", animation:"rec-blink 1s step-end infinite" }}/>
                    <span style={{ fontSize:8, color:"#ff2222", letterSpacing:2 }}>REC</span>
                  </div>
                )}
                <div style={{ fontSize:7, color:`${color}45`, letterSpacing:1 }}>
                  {motionLevel > 0.004 ? `▲ ${(motionLevel*100).toFixed(1)}%` : "CLEAR"}
                </div>
                {tempData && (mode==="THERMAL"||mode==="RAINBOW"||mode==="FUSION") && (
                  <div style={{ fontSize:7, color:"#ff8800", letterSpacing:1 }}>
                    ▲{tempData.hot.toFixed(1)}°C
                  </div>
                )}
              </div>

              {/* BOTTOM-RIGHT: GAIN */}
              <div style={{ position:"absolute", bottom:14, right:12, zIndex:20,
                display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                <span style={{ fontSize:6, color:`${color}45`, letterSpacing:1 }}>GAIN</span>
                <div style={{ display:"flex", gap:2 }}>
                  {[-2,-1,0,1,2].map((v,i) => (
                    <div key={i} onClick={() => setBrightness(v * 0.75)} style={{
                      width:7, height:12+i*2, borderRadius:1,
                      background: brightness >= v * 0.75 ? color : `${color}18`,
                      cursor:"pointer", transition:"background 0.1s",
                    }}/>
                  ))}
                </div>
              </div>

              {/* BOTTOM-LEFT: coords */}
              <div style={{ position:"absolute", bottom:14, left:12, zIndex:20,
                display:"flex", flexDirection:"column", gap:1 }}>
                <span style={{ fontSize:7, color:`${color}45`, letterSpacing:1 }}>40°44′N 74°00′W</span>
                <span style={{ fontSize:6, color:`${color}30`, letterSpacing:1 }}>ALT:12m • {facing==="environment"?"REAR":"FRONT"}</span>
              </div>
            </>
          )}

          {/* INIT */}
          {!ready && !error && (
            <div style={{ position:"absolute", inset:0, display:"flex",
              flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, zIndex:30 }}>
              <div style={{ width:32, height:32, borderRadius:"50%",
                border:`2px solid ${color}20`, borderTop:`2px solid ${color}`,
                animation:"sweep 1s linear infinite" }}/>
              <span style={{ fontSize:9, color:`${color}70`, letterSpacing:3 }}>INITIALIZING SENSOR</span>
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center", gap:10, zIndex:30, background:"rgba(0,0,0,0.92)" }}>
              <span style={{ fontSize:22 }}>📷</span>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:"#ff4444", letterSpacing:3 }}>
                SENSOR OFFLINE
              </span>
              <span style={{ fontSize:8, color:"rgba(255,100,100,0.5)", textAlign:"center", maxWidth:240, letterSpacing:1 }}>
                {error.toLowerCase().includes("denied") ? "CAMERA PERMISSION REQUIRED" : error.toUpperCase()}
              </span>
              <button onClick={() => window.location.reload()} style={{
                padding:"5px 14px", background:"transparent",
                border:"1px solid rgba(255,100,100,0.35)", borderRadius:2,
                color:"rgba(255,100,100,0.7)", fontSize:8, letterSpacing:2 }}>
                RETRY
              </button>
            </div>
          )}
        </div>

        {/* ── CONTROLS ── */}
        <div style={{ padding:"10px 12px", borderTop:`1px solid ${color}10`,
          display:"flex", flexDirection:"column", gap:7 }}>

          {/* MODE */}
          <div style={{ display:"flex", gap:4 }}>
            {MODE_KEYS.map(m => {
              const mc = MODE_META[m].color;
              return (
                <button key={m} onClick={() => setMode(m)} style={{
                  flex:1, padding:"5px 1px",
                  background: mode===m ? `${mc}12` : "transparent",
                  border:`1px solid ${mode===m ? mc : `${mc}18`}`,
                  borderRadius:2, fontSize:6,
                  color: mode===m ? mc : `${mc}40`,
                  letterSpacing:1, transition:"all 0.12s",
                }}>{MODE_META[m].label}</button>
              );
            })}
          </div>

          {/* ZOOM */}
          <div style={{ display:"flex", gap:3 }}>
            {ZOOM_STEPS.map(z => (
              <button key={z} onClick={() => setZoom(z)} style={{
                flex:1, padding:"4px 1px",
                background: zoom===z ? `${color}10` : "transparent",
                border:`1px solid ${zoom===z ? color : `${color}12`}`,
                borderRadius:2, fontSize:6,
                color: zoom===z ? color : `${color}35`,
                transition:"all 0.1s",
              }}>{z}×</button>
            ))}
          </div>

          {/* SENSITIVITY slider */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:7, color:`${color}50`, letterSpacing:1, whiteSpace:"nowrap" }}>SENS</span>
            <input type="range" min="0" max="1" step="0.05" value={sensitivity}
              onChange={e => setSensitivity(parseFloat(e.target.value))}
              style={{ flex:1, accentColor:color, height:2 }}/>
            <span style={{ fontSize:7, color:`${color}70`, letterSpacing:1, minWidth:24 }}>
              {Math.round(sensitivity*100)}%
            </span>
          </div>

          {/* ACTION ROW 1 */}
          <div style={{ display:"flex", gap:5 }}>
            <button onClick={flipCamera} style={{
              padding:"7px 10px", background:"transparent",
              border:`1px solid ${color}18`, borderRadius:2, color:`${color}55`, fontSize:13 }}>⇄</button>

            <button onClick={() => setShowReticle(r=>!r)} style={{
              padding:"7px 9px",
              background: showReticle ? `${color}08` : "transparent",
              border:`1px solid ${showReticle ? color : `${color}18`}`,
              borderRadius:2, color: showReticle ? color : `${color}30`, fontSize:12 }}>⊕</button>

            <button onClick={() => setEdgeOverlay(e=>!e)} style={{
              flex:1, padding:"7px 4px",
              background: edgeOverlay ? `${color}08` : "transparent",
              border:`1px solid ${edgeOverlay ? color : `${color}18`}`,
              borderRadius:2, fontSize:7, letterSpacing:1,
              color: edgeOverlay ? color : `${color}30` }}>EDGE</button>

            <button onClick={() => setNoiseReduction(n=>!n)} style={{
              flex:1, padding:"7px 4px",
              background: noiseReduction ? `${color}08` : "transparent",
              border:`1px solid ${noiseReduction ? color : `${color}18`}`,
              borderRadius:2, fontSize:7, letterSpacing:1,
              color: noiseReduction ? color : `${color}30` }}>NR</button>

            <button onClick={() => { setMotionEnabled(m=>!m); setBlobs([]); setMotionLevel(0); }} style={{
              flex:1, padding:"7px 4px",
              background: motionEnabled ? "rgba(255,165,0,0.07)" : "transparent",
              border:`1px solid ${motionEnabled ? "#ffaa00" : "rgba(255,165,0,0.15)"}`,
              borderRadius:2, fontSize:7, letterSpacing:1,
              color: motionEnabled ? "#ffaa00" : "rgba(255,165,0,0.25)" }}>MOT</button>
          </div>

          {/* ACTION ROW 2 */}
          <div style={{ display:"flex", gap:5 }}>
            <button onClick={takeSnapshot} style={{
              flex:1, padding:"7px 4px",
              background:"transparent",
              border:`1px solid ${color}20`,
              borderRadius:2, fontSize:7, letterSpacing:1, color:`${color}60` }}>📷 SNAP</button>

            <button onClick={toggleRecord} style={{
              flex:1, padding:"7px 4px",
              background: recording ? "rgba(255,34,34,0.10)" : "transparent",
              border:`1px solid ${recording ? "#ff2222" : "rgba(255,34,34,0.18)"}`,
              borderRadius:2, fontSize:7, letterSpacing:1,
              color: recording ? "#ff2222" : "rgba(255,34,34,0.35)" }}>
              {recording ? "■ STOP" : "● REC"}
            </button>

            <button onClick={() => { setBlobs([]); setMotionLevel(0); }} style={{
              flex:1, padding:"7px 4px",
              background:"transparent",
              border:`1px solid rgba(255,136,0,0.18)`,
              borderRadius:2, fontSize:7, letterSpacing:1, color:"rgba(255,136,0,0.4)" }}>CLR TGT</button>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{ padding:"5px 12px", borderTop:`1px solid ${color}08`,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:6, color:`${color}20`, letterSpacing:1 }}>CLOUDYGETTY-AI // ENTROPY-ZERO</span>
          <span style={{ fontSize:6, color:`${color}20`, letterSpacing:1 }}>NVS-7.3 // CLASSIFIED</span>
        </div>
      </div>
    </div>
  );
}
