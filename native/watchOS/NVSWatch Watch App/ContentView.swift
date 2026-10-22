import SwiftUI

struct ContentView: View {
    @EnvironmentObject var connectivity: WatchConnectivityManager

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10).fill(Color.black)
                    if let frame = connectivity.latestFrame {
                        Image(uiImage: frame)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    } else {
                        Text(connectivity.connected ? "Waiting for phone…" : "Not connected")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 8)
                    }
                }
                .frame(height: 120)

                Text(connectivity.modeLabel)
                    .font(.headline)
                    .foregroundStyle(connectivity.modeColor)

                HStack {
                    Button(action: { connectivity.send(command: "cycleMode", value: -1) }) {
                        Image(systemName: "chevron.left")
                    }
                    Spacer()
                    Button(action: { connectivity.send(command: "toggleRecording") }) {
                        Image(systemName: connectivity.isRecording ? "stop.fill" : "record.circle")
                            .foregroundStyle(connectivity.isRecording ? .red : .primary)
                    }
                    Spacer()
                    Button(action: { connectivity.send(command: "cycleMode", value: 1) }) {
                        Image(systemName: "chevron.right")
                    }
                }
                .buttonStyle(.bordered)

                Button(action: { connectivity.send(command: "toggleSentry") }) {
                    Label(connectivity.sentryOn ? "Sentry: On" : "Sentry: Off", systemImage: "shield.fill")
                }
                .tint(connectivity.sentryOn ? .red : .gray)
            }
            .padding(.horizontal, 4)
            .padding(.top, 4)
        }
    }
}
