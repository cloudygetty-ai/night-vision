import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MODES = {
  NVG: {
    label: "NVG",
    desc: "Night Vision Green",
    brightness: 2.2,
    contrast: 1.6,
    greenBoost: 2.0,
    redSup: 0.15,
    blueSup: 0.2,
    grain: 0.06,
    tint: "rgba(0,255,80,0.08)",
  },
  THERMAL: {
    label: "THERMAL",
    desc: "Thermal Infrared",
    brightness: 1.8,
    contrast: 2.0,
    greenBoost: 0,
    redSup: 1.8,
    blueSup: 0.3,
    grain: 0.03,
    tint: "rgba(255,80,0,0.10)",
  },
  BLUE: {
    label: "ARCTIC",
    desc: "Arctic Blue IR",
    brightness: 2.0,
    contrast: 1.7,
    greenBoost: 0.3,
    redSup: 0.2,
    blueSup: 2.4,
    grain: 0.05,
    tint: "rgba(0,120,255,0.08)",
  },
  WHITE: {
    label: "WHT-HOT",
    desc: "White Hot",
    brightness: 2.4,
    contrast: 1.9,
    greenBoost: 1.0,
    redSup: 1.0,
    blueSup: 1.0,
    grain: 0.04,
    tint: "rgba(255,255,255,0.04)",
  },
};

const MODE_KEYS = Object.keys(MODES);
const MODE_COLORS = {
  NVG: "#00ff50",
  THERMAL: "#ff5500",
  BLUE: "#0088ff",
  WHITE: "#e8e8e8",
};

// ─── Processing: apply NVG effect to canvas frame ─────────────────────────────
function processFrame(srcCanvas, dstCanvas, mode, brightnessGain = 0) {
  const cfg = MODES[mode];
  const sw = srcCanvas.videoWidth || srcCanvas.width;
  const sh = srcCanvas.videoHeight || srcCanvas.height;
  if (!sw || !sh) return;

  dstCanvas.width = sw;
  dstCanvas.height = sh;

  const ctx = dstCanvas.getContext("2d");

  // Draw raw video frame
  ctx.drawImage(srcCanvas, 0, 0, sw, sh);

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, sw, sh);
  const data = imageData.data;
  const bri = cfg.brightness + brightnessGain;
  const con = cfg.contrast;
  const mid = 128;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Luminance
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // Apply brightness / contrast on luminance base
    let boosted = ((lum * bri - mid) * con + mid);

    // Channel isolation
    if (mode === "NVG") {
      data[i]     = Math.min(255, boosted * cfg.redSup);
      data[i + 1] = Math.min(255, boosted * cfg.greenBoost + (g * 0.3));
      data[i + 2] = Math.min(255, boosted * cfg.blueSup);
    } else if (mode === "THERMAL") {
      const t = boosted / 255;
      data[i]     = Math.min(255, t * 255 * cfg.redSup);
      data[i + 1] = Math.min(255, (t > 0.5 ? (t - 0.5) * 2 : 0) * 200);
      data[i + 2] = Math.min(255, (t < 0.3 ? t * 3 : 1) * 80 * cfg.blueSup);
    } else if (mode === "BLUE") {
      data[i]     = Math.min(255, boosted * cfg.redSup);
      data[i + 1] = Math.min(255, boosted * cfg.greenBoost);
      data[i + 2] = Math.min(255, boosted * cfg.blueSup + (b * 0.4));
    } else {
      // WHITE HOT - grayscale enhanced
      const w = Math.min(255, boosted);
      data[i] = data[i + 1] = data[i + 2] = w;
    }

    // Grain
    if (cfg.grain > 0) {
      const noise = (Math.random() - 0.5) * cfg.grain * 255;
      data[i]     = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Scanlines overlay
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  for (let y = 0; y < sh; y += 3) {
    ctx.fillRect(0, y, sw, 1);
  }

  // Vignette
  const grad = ctx.createRadialGradient(sw / 2, sh / 2, sh * 0.2, sw / 2, sh / 2, sh * 0.85);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sw, sh);

  // Color tint
  ctx.fillStyle = cfg.tint;
  ctx.fillRect(0, 0, sw, sh);
}

// ─── Hook: camera stream ──────────────────────────────────────────────────────
function useCameraStream(facing) {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    setError(null);

    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then((s) => {
        if (!active) { s.getTracks().forEach(t => t.stop()); return; }
        setStream(s);
        setReady(true);
      })
      .catch((e) => {
        if (!active) return;
        setError(e.message || "Camera unavailable");
      });

    return () => {
      active = false;
    };
  }, [facing]);

  // Cleanup stream on unmount or change
  useEffect(() => {
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, [stream]);

  return { stream, error, ready };
}

// ─── Clock ────────────────────────────────────────────────────────────────────
function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

// ─── ScanLine overlay div ─────────────────────────────────────────────────────
function ScanLineOverlay() {
  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10,
      overflow: "hidden", borderRadius: "inherit",
    }}>
      <div style={{
        position: "absolute", left: 0, right: 0, height: 3,
        background: "linear-gradient(180deg, transparent, rgba(0,255,80,0.18), transparent)",
        animation: "nvg-scan 4s linear infinite",
      }} />
    </div>
  );
}

// ─── HUD corner brackets ──────────────────────────────────────────────────────
function Corners({ color }) {
  const base = {
    position: "absolute", width: 22, height: 22,
    borderColor: color, opacity: 0.85,
  };
  return (
    <>
      <div style={{ ...base, top: 12, left: 12, borderTop: "2px solid", borderLeft: "2px solid" }} />
      <div style={{ ...base, top: 12, right: 12, borderTop: "2px solid", borderRight: "2px solid" }} />
      <div style={{ ...base, bottom: 12, left: 12, borderBottom: "2px solid", borderLeft: "2px solid" }} />
      <div style={{ ...base, bottom: 12, right: 12, borderBottom: "2px solid", borderRight: "2px solid" }} />
    </>
  );
}

// ─── Reticle ──────────────────────────────────────────────────────────────────
function Reticle({ color, size = 60 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60"
      style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 12 }}>
      <circle cx="30" cy="30" r="18" fill="none" stroke={color} strokeWidth="0.8" opacity="0.5" />
      <circle cx="30" cy="30" r="1.5" fill={color} opacity="0.9" />
      <line x1="30" y1="5" x2="30" y2="16" stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1="30" y1="44" x2="30" y2="55" stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1="5" y1="30" x2="16" y2="30" stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1="44" y1="30" x2="55" y2="30" stroke={color} strokeWidth="1" opacity="0.6" />
      <circle cx="30" cy="30" r="28" fill="none" stroke={color} strokeWidth="0.4" strokeDasharray="4 6" opacity="0.25" />
    </svg>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function NightVisionCamera() {
  const [mode, setMode] = useState("NVG");
  const [facing, setFacing] = useState("environment");
  const [brightness, setBrightness] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showReticle, setShowReticle] = useState(true);
  const [recording, setRecording] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  const clock = useClock();
  const { stream, error, ready } = useCameraStream(facing);

  const color = MODE_COLORS[mode];
  const cfg = MODES[mode];

  // Attach stream to video element
  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {});
  }, [stream]);

  // Track perm denied
  useEffect(() => {
    if (error && error.toLowerCase().includes("denied")) setPermDenied(true);
  }, [error]);

  // Render loop
  const renderLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState >= 2) {
      processFrame(video, canvas, mode, brightness);
    }
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [mode, brightness]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderLoop]);

  const flipCamera = () => setFacing(f => f === "environment" ? "user" : "environment");
  const cycleMode = () => {
    const idx = MODE_KEYS.indexOf(mode);
    setMode(MODE_KEYS[(idx + 1) % MODE_KEYS.length]);
  };

  const timeStr = clock.toLocaleTimeString("en-US", { hour12: false });
  const dateStr = clock.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  return (
    <div style={{
      minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Mono', monospace",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes nvg-scan {
          0% { top: -3px; opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 0.7; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes rec-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes hud-fade-in {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        width: "100%", maxWidth: 480,
        display: "flex", flexDirection: "column", gap: 0,
        animation: "hud-fade-in 0.5s ease",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: `1px solid ${color}22`,
        }}>
          <span style={{
            fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 900,
            color, letterSpacing: 4, textShadow: `0 0 12px ${color}60`,
          }}>NVS-7</span>
          <div style={{ display: "flex", gap: 16 }}>
            <span style={{ fontSize: 9, color: `${color}80`, letterSpacing: 2 }}>{dateStr}</span>
            <span style={{ fontSize: 10, color, letterSpacing: 2, textShadow: `0 0 8px ${color}50` }}>{timeStr}</span>
          </div>
          <span style={{ fontSize: 9, color: `${color}60`, letterSpacing: 2 }}>{cfg.desc}</span>
        </div>

        {/* ── VIEWPORT ── */}
        <div style={{
          position: "relative", width: "100%",
          aspectRatio: "4/3", background: "#050a05", overflow: "hidden",
          border: `1px solid ${color}20`,
        }}>
          {/* Hidden video source */}
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            style={{
              position: "absolute", opacity: 0, pointerEvents: "none",
              width: 1, height: 1,
            }}
          />

          {/* Processed canvas output */}
          <canvas
            ref={canvasRef}
            style={{
              width: "100%", height: "100%", display: "block",
              objectFit: "cover",
              transform: `scale(${zoom}) ${facing === "user" ? "scaleX(-1)" : ""}`,
              transformOrigin: "center",
              transition: "transform 0.2s ease",
            }}
          />

          {/* Scanline pass */}
          <ScanLineOverlay />

          {/* HUD overlays */}
          {ready && (
            <>
              <Corners color={color} />
              {showReticle && <Reticle color={color} />}

              {/* TOP-LEFT: mode badge */}
              <div style={{
                position: "absolute", top: 18, left: 18, zIndex: 20,
                display: "flex", flexDirection: "column", gap: 3,
              }}>
                <div style={{
                  fontSize: 9, color, letterSpacing: 2, padding: "2px 6px",
                  border: `1px solid ${color}40`, borderRadius: 2,
                  background: `${color}08`,
                }}>MODE:{mode}</div>
                <div style={{ fontSize: 8, color: `${color}60`, letterSpacing: 1, paddingLeft: 4 }}>
                  ZOOM:{zoom.toFixed(1)}x
                </div>
              </div>

              {/* TOP-RIGHT: REC indicator */}
              <div style={{
                position: "absolute", top: 18, right: 18, zIndex: 20,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                {recording && (
                  <>
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%", background: "#ff3333",
                      boxShadow: "0 0 8px #ff3333",
                      animation: "rec-blink 1s step-end infinite",
                    }} />
                    <span style={{ fontSize: 9, color: "#ff3333", letterSpacing: 2 }}>REC</span>
                  </>
                )}
              </div>

              {/* BOTTOM-LEFT: coordinates */}
              <div style={{
                position: "absolute", bottom: 18, left: 18, zIndex: 20,
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <span style={{ fontSize: 8, color: `${color}55`, letterSpacing: 1 }}>40°44′N 74°00′W</span>
                <span style={{ fontSize: 8, color: `${color}40`, letterSpacing: 1 }}>ALT 12m • ENV</span>
              </div>

              {/* BOTTOM-RIGHT: brightness */}
              <div style={{
                position: "absolute", bottom: 18, right: 18, zIndex: 20,
                display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3,
              }}>
                <span style={{ fontSize: 8, color: `${color}55`, letterSpacing: 1 }}>GAIN</span>
                <div style={{ display: "flex", gap: 2 }}>
                  {[-1.5, -0.75, 0, 0.75, 1.5].map((v, i) => (
                    <div key={i} style={{
                      width: 8, height: 14, borderRadius: 1,
                      background: brightness >= v ? color : `${color}20`,
                      cursor: "pointer",
                    }} onClick={() => setBrightness(v)} />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── STATES ── */}
          {!ready && !error && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, zIndex: 30,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                border: `2px solid ${color}30`,
                borderTop: `2px solid ${color}`,
                animation: "nvg-scan 1s linear infinite",
              }} />
              <span style={{ fontSize: 10, color: `${color}70`, letterSpacing: 3 }}>INITIALIZING</span>
            </div>
          )}

          {error && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 30,
              background: "rgba(0,0,0,0.85)",
            }}>
              <span style={{ fontSize: 28, filter: "grayscale(1)" }}>📷</span>
              <span style={{
                fontFamily: "'Cinzel', serif", fontSize: 11, color: "#ff4444",
                letterSpacing: 3,
              }}>CAMERA UNAVAILABLE</span>
              <span style={{ fontSize: 9, color: "rgba(255,100,100,0.6)", letterSpacing: 1, textAlign: "center", maxWidth: 260 }}>
                {permDenied
                  ? "Camera permission denied. Allow camera access in your browser settings."
                  : error}
              </span>
              <button
                onClick={() => window.location.reload()}
                style={{
                  marginTop: 4, padding: "6px 16px", background: "transparent",
                  border: "1px solid rgba(255,100,100,0.4)", borderRadius: 2,
                  color: "rgba(255,100,100,0.8)", fontFamily: "'DM Mono', monospace",
                  fontSize: 9, letterSpacing: 2, cursor: "pointer",
                }}>RETRY</button>
            </div>
          )}
        </div>

        {/* ── CONTROLS ── */}
        <div style={{
          padding: "12px 16px",
          borderTop: `1px solid ${color}15`,
          display: "flex", flexDirection: "column", gap: 10,
        }}>

          {/* MODE SELECTOR */}
          <div style={{ display: "flex", gap: 6 }}>
            {MODE_KEYS.map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: "6px 4px",
                background: mode === m ? `${MODE_COLORS[m]}18` : "transparent",
                border: `1px solid ${mode === m ? MODE_COLORS[m] : `${MODE_COLORS[m]}25`}`,
                borderRadius: 3, cursor: "pointer",
                fontFamily: "'DM Mono', monospace", fontSize: 8,
                color: mode === m ? MODE_COLORS[m] : `${MODE_COLORS[m]}55`,
                letterSpacing: 1, transition: "all 0.2s",
              }}>{MODES[m].label}</button>
            ))}
          </div>

          {/* ACTION ROW */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

            {/* FLIP */}
            <button onClick={flipCamera} style={{
              padding: "8px 14px", background: "transparent",
              border: `1px solid ${color}25`, borderRadius: 3, cursor: "pointer",
              color: `${color}70`, fontSize: 14, transition: "all 0.15s",
            }}>⇄</button>

            {/* ZOOM */}
            <div style={{ display: "flex", gap: 4, flex: 1, justifyContent: "center" }}>
              {[1, 1.5, 2, 3].map(z => (
                <button key={z} onClick={() => setZoom(z)} style={{
                  padding: "6px 10px", background: zoom === z ? `${color}15` : "transparent",
                  border: `1px solid ${zoom === z ? color : `${color}20`}`,
                  borderRadius: 3, cursor: "pointer",
                  fontFamily: "'DM Mono', monospace", fontSize: 9,
                  color: zoom === z ? color : `${color}45`,
                  letterSpacing: 1, transition: "all 0.15s",
                }}>{z}×</button>
              ))}
            </div>

            {/* RETICLE toggle */}
            <button onClick={() => setShowReticle(r => !r)} style={{
              padding: "8px 12px", background: showReticle ? `${color}12` : "transparent",
              border: `1px solid ${showReticle ? color : `${color}25`}`,
              borderRadius: 3, cursor: "pointer",
              color: showReticle ? color : `${color}40`, fontSize: 13,
              transition: "all 0.15s",
            }}>⊕</button>

            {/* REC toggle */}
            <button onClick={() => setRecording(r => !r)} style={{
              padding: "8px 14px", background: recording ? "rgba(255,51,51,0.12)" : "transparent",
              border: `1px solid ${recording ? "#ff3333" : "rgba(255,51,51,0.2)"}`,
              borderRadius: 3, cursor: "pointer",
              color: recording ? "#ff3333" : "rgba(255,51,51,0.4)", fontSize: 12,
              transition: "all 0.15s",
            }}>●</button>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          padding: "6px 16px", borderTop: `1px solid ${color}10`,
          display: "flex", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 8, color: `${color}30`, letterSpacing: 1 }}>CLOUDYGETTY-AI</span>
          <span style={{ fontSize: 8, color: `${color}30`, letterSpacing: 1 }}>NVS-7 // SEC:CLASSIFIED</span>
        </div>
      </div>
    </div>
  );
}
