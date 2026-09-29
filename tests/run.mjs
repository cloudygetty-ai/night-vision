import { execFileSync } from 'node:child_process'
let tp = 0, tf = 0
for (const t of ['motion', 'resolution', 'shader', 'exposure', 'renderer']) {
  let out = ''
  try { out = execFileSync('node', [`tests/${t}.test.mjs`], { encoding: 'utf8' }) }
  catch (e) { out = (e.stdout || '') + (e.stderr || '') }
  const m = out.match(/(\d+) passed, (\d+) failed/)
  const p = m ? +m[1] : 0, f = m ? +m[2] : 1
  tp += p; tf += f
  console.log(`${f ? '✗' : '✓'} ${t.padEnd(11)} ${p} passed${f ? `, ${f} FAILED` : ''}`)
  if (f) out.split('\n').filter(l => l.includes('✗')).forEach(l => console.log('   ' + l.trim()))
}
console.log(`\n${tp} passed, ${tf} failed`)
process.exit(tf ? 1 : 0)
