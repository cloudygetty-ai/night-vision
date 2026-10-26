// Run: node tests/capture.test.mjs
// The resolution chain: pick the sensor mode with the most USABLE pixels after
// the portrait cover-crop, then render stills at that true detail instead of
// reading back the screen-sized preview buffer.
import fs from 'node:fs'
import path from 'node:path'
import { rankCameraModes, usablePixels, captureSize, fitCanvas } from '../src/engine.js'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }
const group = n => console.log(`\n${n}`)

const gl = fs.readFileSync(path.join(import.meta.dirname, '../src/gl.js'), 'utf8')
const app = fs.readFileSync(path.join(import.meta.dirname, '../src/App.jsx'), 'utf8')
const PHONE = 1179 / 2556        // iPhone portrait

group('Usable pixels after the cover-crop')
{
  ok('16:9 4K loses most of its width to a portrait crop',
     Math.abs(usablePixels(3840, 2160, PHONE) / 1e6 - 2.15) < 0.05,
     `${(usablePixels(3840, 2160, PHONE) / 1e6).toFixed(2)}MP`)
  ok('4:3 at the same long edge keeps far more',
     usablePixels(4032, 3024, PHONE) > usablePixels(3840, 2160, PHONE) * 1.8,
     `${(usablePixels(4032, 3024, PHONE) / 1e6).toFixed(2)}MP vs ${(usablePixels(3840, 2160, PHONE) / 1e6).toFixed(2)}MP`)
  ok('a frame already matching the display loses nothing',
     usablePixels(1179, 2556, PHONE) === 1179 * 2556)
  ok('handles a landscape display too', usablePixels(4032, 3024, 16 / 9) > 0)
  ok('degenerate input is zero, not NaN', usablePixels(0, 0, PHONE) === 0)
}

group('Mode ranking picks detail, not headline megapixels')
{
  const ranked = rankCameraModes({ width: { max: 4032 }, height: { max: 3024 } }, PHONE)
  ok('returns candidates', ranked.length >= 3, `${ranked.length}`)
  ok('ranks 4:3 first for a portrait screen', ranked[0].aspect === '4:3', ranked[0].aspect)
  ok('ranks 16:9 last', ranked[ranked.length - 1].aspect === '16:9')
  ok('is sorted by usable pixels descending',
     ranked.every((m, i) => i === 0 || ranked[i - 1].usable >= m.usable))
  ok('the winner nearly doubles the 16:9 option',
     ranked[0].usable / ranked[ranked.length - 1].usable > 1.7,
     `${(ranked[0].usable / ranked[ranked.length - 1].usable).toFixed(2)}×`)
  ok('never exceeds the sensor maximum',
     ranked.every(m => m.width <= 4032 && m.height <= 3024),
     JSON.stringify(ranked[0]))

  // a landscape viewport should prefer a wide mode instead
  const wide = rankCameraModes({ width: { max: 4032 }, height: { max: 3024 } }, 16 / 9)
  // cropping a 4:3 frame to 16:9 yields the same pixels as a native 16:9
  // mode, so a tie at the top is correct — what matters is the pixel count
  const native169 = wide.find(m => m.aspect === '16:9')
  ok('a 16:9 viewport loses nothing to the chosen mode', wide[0].usable >= native169.usable,
     `${wide[0].aspect} ${(wide[0].usable / 1e6).toFixed(2)}MP vs 16:9 ${(native169.usable / 1e6).toFixed(2)}MP`)

  ok('survives missing capabilities', rankCameraModes({}, PHONE).length > 0)
  ok('a 1080p-only sensor still ranks', rankCameraModes({ width: { max: 1920 }, height: { max: 1080 } }, PHONE).length > 0)
}

group('Still capture uses real detail, not the preview buffer')
{
  const preview = fitCanvas(393, 852, 3, 'ULTRA', 4032, 3024, false, 0.73)  // governor-shrunk
  const shot = captureSize(preview.w, preview.h, 4032, 3024, 1)
  ok('preview is smaller than the sensor can supply', preview.w * preview.h < 4.2e6,
     `${preview.w}×${preview.h}`)
  ok('capture is larger than the preview buffer', shot.w * shot.h > preview.w * preview.h,
     `${shot.w}×${shot.h} vs ${preview.w}×${preview.h}`)
  ok('capture reaches the full crop height', shot.h === 3024, `h=${shot.h}`)
  ok('capture is not upscaled at 1×', shot.upscaled === false)
  const gain = (shot.w * shot.h) / (preview.w * preview.h)
  ok(`captures ${gain.toFixed(1)}× the pixels of the live buffer`, gain > 2)
  ok('keeps the framing aspect', Math.abs((shot.w / shot.h) - (preview.w / preview.h)) < 0.01)
}

group('Capture is honest about zoom')
{
  const wide = captureSize(1179, 2556, 4032, 3024, 1)
  const zoomed = captureSize(1179, 2556, 4032, 3024, 3)
  ok('zooming reduces the real detail available', zoomed.w * zoomed.h < wide.w * wide.h)
  ok('flags that a deep zoom is upscaled', zoomed.upscaled === true)
  ok('never drops below the preview size', zoomed.w >= 1179)
  ok('respects a pixel budget', captureSize(1179, 2556, 20000, 15000, 1, 12e6).w * captureSize(1179, 2556, 20000, 15000, 1, 12e6).h <= 12e6)
  ok('degenerate input returns something renderable', captureSize(0, 0, 0, 0, 1).w >= 2)
}

group('Renderer capture path')
{
  ok('captureFull exists and is exported', /function captureFull/.test(gl) && /captureFull,/.test(gl))
  ok('refuses to run on a lost context', /captureFull[\s\S]{0,300}isContextLost\(\)\) return null/.test(gl))
  ok('uses RGBA8, not half-float, to bound peak memory',
     /captureFull[\s\S]{0,1600}gl\.RGBA, w, h, 0, gl\.RGBA, gl\.UNSIGNED_BYTE, null/.test(gl))
  ok('frees every temporary buffer in a finally block',
     /finally \{[\s\S]{0,260}deleteTexture[\s\S]{0,120}deleteFramebuffer/.test(gl))
  ok('restores the preview viewport afterwards',
     /finally \{[\s\S]{0,400}gl\.viewport\(0, 0, W, H\)/.test(gl))
  ok('flips GL bottom-up rows into image order', /h - 1 - y/.test(gl))
  ok('stacks multiple frames for denoise', /uAlpha, i === 0 \? 1 : 1 \/ \(i \+ 1\)/.test(gl))
  ok('drawDisplay can target an offscreen FBO', /function drawDisplay\(tex, o, target = null/.test(gl))
  ok('checks framebuffer completeness before using it', /checkFramebufferStatus[\s\S]{0,80}throw/.test(gl))
}

group('Wired into the app')
{
  ok('shutter renders a full-detail still', /captureFull\(v,/.test(app))
  ok('falls back to the canvas if capture fails', /if \(!url\) \{[\s\S]{0,60}toDataURL/.test(app))
  ok('camera asks for a 4:3 mode first', /width: \{ ideal: 4032 \}/.test(app))
  ok('probes ranked modes against the real viewport', /rankCameraModes\(caps, aspect\)/.test(app))
  ok('keeps whichever mode measured best', /got > best\.usable/.test(app))
  ok('JPEG quality raised for the larger frame', /toDataURL\('image\/jpeg', 0\.95\)/.test(app))
  ok('stores the still resolution with the shot', /w: shotW, h: shotH/.test(app))
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
