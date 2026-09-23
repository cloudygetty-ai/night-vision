// ═════════════════════════════════════════════════════════════════════════
// NVS-15 GPU PIPELINE
//   pass 1  ACCUMULATE  video → cover-crop → mirror → temporal blend (ping-pong FBO)
//   pass 2  DISPLAY     zoom → mode shader → edge overlay → vignette → screen
// Everything runs on the GPU. The CPU only uploads one video texture per frame.
// ═════════════════════════════════════════════════════════════════════════

export const MODES = [
  { id: 'RAW',     label: 'RAW',     color: '#e8e8e8', idx: 0, denoise: 0 },
  { id: 'NVG',     label: 'NIGHT',   color: '#39ff6a', idx: 1, denoise: 0.55 },
  { id: 'THERMAL', label: 'THERMAL', color: '#ff7a1a', idx: 2, denoise: 0.3 },
  { id: 'WHT',     label: 'WHT-HOT', color: '#f4f4f4', idx: 3, denoise: 0.3 },
  { id: 'BLK',     label: 'BLK-HOT', color: '#b8b8b8', idx: 4, denoise: 0.3 },
  { id: 'RAINBOW', label: 'RAINBOW', color: '#3fd4ff', idx: 5, denoise: 0.3 },
  { id: 'ARCTIC',  label: 'ARCTIC',  color: '#4f9dff', idx: 6, denoise: 0.3 },
  { id: 'TACT',    label: 'TACTICAL',color: '#f2d85a', idx: 7, denoise: 0.1 },
  { id: 'DEHAZE',  label: 'DEHAZE',  color: '#6ad6ff', idx: 8, denoise: 0.1 },
  { id: 'ASTRO',   label: 'ASTRO',   color: '#a8c0ff', idx: 9, denoise: 0.93 },
]

const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = vec2(aPos.x*.5+.5, .5-aPos.y*.5); gl_Position = vec4(aPos,0.,1.); }`

// Display pass reads an FBO (already bottom-up in GL space) so it must NOT flip.
const VS_FLAT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos,0.,1.); }`

const ACC_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uCur, uPrev;
uniform float uAlpha, uMirror;
uniform vec2 uScale, uShift;
void main(){
  vec2 uv = (vUv - .5) * uScale + .5 + uShift;
  if (uMirror > .5) uv.x = 1. - uv.x;
  vec3 c = texture(uCur, uv).rgb;
  vec3 p = texture(uPrev, vUv).rgb;
  o = vec4(mix(p, c, uAlpha), 1.);
}`

const DISP_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex, uLut;
uniform int uMode;
uniform float uGain, uTime, uZoom, uEdge, uSharp;
uniform vec2 uRes;
float L(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
float H(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
vec3 S(vec2 uv){ return texture(uTex, uv).rgb; }
vec3 LUT(float v, float row){ return texture(uLut, vec2(clamp(v,0.,1.), (row+.5)/3.)).rgb; }
void main(){
  vec2 uv = (vUv - .5) / uZoom + .5;
  vec2 px = 1. / uRes;
  vec3 c = S(uv);
  if (uSharp > 0.) {                                   // detail recovery on the clean stacked image
    vec3 b = (S(uv+vec2(px.x,0.)) + S(uv-vec2(px.x,0.)) + S(uv+vec2(0.,px.y)) + S(uv-vec2(0.,px.y))) * .25;
    vec3 b2 = (S(uv+px) + S(uv-px) + S(uv+vec2(px.x,-px.y)) + S(uv+vec2(-px.x,px.y))) * .25;
    c = clamp(c + (c - mix(b, b2, .35)) * uSharp, 0., 1.);
  }
  float l = L(c);
  float g = uGain;
  vec3 col;

  if (uMode == 0) {                                   // RAW
    col = c * g;
  } else if (uMode == 1) {                            // NIGHT VISION
    float v = pow(clamp(l*g*2.4, 0., 1.), .6);
    float bl = 0.;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * .7854;
      bl += L(S(uv + vec2(cos(a), sin(a)) * px * 5.));
    }
    bl /= 8.;
    v += max(bl*g*2.4 - .55, 0.) * .7;                // phosphor bloom
    col = vec3(.12, 1., .34) * v;
    col += (H(vUv*uRes + uTime) - .5) * (.11*(1.-v) + .02);  // signal-adaptive grain
    col *= 1. - .09 * mod(floor(gl_FragCoord.y), 2.); // scanlines
  } else if (uMode == 2) { col = LUT(l*g*1.3, 0.);    // THERMAL (iron)
  } else if (uMode == 3) { float v = clamp((l*g-.5)*1.7+.5, 0., 1.); col = vec3(v);
  } else if (uMode == 4) { float v = clamp((l*g-.5)*1.7+.5, 0., 1.); col = vec3(1.-v);
  } else if (uMode == 5) { col = LUT(l*g*1.2, 1.);    // RAINBOW
  } else if (uMode == 6) { col = LUT(l*g*1.3, 2.);    // ARCTIC
  } else if (uMode == 7) {                            // TACTICAL: unsharp + contrast
    vec3 b = (S(uv+vec2(px.x,0.)) + S(uv-vec2(px.x,0.)) + S(uv+vec2(0.,px.y)) + S(uv-vec2(0.,px.y))) * .25;
    col = c + (c - b) * 1.8;
    col = (col - .5) * 1.28 + .5;
    col *= g * vec3(.95, 1.04, .9);
  } else if (uMode == 8) {                            // DEHAZE: dark-channel prior
    float d = 1.;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
      vec3 s = S(uv + vec2(float(i), float(j)) * px * 7.);
      d = min(d, min(s.r, min(s.g, s.b)));
    }
    float t = max(1. - .9*d, .22);
    col = ((c - .86) / t + .86) * g;
  } else {                                            // ASTRO
    float v = pow(clamp(l*g*3.2, 0., 1.), .5);
    col = v * vec3(.84, .92, 1.08);
  }

  if (uEdge > 0.) {
    float gx = L(S(uv+vec2(px.x,0.))) - L(S(uv-vec2(px.x,0.)));
    float gy = L(S(uv+vec2(0.,px.y))) - L(S(uv-vec2(0.,px.y)));
    col = mix(col, vec3(1., .82, .18), smoothstep(.05, .18, length(vec2(gx,gy))) * uEdge);
  }

  vec2 q = vUv - .5;
  col *= 1. - dot(q,q) * .85;                         // lens vignette
  o = vec4(clamp(col, 0., 1.), 1.);
}`


const PIP_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uCur;
uniform float uMirror;
uniform vec2 uScale;
void main(){
  vec2 uv = (vUv - .5) * uScale + .5;
  if (uMirror > .5) uv.x = 1. - uv.x;
  o = vec4(texture(uCur, uv).rgb, 1.);
}`

function buildLut() {
  const stops = [
    [[0,0,0],[.2,0,.35],[.45,.05,.55],[.8,.15,.25],[1,.55,0],[1,.9,.2],[1,1,1]], // iron
    [[0,0,.5],[0,.3,1],[0,1,1],[0,1,.2],[1,1,0],[1,.4,0],[1,0,0]],             // rainbow
    [[0,0,.05],[0,.1,.35],[.05,.35,.75],[.3,.7,1],[.75,.95,1],[1,1,1]],          // arctic
  ]
  const data = new Uint8Array(256 * 3 * 4)
  stops.forEach((s, row) => {
    for (let i = 0; i < 256; i++) {
      const t = (i / 255) * (s.length - 1)
      const k = Math.min(s.length - 2, Math.floor(t)), f = t - k
      const o = (row * 256 + i) * 4
      for (let ch = 0; ch < 3; ch++) data[o + ch] = Math.round((s[k][ch] + (s[k + 1][ch] - s[k][ch]) * f) * 255)
      data[o + 3] = 255
    }
  })
  return data
}

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src); gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
  return s
}
function program(gl, fs, vs = VS) {
  const p = gl.createProgram()
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs))
  gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
  const u = {}
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name) }
  return { p, u }
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', {
    preserveDrawingBuffer: true, antialias: false, alpha: false, depth: false,
    powerPreference: 'high-performance',
  })
  if (!gl) return null

  const halfFloat = !!gl.getExtension('EXT_color_buffer_float')
  const acc = program(gl, ACC_FS)
  const disp = program(gl, DISP_FS, VS_FLAT)
  const pip = program(gl, PIP_FS)

  const vbo = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const mkTex = () => {
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  const video = mkTex()
  const video2 = mkTex()
  const lut = mkTex()
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLut())

  let W = 0, H = 0, ping = [], cur = 0, fresh = true

  function resize(w, h) {
    if (w === W && h === H) return
    W = w; H = h; canvas.width = w; canvas.height = h
    ping.forEach(b => { gl.deleteTexture(b.tex); gl.deleteFramebuffer(b.fbo) })
    ping = [0, 1].map(() => {
      const tex = mkTex()
      if (halfFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      return { tex, fbo }
    })
    fresh = true
  }

  function reset() { fresh = true }

  function render(el, o) {
    const vw = el.videoWidth, vh = el.videoHeight
    if (!vw || !vh || !W) return false

    gl.bindTexture(gl.TEXTURE_2D, video)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el)

    // cover-fit crop
    const ca = W / H, va = vw / vh
    const sx = va > ca ? ca / va : 1
    const sy = va > ca ? 1 : va / ca

    // pass 1 — temporal accumulation into the other ping-pong buffer
    const src = ping[cur], dst = ping[1 - cur]
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo)
    gl.viewport(0, 0, W, H)
    gl.useProgram(acc.p)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, video)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.tex)
    gl.uniform1i(acc.u.uCur, 0); gl.uniform1i(acc.u.uPrev, 1)
    gl.uniform1f(acc.u.uAlpha, fresh ? 1 : Math.max(0.04, 1 - o.denoise))
    gl.uniform1f(acc.u.uMirror, o.mirror ? 1 : 0)
    gl.uniform2f(acc.u.uScale, sx, sy)
    gl.uniform2f(acc.u.uShift, o.shift ? o.shift[0] : 0, o.shift ? o.shift[1] : 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    cur = 1 - cur; fresh = false

    // pass 2 — mode shader to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, W, H)
    gl.useProgram(disp.p)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dst.tex)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lut)
    gl.uniform1i(disp.u.uTex, 0); gl.uniform1i(disp.u.uLut, 1)
    gl.uniform1i(disp.u.uMode, o.mode)
    gl.uniform1f(disp.u.uGain, o.gain)
    gl.uniform1f(disp.u.uTime, o.time % 1000)
    gl.uniform1f(disp.u.uZoom, o.zoom)
    gl.uniform1f(disp.u.uEdge, o.edge ? 0.85 : 0)
    gl.uniform1f(disp.u.uSharp, o.sharp || 0)
    gl.uniform2f(disp.u.uRes, W, H)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    return { sx, sy }
  }


  // Picture-in-picture: second camera composited into the same GPU frame,
  // so photos, recordings and casts all contain both views.
  function renderPip(el, r, mirror, border) {
    const vw = el.videoWidth, vh = el.videoHeight
    if (!vw || !vh || !W) return
    const x = Math.round(r.x * W), w = Math.round(r.w * W), h = Math.round(r.h * H)
    const y = Math.round(H - (r.y * H) - h)                  // GL origin is bottom-left
    const b = Math.max(2, Math.round(W * 0.004))
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(x - b, y - b, w + 2 * b, h + 2 * b)
    gl.clearColor(border[0], border[1], border[2], 1); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.scissor(x, y, w, h)
    gl.viewport(x, y, w, h)
    gl.bindTexture(gl.TEXTURE_2D, video2)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el)
    const ca = w / h, va = vw / vh
    gl.useProgram(pip.p)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, video2)
    gl.uniform1i(pip.u.uCur, 0)
    gl.uniform1f(pip.u.uMirror, mirror ? 1 : 0)
    gl.uniform2f(pip.u.uScale, va > ca ? ca / va : 1, va > ca ? 1 : va / ca)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.disable(gl.SCISSOR_TEST)
    gl.viewport(0, 0, W, H)
  }

  return { gl, resize, render, renderPip, reset, halfFloat }
}

// Map a point in normalized raw-video space (0..1) to normalized screen space.
export function videoToScreen(x, y, { sx, sy, zoom, mirror }) {
  let u = (x - 0.5) / sx + 0.5
  const v = (y - 0.5) / sy + 0.5
  if (mirror) u = 1 - u
  return [(u - 0.5) * zoom + 0.5, (v - 0.5) * zoom + 0.5]
}
