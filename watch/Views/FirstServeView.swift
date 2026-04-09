import SwiftUI
import SwiftData

struct FirstServeView: View {
    let matchId: String
    @Binding var navigationPath: NavigationPath
    @Environment(\.modelContext) private var modelContext
    @Query private var allMatches: [WatchMatch]

    private var match: WatchMatch? { allMatches.first { $0.id == matchId } }

    var body: some View {
        if let match = match {
            VStack(spacing: 12) {
                Text("Who serves first?")
                    .font(PickleGoFont.title())
                    .multilineTextAlignment(.center)

                Button(action: { selectFirstServe(team: 1, match: match) }) {
                    Text(match.team1Label).font(PickleGoFont.button()).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).tint(.pickleGreen)
                .shadow(color: .pickleGreen.opacity(0.3), radius: 4)
                .accessibilityLabel("\(match.team1Label) serves first")

                Text("vs")
                    .font(PickleGoFont.caption())
                    .foregroundStyle(Color.powerYellow)

                Button(action: { selectFirstServe(team: 2, match: match) }) {
                    Text(match.team2Label).font(PickleGoFont.button()).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).tint(.courtBlue)
                .accessibilityLabel("\(match.team2Label) serves first")
            }
            .padding()
        } else {
            Text("Match not found").foregroundStyle(.secondary)
        }
    }

    private func selectFirstServe(team: Int, match: WatchMatch) {
        let engine = SideOutScoringEngine()
        if match.isScheduled { match.status = "active" }
        engine.resetForNewGame(match: match, firstServingTeam: team)

        match.flushCaches()
        do { try modelContext.save() }
        catch { print("[PickleGoWatch] Failed to save: \(error)"); return }

        navigationPath.removeLast()
        navigationPath.append(ScoringDestination(matchId: matchId))
    }
}
