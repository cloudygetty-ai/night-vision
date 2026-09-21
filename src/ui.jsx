import { useRef, useState } from 'react'

export const FONT = "'DM Mono', ui-monospace, monospace"
export const DISPLAY = "'Cinzel', Georgia, serif"
export const PANEL = 'rgba(6,10,8,0.94)'

// ── Bottom sheet with drag-to-dismiss ─────────────────────────────────────
export function Sheet({ title, onClose, color, children, right }) {
  const y0 = useRef(0), dy = useRef(0)
  const [drag, setDrag] = useState(0)
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.6)' }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 91, maxHeight: '86dvh',
        display: 'flex', flexDirection: 'column', background: PANEL,
        borderRadius: '22px 22px 0 0', borderTop: `1px solid ${color}44`,
        boxShadow: '0 -18px 60px rgba(0,0,0,.8)',
        transform: `translateY(${drag}px)`, transition: drag ? 'none' : 'transform .2s ease',
      }}>
        <div
          onTouchStart={e => { y0.current = e.touches[0].clientY }}
          onTouchMove={e => { dy.current = Math.max(0, e.touches[0].clientY - y0.current); setDrag(dy.current) }}
          onTouchEnd={() => { if (dy.current > 90) onClose(); setDrag(0); dy.current = 0 }}
          style={{ padding: '12px 18px 10px', flexShrink: 0 }}>
          <div style={{ width: 46, height: 5, borderRadius: 3, background: `${color}55`, margin: '0 auto 12px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 900, color, letterSpacing: 3 }}>{title}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {right}
              <Btn color={color} onClick={onClose}>DONE</Btn>
            </div>
          </div>
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', padding: '4px 16px calc(env(safe-area-inset-bottom,0px) + 22px)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {children}
        </div>
      </div>
    </>
  )
}

export function Btn({ color, onClick, children, danger, active, style }) {
  const c = danger ? '#ff5a5a' : color
  return (
    <button onClick={onClick} style={{
      padding: '10px 16px', borderRadius: 11, fontFamily: FONT, fontSize: 13, fontWeight: 700,
      letterSpacing: 1.2, color: active ? '#041008' : c, background: active ? c : 'rgba(255,255,255,.06)',
      border: `1.5px solid ${c}88`, ...style,
    }}>{children}</button>
  )
}

export function Section({ color, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 2px 2px' }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color, letterSpacing: 3.5 }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${color}55, transparent)` }} />
    </div>
  )
}

export function Toggle({ color, label, hint, on, onClick, c }) {
  const k = c || color
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '16px 16px', borderRadius: 14, textAlign: 'left',
      background: on ? `${k}1f` : 'rgba(255,255,255,.05)', border: `1.5px solid ${on ? k : 'rgba(255,255,255,.12)'}`,
    }}>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: on ? k : '#e9f1ec', letterSpacing: .6 }}>{label}</span>
        {hint && <span style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(233,241,236,.62)' }}>{hint}</span>}
      </span>
      <span style={{ width: 50, height: 28, borderRadius: 15, flexShrink: 0, position: 'relative',
        background: on ? k : 'rgba(255,255,255,.18)', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 22, height: 22, borderRadius: '50%',
          background: on ? '#041008' : '#dfe8e2', transition: 'left .15s' }} />
      </span>
    </button>
  )
}

export function Slider({ color, label, value, min, max, step, onChange, fmt }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1.5px solid rgba(255,255,255,.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#e9f1ec', letterSpacing: 1 }}>{label}</span>
        <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color }}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: color }} />
    </div>
  )
}

export function Tool({ icon, label, onClick, on, c, badge }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
      padding: '10px 2px 8px', borderRadius: 13, position: 'relative',
      background: on ? `${c}26` : 'rgba(255,255,255,.06)', border: `1.5px solid ${on ? c : 'rgba(255,255,255,.14)'}`,
    }}>
      <span style={{ fontSize: 21, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: .8, color: on ? c : '#e9f1ec' }}>{label}</span>
      {badge > 0 && <span style={{ position: 'absolute', top: 4, right: 6, background: c, color: '#041008',
        fontFamily: FONT, fontSize: 10, fontWeight: 800, borderRadius: 10, padding: '1px 6px' }}>{badge}</span>}
    </button>
  )
}
