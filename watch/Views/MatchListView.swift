import SwiftUI
import SwiftData

struct MatchListView: View {
    @Binding var navigationPath: NavigationPath
    @Query(sort: \WatchMatch.scheduledDate) private var matches: [WatchMatch]
    @Environment(\.modelContext) private var modelContext
    @ObservedObject private var syncManager = WatchSessionManager.shared

    private var upcomingMatches: [WatchMatch] {
        matches.filter { !$0.isCompleted }
    }

    var body: some View {
        List {
            if upcomingMatches.isEmpty {
                emptyState
            } else {
                ForEach(upcomingMatches, id: \.id) { match in
                    matchRow(match)
                        .onTapGesture {
                            if match.isActive {
                                navigationPath.append(ScoringDestination(matchId: match.id))
                            } else if match.isScheduled {
                                navigationPath.append(FirstServeDestination(matchId: match.id))
                            }
                        }
                }
                .onDelete { offsets in
                    let toDelete = offsets.map { upcomingMatches[$0] }
                    for match in toDelete { modelContext.delete(match) }
                }
            }
        }
        .refreshable {
            await syncManager.refreshAsync()
        }
        .overlay(alignment: .bottom) {
            GeometryReader { geo in
                let height = geo.size.height * 0.10
                Button {
                    Task { await syncManager.refreshAsync() }
                } label: {
                    Text("Refresh")
                        .font(PickleGoFont.caption())
                        .foregroundStyle(Color.pickleGreen)
                        .frame(maxWidth: .infinity)
                        .frame(height: height)
                        .background(Color.black)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .ignoresSafeArea(.container, edges: .bottom)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Text("PickleGo")
                    .font(PickleGoFont.title())
                    .foregroundStyle(Color.pickleGreen)
            }
        }
        .navigationDestination(for: FirstServeDestination.self) { dest in
            FirstServeView(matchId: dest.matchId, navigationPath: $navigationPath)
        }
        .navigationDestination(for: ScoringDestination.self) { dest in
            ScoringView(matchId: dest.matchId, navigationPath: $navigationPath)
        }
        .navigationDestination(for: MatchSummaryDestination.self) { dest in
            MatchSummaryView(matchId: dest.matchId, navigationPath: $navigationPath)
        }
        .onAppear { WatchSessionManager.shared.configure(modelContext: modelContext) }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image("pete-coach")
                .resizable()
                .scaledToFit()
                .frame(height: 60)

            Text("No Matches Yet")
                .font(PickleGoFont.title())
                .foregroundStyle(.white)

            Text("Create one in the\nPickleGo app")
                .font(PickleGoFont.caption())
                .foregroundStyle(Color.gray400)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .listRowBackground(Color.clear)
    }

    @ViewBuilder
    private func matchRow(_ match: WatchMatch) -> some View {
        HStack(spacing: 0) {
            // Leading accent bar
            RoundedRectangle(cornerRadius: 2)
                .fill(match.isActive ? Color.pickleGreen : Color.courtBlue)
                .frame(width: 3)
                .padding(.vertical, 2)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(match.team1Label).font(PickleGoFont.teamName()).lineLimit(1)
                    Text("vs").font(PickleGoFont.caption()).foregroundStyle(Color.powerYellow)
                    Text(match.team2Label).font(PickleGoFont.teamName()).lineLimit(1)
                }
                Text(formatDate(match.scheduledDate)).font(PickleGoFont.caption()).foregroundStyle(Color.gray400)
                if match.isActive {
                    Text("In Progress").font(PickleGoFont.caption()).foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.pickleGreen).clipShape(Capsule())
                }
            }
            .padding(.leading, 8)
        }
        .listRowBackground(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.cardBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.cardBorder, lineWidth: 0.5)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(match.team1Label) versus \(match.team2Label), \(formatDate(match.scheduledDate))\(match.isActive ? ", in progress" : "")")
    }

    private func formatDate(_ date: Date) -> String {
        let cal = Calendar.current
        let fmt = DateFormatter()
        if cal.isDateInToday(date) { fmt.dateFormat = "'Today' h:mm a" }
        else if cal.isDateInTomorrow(date) { fmt.dateFormat = "'Tomorrow' h:mm a" }
        else { fmt.dateFormat = "MMM d, h:mm a" }
        return fmt.string(from: date)
    }
}

struct FirstServeDestination: Hashable { let matchId: String }
struct ScoringDestination: Hashable { let matchId: String }
struct MatchSummaryDestination: Hashable { let matchId: String }
