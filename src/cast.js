// ── CAST TRANSPORT ─────────────────────────────────────────────────────────
// Trystero needs a signalling network to introduce the two devices before
// WebRTC takes over. Public nostr relays are community-run and frequently
// down or rate-limiting, which leaves a cast stuck with no way to say why.
//
// MQTT is the primary here. Nostr is joined ALONGSIDE it rather than as a
// timed fallback, because the two devices cannot agree to switch networks
// without a working channel to agree over — so both just listen on both, and
// whichever introduces them first wins.
//
// In trystero 0.26 the `trystero/<strategy>` subpaths throw on import; the
// strategies must be imported from their own packages.
export const APP_ID = 'nvs15-cast'
export const roomName = code => `nvs-${String(code || '').toUpperCase()}`

export const STRATEGIES = [
  { name: 'mqtt', load: () => import('@trystero-p2p/mqtt') },
  { name: 'nostr', load: () => import('@trystero-p2p/nostr') },
]

// Join every transport at once and present them as one room.
// handlers: { onPeerJoin(id, via), onPeerLeave(id, via), onPeerStream(stream, id, via) }
export async function joinCast(code, handlers = {}, strategies = STRATEGIES) {
  const live = []
  const failures = []
  const peerVia = new Map()          // peer id → the transport that introduced it

  const settled = await Promise.allSettled(strategies.map(async s => {
    const mod = await s.load()
    const joinRoom = mod.joinRoom || mod.default?.joinRoom
    if (typeof joinRoom !== 'function') throw new Error(`${s.name}: no joinRoom export`)
    // relayConfig.urls lets the integration harness point at a local broker;
    // onJoinError is trystero reporting WHY a network refused us, which is the
    // detail that was missing every time a cast silently failed.
    const urls = globalThis.__NVS_RELAYS?.[s.name]
    const room = joinRoom({
      appId: APP_ID,
      ...(urls ? { relayConfig: { urls } } : {}),
      ...(globalThis.__NVS_RTC || {}),            // integration harness only
      onJoinError: d => handlers.onJoinError?.(`${s.name}: ${d.error}`, s.name),
    }, roomName(code))

    // trystero 0.26 INVERTED this API: onPeerJoin and friends are properties
    // you assign, not functions you call (0.25 was the other way round, which
    // is what the NVS-13 note describes). Calling them throws; calling them
    // with optional chaining — as this did — silently does nothing at all,
    // so peers simply never connected and no error was ever raised.
    room.onPeerJoin = id => {
      if (peerVia.has(id)) return            // same viewer reached us twice
      peerVia.set(id, { room, name: s.name })
      handlers.onPeerJoin?.(id, s.name)
    }
    room.onPeerLeave = id => {
      // Only the transport that introduced this peer may retire them; the
      // other one never had them, and letting it fire drops a live viewer.
      if (peerVia.get(id)?.name !== s.name) return
      peerVia.delete(id)
      handlers.onPeerLeave?.(id, s.name)
    }
    room.onPeerStream = (stream, id) => handlers.onPeerStream?.(stream, id, s.name)

    live.push({ name: s.name, room })
    return s.name
  }))

  settled.forEach((r, i) => {
    if (r.status === 'rejected') failures.push(`${strategies[i].name}: ${r.reason?.message || r.reason}`)
  })
  if (!live.length) throw new Error(failures.join(' · ') || 'no transport available')

  return {
    transports: live.map(l => l.name),
    failures,
    // Send to the transport that actually introduced this peer; broadcasting
    // a stream to a room that has never seen them just throws.
    addStream(stream, id) {
      if (id) {
        const t = peerVia.get(id)
        if (t) { try { t.room.addStream(stream, { target: id }) } catch { /* peer vanished */ } }
        return
      }
      live.forEach(({ room }) => { try { room.addStream(stream) } catch { /* no peers yet */ } })
    },
    leave() {
      live.forEach(({ room }) => { try { room.leave() } catch { /* already gone */ } })
      live.length = 0
      peerVia.clear()
    },
  }
}
