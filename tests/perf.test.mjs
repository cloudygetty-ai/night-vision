// Run: node tests/perf.test.mjs
import fs from 'node:fs'
import path from 'node:path'
import { qualityGovernor, fitCanvas, GOV_MIN, GOV_MAX, GOV_TARGET } from '../src/engine.js'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }
const group = n => console.log(`\n${n}`)

const gl = fs.readFileSync(path.join(import.meta.dirname, '../src/gl.js'), 'utf8')
const app = fs.readFileSync(path.join(import.meta.dirname, '../src/App.jsx'), 'utf8')

group('Per-frame GPU upload')
{
  ok('streams frames with texSubImage2D', /texSubImage2D\(gl\.TEXTURE_2D, 0, 0, 0, gl\.RGBA/.test(gl))
  ok('reallocates storage only when the source size changes', /texDim\.get\(tex\) !== key/.test(gl))
  // the only full texImage2D calls left should be the allocation path + the LUT
  const allocs = (gl.match(/gl\.texImage2D\(/g) || []).length
  ok('no stray per-frame texImage2D calls', allocs <= 4, `${allocs} texImage2D call sites`)
  ok('upload() is not recursive', !/function upload[\s\S]{0,400}?upload\(video/.test(gl))
}

group('Compositing fast path')
{
  ok('preserveDrawingBuffer is off', /preserveDrawingBuffer: false/.test(gl))
  ok('desynchronized compositing requested', /desynchronized: true/.test(gl))
  ok('redraw() exists for pixel reads', /function redraw\(\)/.test(gl) && /redraw,/.test(gl))
  ok('photo capture repaints before toDataURL',
     /redraw\(\)[\s\S]{0,120}toDataURL/.test(app))
}

group('CPU readback is on a clock, not per frame')
{
  ok('sampling is time-gated', /t - lastSample > \d+/.test(app))
  ok('no every-other-frame tick gate left', !/\(\+\+tick & 1\) === 0/.test(app))
  const ms = +(app.match(/t - lastSample > (\d+)/) || [])[1]
  ok(`samples at roughly 10Hz (${ms}ms)`, ms >= 60 && ms <= 150)
  // at 60fps this is the difference between 30 and ~10 readbacks per second
  ok('cuts readbacks by >2× versus every-other-frame', (1000 / ms) < 30 / 2, `${(1000 / ms).toFixed(1)}Hz`)
}

group('Governor reacts in the right direction')
{
  ok('shrinks when frame rate is below target', qualityGovernor(16, 1) < 1)
  ok('shrinks harder when far below target', qualityGovernor(12, 1) < qualityGovernor(26, 1))
  ok('grows when comfortably above target', qualityGovernor(60, 0.7) > 0.7)
  ok('does not grow past full resolution', qualityGovernor(60, 1) === GOV_MAX)
  ok('never collapses below the floor', qualityGovernor(3, GOV_MIN) >= GOV_MIN)
  ok('ignores a bogus reading', qualityGovernor(0, 0.8) === 0.8 && qualityGovernor(NaN, 0.8) === 0.8)
}

group('Governor converges on a simulated device')
{
  // Model a GPU with a fixed fill budget: fps ≈ budget / pixels.
  const sim = (budgetMP, frames = 60) => {
    let scale = 1
    const hist = []
    for (let i = 0; i < frames; i++) {
      const { w, h } = fitCanvas(393, 852, 3, 'ULTRA', 3840, 2160, false, scale)
      const fps = Math.min(60, budgetMP / ((w * h) / 1e6))
      hist.push({ scale, fps })
      scale = qualityGovernor(fps, scale)
    }
    return hist
  }

  // a phone that managed only 16fps at full 3.0MP → budget ≈ 48
  const slow = sim(48, 90)
  const end = slow[slow.length - 1]
  ok('recovers a 16fps device to at or near target',
     end.fps >= GOV_TARGET * 0.8, `${end.fps.toFixed(1)} fps at scale ${end.scale}`)
  // it cannot exceed the target by design, so measure the gain up to it
  ok('reaches the frame-rate target', end.fps >= GOV_TARGET - 0.5,
     `${slow[0].fps.toFixed(1)} → ${end.fps.toFixed(1)} fps`)
  ok('is a large real-world gain (>1.7×)', end.fps / slow[0].fps > 1.7,
     `${(end.fps / slow[0].fps).toFixed(2)}×`)
  ok('keeps meaningful resolution while doing it', end.scale > 0.6, `scale ${end.scale}`)
  ok('settles rather than oscillating',
     Math.abs(slow[89].scale - slow[80].scale) < 0.06,
     `scale ${slow[80].scale} → ${slow[89].scale}`)

  // a fast device should stay at full resolution
  const fast = sim(400)
  ok('leaves a capable device at full resolution', fast[fast.length - 1].scale === GOV_MAX,
     `scale ${fast[fast.length - 1].scale}`)
  ok('a capable device is never needlessly downscaled', fast.every(s => s.scale === 1))
}

group('Governor is bounded and quantised')
{
  let s = 1
  for (let i = 0; i < 200; i++) s = qualityGovernor(i % 2 ? 5 : 60, s)   // worst-case thrash
  ok('stays in range under alternating load', s >= GOV_MIN && s <= GOV_MAX, String(s))
  ok('scale is rounded (avoids resize churn)', String(s).split('.')[1]?.length <= 3 || Number.isInteger(s))
  const r = fitCanvas(393, 852, 3, 'ULTRA', 3840, 2160, false, GOV_MIN)
  ok('floor still renders a usable buffer', r.w > 400 && r.h > 800, `${r.w}×${r.h}`)
}

group('Governor is wired into the app')
{
  ok('governor imported', /qualityGovernor/.test(app))
  ok('scale feeds the canvas sizing', /scaleRef\.current\)/.test(app))
  ok('resize re-runs when the scale changes', /glReady, govScale\]/.test(app))
  ok('can be turned off', /ADAPTIVE RESOLUTION/.test(app) && /cfg\.current\.adaptive/.test(app))
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
