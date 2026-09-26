// Run: node tests/motion.test.mjs
import { analyzeMotion, MOTION_W as W, MOTION_H as H } from '../src/engine.js'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
const group = n => console.log(`\n${n}`)

// ── helpers ───────────────────────────────────────────────────────────────
const blank = (v = 90) => { const a = new Uint8Array(W * H); a.fill(v); return a }
const noisy = (base, amp, seed = 1) => {
  const a = new Uint8Array(base); let s = seed
  for (let i = 0; i < a.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; a[i] = Math.max(0, Math.min(255, a[i] + ((s % (amp * 2 + 1)) - amp))) }
  return a
}
const rect = (a, x, y, w, h, v) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
    if (xx >= 0 && yy >= 0 && xx < W && yy < H) a[yy * W + xx] = v
  return a
}
const shift = (a, dx) => {
  const o = new Uint8Array(a.length)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = a[y * W + Math.min(W - 1, Math.max(0, x - dx))]
  return o
}
// Intersection-over-union of a returned box vs truth (both in pixels)
const iou = (b, t) => {
  const bx = b.x * W, by = b.y * H, bw = b.w * W, bh = b.h * H
  const ix = Math.max(0, Math.min(bx + bw, t.x + t.w) - Math.max(bx, t.x))
  const iy = Math.max(0, Math.min(by + bh, t.y + t.h) - Math.max(by, t.y))
  const inter = ix * iy
  return inter / (bw * bh + t.w * t.h - inter)
}

// ── 1. a still scene must produce nothing ─────────────────────────────────
group('Still scene')
{
  const a = noisy(blank(), 4, 7), b = noisy(blank(), 4, 99)
  const r = analyzeMotion(b, a, 0.6)
  ok('no boxes on sensor noise alone', r.boxes.length === 0, `got ${r.boxes.length}`)
  ok('not flagged as panning', r.panning === false)
}

// ── 2. one moving target → exactly one tight box ──────────────────────────
group('Single moving target')
{
  const bg = noisy(blank(), 3, 3)
  const truth = { x: 60, y: 30, w: 24, h: 36 }
  const cur = rect(new Uint8Array(bg), truth.x, truth.y, truth.w, truth.h, 200)
  const r = analyzeMotion(cur, bg, 0.6)
  ok('finds exactly one target', r.boxes.length === 1, `got ${r.boxes.length}`)
  const overlap = r.boxes[0] ? iou(r.boxes[0], truth) : 0
  ok('box tightly matches the target (IoU > 0.6)', overlap > 0.6, `IoU ${overlap.toFixed(2)}`)
  const b = r.boxes[0]
  ok('box is not a sliver', b && b.w > 0.08 && b.h > 0.2, b ? `w=${b.w.toFixed(3)} h=${b.h.toFixed(3)}` : 'none')
}

// ── 3. two separated targets stay separate ────────────────────────────────
group('Two separated targets')
{
  const bg = noisy(blank(), 3, 11)
  let cur = new Uint8Array(bg)
  cur = rect(cur, 20, 30, 20, 30, 210)
  cur = rect(cur, 120, 30, 20, 30, 210)
  const r = analyzeMotion(cur, bg, 0.6)
  ok('reports two targets', r.boxes.length === 2, `got ${r.boxes.length}`)
  if (r.boxes.length === 2) {
    const [l, rt] = r.boxes.sort((a, b) => a.x - b.x)
    ok('boxes do not overlap', l.x + l.w < rt.x, `${(l.x + l.w).toFixed(2)} vs ${rt.x.toFixed(2)}`)
  }
}

// ── 4. a target split across cell borders merges into one box ─────────────
group('Target spanning cell boundaries')
{
  const bg = noisy(blank(), 3, 21)
  // straddles cell columns/rows deliberately (cells are 8×9)
  const truth = { x: 45, y: 22, w: 30, h: 40 }
  const cur = rect(new Uint8Array(bg), truth.x, truth.y, truth.w, truth.h, 205)
  const r = analyzeMotion(cur, bg, 0.6)
  ok('merges into a single box, not fragments', r.boxes.length === 1, `got ${r.boxes.length}`)
  const overlap = r.boxes[0] ? iou(r.boxes[0], truth) : 0
  ok('merged box still tight (IoU > 0.6)', overlap > 0.6, `IoU ${overlap.toFixed(2)}`)
}

// ── 5. camera pan must be suppressed ──────────────────────────────────────
group('Camera pan')
{
  // a real pan: a structured scene (edges and gradients, light sensor noise)
  const scene = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 110 + 60 * Math.sin(x / 7) * Math.cos(y / 9) + 40 * Math.sin((x + y) / 4)
    scene[y * W + x] = Math.max(0, Math.min(255, v | 0))
  }
  const bg = noisy(scene, 3, 5)
  const panned = noisy(shift(scene, 6), 3, 6)
  const r = analyzeMotion(panned, bg, 0.6)
  ok('flags panning', r.panning === true)
  ok('returns no target boxes while panning', r.boxes.length === 0, `got ${r.boxes.length}`)
}

// ── 6. sensitivity actually changes behaviour ─────────────────────────────
group('Sensitivity')
{
  const bg = noisy(blank(), 3, 31)
  const faint = rect(new Uint8Array(bg), 60, 30, 24, 36, 104)  // only +14 over background
  const low = analyzeMotion(faint, bg, 0.05)
  const high = analyzeMotion(faint, bg, 1.0)
  ok('low sensitivity ignores a faint change', low.boxes.length === 0, `got ${low.boxes.length}`)
  ok('high sensitivity catches it', high.boxes.length >= 1, `got ${high.boxes.length}`)
}

// ── 7. small speck rejected as noise ──────────────────────────────────────
group('Tiny speck rejection')
{
  const bg = noisy(blank(), 3, 41)
  const speck = rect(new Uint8Array(bg), 80, 40, 3, 3, 240)
  const r = analyzeMotion(speck, bg, 0.6)
  ok('ignores a 3×3 speck', r.boxes.length === 0, `got ${r.boxes.length}`)
}

// ── 8. output contract ────────────────────────────────────────────────────
group('Output contract')
{
  const bg = noisy(blank(), 3, 51)
  const cur = rect(new Uint8Array(bg), 40, 20, 30, 40, 200)
  const r = analyzeMotion(cur, bg, 0.6)
  const b = r.boxes[0]
  ok('frac is a 0..1 fraction', r.frac >= 0 && r.frac <= 1, String(r.frac))
  ok('coords normalised inside the frame', !!b && b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001,
     b ? JSON.stringify(b) : 'no box')
  ok('boxes capped at 5', r.boxes.length <= 5)
}

// ── 9. a large close-up target must NOT be suppressed as noise ────────────
group('Large close target')
{
  const bg = noisy(blank(), 3, 61)
  const truth = { x: 30, y: 10, w: 70, h: 70 }          // ~34% of the frame
  const cur = rect(new Uint8Array(bg), truth.x, truth.y, truth.w, truth.h, 190)
  const r = analyzeMotion(cur, bg, 0.6)
  ok('still detects a large subject', r.boxes.length >= 1 && !r.panning, `boxes=${r.boxes.length} panning=${r.panning}`)
  const overlap = r.boxes[0] ? iou(r.boxes[0], truth) : 0
  ok('large box is tight (IoU > 0.6)', overlap > 0.6, `IoU ${overlap.toFixed(2)}`)
}

// ── 10. performance budget ────────────────────────────────────────────────
group('Performance')
{
  const bg = noisy(blank(), 3, 71)
  const cur = rect(new Uint8Array(bg), 50, 25, 30, 40, 200)
  analyzeMotion(cur, bg, 0.6)                            // warm up
  const t0 = performance.now()
  const N = 200
  for (let i = 0; i < N; i++) analyzeMotion(cur, bg, 0.6)
  const per = (performance.now() - t0) / N
  ok(`under 4ms per frame (${per.toFixed(2)}ms)`, per < 4)
  ok(`leaves headroom at 30Hz analysis (${(per / 33.3 * 100).toFixed(1)}% of a 30fps budget)`, per < 8)
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
