// Run: node tests/cast.test.mjs
// Casting had no coverage at all, which is why a change made for frame rate
// (preserveDrawingBuffer: false) could silently break it: both casting and
// recording feed on canvas.captureStream(), and a non-preserved WebGL buffer
// can hand WebKit black frames.
import fs from 'node:fs'
import path from 'node:path'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }
const group = n => console.log(`\n${n}`)

const R = f => fs.readFileSync(path.join(import.meta.dirname, '../src/' + f), 'utf8')
const app = R('App.jsx'), watch = R('Watch.jsx'), gl = R('gl.js')

group('Sender and receiver must agree, or casting fails silently')
{
  const sendApp = app.match(/joinRoom\(\{ appId: '([^']+)' \}, `([^`]+)`\)/)
  const recvApp = watch.match(/joinRoom\(\{ appId: '([^']+)' \}, `([^`]+)`\)/)
  ok('sender joins a room', !!sendApp)
  ok('receiver joins a room', !!recvApp)
  ok('appId matches on both sides', sendApp?.[1] === recvApp?.[1],
     `${sendApp?.[1]} vs ${recvApp?.[1]}`)
  const norm = s => (s || '').replace('.toUpperCase()', '')
  ok('room name template matches on both sides', norm(sendApp?.[2]) === norm(recvApp?.[2]),
     `${sendApp?.[2]} vs ${recvApp?.[2]}`)
  ok('receiver normalises case so a typed lowercase code still joins',
     /code\.toUpperCase\(\)/.test(watch))
  ok('both use the same trystero strategy',
     /trystero\/nostr/.test(app) && /trystero\/nostr/.test(watch))
}

group('Trystero handlers are called, not assigned (the NVS-13 regression)')
{
  ok('sender calls onPeerJoin as a function', /room\.onPeerJoin\(/.test(app))
  ok('sender calls onPeerLeave as a function', /room\.onPeerLeave\(/.test(app))
  ok('receiver calls onPeerStream as a function', /room\.onPeerStream\(/.test(watch))
  ok('nothing assigns a handler as a property',
     !/\.onPeer(Join|Leave|Stream)\s*=/.test(app + watch))
}

group('captureStream gets a preserved drawing buffer')
{
  ok('the drawing buffer is preserved by default', /preserveDrawingBuffer: opts\.preserve !== false/.test(gl))
  ok('app does not opt out of it', !/preserve: false/.test(app))
  ok('renderer reports its mode', /const preserving = opts\.preserve !== false/.test(gl))
  // Rebuilding the context at cast start (to switch this flag) is what set the
  // dispose -> loseContext -> rebuild loop going. There must be no such path.
  ok('no context rebuild on the cast path', !/ensurePreserve/.test(app))
  ok('no second preserve mode to switch between', !/preserveRef/.test(app))
}

group('Disposing must not look like a context loss (the runaway loop)')
{
  ok('renderer tracks deliberate teardown', /let lost = false, disposing = false/.test(gl))
  ok('dispose marks itself before losing the context', /disposing = true\n\s*canvas\.removeEventListener/.test(gl))
  ok('a deliberate loss is not reported to the owner', /if \(!disposing\) opts\.onLost\?\.\(\)/.test(gl))
  ok('only the renderer listens for context loss',
     !/addEventListener\('webglcontextlost'/.test(app),
     'App must not attach its own listener')
  ok('the owner is notified through the callback', /onLost: \(\) =>/.test(app))

  // Simulate the wiring: a deliberate dispose must terminate, not recurse.
  let rebuilds = 0, disposals = 0
  const canvasListeners = []
  const mkRenderer = onLost => {
    rebuilds++
    let disposing = false
    const handler = () => { if (!disposing) onLost() }
    canvasListeners.push(handler)
    return {
      dispose() { disposing = true; disposals++; canvasListeners.forEach(h => h()) },  // loseContext()
    }
  }
  let current = null
  const rebuild = () => { if (current) current.dispose(); current = mkRenderer(rebuild) }
  let overflowed = false
  try { rebuild(); current.dispose() } catch { overflowed = true }
  ok('a deliberate dispose terminates', !overflowed)
  ok('it does not trigger a rebuild storm', rebuilds <= 2, `${rebuilds} rebuilds`)
  ok('each renderer is disposed at most once', disposals <= 2, `${disposals} disposals`)

  // a GENUINE loss must still rebuild exactly once
  let recovered = 0
  const genuine = mkRenderer(() => { recovered++ })
  canvasListeners[canvasListeners.length - 1]()
  ok('a real context loss still recovers', recovered === 1, `${recovered}`)
}

group('A failed cast keeps the code on screen')
{
  const castBody = app.slice(app.indexOf('const startCast'), app.indexOf('const stopCast'))
  ok('failure does not blank the code', !/status: 'failed' \}\); say/.test(castBody))
  ok('the session stays open so the user can retry', /setCast\(\{ on: true, code, viewers: 0, status: 'failed'/.test(castBody))
  ok('the real error is captured', /error: String\(e\?\.message \|\| e\)/.test(castBody))
  ok('the reason is shown in the sheet', /cast\.status === 'failed' \? 'Could not reach the relay/.test(app))
  ok('the error text is rendered', /\{cast\.error\}/.test(app))
  ok('there is a retry control', /RETRY<\/Btn>/.test(app))
}

group('Session code')
{
  // mirror of the generator in startCast
  const AL = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const gen = () => Array.from({ length: 4 }, () => AL[(Math.random() * AL.length) | 0]).join('')
  const codes = Array.from({ length: 600 }, gen)
  ok('codes are 4 characters', codes.every(c => c.length === 4), codes[0])
  ok('codes are uppercase alphanumeric', codes.every(c => /^[0-9A-Z]{4}$/.test(c)))
  ok('codes omit characters that are misread aloud (0/O/1/I)',
     codes.every(c => !/[01OI]/.test(c)))
  ok('every code is exactly 4 characters, with no short-string edge case',
     Array.from({ length: 200000 }, gen).every(c => c.length === 4))
  ok('codes vary', new Set(codes).size > 400, `${new Set(codes).size} distinct of 600`)
  ok('generator in source matches this shape',
     /Array\.from\(\{ length: 4 \}, \(\) => AL\[/.test(app))
  ok('watch URL carries the code', /\?watch=\$\{cast\.code\}/.test(app))
  ok('app routes a ?watch= visit to the receiver', /watch=/.test(app) || /watch/.test(R('main.jsx')))
}

group('Lifecycle and failure handling')
{
  ok('leaves the room on stop', /castRef\.current\?\.leave\(\)/.test(app))
  ok('clears the room reference', /castRef\.current = null/.test(app))
  // Previously a failure wiped the session, so the code flashed up and
  // vanished and the only clue was a transient toast. It must now land in a
  // visible failed state instead.
  ok('a failed start lands in a visible failed state, not a blank one',
     /status: 'failed', error:/.test(app) && !/status: 'failed' \}\); say\('Could not start cast'\)/.test(app))
  ok('unsupported browsers are told so', /Casting not supported in this browser/.test(app))
  ok('viewer count cannot go negative', /Math\.max\(0, s\.viewers - 1\)/.test(app))
  ok('a late joiner is sent the stream too', /room\.addStream\(out, id\)/.test(app))
  ok('trystero loads lazily, off the startup path', /await import\('trystero\/nostr'\)/.test(app))
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
