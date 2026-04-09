import SwiftUI
import SwiftData

struct GamesSummaryView: View {
    let matchId: String
    @Query private var allMatches: [WatchMatch]
    @State private var pulsing = false

    private var match: WatchMatch? { allMatches.first { $0.id == matchId } }

    var body: some View {
        if let match = match {
            List {
                ForEach(Array(match.completedGames.enumerated()), id: \.offset) { index, game in
                    HStack {
                        Text("Game \(index + 1)").font(PickleGoFont.body())
                        Spacer()
                        Text("\(game.team1Score)")
                            .font(PickleGoFont.body())
                            .foregroundStyle(game.winnerTeam == 1 ? Color.pickleGreen : .white)
                        Text("-").font(PickleGoFont.body()).foregroundStyle(Color.gray400)
                        Text("\(game.team2Score)")
                            .font(PickleGoFont.body())
                            .foregroundStyle(game.winnerTeam == 2 ? Color.pickleGreen : .white)
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Color.pickleGreen)
                            .font(.caption2)
                    }
                    .listRowBackground(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.cardBackground)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.cardBorder, lineWidth: 0.5)
                            )
                    )
                    .accessibilityLabel("Game \(index + 1): \(game.team1Score) to \(game.team2Score), won by \(game.winnerTeam == 1 ? match.team1Label : match.team2Label)")
                }
                if !match.isCompleted {
                    HStack {
                        Text("Game \(match.currentGameIndex + 1)").font(PickleGoFont.body())
                        Spacer()
                        Circle()
                            .fill(Color.pickleGreen)
                            .frame(width: 6, height: 6)
                            .opacity(pulsing ? 0.3 : 1.0)
                            .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: pulsing)
                        Text("in progress").font(PickleGoFont.caption()).foregroundStyle(Color.gray400)
                    }
                    .listRowBackground(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.cardBackground)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.cardBorder, lineWidth: 0.5)
                            )
                    )
                    .onAppear { pulsing = true }
                }
            }
            .navigationTitle("Games")
        }
    }
}
