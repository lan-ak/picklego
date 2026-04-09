import SwiftUI
import SwiftData
import WatchKit

struct ScoringView: View {
    let matchId: String
    @Binding var navigationPath: NavigationPath
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Query private var allMatches: [WatchMatch]

    @State private var showGameOver = false
    @State private var gameWinner: Int = 0
    @State private var showHint = true
    @State private var hintTask: Task<Void, Never>?
    @State private var showAbandonConfirm = false

    private let engine = SideOutScoringEngine()

    private var match: WatchMatch? { allMatches.first { $0.id == matchId } }

    var body: some View {
        if let match = match {
            if scenePhase == .inactive || scenePhase == .background {
                alwaysOnView(match)
            } else {
                TabView {
                    activeView(match)
                    if match.currentGameIndex > 0 {
                        GamesSummaryView(matchId: matchId)
                    }
                }
                .tabViewStyle(.verticalPage)
            }
        } else {
            Text("Match not found").foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func activeView(_ match: WatchMatch) -> some View {
        VStack(spacing: 4) {
            scoreCallout(match)

            Text("Game \(match.currentGameIndex + 1) of \(match.numberOfGames)")
                .font(PickleGoFont.gameIndicator()).foregroundStyle(Color.gray400)

            HStack(spacing: 8) {
                teamTapZone(match: match, team: 1)
                teamTapZone(match: match, team: 2)
            }
            .padding(.horizontal, 6)

            Spacer(minLength: 0)

            if showHint {
                HStack(spacing: 4) {
                    Image(systemName: "hand.tap.fill")
                        .font(.system(size: 10))
                    Text("Tap team that won rally")
                        .font(PickleGoFont.caption())
                }
                .foregroundStyle(Color.gray400)
                .transition(.opacity)
            }

            let hasRallies = !match.currentRallyLog.isEmpty
            Button(action: { undoRally(match) }) {
                Text("Undo")
                    .font(PickleGoFont.caption())
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            .foregroundStyle(hasRallies ? Color.gray400 : Color.gray500)
            .background(Capsule().fill(Color.cardBackground))
            .disabled(!hasRallies)
            .accessibilityLabel("Undo last rally")
            .accessibilityHint(hasRallies ? "Reverts the last rally" : "No rallies to undo")
        }
        .padding(.top, 2)
        .navigationBarBackButtonHidden(true)
        .overlay {
            if showGameOver {
                gameOverOverlay(match)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    showAbandonConfirm = true
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.gray400)
                }
            }
        }
        .confirmationDialog("Abandon match?", isPresented: $showAbandonConfirm) {
            Button("Abandon", role: .destructive) { abandonMatch(match) }
            Button("Cancel", role: .cancel) { }
        }
        .onAppear {
            hintTask = Task {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { return }
                withAnimation { showHint = false }
            }
        }
        .onDisappear { hintTask?.cancel() }
    }

    @ViewBuilder
    private func alwaysOnView(_ match: WatchMatch) -> some View {
        VStack(spacing: 8) {
            scoreCallout(match).opacity(0.6)
            Text("Game \(match.currentGameIndex + 1) of \(match.numberOfGames)")
                .font(PickleGoFont.gameIndicator()).foregroundStyle(.secondary).opacity(0.5)
            HStack(spacing: 24) {
                VStack(spacing: 2) {
                    Text(truncateTeamName(match.team1Label))
                        .font(PickleGoFont.caption())
                        .lineLimit(1)
                        .opacity(0.4)
                    Text("\(match.currentTeam1Score)").font(PickleGoFont.scoreDigit())
                    if match.servingTeam == 1 {
                        servingIndicator(serverNumber: match.serverNumber, size: 8, glowing: false)
                            .opacity(0.5)
                    }
                }
                VStack(spacing: 2) {
                    Text(truncateTeamName(match.team2Label))
                        .font(PickleGoFont.caption())
                        .lineLimit(1)
                        .opacity(0.4)
                    Text("\(match.currentTeam2Score)").font(PickleGoFont.scoreDigit())
                    if match.servingTeam == 2 {
                        servingIndicator(serverNumber: match.serverNumber, size: 8, glowing: false)
                            .opacity(0.5)
                    }
                }
            }.opacity(0.6)
        }
    }

    @ViewBuilder
    private func scoreCallout(_ match: WatchMatch) -> some View {
        let servingScore = match.servingTeam == 1 ? match.currentTeam1Score : match.currentTeam2Score
        let receivingScore = match.servingTeam == 1 ? match.currentTeam2Score : match.currentTeam1Score
        Text("\(servingScore) - \(receivingScore) - \(match.serverNumber)")
            .font(PickleGoFont.scoreCallout()).foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(Capsule().fill(Color.white.opacity(0.08)))
            .accessibilityLabel("Score: \(servingScore) serving, \(receivingScore) receiving, server \(match.serverNumber)")
    }

    @ViewBuilder
    private func teamTapZone(match: WatchMatch, team: Int) -> some View {
        let isServing = match.servingTeam == team
        let score = team == 1 ? match.currentTeam1Score : match.currentTeam2Score
        let label = team == 1 ? match.team1Label : match.team2Label
        let truncated = truncateTeamName(label)

        Button(action: { recordRally(match: match, winner: team) }) {
            VStack(spacing: 2) {
                Text(truncated).font(PickleGoFont.teamName()).lineLimit(1).minimumScaleFactor(0.7)
                Text("\(score)")
                    .font(PickleGoFont.scoreDigit())
                    .foregroundStyle(isServing ? Color.pickleGreen : .white)
                if isServing {
                    servingIndicator(serverNumber: match.serverNumber, size: 10, glowing: true)
                } else {
                    Spacer().frame(height: 10)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isServing ? Color.pickleGreen.opacity(0.15) : Color.cardBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isServing ? Color.pickleGreen : Color.gray400, lineWidth: isServing ? 3 : 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label), score \(score)\(isServing ? ", serving" : "")")
        .accessibilityHint(isServing ? "Tap if \(label) won the rally to score a point" : "Tap if \(label) won the rally for a side-out")
    }

    @ViewBuilder
    private func gameOverOverlay(_ match: WatchMatch) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 24))
                .foregroundStyle(Color.powerYellow)

            Text("Game Complete!")
                .font(PickleGoFont.headline())

            Text(gameWinner == 1 ? match.team1Label : match.team2Label)
                .font(PickleGoFont.button()).foregroundStyle(Color.pickleGreen)
                .lineLimit(1).minimumScaleFactor(0.7)

            Text("\(match.currentTeam1Score) - \(match.currentTeam2Score)")
                .font(PickleGoFont.scoreCallout())
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
                .background(Capsule().fill(Color.white.opacity(0.08)))

            HStack(spacing: 12) {
                Button("Confirm") { confirmGameOver(match) }
                    .buttonStyle(.borderedProminent).tint(.pickleGreen)
                Button("Cancel") { withAnimation { showGameOver = false } }
                    .buttonStyle(.bordered).tint(.gray400)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.85).ignoresSafeArea())
        .accessibilityLabel("Game complete. \(gameWinner == 1 ? match.team1Label : match.team2Label) wins \(match.currentTeam1Score) to \(match.currentTeam2Score)")
    }

    @ViewBuilder
    private func servingIndicator(serverNumber: Int, size: CGFloat, glowing: Bool) -> some View {
        HStack(spacing: 4) {
            ForEach(0..<serverNumber, id: \.self) { _ in
                Circle().fill(Color.pickleGreen).frame(width: size, height: size)
            }
        }
        .shadow(color: glowing ? Color.pickleGreen.opacity(0.6) : .clear, radius: glowing ? 4 : 0)
        .transition(.scale.combined(with: .opacity))
    }

    private func recordRally(match: WatchMatch, winner: Int) {
        let (event, gameOver) = engine.processRally(winner: winner, match: match)
        WKInterfaceDevice.current().play(event.type == .point ? .click : .directionUp)
        match.flushCaches()
        try? modelContext.save()

        if gameOver {
            gameWinner = engine.isGameOver(team1Score: match.currentTeam1Score, team2Score: match.currentTeam2Score, pointsToWin: match.pointsToWin) ?? 0
            WKInterfaceDevice.current().play(.notification)
            withAnimation { showGameOver = true }
        }
    }

    private func undoRally(_ match: WatchMatch) {
        if engine.undoLastRally(match: match) {
            WKInterfaceDevice.current().play(.click)
            match.flushCaches()
            try? modelContext.save()
        }
    }

    private func confirmGameOver(_ match: WatchMatch) {
        withAnimation { showGameOver = false }
        let _ = engine.finalizeGame(match: match)
        match.flushCaches()
        try? modelContext.save()

        if match.isCompleted {
            match.needsSync = true
            match.flushCaches()
            WatchSessionManager.shared.sendCompletedMatch(match)
            try? modelContext.save()
            navigationPath.removeLast()
            navigationPath.append(MatchSummaryDestination(matchId: matchId))
        } else {
            navigationPath.removeLast()
            navigationPath.append(FirstServeDestination(matchId: matchId))
        }
    }

    private func abandonMatch(_ match: WatchMatch) {
        match.status = "scheduled"
        match.currentTeam1Score = 0
        match.currentTeam2Score = 0
        match.currentRallyLog = []
        match.servingTeam = 1
        match.serverNumber = 2
        match.isFirstServeOfGame = true
        match.lastModifiedAt = Date()
        match.flushCaches()
        try? modelContext.save()
        navigationPath = NavigationPath()
    }

    private func truncateTeamName(_ name: String) -> String {
        let parts = name.components(separatedBy: " & ")
        if parts.count > 1 { return parts.map { String($0.prefix(1)) }.joined(separator: "&") }
        if name.count > 8, let first = name.components(separatedBy: " ").first { return String(first.prefix(8)) }
        return name
    }
}
