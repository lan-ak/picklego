import Foundation

/// Represents a single rally in a pickleball game.
///
/// `rallyWinner` indicates which team won the rally.
/// `type` determines the outcome:
/// - `.point`: serving team won the rally and scored +1
/// - `.sideout`: receiving team won the rally, serve switches, no point scored
struct RallyEvent: Codable, Equatable {
    let rallyNumber: Int
    let rallyWinner: Int       // 1 or 2
    let type: RallyType
    let team1Score: Int        // Score AFTER this rally
    let team2Score: Int
    let servingTeam: Int       // Who was serving DURING this rally
    let serverNumber: Int      // 1 or 2 (doubles); always 1 (singles)
    let timestamp: Date

    enum RallyType: String, Codable {
        case point
        case sideout
    }
}
