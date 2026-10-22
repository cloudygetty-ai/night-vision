import Foundation
import WatchConnectivity
import SwiftUI
import UIKit   // UIImage — watchOS ships the UIKit subset SwiftUI itself relies on

final class WatchConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    @Published var latestFrame: UIImage?
    @Published var modeLabel = "—"
    @Published var modeColor: Color = .green
    @Published var isRecording = false
    @Published var sentryOn = false
    @Published var connected = false

    private let session: WCSession? = WCSession.isSupported() ? .default : nil

    override init() {
        super.init()
        session?.delegate = self
        session?.activate()
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { self.connected = (state == .activated) }
    }

    // Phone -> Watch: { type: 'frame', jpeg, w, h, mode, modeLabel, color,
    // recording, sentry, dce, zoom } relayed by PhoneConnectivity.swift.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard message["type"] as? String == "frame" else { return }
        DispatchQueue.main.async { [weak self] in self?.apply(message) }
    }

    private func apply(_ message: [String: Any]) {
        if let jpegB64 = message["jpeg"] as? String, let data = Data(base64Encoded: jpegB64) {
            latestFrame = UIImage(data: data)
        }
        if let label = message["modeLabel"] as? String { modeLabel = label }
        if let hex = message["color"] as? String, let c = Color(nvsHex: hex) { modeColor = c }
        if let rec = message["recording"] as? Bool { isRecording = rec }
        if let s = message["sentry"] as? Bool { sentryOn = s }
    }

    // Watch -> Phone: see PhoneConnectivity.swift's dispatchCommand(_:).
    func send(command: String, value: Any? = nil) {
        guard let session, session.isReachable else { return }
        var message: [String: Any] = ["command": command]
        if let value { message["value"] = value }
        session.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }
}

// NVS mode colors are plain "#rrggbb" strings (see src/gl.js MODES).
extension Color {
    init?(nvsHex hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        s.removeAll { $0 == "#" }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self = Color(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }
}
