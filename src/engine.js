// ═════════════════════════════════════════════════════════════════════════
// NVS-15 ENGINE — cheap CPU-side services (everything heavy lives in gl.js)
// ═════════════════════════════════════════════════════════════════════════

// ── MOTION: 96×54 luminance diff → 12×6 cell grid → merged boxes ──────────
export function createMotion() {
  const W = 96, H = 54, CW = 8, CH = 9, GX = W / CW, GY = H / CH
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })
  let prev = null
  const lum = new Uint8Array(W * H)

  return function detect(video, sensitivity) {
    ctx.drawImage(video, 0, 0, W, H)
    const d = ctx.getImageData(0, 0, W, H).data
    for (let i = 0, j = 0; j < lum.length; i += 4, j++) lum[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8
    if (!prev) { prev = new Uint8Array(lum); return { frac: 0, boxes: [] } }

    const thr = 14 + (1 - sensitivity) * 36
    const cells = new Uint16Array(GX * GY)
    let changed = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x
      if (Math.abs(lum[k] - prev[k]) > thr) { changed++; cells[((y / CH) | 0) * GX + ((x / CW) | 0)]++ }
    }
    prev.set(lum)

    const active = new Uint8Array(GX * GY)
    const need = CW * CH * 0.18
    for (let i = 0; i < cells.length; i++) active[i] = cells[i] > need ? 1 : 0

    const seen = new Uint8Array(GX * GY), boxes = []
    for (let s = 0; s < active.length; s++) {
      if (!active[s] || seen[s]) continue
      let x0 = GX, y0 = GY, x1 = 0, y1 = 0, n = 0
      const q = [s]; seen[s] = 1
      while (q.length) {
        const k = q.pop(), x = k % GX, y = (k / GX) | 0
        n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= GX || ny >= GY) continue
          const nk = ny * GX + nx
          if (active[nk] && !seen[nk]) { seen[nk] = 1; q.push(nk) }
        }
      }
      if (n >= 1) boxes.push({ x: x0 / GX, y: y0 / GY, w: (x1 - x0 + 1) / GX, h: (y1 - y0 + 1) / GY, cells: n })
    }
    boxes.sort((a, b) => b.cells - a.cells)
    return { frac: changed / (W * H), boxes: boxes.slice(0, 6) }
  }
}

// ── VAULT: IndexedDB persistence for captures + clips ─────────────────────
const DB = 'nvs15', VER = 1
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER)
    r.onupgradeneeded = () => {
      const db = r.result
      for (const s of ['shots', 'clips']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'ts' })
    }
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
const tx = async (store, mode, fn) => {
  try {
    const db = await open()
    return await new Promise(res => {
      const t = db.transaction(store, mode); const out = fn(t.objectStore(store))
      t.oncomplete = () => res(out?.result ?? true); t.onerror = () => res(null)
    })
  } catch { return null }
}
export const vault = {
  put: (s, v) => tx(s, 'readwrite', o => o.put(v)),
  del: (s, k) => tx(s, 'readwrite', o => o.delete(k)),
  clear: s => tx(s, 'readwrite', o => o.clear()),
  all: async s => (await tx(s, 'readonly', o => o.getAll())) || [],
  usage: async () => { try { return await navigator.storage?.estimate?.() } catch { return null } },
}

// ── EVIDENCE: burned-in stamp + SHA-256 ───────────────────────────────────
export async function stamp(dataUrl, meta) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl })
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const x = c.getContext('2d'); x.drawImage(img, 0, 0)
  const fs = Math.max(11, Math.round(c.width * 0.02)), pad = Math.round(fs * 0.8)
  const lines = [
    `${meta.utc}  ·  ${meta.mode}${meta.zoom > 1 ? `  ·  ${meta.zoom.toFixed(1)}×` : ''}`,
    meta.gps ? `${meta.gps.lat.toFixed(6)}, ${meta.gps.lon.toFixed(6)}  ±${Math.round(meta.gps.acc || 0)}m` : 'GPS UNAVAILABLE',
  ]
  const bh = lines.length * fs * 1.4 + pad * 1.2
  x.fillStyle = 'rgba(0,0,0,.62)'; x.fillRect(0, c.height - bh, c.width, bh)
  x.fillStyle = 'rgba(80,255,130,.95)'; x.font = `${fs}px "DM Mono",monospace`; x.textBaseline = 'top'
  lines.forEach((t, i) => x.fillText(t, pad, c.height - bh + pad * 0.6 + i * fs * 1.4))
  return c.toDataURL('image/jpeg', 0.92)
}
export async function sha256(dataUrl) {
  try {
    const buf = await (await fetch(dataUrl)).arrayBuffer()
    const h = await crypto.subtle.digest('SHA-256', buf)
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}

// ── ALERT TONE ────────────────────────────────────────────────────────────
let actx = null
export function beep(freq = 880, dur = 0.16, count = 1) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)()
    for (let i = 0; i < count; i++) {
      const t = actx.currentTime + i * (dur + 0.07)
      const o = actx.createOscillator(), g = actx.createGain()
      o.type = 'square'; o.frequency.value = freq; o.connect(g); g.connect(actx.destination)
      g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      o.start(t); o.stop(t + dur + 0.02)
    }
  } catch { /* audio blocked until user gesture */ }
}

// ── RECORDER MIME (iOS needs mp4) ─────────────────────────────────────────
export function recorderType() {
  const opts = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  return opts.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || ''
}

// ── SHARE ─────────────────────────────────────────────────────────────────
export async function shareBlob(blob, name, text) {
  try {
    const file = new File([blob], name, { type: blob.type })
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return true }
  } catch { /* cancelled */ }
  return false
}
export function download(url, name) {
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
}
export const dataUrlToBlob = async u => (await fetch(u)).blob()

// ── FRAME REGISTRATION for super-resolution ───────────────────────────────
// Locks onto a reference frame and measures how far each new frame has
// drifted (handshake). The GPU then samples each frame back into alignment
// before averaging, so detail adds up instead of smearing.
export function createAligner() {
  const W = 128, H = 72, R = 6, M = 8
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })
  const cur = new Float32Array(W * H)
  let ref = null
  return {
    reset() { ref = null },
    estimate(video) {
      ctx.drawImage(video, 0, 0, W, H)
      const d = ctx.getImageData(0, 0, W, H).data
      for (let i = 0, j = 0; j < cur.length; i += 4, j++) cur[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
      if (!ref) { ref = new Float32Array(cur); return { dx: 0, dy: 0, fresh: true, lost: false } }
      let best = Infinity, bx = 0, by = 0
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        let sum = 0
        for (let y = M; y < H - M; y += 2) {
          const row = y * W, rrow = (y + dy) * W
          for (let x = M; x < W - M; x += 2) sum += Math.abs(cur[row + x] - ref[rrow + x + dx])
          if (sum >= best) break
        }
        if (sum < best) { best = sum; bx = dx; by = dy }
      }
      const lost = Math.abs(bx) === R || Math.abs(by) === R   // drifted past search window
      return { dx: bx / W, dy: by / H, fresh: false, lost }
    },
  }
}
