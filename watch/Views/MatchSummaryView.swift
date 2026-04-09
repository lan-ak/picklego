import SwiftUI
import SwiftData

struct MatchSummaryView: View {
    let matchId: String
    @Binding var navigationPath: NavigationPath
    @ObservedObject private var syncManager = WatchSessionManager.shared
    @Query private var allMatches: [WatchMatch]

    private var match: WatchMatch? { allMatches.first { $0.id == matchId } }

    var body: some View {
        if let match = match {
            ScrollView {
                VStack(spacing: 12) {
                    // Victory header
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(Color.powerYellow)

                    Text("Match Complete!")
                        .font(PickleGoFont.headline())

                    // Winner card
                    let winnerLabel = match.winnerTeam == 1 ? match.team1Label : match.team2Label
                    VStack(spacing: 4) {
                        Text(winnerLabel)
                            .font(PickleGoFont.button())
                            .foregroundStyle(Color.pickleGreen)
                        Text("(\(match.team1GameWins)-\(match.team2GameWins))")
                            .font(PickleGoFont.body())
                            .foregroundStyle(Color.gray400)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.pickleGreen.opacity(0.15))
                    )

                    // Separator
                    Rectangle()
                        .fill(Color.gray500)
                        .frame(height: 0.5)
                        .padding(.horizontal, 4)

                    // Game scores
                    ForEach(Array(match.completedGames.enumerated()), id: \.offset) { index, game in
                        HStack {
                            Text("Game \(index + 1):").font(PickleGoFont.body())
                            Spacer()
                            Text("\(game.team1Score)")
                                .font(PickleGoFont.body())
                                .foregroundStyle(game.winnerTeam == 1 ? Color.pickleGreen : .white)
                            Text("-").font(PickleGoFont.body()).foregroundStyle(Color.gray400)
                            Text("\(game.team2Score)")
                                .font(PickleGoFont.body())
                                .foregroundStyle(game.winnerTeam == 2 ? Color.pickleGreen : .white)
                        }
                    }

                    Text("\(match.totalRallyCount) rallies")
                        .font(PickleGoFont.caption())
                        .foregroundStyle(Color.gray400)

                    // Separator
                    Rectangle()
                        .fill(Color.gray500)
                        .frame(height: 0.5)
                        .padding(.horizontal, 4)

                    // Sync status
                    HStack {
                        if match.needsSync {
                            if syncManager.isReachable {
                                ProgressView().frame(width: 12, height: 12).tint(Color.pickleGreen)
                                Text("Syncing...").font(PickleGoFont.caption()).foregroundStyle(Color.gray400)
                            } else {
                                Image(systemName: "clock").font(.caption2).foregroundStyle(Color.gray400)
                                Text("Pending sync").font(PickleGoFont.caption()).foregroundStyle(Color.gray400)
                            }
                        } else {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.pickleGreen).font(.caption2)
                            Text("Synced").font(PickleGoFont.caption()).foregroundStyle(Color.pickleGreen)
                        }
                    }

                    Button(action: { navigationPath = NavigationPath() }) {
                        Text("Done")
                            .font(PickleGoFont.button())
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(.pickleGreen)
                }
                .padding()
            }
            .navigationBarBackButtonHidden(true)
            .accessibilityLabel("Match complete. \(match.winnerTeam == 1 ? match.team1Label : match.team2Label) wins \(match.team1GameWins) to \(match.team2GameWins)")
        } else {
            Text("Match not found").foregroundStyle(.secondary)
        }
    }
}
