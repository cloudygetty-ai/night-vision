// Run: node tests/glare.test.mjs
// Bright source protection: an oncoming headlight blows out the frame, throws
// veiling glare across everything near it, and drags exposure metering down so
// the rest of the scene goes black. These tests mirror the shader's maths on
// the CPU and measure whether a target BESIDE the lamp actually becomes visible.
import fs from 'node:fs'
import path from 'node:path'
import { autoExposure, glareLoad, BLOWN } from '../src/engine.js'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }
const group = n => console.log(`\n${n}`)

const gl = fs.readFileSync(path.join(import.meta.dirname, '../src/gl.js'), 'utf8')
const app = fs.readFileSync(path.join(import.meta.dirname, '../src/App.jsx'), 'utf8')

// ── a night road with two oncoming headlights and a pedestrian in the halo ──
const W = 160, H = 90, N = W * H
const PED = { x0: 104, x1: 112, y0: 38, y1: 58 }
const BG = { x0: 116, x1: 126 }
function scene() {
  const a = new Float32Array(N)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let road = 0.045
    if (x >= PED.x0 && x < PED.x1 && y >= PED.y0 && y < PED.y1) road = 0.085   // pedestrian
    let v = road
    for (const cx of [64, 96]) {
      const d = Math.hypot(x - cx, y - 46)
      v += 0.75 * Math.exp(-(d * d) / (2 * 15 * 15))                            // veiling glare
      if (d < 5) v = 1.2                                                        // lamp core
    }
    a[y * W + x] = Math.min(v, 1)                                               // sensor clips
  }
  return a
}
const gauss = (src, sig) => {
  const r = Math.ceil(sig * 2), k = []
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sig * sig)))
  const t = new Float32Array(N), o = new Float32Array(N)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, c = 0
    for (let i = -r; i <= r; i++) { const nx = Math.min(W - 1, Math.max(0, x + i)); s += src[y * W + nx] * k[i + r]; c += k[i + r] }
    t[y * W + x] = s / c
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, c = 0
    for (let i = -r; i <= r; i++) { const ny = Math.min(H - 1, Math.max(0, y + i)); s += t[ny * W + x] * k[i + r]; c += k[i + r] }
    o[y * W + x] = s / c
  }
  return o
}
const TM = x => 1 - Math.exp(-Math.max(x, 0) * 1.85)

// CPU mirror of the shader's BSP block
function applyBsp(src, base, bsp, baseC = 0.28, detail = 3.0, gain = 3.2) {
  const out = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let c = src[i]
    if (bsp > 0) {
      const b = base[i], d = c - b
      // mirror of the shader: choose the on-screen luminance, then invert the
      // tone curve so the downstream TM(l*g) reproduces it
      const th = x => Math.tanh(x)
      const dt = 0.5 * th((d * gain * detail) / 0.5)      // soft-limited detail
      const want = Math.min(0.995, Math.max(0, TM(b * gain) * baseC + dt))
      const pre = -Math.log(1 - want) / 1.85 / Math.max(gain, 1e-3)
      c = c + (pre - c) * bsp
    }
    out[i] = Math.min(1, TM(c * gain))
  }
  return out
}
const probe = img => {
  let p = 0, pn = 0, b = 0, bn = 0
  for (let y = PED.y0; y < PED.y1; y++) {
    for (let x = PED.x0; x < PED.x1; x++) { p += img[y * W + x]; pn++ }
    for (let x = BG.x0; x < BG.x1; x++) { b += img[y * W + x]; bn++ }
  }
  const a = p / pn, c = b / bn
  return { ped: a, bg: c, contrast: Math.abs(a - c) / Math.max(a + c, 1e-6) }
}

const raw = scene(), base = gauss(raw, 6)
const off = probe(applyBsp(raw, base, 0))
const on = probe(applyBsp(raw, base, 1))

group('Seeing past the headlight')
{
  ok('without protection the halo washes the target out', off.contrast < 0.16,
     `${(off.contrast * 100).toFixed(1)}% contrast`)
  ok('protection restores target contrast', on.contrast > off.contrast * 2,
     `${(off.contrast * 100).toFixed(1)}% → ${(on.contrast * 100).toFixed(1)}%`)
  ok('target is meaningfully separated from the road', on.contrast > 0.3,
     `${(on.contrast * 100).toFixed(1)}%`)
  ok('the surround is pulled out of saturation', on.bg < off.bg,
     `${off.bg.toFixed(2)} → ${on.bg.toFixed(2)}`)
}

group('The lamp itself is held down')
{
  const lampOff = applyBsp(raw, base, 0)[46 * W + 96]
  const lampOn = applyBsp(raw, base, 1)[46 * W + 96]
  ok('lamp core is blown without protection', lampOff > 0.97, lampOff.toFixed(3))
  ok('lamp core is compressed with it', lampOn < 0.9, lampOn.toFixed(3))
  ok('but is not crushed to black — it is still a lamp', lampOn > 0.3, lampOn.toFixed(3))
}

group('Strength behaves monotonically')
{
  const cs = [0, 0.25, 0.5, 0.75, 1].map(s => probe(applyBsp(raw, base, s)).contrast)
  ok('contrast rises with strength', cs.every((v, i) => i === 0 || v >= cs[i - 1] - 1e-9),
     cs.map(v => (v * 100).toFixed(0) + '%').join(' → '))
  ok('zero strength is a true bypass',
     Math.abs(cs[0] - off.contrast) < 1e-9)
}

group('A clean scene is left alone')
{
  // no bright source: protection must not wreck an ordinary dark frame
  const plain = new Float32Array(N)
  for (let i = 0; i < N; i++) plain[i] = 0.045 + (i % 37) / 37 * 0.02
  const pb = gauss(plain, 6)
  const a = applyBsp(plain, pb, 0), b = applyBsp(plain, pb, 1)
  let maxShift = 0
  for (let i = 0; i < N; i++) maxShift = Math.max(maxShift, Math.abs(a[i] - b[i]))
  ok('a glare-free frame is not badly disturbed', maxShift < 0.45, `max shift ${maxShift.toFixed(3)}`)
  ok('no pixel is driven negative or past white',
     b.every(v => v >= 0 && v <= 1))
}

group('Metering ignores the bright source')
{
  const luma = new Uint8Array(N)
  for (let i = 0; i < N; i++) luma[i] = Math.round(raw[i] * 255)
  const settle = o => { let e = 1; for (let i = 0; i < 200; i++) e = autoExposure(luma, e, 0.12, 0.34, o); return e }
  const plain = settle({}), bsp = settle({ bsp: true })
  const dark = new Uint8Array(N); dark.fill(12)
  ok('headlights register as blown pixels', glareLoad(luma) >= 0.005,
     `${(glareLoad(luma) * 100).toFixed(2)}% blown`)
  ok('a glare-free frame registers none', glareLoad(dark) === 0)
  ok('metering past them recovers gain on the dark road', bsp > plain * 1.15,
     `${plain.toFixed(2)}× → ${bsp.toFixed(2)}×`)
  ok('gain stays bounded', bsp <= 12)

  // if the frame is ALMOST ALL bright, blown pixels must not all be discarded
  const white = new Uint8Array(N); white.fill(250)
  ok('an all-bright frame still meters sanely', settle.call(null, { bsp: true }) > 0 &&
     autoExposure(white, 1, 0.12, 0.34, { bsp: true }) <= 1.0)
  ok('empty input returns the previous value', autoExposure(null, 2.5, 0.12, 0.34, { bsp: true }) === 2.5)
  ok('BLOWN cutoff is in the clipped range', BLOWN > 220 && BLOWN <= 255)
}

group('Shader and pipeline wiring')
{
  ok('glare field shader exists', /const GLARE_FS/.test(gl))
  ok('separable blur shader exists', /const BLUR_FS/.test(gl))
  ok('base/detail decomposition is in the display pass',
     /float d = lv - b;/.test(gl) && /float dt = d \* g \* uBspD;/.test(gl))
  ok('base is compressed, detail added on top', /TM\(b \* g\) \* uBspT \+ dt/.test(gl))
  ok('detail is soft-limited so a source cannot amplify itself', /tanh\(dt \/ 0\.5\)/.test(gl))
  ok('the tone curve is inverted so the mode gain lands where intended',
     /-log\(1\. - want\) \/ 1\.85 \/ max\(g, 1e-3\)/.test(gl))
  ok('hue is preserved by scaling, not by replacing', /c \*= mix\(1\., pre \/ max\(lv, 1e-4\), uBsp\)/.test(gl))
  ok('glare field runs at 1/8 resolution', /Math\.ceil\(w \/ 8\)/.test(gl))
  ok('blur runs multiple wide iterations', (gl.match(/SP \/ gw, 0/g) || []).length >= 2)
  ok('glare pass is skipped entirely when off', /if \(o\.bsp > 0\) buildGlare/.test(gl))
  ok('glare buffers are freed on dispose', /gbuf\.forEach\(b => \{ gl\.deleteTexture/.test(gl))
  ok('glare buffers are rebuilt on resize', /gbuf = \[0, 1\]\.map/.test(gl))
}

group('App wiring')
{
  ok('strength is passed to the live render', /bsp: S\.bsp \}/.test(app))
  ok('and to the full-resolution still', /bsp: cfg\.current\.bsp/.test(app))
  ok('metering is told when protection is on', /\{ bsp: S\.bsp > 0 \}/.test(app))
  ok('one-tap toggle on the tool strip', /label="GLARE"/.test(app))
  ok('status pill shows it is active', /GLARE \{Math\.round\(bsp \* 100\)\}/.test(app))
  ok('strength slider in settings', /HEADLIGHT SUPPRESSION/.test(app))
  ok('defaults to off', /useState\(0\) {8}\/\/ bright source protection/.test(app))
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
