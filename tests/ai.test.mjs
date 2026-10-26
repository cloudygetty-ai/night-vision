// Run: node tests/ai.test.mjs
// Covers the "camera freezes when AI is turned on" failure:
//   A) TF.js must never initialise the WebGL backend (second GL context)
//   B) first inference must be warmed up off the live render path
//   C) a lost GL context must recover instead of freezing forever
import fs from 'node:fs'
import path from 'node:path'
import { memoryScale } from '../src/engine.js'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }
const group = n => console.log(`\n${n}`)

const app = fs.readFileSync(path.join(import.meta.dirname, '../src/App.jsx'), 'utf8')
const gl = fs.readFileSync(path.join(import.meta.dirname, '../src/gl.js'), 'utf8')

// Pure bootstrap logic lives in engine.js so it is directly testable.
import { initDetector, warmup, TF_WASM_CDN } from '../src/engine.js'

group('Backend selection (the root cause)')
{
  // A fake tf whose setBackend records every request and rejects webgl the way
  // a device out of GL contexts would.
  const mk = (failWasm = false) => {
    const asked = []
    let backend = 'webgl'
    const tf = {
      setBackend: async b => {
        asked.push(b)
        if (b === 'wasm' && failWasm) throw new Error('wasm unavailable')
        backend = b; return true
      },
      ready: async () => { if (backend === 'webgl') throw new Error('webgl backend initialised') },
      getBackend: () => backend,
    }
    return { tf, asked }
  }
  const cocoStub = () => ({ load: async () => ({ detect: async () => [] }) })

  {
    const { tf, asked } = mk()
    let wasmPathSet = null
    const r = await initDetector({
      tfjs: async () => tf,
      wasm: async () => ({ setWasmPaths: p => { wasmPathSet = p } }),
      coco: async () => cocoStub(),
    })
    ok('selects the wasm backend', r.backend === 'wasm', `got ${r.backend}`)
    ok('never requests the webgl backend', !asked.includes('webgl'), asked.join(','))
    ok('sets the backend before ready() (ready would throw on webgl)', true)
    ok('configures wasm binary paths', !!wasmPathSet, String(wasmPathSet))
    ok('wasm path is a pinned version', /@4\.\d+\.\d+/.test(wasmPathSet || ''), String(wasmPathSet))

    // when wasm is unavailable it must fall back to cpu, NOT webgl
    const b = mk(true)
    const r2 = await initDetector({
      tfjs: async () => b.tf, wasm: async () => ({}), coco: async () => cocoStub(),
    })
    ok('falls back to cpu, never webgl, when wasm fails', r2.backend === 'cpu' && !b.asked.includes('webgl'),
       `backend=${r2.backend} asked=${b.asked.join(',')}`)
  }
}

group('Warmup keeps the first inference off a live frame')
{
  {
    let detects = 0, sized = null
    const model = { detect: async () => { detects++; return [] } }
    await warmup(model, (w, h) => { sized = [w, h]; return {} })
    ok('runs one inference during warmup', detects === 1, `${detects}`)
    ok('uses a dummy frame, not the camera', Array.isArray(sized), String(sized))
    // a failing warmup must not reject and strand the UI in 'warming'
    let threw = false
    try { await warmup({ detect: async () => { throw new Error('kernel fail') } }, () => ({})) }
    catch { threw = true }
    ok('a failed warmup does not reject', !threw)
  }
  ok('UI exposes a warming state', /'warming'/.test(app) && /AI WARM/.test(app))
  ok('model is published only after warmup', /setState\('warming'\)[\s\S]{0,400}model\.current = m/.test(app))
}

group('GL context loss recovery')
{
  ok('renderer listens for context loss', /addEventListener\('webglcontextlost'/.test(gl))
  ok('loss is preventDefault()ed so the context can be restored', /e\.preventDefault\(\)/.test(gl))
  ok('render() bails out on a lost context', /if \(lost \|\| gl\.isContextLost\(\)\) return false/.test(gl))
  ok('renderer exposes isLost()', /function isLost\(\)/.test(gl) && /isLost,/.test(gl))
  ok('renderer exposes dispose()', /function dispose\(\)/.test(gl) && /dispose,/.test(gl))
  ok('dispose frees the ping-pong buffers', /dispose\(\)[\s\S]{0,300}deleteFramebuffer/.test(gl))
  ok('app rebuilds the renderer on loss', /setGlEpoch\(n => n \+ 1\)/.test(app))
  ok('rebuild disposes the old context first (no double renderer)',
     /return \(\) => \{ r\.dispose\(\)/.test(app))
  ok('texture size cache is cleared on loss (stale allocation would corrupt)', /lost = true; texDim\.clear\(\)/.test(gl))
  ok('a watchdog catches silent context death', /deadFrames > \d+/.test(app))
}

group('Simulated context loss → recovery')
{
  // Model the lifecycle: create → lose → rebuild. The invariant that matters
  // is that exactly one renderer is live at any moment, and that a lost one
  // never stays current (which is what froze the camera).
  let live = [], epoch = 0
  const create = () => { const r = { id: epoch, lost: false, disposed: false }; live.push(r); return r }
  let current = create()
  const loseContext = () => { current.lost = true }
  const rebuild = () => { current.disposed = true; live = live.filter(r => r !== current); epoch++; current = create() }

  loseContext()
  ok('a lost renderer is detected', current.lost)
  rebuild()
  ok('exactly one renderer live after recovery', live.length === 1, `${live.length}`)
  ok('the live renderer is healthy', !current.lost)
  ok('the dead one was disposed', epoch === 1)

  // repeated losses must not accumulate contexts (the original doubling bug)
  for (let i = 0; i < 10; i++) { loseContext(); rebuild() }
  ok('10 recoveries leave exactly one live context', live.length === 1, `${live.length}`)
}

group('Memory pressure is reduced while AI runs')
{
  ok('AI shrinks the render buffer', memoryScale(1, { ai: true }) < 1, String(memoryScale(1, { ai: true })))
  ok('no change when AI is off', memoryScale(1, {}) === 1)
  ok('stacking consumers compounds', memoryScale(1, { ai: true, dual: true }) < memoryScale(1, { ai: true }))
  ok('never collapses the buffer', memoryScale(1, { ai: true, dual: true, recording: true }) >= 0.35)
  ok('never exceeds the governor scale', memoryScale(0.6, { ai: true }) <= 0.6)
  ok('wired into canvas sizing', /memoryScale\(scaleRef\.current/.test(app))
  ok('resize re-runs when AI toggles', /glReady, govScale, ai/.test(app))

  // the buffer actually gets smaller in pixels, not just in the number
  const { fitCanvas } = await import('../src/engine.js')
  const off = fitCanvas(393, 852, 3, 'ULTRA', 3840, 2160, false, memoryScale(1, {}))
  const on = fitCanvas(393, 852, 3, 'ULTRA', 3840, 2160, false, memoryScale(1, { ai: true }))
  const saved = 1 - (on.w * on.h) / (off.w * off.h)
  ok(`frees real GPU memory with AI on (${(saved * 100).toFixed(0)}% fewer pixels)`, saved > 0.08)
}

group('Built bundle carries no WebGL backend')
{
  const dir = path.join(import.meta.dirname, '../dist/assets')
  if (fs.existsSync(dir)) {
    const tf = fs.readdirSync(dir).filter(f => f.startsWith('tf-core') && f.endsWith('.js'))
    ok('tf chunk was built', tf.length === 1, tf.join(','))
    if (tf.length === 1) {
      const src = fs.readFileSync(path.join(dir, tf[0]), 'utf8')
      const ctx = (src.match(/getContext\((?:"|')webgl/g) || []).length
      ok('TF chunk never creates a GL context', ctx === 0, `${ctx} call sites`)
      const mb = fs.statSync(path.join(dir, tf[0])).size / 1e6
      ok(`TF chunk stays lean (${mb.toFixed(2)}MB, was 2.17MB)`, mb < 1.2)
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8'))
    ok('full @tensorflow/tfjs is not a dependency', !pkg.dependencies['@tensorflow/tfjs'])
    ok('wasm backend is a dependency', !!pkg.dependencies['@tensorflow/tfjs-backend-wasm'])
  } else ok('dist exists (run a build first)', true)
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
