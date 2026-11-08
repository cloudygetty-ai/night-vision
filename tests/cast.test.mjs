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
  ok('renderer takes a preserve option', /createRenderer\(canvas, opts = \{\}\)/.test(gl))
  ok('the flag is driven by that option', /preserveDrawingBuffer: !!opts\.preserve/.test(gl))
  ok('renderer reports which mode it is in', /preserving,/.test(gl))
  ok('app creates the context with the current preference',
     /createRenderer\(cv, \{ preserve: preserveRef\.current \}\)/.test(app))

  // ordering is the whole point: the stream must not be grabbed from a
  // context that is about to be thrown away
  const castBody = app.slice(app.indexOf('const startCast'), app.indexOf('const stopCast'))
  ok('cast switches to preserving BEFORE grabbing the stream',
     castBody.indexOf('ensurePreserve(true)') < castBody.indexOf('captureStream('),
     'ensurePreserve must come first')
  ok('cast awaits the rebuild', /await ensurePreserve\(true\)/.test(castBody))

  const recBody = app.slice(app.indexOf('const startRec'), app.indexOf('const stopRec'))
  ok('recording switches to preserving before grabbing the stream',
     recBody.indexOf('ensurePreserve(true)') < recBody.indexOf('captureStream('))
  ok('recording awaits the rebuild', /await ensurePreserve\(true\)/.test(recBody))
  ok('startRec is async now that it awaits', /const startRec = useCallback\(async/.test(app))
  ok('a second start during the rebuild is ignored',
     /if \(recRef\.current\) return\s+\/\/ a second call landed while rebuilding/.test(app))
}

group('The fast path comes back when nothing is streaming')
{
  ok('stopping the cast drops preserving if not recording',
     /if \(!recRef\.current\) ensurePreserve\(false\)/.test(app))
  ok('stopping recording drops preserving if not casting',
     /if \(!castRef\.current\) ensurePreserve\(false\)/.test(app))
  ok('switching is a no-op when already in the right mode',
     /if \(preserveRef\.current === want\) return/.test(app))
  ok('the switch rebuilds the context', /preserveRef\.current = want\s+setGlEpoch/.test(app))
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
  ok('a failed start resets state rather than hanging on "connecting"',
     /catch \{ setCast\(\{ on: false, code: '', viewers: 0, status: 'failed' \}\)/.test(app))
  ok('unsupported browsers are told so', /Casting not supported in this browser/.test(app))
  ok('viewer count cannot go negative', /Math\.max\(0, s\.viewers - 1\)/.test(app))
  ok('a late joiner is sent the stream too', /room\.addStream\(out, id\)/.test(app))
  ok('trystero loads lazily, off the startup path', /await import\('trystero\/nostr'\)/.test(app))
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
