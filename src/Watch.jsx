import { useState, useEffect, useRef } from 'react'
import { Btn, FONT, DISPLAY } from './ui.jsx'
import { joinCast } from './cast.js'

export default function Watch({ initial }) {
  const [code, setCode] = useState(initial || '')
  const [joined, setJoined] = useState(!!initial)
  const [status, setStatus] = useState('idle')
  const video = useRef(null)
  const [via, setVia] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!joined || !code) return
    let room = null, dead = false
    setStatus('searching'); setErr('')
    ;(async () => {
      try {
        room = await joinCast(code, {
          onPeerJoin: () => setStatus(s => (s === 'live' ? s : 'connecting')),
          onPeerStream: s => {
            if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}) }
            setStatus('live')
          },
          onPeerLeave: () => setStatus('ended'),
        })
        if (dead) { room.leave(); return }
        setVia(room.transports.join('+'))
      } catch (e) { setErr(String(e?.message || e).slice(0, 160)); setStatus('failed') }
    })()
    return () => { dead = true; try { room?.leave() } catch { /* noop */ } }
  }, [joined, code])

  const label = { idle: '', searching: 'Looking for the camera…', connecting: 'Camera found — connecting…',
    live: '● LIVE', ended: 'Camera stopped casting', failed: 'Connection failed' }[status]

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', color: '#e9f1ec', fontFamily: FONT,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 20 }}>
      {!joined ? (
        <>
          <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 900, color: '#5cd6ff', letterSpacing: 4 }}>NVS WATCH</div>
          <div style={{ fontSize: 15, opacity: .8 }}>Enter the cast code shown on the camera</div>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))} autoFocus
            style={{ fontFamily: DISPLAY, fontSize: 42, letterSpacing: 12, textAlign: 'center', width: 250, padding: 14,
              background: 'rgba(255,255,255,.06)', border: '2px solid #5cd6ff88', borderRadius: 14, color: '#5cd6ff', outline: 'none' }} />
          <Btn color="#5cd6ff" onClick={() => code.length === 4 && setJoined(true)} style={{ padding: '14px 30px', fontSize: 15 }}>WATCH</Btn>
        </>
      ) : (
        <>
          <video ref={video} playsInline autoPlay muted controls
            style={{ width: '100%', maxWidth: 1100, maxHeight: '80dvh', background: '#050505', borderRadius: 12, border: '1.5px solid #5cd6ff44' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: status === 'live' ? '#ff4d6d' : '#5cd6ff' }}>
            {label} · CODE {code}{via && status !== 'failed' ? ` · via ${via}` : ''}
          </div>
          {err && <div style={{ fontSize: 12, opacity: .7, maxWidth: 520, textAlign: 'center' }}>{err}</div>}
          <Btn color="#5cd6ff" onClick={() => { setJoined(false); setStatus('idle') }}>CHANGE CODE</Btn>
        </>
      )}
    </div>
  )
}
