// Run: node tests/resolution.test.mjs
import { fitCanvas, pickBitrate, resLabel, QUALITY_CAP } from '../src/engine.js'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }
const group = n => console.log(`\n${n}`)

// Real device profiles: CSS viewport, DPR, sensor resolution
const IPHONE = { cssW: 393, cssH: 852, dpr: 3, srcW: 3840, srcH: 2160 }
const IPHONE_1080 = { ...IPHONE, srcW: 1920, srcH: 1080 }
const DESKTOP = { cssW: 1440, cssH: 900, dpr: 2, srcW: 1920, srcH: 1080 }

group('ULTRA uses the sensor, not an arbitrary cap')
{
  const r = fitCanvas(IPHONE.cssW, IPHONE.cssH, IPHONE.dpr, 'ULTRA', IPHONE.srcW, IPHONE.srcH, false)
  ok('renders above the old 1600px ceiling', Math.max(r.w, r.h) > 1600, `${r.w}×${r.h}`)
  ok('uses full DPR 3 (was clamped to 2)', r.dpr === 3, `dpr=${r.dpr}`)
  ok('matches native screen pixels (393×3 = 1179 wide)', r.w === 1179, `w=${r.w}`)
  ok('stays within the 4096 cap', Math.max(r.w, r.h) <= QUALITY_CAP.ULTRA, `${r.w}×${r.h}`)
}

group('Never wastes GPU upscaling past the sensor')
{
  const r = fitCanvas(2000, 2000, 3, 'ULTRA', 1280, 720, false)
  ok('clamped to the 1280px source', Math.max(r.w, r.h) <= 1280, `${r.w}×${r.h}`)
  const sr = fitCanvas(2000, 2000, 3, 'ULTRA', 1280, 720, true)
  ok('super-res is allowed past the source (real detail)', Math.max(sr.w, sr.h) > 1280, `${sr.w}×${sr.h}`)
}

group('Quality ladder is monotonic')
{
  const sizes = ['ULTRA', 'HIGH', 'BALANCED', 'SAVER'].map(q => {
    const r = fitCanvas(IPHONE.cssW, IPHONE.cssH, IPHONE.dpr, q, IPHONE.srcW, IPHONE.srcH, false)
    return { q, px: r.w * r.h }
  })
  let mono = true
  for (let i = 1; i < sizes.length; i++) if (sizes[i].px >= sizes[i - 1].px) mono = false
  ok('each tier is strictly smaller than the one above', mono, sizes.map(s => `${s.q}:${(s.px / 1e6).toFixed(2)}MP`).join(' '))
  ok('SAVER is a real saving (<40% of ULTRA pixels)', sizes[3].px < sizes[0].px * 0.4,
     `${(sizes[3].px / sizes[0].px * 100).toFixed(0)}%`)
}

group('Aspect ratio is preserved')
{
  for (const [q, p] of [['ULTRA', IPHONE], ['BALANCED', DESKTOP], ['SAVER', IPHONE_1080]]) {
    const r = fitCanvas(p.cssW, p.cssH, p.dpr, q, p.srcW, p.srcH, false)
    const want = p.cssW / p.cssH, got = r.w / r.h
    ok(`${q} keeps aspect within 1%`, Math.abs(want - got) / want < 0.01, `${want.toFixed(3)} vs ${got.toFixed(3)}`)
  }
}

group('Degenerate inputs never crash the renderer')
{
  for (const [name, args] of [
    ['zero size', [0, 0, 1, 'ULTRA', 0, 0, false]],
    ['no dpr', [393, 852, 0, 'HIGH', 1920, 1080, false]],
    ['unknown quality', [393, 852, 3, 'NOPE', 1920, 1080, false]],
    ['no sensor info yet', [393, 852, 3, 'ULTRA', 0, 0, false]],
  ]) {
    const r = fitCanvas(...args)
    ok(`${name} → valid buffer`, Number.isFinite(r.w) && Number.isFinite(r.h) && r.w >= 2 && r.h >= 2, JSON.stringify(r))
  }
}

group('Bitrate scales with resolution')
{
  const hd = pickBitrate(1920, 1080, 30), uhd = pickBitrate(3840, 2160, 30)
  ok('1080p lands in a sane band (4–12 Mbps)', hd >= 4e6 && hd <= 12e6, `${(hd / 1e6).toFixed(1)} Mbps`)
  ok('4K gets roughly 4× the 1080p bitrate', uhd / hd > 3.5 && uhd / hd < 4.5, `${(uhd / hd).toFixed(2)}×`)
  ok('4K is no longer stuck at the old flat 6 Mbps', uhd > 6e6, `${(uhd / 1e6).toFixed(1)} Mbps`)
  ok('tiny frames keep a 4 Mbps floor', pickBitrate(320, 240, 30) === 4e6)
  ok('capped at 120 Mbps', pickBitrate(7680, 4320, 60) <= 120e6)
}

group('Resolution labels')
{
  ok('3840×2160 → 4K', resLabel(3840, 2160) === '4K')
  ok('2560×1440 → QHD', resLabel(2560, 1440) === 'QHD')
  ok('1920×1080 → FHD', resLabel(1920, 1080) === 'FHD')
  ok('portrait 2160×3840 → 4K', resLabel(2160, 3840) === '4K')
}

console.log(`\n${'─'.repeat(46)}\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
