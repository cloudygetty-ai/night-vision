// Run: node tests/shader.test.mjs
// Verifies the accumulation pass's coordinate spaces two ways:
//  A) static analysis of the GLSL — the FBO must never be sampled with flipped uv
//  B) a CPU simulation of the ping-pong loop — history must not mirror
import fs from 'node:fs'
import path from 'node:path'

const src = fs.readFileSync(path.join(import.meta.dirname, '../src/gl.js'), 'utf8')
const shader = n => src.match(new RegExp('const ' + n + ' = `([\\s\\S]*?)`'))?.[1] || ''

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }
const group = n => console.log(`\n${n}`)

// ── A. static: which varying samples which texture ────────────────────────
group('Coordinate spaces in ACC_FS')
{
  const acc = shader('ACC_FS'), vs = shader('VS')
  const flipped = vs.match(/vUv\s*=\s*vec2\([^;]*\)/)?.[0] || ''
  ok('VS provides a Y-flipped vUv for the video', /\.5\s*-\s*aPos\.y/.test(flipped), flipped)
  ok('VS also provides an un-flipped FBO varying', /out vec2 vFbo/.test(vs) && /vFbo\s*=\s*aPos\s*\*\s*\.5\s*\+\s*\.5/.test(vs))

  const prev = acc.match(/texture\(\s*uPrev\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]
  const cur = acc.match(/texture\(\s*uCur\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]
  ok('uPrev (the FBO) is sampled in un-flipped FBO space', prev === 'vFbo', `sampled with "${prev}"`)
  ok('uCur (the video) is sampled with the flipped-derived uv', cur === 'uv', `sampled with "${cur}"`)
  ok('uPrev is NOT sampled with vUv (this is the mirror bug)', prev !== 'vUv')
}

group('Display pass must not re-flip')
{
  const vsFlat = shader('VS_FLAT')
  ok('VS_FLAT is un-flipped', /vUv\s*=\s*aPos\s*\*\s*\.5\s*\+\s*\.5/.test(vsFlat))
  ok('display program is built with VS_FLAT', /program\(gl,\s*DISP_FS,\s*VS_FLAT\)/.test(src))
  ok('accumulation program uses the flipping VS', /program\(gl,\s*ACC_FS\)/.test(src) || /program\(gl,\s*ACC_FS,\s*VS\)/.test(src))
}

// ── B. dynamic: simulate the ping-pong accumulation loop ──────────────────
// Model a 1-D vertical column. The shader writes output row r by reading
// history at the coordinate the shader specifies. If that read is flipped,
// row r mixes in row (N-1-r) and the result becomes mirror-symmetric.
group('Accumulation loop simulation')
{
  const N = 16
  // an asymmetric scene: bright at the top, dark at the bottom
  const scene = Array.from({ length: N }, (_, r) => (N - 1 - r) / (N - 1))

  const runLoop = (flipHistory, frames = 60, alpha = 1 - 0.55) => {  // NIGHT denoise
    let hist = scene.slice()                                          // first frame: alpha = 1
    for (let f = 1; f < frames; f++) {
      const out = new Array(N)
      for (let r = 0; r < N; r++) {
        const hr = flipHistory ? N - 1 - r : r
        out[r] = hist[hr] * (1 - alpha) + scene[r] * alpha
      }
      hist = out
    }
    return hist
  }

  const mirrorErr = a => {
    let m = 0
    for (let r = 0; r < N; r++) m = Math.max(m, Math.abs(a[r] - a[N - 1 - r]))
    return m
  }
  const sceneErr = a => {
    let m = 0
    for (let r = 0; r < N; r++) m = Math.max(m, Math.abs(a[r] - scene[r]))
    return m
  }

  const good = runLoop(false), bad = runLoop(true)
  ok('correct sampling converges to the true scene', sceneErr(good) < 0.01, `max err ${sceneErr(good).toFixed(4)}`)
  ok('correct sampling stays asymmetric (no mirror)', mirrorErr(good) > 0.9, `mirror delta ${mirrorErr(good).toFixed(3)}`)
  // At NIGHT's blend rate the corruption is a PARTIAL mirror ghost, not a
  // perfect reflection — which is exactly how it looks on screen.
  ok('flipped sampling pulls the image toward its own mirror (ghost)',
     mirrorErr(bad) < mirrorErr(good) * 0.5 && mirrorErr(bad) > 0.05,
     `ghost ${mirrorErr(bad).toFixed(3)} vs clean ${mirrorErr(good).toFixed(3)}`)
  // and at high denoise it collapses to a near-perfect reflection
  const astro = runLoop(true, 200, Math.max(0.04, 1 - 0.93))
  ok('at ASTRO denoise it becomes a near-perfect reflection', mirrorErr(astro) < 0.08, `mirror delta ${mirrorErr(astro).toFixed(3)}`)
  ok('flipped sampling loses the real scene (the reported bug)', sceneErr(bad) > 0.2, `max err ${sceneErr(bad).toFixed(3)}`)

  // the artefact must worsen with denoise, matching NIGHT/ASTRO being worst
  const errAt = d => sceneErr(runLoop(true, 60, Math.max(0.04, 1 - d)))
  ok('bug severity rises with denoise (RAW clean, ASTRO worst)',
     errAt(0) < 0.01 && errAt(0.93) > errAt(0.55) && errAt(0.55) > 0.2,
     `RAW ${errAt(0).toFixed(3)} NIGHT ${errAt(0.55).toFixed(3)} ASTRO ${errAt(0.93).toFixed(3)}`)
}

group('Texture wrapping cannot create reflections')
{
  const mk = src.match(/const mkTex = \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''
  ok('WRAP_S is CLAMP_TO_EDGE', /TEXTURE_WRAP_S,\s*gl\.CLAMP_TO_EDGE/.test(mk))
  ok('WRAP_T is CLAMP_TO_EDGE', /TEXTURE_WRAP_T,\s*gl\.CLAMP_TO_EDGE/.test(mk))
  ok('no MIRRORED_REPEAT anywhere', !/MIRRORED_REPEAT/.test(src))
  ok('FBO textures are built with mkTex (so they inherit clamping)',
     /ping = \[0, 1\]\.map\(\(\) => \{\s*\n\s*const tex = mkTex\(\)/.test(src))
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
