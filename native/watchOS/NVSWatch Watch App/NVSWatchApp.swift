import SwiftUI

@main
struct NVSWatchApp: App {
    @StateObject private var connectivity = WatchConnectivityManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(connectivity)
        }
    }
}
