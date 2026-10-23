import SwiftUI
import WebKit

struct WebViewContainer: UIViewRepresentable {
    @ObservedObject var connectivity: PhoneConnectivity

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        if let handler = LocalSchemeHandler() {
            config.setURLSchemeHandler(handler, forURLScheme: LocalSchemeHandler.scheme)
        } else {
            assertionFailure("NVS web build not bundled — see native/SETUP.md step 5 (dist/ folder reference)")
        }

        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "nvsWatch")   // JS -> native, see watchBridge.js
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator                // camera permission grant, below
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .black

        connectivity.webView = webView

        webView.load(URLRequest(url: URL(string: "\(LocalSchemeHandler.scheme)://app/index.html")!))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(connectivity: connectivity) }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        let connectivity: PhoneConnectivity
        init(connectivity: PhoneConnectivity) { self.connectivity = connectivity }

        // JS -> native: { type: 'frame', jpeg, w, h, mode, modeLabel, color,
        // recording, sentry, dce, zoom } posted by src/watchBridge.js.
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            connectivity.relayFrameToWatch(body)
        }

        // NVS calls getUserMedia() for the camera. WKWebView does not surface
        // the usual browser permission chrome, so this must be granted
        // explicitly or the camera silently never starts.
        func webView(
            _ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            // Only the bundled app (nvs://app) gets the camera — never a remote page.
            decisionHandler(origin.protocol == LocalSchemeHandler.scheme ? .grant : .deny)
        }

        // Keep the web view on the bundled app: web links open in Safari instead
        // of replacing NVS (and inheriting its camera access) inside this view.
        func webView(
            _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
               navigationAction.targetFrame?.isMainFrame ?? true {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            print("NVS web view failed to load:", error.localizedDescription)
        }
    }
}
