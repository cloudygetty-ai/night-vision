import Foundation
import WatchConnectivity
import WebKit

final class PhoneConnectivity: NSObject, ObservableObject, WCSessionDelegate {
    weak var webView: WKWebView?
    private let session: WCSession? = WCSession.isSupported() ? .default : nil

    override init() {
        super.init()
        session?.delegate = self
        session?.activate()
    }

    // JS -> native -> Watch. Frames arrive roughly every 400ms (see
    // watchBridge.js). sendMessage only succeeds while the Watch app is
    // reachable (both apps foregrounded) — the expected case for a live
    // glance feature like this; frames while unreachable are just dropped,
    // not queued, so the Watch always shows the most recent live state once
    // it reconnects rather than a backlog.
    func relayFrameToWatch(_ body: [String: Any]) {
        guard let session, session.isPaired, session.isWatchAppInstalled, session.isReachable else { return }
        session.sendMessage(body, replyHandler: nil) { error in
            print("NVS: failed to relay frame to Watch:", error.localizedDescription)
        }
    }

    // Watch -> native -> JS: see watchBridge.js's window.__nvsRemote surface.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async { [weak self] in self?.dispatchCommand(message) }
    }

    private func dispatchCommand(_ message: [String: Any]) {
        guard let command = message["command"] as? String else { return }
        let js: String
        switch command {
        case "setMode":
            guard let idx = message["value"] as? Int else { return }
            js = "window.__nvsRemote?.setMode(\(idx))"
        case "cycleMode":
            let dir = (message["value"] as? Int) ?? 1
            js = "window.__nvsRemote?.cycleMode(\(dir))"
        case "toggleRecording":
            js = "window.__nvsRemote?.toggleRecording()"
        case "toggleSentry":
            js = "window.__nvsRemote?.toggleSentry()"
        case "setDce":
            guard let v = message["value"] as? Double else { return }
            js = "window.__nvsRemote?.setDce(\(v))"
        case "setZoom":
            guard let v = message["value"] as? Double else { return }
            js = "window.__nvsRemote?.setZoom(\(v))"
        default:
            return
        }
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // Required WCSessionDelegate conformance (iOS side needs all three).
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }   // re-activate after a watch switch
}
