import Foundation

/// A completed game within a match. Stored in WatchMatch.completedGames.
struct WatchGame: Codable, Equatable {
    var team1Score: Int
    var team2Score: Int
    var winnerTeam: Int                  // 1 or 2
    var team1PlayerIds: [String]?        // For randomizeTeamsPerGame compatibility
    var team2PlayerIds: [String]?
    var rallyLog: [RallyEvent]
}
