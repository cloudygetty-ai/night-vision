// Run: node tests/watchBridge.test.mjs
import fs from 'node:fs'
import path from 'node:path'
import { initWatchBridge } from '../src/watchBridge.js'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }
const group = n => console.log(`\n${n}`)

const src = fs.readFileSync(path.join(import.meta.dirname, '../src/watchBridge.js'), 'utf8')
const app = fs.readFileSync(path.join(import.meta.dirname, '../src/App.jsx'), 'utf8')

group('No window (SSR / plain Node) — never throws')
{
  // There is no `window` in this test runner, same as a server-rendering
  // context. initWatchBridge must degrade to a no-op, not throw.
  let threw = false, cleanup = null
  try {
    cleanup = initWatchBridge({
      canvasRef: { current: null }, rendererRef: { current: null },
      getStatus: () => ({}), remote: {},
    })
  } catch { threw = true }
  ok('does not throw when window is undefined', !threw)
  ok('returns a cleanup function', typeof cleanup === 'function')
  ok('cleanup itself does not throw', (() => { try { cleanup(); return true } catch { return false } })())
}

group('Outbound guard — never calls into a missing native handler')
{
  // Guards every outbound postMessage on window.webkit.messageHandlers.nvsWatch
  // existing, so plain browser/PWA use is never affected.
  ok('checks window.webkit?.messageHandlers?.nvsWatch before posting', /webkit\?\.messageHandlers\?\.nvsWatch/.test(src))
  ok('frame grab repaints via redraw() before reading the canvas', /renderer\?\.redraw\?\.\(\)/.test(src))
  ok('downsamples onto an offscreen canvas (not the full-res main canvas)', /FRAME_W/.test(src) && /drawImage/.test(src))
}

group('Inbound command surface matches what App.jsx wires up')
{
  const fns = ['setMode', 'cycleMode', 'toggleRecording', 'toggleSentry', 'setDce', 'setZoom']
  for (const fn of fns) {
    ok(`bridge exposes ${fn}`, new RegExp(`${fn}:`).test(src))
    ok(`App.jsx provides a remote.${fn}`, new RegExp(`${fn}:`).test(app))
  }
}

group('Wired into App.jsx exactly once, with stable identities')
{
  ok('imports initWatchBridge', /import \{ initWatchBridge \} from '\.\/watchBridge\.js'/.test(app))
  ok('calls initWatchBridge from a useEffect', /useEffect\(\(\) => initWatchBridge\(/.test(app))
  // toggleRecording must read recRef (live), never the `recording` state value
  // directly, or it would always act on whatever `recording` was when the
  // effect last registered.
  ok('toggleRecording reads the live recRef, not a captured recording value', /recRef\.current \? stopRec\(\) : startRec\(false\)/.test(app))
  // Match the property, not the key ORDER: pinning the exact adjacency broke
  // every time an unrelated flag was added to cfg.current.
  const cfgBlock = app.slice(app.indexOf('cfg.current = {'), app.indexOf('cfg.current = {') + 400)
  ok('status mirrors recording into cfg.current for the bridge to read live',
     /[{,]\s*recording\s*[,}]/.test(cfgBlock), cfgBlock.split('\n')[3])
}

console.log(`\n${'─'.repeat(50)}\n# ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
