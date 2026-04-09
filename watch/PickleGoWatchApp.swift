import SwiftUI
import SwiftData

@main
struct PickleGoWatchApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: WatchMatch.self)
    }
}

struct ContentView: View {
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            MatchListView(navigationPath: $navigationPath)
        }
    }
}
