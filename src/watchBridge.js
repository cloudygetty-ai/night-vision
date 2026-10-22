// ═════════════════════════════════════════════════════════════════════════
// WATCH BRIDGE
//   Bridges NVS to a native iOS host app's WKWebView, which relays frames
//   and status to a paired watchOS companion over WatchConnectivity, and
//   relays Watch-originated commands back in. See native/SETUP.md.
//
//   No Apple Watch has a camera, so the Watch never captures anything itself
//   — it shows a low-rate still-frame mirror of what the phone is already
//   rendering and sends remote-control commands back. This is a no-op in a
//   plain browser/PWA: every outbound call is guarded on the native message
//   handler actually existing, so nothing here affects normal web use.
//
//   Wire format, JS → native (window.webkit.messageHandlers.nvsWatch):
//     { type: 'frame', jpeg: <base64, no "data:" prefix>, w, h,
//       mode, modeLabel, color, recording, sentry, dce, zoom }
//   Wire format, native → JS (window.__nvsRemote.<fn>(...)):
//     setMode(idx) | cycleMode(dir) | toggleRecording() | toggleSentry() |
//     setDce(v) | setZoom(v)
// ═════════════════════════════════════════════════════════════════════════

const FRAME_W = 160             // small on purpose — WatchConnectivity is not a video pipe
const FRAME_INTERVAL_MS = 400   // ~2.5fps: a refreshing glance, not smooth video

let offscreen = null

function hasNativeBridge() {
  return typeof window !== 'undefined' && !!window.webkit?.messageHandlers?.nvsWatch
}

// Downscales the live canvas into a small JPEG. The main canvas's drawing
// buffer is not preserved (see gl.js), so repaint it via redraw() first —
// same pattern the photo-capture path (snap(), App.jsx) already relies on.
function grabFrame(canvas, renderer) {
  if (!canvas || !canvas.width || !canvas.height) return null
  renderer?.redraw?.()
  const h = Math.max(1, Math.round(FRAME_W * canvas.height / canvas.width))
  if (!offscreen) offscreen = document.createElement('canvas')
  offscreen.width = FRAME_W; offscreen.height = h
  const ctx = offscreen.getContext('2d')
  ctx.drawImage(canvas, 0, 0, FRAME_W, h)
  const url = offscreen.toDataURL('image/jpeg', 0.5)
  const comma = url.indexOf(',')
  return { jpeg: comma >= 0 ? url.slice(comma + 1) : url, w: FRAME_W, h }
}

// Call once (e.g. from a mount-only effect). `getStatus()` is read fresh on
// every tick, so pass something backed by a ref/cfg object, not stale state.
// `remote` functions must be stable across the component's lifetime (plain
// setState setters, updater-callback setters, or ref reads) since they're
// wired up exactly once.
export function initWatchBridge({ canvasRef, rendererRef, getStatus, remote }) {
  if (typeof window === 'undefined') return () => {}

  window.__nvsRemote = {
    setMode: idx => remote.setMode(idx),
    cycleMode: dir => remote.cycleMode(dir),
    toggleRecording: () => remote.toggleRecording(),
    toggleSentry: () => remote.toggleSentry(),
    setDce: v => remote.setDce(v),
    setZoom: v => remote.setZoom(v),
  }

  const id = setInterval(() => {
    if (!hasNativeBridge()) return
    const frame = grabFrame(canvasRef.current, rendererRef.current)
    if (!frame) return
    window.webkit.messageHandlers.nvsWatch.postMessage({ type: 'frame', ...frame, ...getStatus() })
  }, FRAME_INTERVAL_MS)

  return () => { clearInterval(id); delete window.__nvsRemote }
}
