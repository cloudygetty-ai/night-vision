import WebKit

// Serves the bundled NVS web build (the `dist/` folder added to this target
// as a folder reference) under a custom `nvs://app/...` scheme instead of a
// raw `file://` load.
//
// Why not WKWebView.loadFileURL: Vite's build output is ES module scripts
// (<script type="module">), and module-script fetches are always
// CORS-mode per the HTML spec. A file:// load gets a fresh *opaque* origin
// per navigation, so even same-directory module/script/stylesheet requests
// get rejected with a CORS error — confirmed by actually loading this repo's
// dist/index.html under file:// in headless Chromium while building this
// bridge; WebKit treats module-script fetches the same way. A custom scheme
// has a real, stable origin (nvs://app), so same-scheme-same-host requests
// are same-origin and load normally. This is the same fix Capacitor/Cordova
// adopted for the identical problem.
final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "nvs"
    private let root: URL

    // `bundleSubdirectory` must match the folder-reference name added to the
    // Xcode target (native/SETUP.md step 5) — "dist" by default, i.e. the
    // night-vision repo's own `npm run build` output directory.
    init?(bundleSubdirectory: String = "dist") {
        guard let root = Bundle.main.url(forResource: bundleSubdirectory, withExtension: nil) else {
            return nil
        }
        self.root = root
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let fileURL = root.appendingPathComponent(path).standardizedFileURL

        // Refuse "../" escapes out of the bundled dist/ folder.
        guard fileURL.path.hasPrefix(root.standardizedFileURL.path + "/"),
              let data = try? Data(contentsOf: fileURL) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let response = URLResponse(
            url: url, mimeType: Self.mimeType(for: fileURL.pathExtension),
            expectedContentLength: data.count, textEncodingName: "utf-8"
        )
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // Static-file reads complete synchronously above; nothing to cancel.
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html"
        case "js", "mjs": return "application/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "png": return "image/png"
        case "svg": return "image/svg+xml"
        case "ico": return "image/x-icon"
        case "webmanifest": return "application/manifest+json"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }
}
