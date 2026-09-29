// Run: node tests/exposure.test.mjs
import fs from 'node:fs'
import path from 'node:path'
import { autoExposure, AGC_TARGET, AGC_MIN, AGC_MAX } from '../src/engine.js'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }
const group = n => console.log(`\n${n}`)

const N = 160 * 90
const flat = v => { const a = new Uint8Array(N); a.fill(v); return a }
const scene = (base, spots = 0, spotV = 255) => {
  const a = flat(base)
  for (let i = 0; i < spots; i++) a[(i * 97) % N] = spotV
  return a
}
// settle the AGC loop like a real camera would over ~2s
const settle = (luma, frames = 120) => { let e = 1; for (let i = 0; i < frames; i++) e = autoExposure(luma, e); return e }

// CPU mirror of the shader's response curve + NIGHT branch
const TM = x => 1 - Math.exp(-Math.max(x, 0) * 1.85)
const night = (l, gain, exp) => Math.pow(TM(l * gain * exp), 0.78)

group('AGC brightens genuinely dark scenes')
{
  const e = settle(flat(8))                    // near-black, l≈0.03
  ok('pushes a dark scene up hard', e > 4, `${e.toFixed(2)}×`)
  ok('stays within the clamp', e <= AGC_MAX)
  const out = night(8 / 255, 1, e)
  ok('dark scene lands in usable midtones', out > 0.3 && out < 0.95, out.toFixed(3))
}

group('AGC pulls back bright scenes (the reported bug)')
{
  // the screenshot: a streetlit interior, mid-bright, was clipping to flat green
  const lit = flat(128)                        // l ≈ 0.5
  const e = settle(lit)
  ok('does not amplify an already-bright scene', e < 1, `${e.toFixed(2)}×`)
  const fixedOld = Math.min(1, 0.5 * 1 * 2.4)  // old shader: clamp(l*g*2.4)
  const fixedNew = night(0.5, 1, e)
  ok('old fixed 2.4× boost fully clipped', fixedOld >= 1.0, fixedOld.toFixed(3))
  ok('new path does NOT clip', fixedNew < 0.99, fixedNew.toFixed(3))
  ok('new path keeps headroom for detail', fixedNew > 0.25 && fixedNew < 0.9, fixedNew.toFixed(3))
}

group('Response curve never clips')
{
  let maxOut = 0, clipped = 0
  for (let l = 0; l <= 1.0001; l += 0.02) for (const g of [0.5, 1, 2, 4, 8]) {
    const v = night(l, g, 1)
    maxOut = Math.max(maxOut, v)
    if (v >= 1.0) clipped++
  }
  ok('output stays below 1.0 across all inputs and gains', maxOut < 1.0, `max ${maxOut.toFixed(5)}`)
  ok('no input/gain pair hard-clips (asymptotic, never == 1)', clipped === 0, `${clipped} clipped`)
  ok('curve is monotonic (brighter in → brighter out)',
     [0.1, 0.3, 0.5, 0.7, 0.9].every((l, i, arr) => i === 0 || night(l, 2, 1) > night(arr[i - 1], 2, 1)))
}

group('Bright light sources do not crush the scene')
{
  // a torch reflection or streetlight in an otherwise dark frame
  const dark = flat(10), withLamp = scene(10, Math.round(N * 0.03), 255)
  const eDark = settle(dark), eLamp = settle(withLamp)
  ok('a 3% blown highlight barely moves exposure', Math.abs(eDark - eLamp) / eDark < 0.2,
     `${eDark.toFixed(2)}× vs ${eLamp.toFixed(2)}×`)
  // mean-based AGC would have collapsed here — prove the median choice matters
  const meanOf = a => a.reduce((x, y) => x + y, 0) / a.length / 255
  const meanExp = Math.min(AGC_MAX, Math.max(AGC_MIN, AGC_TARGET / meanOf(withLamp)))
  ok('median beats a mean-based AGC on this frame', eLamp > meanExp * 1.3,
     `median ${eLamp.toFixed(2)}× vs mean ${meanExp.toFixed(2)}×`)
}

group('Highlight guard')
{
  // scene already near-white: must not be pushed further
  const e = settle(flat(215))
  ok('refuses to amplify a near-white frame', e <= 1.0, `${e.toFixed(2)}×`)
  ok('never returns below the floor', e >= AGC_MIN)
}

group('Temporal smoothing (no strobing)')
{
  let e = 1
  const steps = []
  for (let i = 0; i < 12; i++) { e = autoExposure(flat(6), e); steps.push(e) }
  const jumps = steps.map((v, i) => i ? v - steps[i - 1] : 0).slice(1)
  ok('ramps gradually rather than snapping', jumps.every(j => j < 1.6), `max jump ${Math.max(...jumps).toFixed(2)}`)
  ok('converges upward', steps[11] > steps[0])
  // a sudden scene flip must not oscillate
  let f = settle(flat(6))
  const after = []
  for (let i = 0; i < 40; i++) { f = autoExposure(flat(180), f); after.push(f) }
  ok('settles after a sudden bright cut', Math.abs(after[39] - after[35]) < 0.05, `Δ ${Math.abs(after[39] - after[35]).toFixed(4)}`)
  ok('no overshoot below the floor', Math.min(...after) >= AGC_MIN)
}

group('Degenerate input')
{
  ok('empty buffer keeps previous exposure', autoExposure(new Uint8Array(0), 3.2) === 3.2)
  ok('null buffer keeps previous exposure', autoExposure(null, 2.1) === 2.1)
  ok('pure black clamps to max, not Infinity', Number.isFinite(settle(flat(0))) && settle(flat(0)) <= AGC_MAX)
  ok('pure white clamps to min', settle(flat(255)) >= AGC_MIN && settle(flat(255)) <= 1)
}

group('Shader wiring')
{
  const src = fs.readFileSync(path.join(import.meta.dirname, '../src/gl.js'), 'utf8')
  ok('uExp uniform declared', /uniform float [^;]*uExp/.test(src))
  ok('gain multiplies auto exposure', /uGain \* uExp/.test(src))
  ok('uExp is uploaded each frame', /uniform1f\(disp\.u\.uExp/.test(src))
  ok('NIGHT no longer hard-codes the 2.4× boost', !/l\*g\*2\.4/.test(src))
  ok('NIGHT uses the saturating curve', /pow\(TM\(l \* g\), \.78\)/.test(src))
  ok('bloom is clamped so it cannot saturate', /v = min\(v \+ bloom, 1\.\)/.test(src))
  ok('exposure defaults to 1 when AGC is off', /o\.exposure == null \? 1 : o\.exposure/.test(src))
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
