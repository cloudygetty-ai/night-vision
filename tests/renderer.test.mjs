// Regression: the WebGL renderer must be constructed exactly once, and the
// motion detector / aligner must not be re-instantiated on resolution change.
import { JSDOM } from '../node_modules/jsdom/lib/api.js'
import { build } from '../node_modules/vite/dist/node/index.js'
import react from '../node_modules/@vitejs/plugin-react/dist/index.js'
process.on('unhandledRejection', () => {})

const out = await build({ root: new URL('..', import.meta.url).pathname, configFile: false, plugins: [react()], logLevel: 'silent',
  build: { write: false, rollupOptions: { output: { inlineDynamicImports: true } } } })
let js = out.output.find(o => o.type === 'chunk' && o.isEntry).code

// instrument: count getContext('webgl2') acquisitions on the visible canvas
js = 'globalThis.__glCount = 0;\n' + js

const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x.test/' })
const w = dom.window
let glCount = 0, resizeCount = 0
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
w.ResizeObserver = class { observe() {} disconnect() {} }
w.indexedDB = { open: () => ({}) }

// a fake camera so the stream-attach effect (and its loadedmetadata listener) runs
const track = {
  kind: 'video', readyState: 'live',
  getCapabilities: () => ({ width: { max: 3840 }, height: { max: 2160 } }),
  getSettings: () => ({ width: 1920, height: 1080 }),
  applyConstraints: () => Promise.resolve(),
  addEventListener() {}, removeEventListener() {}, stop() {},
}
const fakeStream = { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] }
w.navigator.mediaDevices = { getUserMedia: () => Promise.resolve(fakeStream), enumerateDevices: () => Promise.resolve([]) }
w.HTMLMediaElement.prototype.play = function () { return Promise.resolve() }
Object.defineProperty(w.HTMLMediaElement.prototype, 'srcObject', { set() {}, get() { return fakeStream }, configurable: true })
Object.defineProperty(w, 'crypto', { value: globalThis.crypto })
w.fetch = globalThis.fetch
w.console.error = () => {}

// fake a working WebGL2 context so the renderer actually constructs
const fakeGl = () => new Proxy({
  canvas: { width: 0, height: 0 },
  getExtension: () => ({}), getParameter: () => 4096, createShader: () => ({}),
  shaderSource() {}, compileShader() {}, getShaderParameter: () => true, getShaderInfoLog: () => '',
  createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true,
  getProgramInfoLog: () => '', useProgram() {}, createBuffer: () => ({}), bindBuffer() {}, bufferData() {},
  getAttribLocation: () => 0, enableVertexAttribArray() {}, vertexAttribPointer() {},
  getUniformLocation: () => ({}), createTexture: () => ({}), bindTexture() {}, texParameteri() {},
  texImage2D() {}, createFramebuffer: () => ({}), bindFramebuffer() {}, framebufferTexture2D() {},
  checkFramebufferStatus: () => 36053, viewport() {}, drawArrays() {}, clear() {}, clearColor() {},
  deleteTexture() {}, deleteFramebuffer() {}, enable() {}, disable() {}, scissor() {}, blendFunc() {},
  uniform1f() {}, uniform2f() {}, uniform1i() {}, uniform3f() {}, uniform4f() {}, activeTexture() {},
  pixelStorei() {}, finish() {}, flush() {}, texSubImage2D() {}, readPixels() {}, getError: () => 0,
}, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 1 : () => ({}))) })

const origCreate = w.document.createElement.bind(w.document)
w.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === 'webgl2') {
    // only count contexts on the on-screen canvas (offscreen 2d helpers excluded)
    if (this.isConnected || this.__main) { glCount++ }
    const g = fakeGl(); g.canvas = this; return g
  }
  return { drawImage() {}, getImageData: (x, y, cw, ch) => ({ data: new Uint8ClampedArray(cw * ch * 4) }),
           fillRect() {}, fillText() {}, measureText: () => ({ width: 10 }), putImageData() {}, save() {}, restore() {},
           set fillStyle(v) {}, set font(v) {}, set textBaseline(v) {} }
}

try { w.eval(js) } catch (e) { console.log('THROW', e.message) }
await new Promise(r => setTimeout(r, 400))
const afterMount = glCount

// simulate the camera reporting 4K, which previously re-ran the renderer effect
const vids = [...w.document.querySelectorAll('video')]
for (const v of vids) {
  Object.defineProperty(v, 'videoWidth', { value: 3840, configurable: true })
  Object.defineProperty(v, 'videoHeight', { value: 2160, configurable: true })
  v.dispatchEvent(new w.Event('loadedmetadata'))
}
await new Promise(r => setTimeout(r, 600))

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }
console.log('\nSingle renderer guarantee')
ok('exactly one WebGL2 context at mount', afterMount === 1, `got ${afterMount}`)
ok('no extra context after camera reports 4K', glCount === afterMount, `${afterMount} → ${glCount}`)
ok('root still has a single mounted tree', w.document.getElementById('root').children.length === 1)
console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
