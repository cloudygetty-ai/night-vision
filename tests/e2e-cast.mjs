// End-to-end cast test: two real browsers, real WebRTC, a local MQTT broker.
//
//   npm run test:e2e
//
// This exists because casting failed for weeks while every unit test passed.
// Source-matching cannot catch an upstream API inversion; only running the
// thing can. It needs devDependencies (aedes, ws, playwright) and a built
// dist/, so it is kept out of `npm test`.
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Aedes } from 'aedes'
import { WebSocketServer, createWebSocketStream } from 'ws'
import { chromium } from 'playwright'

const DIST = new URL('../dist', import.meta.url).pathname
const BROKER_PORT = 8899, HTTP_PORT = 8877

// ── local MQTT broker over websockets ──
const aedes = await Aedes.createBroker()
const wss = new WebSocketServer({ port: BROKER_PORT })
let brokerClients = 0, published = 0
wss.on('connection', ws => {
  brokerClients++
  aedes.handle(createWebSocketStream(ws, { decodeStrings: false }))
})
aedes.on('publish', () => published++)

// ── static server for the built app ──
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
createServer((req, res) => {
  const url = req.url.split('?')[0]
  let f = join(DIST, url === '/' ? 'index.html' : url)
  if (!existsSync(f) || url === '/') f = join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' })
  res.end(readFileSync(f))
}).listen(HTTP_PORT)

const log = []
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
         '--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
})
const ctx = await browser.newContext({ permissions: ['camera'], ignoreHTTPSErrors: true })

const wire = (page, tag) => {
  page.on('console', m => { const t = m.text(); if (!/favicon|Download the React/.test(t)) log.push(`[${tag}] ${m.type()}: ${t.slice(0, 200)}`) })
  page.on('pageerror', e => log.push(`[${tag}] PAGEERROR: ${e.message.slice(0, 200)}`))
}
// point both pages at the local broker
const init = `
window.__NVS_RELAYS = { mqtt: ['ws://localhost:${BROKER_PORT}'], nostr: [] };
// No STUN is reachable from this container, so force host candidates and let
// trystero resolve mDNS names to loopback — otherwise ICE stalls and no peer
// ever connects, which would look like an app bug.
window.__NVS_RTC = { rtcConfig: { iceServers: [] }, _test_only_mdnsHostFallbackToLoopback: true };
`

const sender = await ctx.newPage(); wire(sender, 'phone'); await sender.addInitScript(init)
await sender.goto(`http://localhost:${HTTP_PORT}/`)
await sender.waitForTimeout(4000)

// start the cast
const castBtn = sender.getByText('CAST', { exact: true })
console.log('CAST tool found:', await castBtn.count())
if (await castBtn.count()) { await castBtn.first().click(); await sender.waitForTimeout(800) }
const sheet1 = (await sender.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
console.log('sheet after tapping CAST:', sheet1.slice(-260))

const startBtn = sender.getByText(/START CAST/i)
console.log('START CAST button found:', await startBtn.count())
if (await startBtn.count()) { await startBtn.first().click() }
await sender.waitForTimeout(7000)

// what happened to the sheet and the code?
const diag = await sender.evaluate(() => {
  const txt = document.body.innerText
  const codeEl = [...document.querySelectorAll('div')].find(e =>
    e.previousElementSibling && /CAST CODE/.test(e.previousElementSibling.textContent) )
  return {
    sheetOpen: /REMOTE CAST/.test(txt),
    codeLabelShown: /CAST CODE/.test(txt),
    code: codeEl ? codeEl.textContent.trim() : null,
    castPill: /📡/.test(txt),
  }
})
console.log('sheet still open:', diag.sheetOpen, '| CAST CODE label:', diag.codeLabelShown, '| code:', diag.code)
await sender.screenshot({ path: new URL('../dist/.e2e-sender.png', import.meta.url).pathname })
const code = diag.code
const senderText = (await sender.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300)
console.log('\n── SENDER ──')
console.log('code on screen:', code)
console.log('ui:', senderText.slice(0, 220))

// viewer joins
const viewer = await ctx.newPage(); wire(viewer, 'watch'); await viewer.addInitScript(init)
await viewer.goto(`http://localhost:${HTTP_PORT}/?watch=${code || 'ZZZZ'}`)
await viewer.waitForTimeout(9000)

const got = await viewer.evaluate(() => {
  const v = document.querySelector('video')
  return {
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 220),
    hasVideo: !!v,
    hasStream: !!(v && v.srcObject),
    tracks: v && v.srcObject ? v.srcObject.getTracks().map(t => `${t.kind}:${t.readyState}`) : [],
    w: v?.videoWidth || 0, h: v?.videoHeight || 0,
  }
})
console.log('\n── VIEWER ──')
console.log('ui:', got.text)
console.log('video element:', got.hasVideo, '| stream attached:', got.hasStream)
console.log('tracks:', got.tracks.join(', ') || 'none', '| frame size:', got.w + 'x' + got.h)

// did the sender notice the viewer?
await sender.waitForTimeout(2500)
const senderCast = await sender.evaluate(() => {
  const t = document.body.innerText
  const m = t.match(/(\d+ watching|Waiting for a viewer|Connecting…|Could not reach[^\n]*)/)
  return { panel: m ? m[0] : '(no cast status found)', pill: (t.match(/📡\s*\d+/) || ['-'])[0] }
})
console.log('\n── SENDER SAW ──')
console.log('panel:', senderCast.panel, '| pill:', senderCast.pill)

console.log('\n── SIGNALLING ──')
console.log('broker connections:', brokerClients, '| messages published:', published)

console.log('\n── CONSOLE ──')
console.log(log.slice(0, 25).join('\n') || '(clean)')

const ok = got.hasStream && got.w > 0
console.log('\n' + (ok ? '✓ CAST WORKS end-to-end' : '✗ CAST FAILED'))
await browser.close(); process.exit(ok ? 0 : 1)
