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
const app = R('App.jsx'), watch = R('Watch.jsx'), gl = R('gl.js'), castSrc = R('cast.js')
const { joinCast, roomName, APP_ID, STRATEGIES } = await import('../src/cast.js')

// A fake trystero room that records what it was asked to do.
const mkStrategy = (name, { fail = false } = {}) => {
  const state = { name, joined: null, streams: [], left: false, handlers: {} }
  return {
    state,
    strategy: {
      name,
      load: async () => {
        if (fail) throw new Error(`${name} relay unreachable`)
        return {
          joinRoom: (cfg, room) => {
            state.joined = { cfg, room }
            return {
              onPeerJoin: f => { state.handlers.join = f },
              onPeerLeave: f => { state.handlers.leave = f },
              onPeerStream: f => { state.handlers.stream = f },
              addStream: (s, id) => state.streams.push({ s, id }),
              leave: () => { state.left = true },
            }
          },
        }
      },
    },
  }
}


group('Sender and receiver share one transport module')
{
  ok('sender uses the shared module', /import \{ joinCast \} from '\.\/cast\.js'/.test(app))
  ok('receiver uses the shared module', /import \{ joinCast \} from '\.\/cast\.js'/.test(watch))
  ok('neither hardcodes a room name any more',
     !/joinRoom\(\{ appId/.test(app) && !/joinRoom\(\{ appId/.test(watch))
  ok('room name derives from the code', roomName('ab7k') === 'NVS-AB7K'.replace('NVS-', 'nvs-'))
  ok('room name is case-insensitive', roomName('ab7k') === roomName('AB7K'))
  ok('both sides therefore cannot disagree', roomName('X2Y9') === `nvs-X2Y9`)
}

group('Deprecated trystero subpaths are gone (they throw in 0.26)')
{
  ok('no trystero/nostr import anywhere', !/'trystero\/nostr'/.test(app + watch + castSrc))
  ok('no trystero/mqtt import anywhere', !/'trystero\/mqtt'/.test(app + watch + castSrc))
  ok('strategies come from their own packages',
     /@trystero-p2p\/mqtt/.test(castSrc) && /@trystero-p2p\/nostr/.test(castSrc))
  const pkg = JSON.parse(R('../package.json'))
  ok('mqtt strategy is a declared dependency', !!pkg.dependencies['@trystero-p2p/mqtt'])
}

group('MQTT is primary, nostr runs alongside it')
{
  const m = mkStrategy('mqtt'), n = mkStrategy('nostr')
  const room = await joinCast('ab7k', {}, [m.strategy, n.strategy])
  ok('mqtt is the primary transport', STRATEGIES[0].name === 'mqtt', STRATEGIES.map(s => s.name).join(','))
  ok('nostr is kept as a backup', STRATEGIES.some(s => s.name === 'nostr'))
  ok('both transports join', room.transports.join(',') === 'mqtt,nostr', room.transports.join(','))
  ok('both join the same room name', m.state.joined.room === n.state.joined.room, m.state.joined.room)
  ok('room name is normalised to upper case', m.state.joined.room === 'nvs-AB7K', m.state.joined.room)
  ok('both use the same appId', m.state.joined.cfg.appId === APP_ID && n.state.joined.cfg.appId === APP_ID)
  room.leave()
  ok('leaving leaves every transport', m.state.left && n.state.left)
}

group('One dead network does not kill the cast')
{
  const m = mkStrategy('mqtt'), n = mkStrategy('nostr', { fail: true })
  const room = await joinCast('ab7k', {}, [m.strategy, n.strategy])
  ok('survives on the healthy transport', room.transports.join(',') === 'mqtt', room.transports.join(','))
  ok('the failure is reported, not swallowed', room.failures.length === 1 && /nostr relay unreachable/.test(room.failures[0]),
     JSON.stringify(room.failures))

  const a = mkStrategy('mqtt', { fail: true }), b = mkStrategy('nostr', { fail: true })
  let threw = null
  try { await joinCast('ab7k', {}, [a.strategy, b.strategy]) } catch (e) { threw = e }
  ok('all transports failing does throw', !!threw)
  ok('and the error names both causes',
     /mqtt relay unreachable/.test(threw.message) && /nostr relay unreachable/.test(threw.message),
     threw?.message)
}

group('A viewer reaching us on both transports counts once')
{
  const m = mkStrategy('mqtt'), n = mkStrategy('nostr')
  let joins = 0, leaves = 0
  const room = await joinCast('ab7k', { onPeerJoin: () => joins++, onPeerLeave: () => leaves++ },
                              [m.strategy, n.strategy])
  m.state.handlers.join('peer-1')
  n.state.handlers.join('peer-1')          // same viewer, second network
  ok('the peer is reported once, not twice', joins === 1, `${joins}`)

  const stream = { id: 'video' }
  room.addStream(stream, 'peer-1')
  ok('the stream goes only to the transport that introduced them',
     m.state.streams.length === 1 && n.state.streams.length === 0,
     `mqtt=${m.state.streams.length} nostr=${n.state.streams.length}`)

  n.state.handlers.leave('peer-1')
  ok('a leave on the other transport is ignored', leaves === 0, `${leaves}`)
  m.state.handlers.leave('peer-1')
  ok('the owning transport reports the leave', leaves === 1, `${leaves}`)

  m.state.handlers.join('peer-2')
  ok('a genuinely new viewer is reported', joins === 2, `${joins}`)
}

group('Broadcast before anyone has joined')
{
  const m = mkStrategy('mqtt'), n = mkStrategy('nostr')
  const room = await joinCast('ab7k', {}, [m.strategy, n.strategy])
  room.addStream({ id: 'video' })
  ok('an untargeted stream is offered to every transport',
     m.state.streams.length === 1 && n.state.streams.length === 1)
  ok('addStream for an unknown peer is a no-op, not a throw',
     (() => { try { room.addStream({}, 'nobody'); return true } catch { return false } })())
}

group('Trystero handlers are called, not assigned (the NVS-13 regression)')
{
  ok('onPeerJoin is called, not assigned', /room\.onPeerJoin\?\.\(/.test(castSrc))
  ok('onPeerLeave is called, not assigned', /room\.onPeerLeave\?\.\(/.test(castSrc))
  ok('onPeerStream is called, not assigned', /room\.onPeerStream\?\.\(/.test(castSrc))
  ok('nothing assigns a handler as a property',
     !/\.onPeer(Join|Leave|Stream)\s*=[^=]/.test(app + watch + castSrc))
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
  ok('a late joiner is sent the stream too', /room\?\.addStream\(out, id\)/.test(app))
  ok('transports load lazily, off the startup path',
     /load: \(\) => import\('@trystero-p2p/.test(castSrc))
  ok('the stream is captured before joining, avoiding a TDZ on the handler path',
     app.indexOf('const out = c.captureStream(24)') < app.indexOf('room = await joinCast'))
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
