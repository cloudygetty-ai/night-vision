import SwiftUI

struct ContentView: View {
    @StateObject private var connectivity = PhoneConnectivity()

    var body: some View {
        WebViewContainer(connectivity: connectivity)
            .ignoresSafeArea()
            .statusBarHidden(true)
            .persistentSystemOverlays(.hidden)
    }
}
