import { useState, useEffect, useRef } from 'react'
import { Btn, FONT, DISPLAY } from './ui.jsx'

export default function Watch({ initial }) {
  const [code, setCode] = useState(initial || '')
  const [joined, setJoined] = useState(!!initial)
  const [status, setStatus] = useState('idle')
  const video = useRef(null)

  useEffect(() => {
    if (!joined || !code) return
    let room = null, dead = false
    setStatus('searching')
    ;(async () => {
      try {
        const { joinRoom } = await import('trystero/nostr')
        if (dead) return
        room = joinRoom({ appId: 'nvs15-cast' }, `nvs-${code.toUpperCase()}`)
        room.onPeerJoin(() => setStatus(s => (s === 'live' ? s : 'connecting')))
        room.onPeerStream(s => {
          if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}) }
          setStatus('live')
        })
        room.onPeerLeave(() => setStatus('ended'))
      } catch { setStatus('failed') }
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
          <div style={{ fontSize: 16, fontWeight: 700, color: status === 'live' ? '#ff4d6d' : '#5cd6ff' }}>{label} · CODE {code}</div>
          <Btn color="#5cd6ff" onClick={() => { setJoined(false); setStatus('idle') }}>CHANGE CODE</Btn>
        </>
      )}
    </div>
  )
}
