import Foundation
import SwiftData

@Model
final class WatchMatch {
    var id: String
    var phoneMatchId: String
    var matchType: String                    // "singles" | "doubles"
    var pointsToWin: Int
    var numberOfGames: Int                   // 1, 3, or 5
    var team1Label: String
    var team2Label: String
    var team1PlayerIds: [String]
    var team2PlayerIds: [String]
    var completedGamesData: Data?            // JSON-encoded [WatchGame]
    var currentGameIndex: Int
    var currentTeam1Score: Int
    var currentTeam2Score: Int
    var servingTeam: Int                     // 1 or 2
    var serverNumber: Int                    // 1 or 2
    var isFirstServeOfGame: Bool
    var currentRallyLogData: Data?           // JSON-encoded [RallyEvent]
    var winnerTeam: Int?                     // 1, 2, or nil
    var status: String                       // "scheduled" | "active" | "completed"
    var scheduledDate: Date
    var createdAt: Date
    var lastModifiedAt: Date
    var needsSync: Bool

    // MARK: - Transient in-memory caches (not persisted by SwiftData)
    // Avoids JSON decode on every property access. Decoded once on first read,
    // mutations happen in memory, encoded back to Data only via flushCaches().

    @Transient private var _rallyLogCache: [RallyEvent]?
    @Transient private var _gamesCache: [WatchGame]?
    @Transient private var _rallyLogDirty = false
    @Transient private var _gamesDirty = false

    init(
        id: String = UUID().uuidString,
        phoneMatchId: String,
        matchType: String,
        pointsToWin: Int,
        numberOfGames: Int,
        team1Label: String,
        team2Label: String,
        team1PlayerIds: [String] = [],
        team2PlayerIds: [String] = [],
        scheduledDate: Date,
        status: String = "scheduled"
    ) {
        self.id = id
        self.phoneMatchId = phoneMatchId
        self.matchType = matchType
        self.pointsToWin = pointsToWin
        self.numberOfGames = numberOfGames
        self.team1Label = team1Label
        self.team2Label = team2Label
        self.team1PlayerIds = team1PlayerIds
        self.team2PlayerIds = team2PlayerIds
        self.completedGamesData = nil
        self.currentGameIndex = 0
        self.currentTeam1Score = 0
        self.currentTeam2Score = 0
        self.servingTeam = 1
        self.serverNumber = 2
        self.isFirstServeOfGame = true
        self.currentRallyLogData = nil
        self.winnerTeam = nil
        self.status = status
        self.scheduledDate = scheduledDate
        self.createdAt = Date()
        self.lastModifiedAt = Date()
        self.needsSync = false
    }

    // MARK: - Cached computed properties

    var completedGames: [WatchGame] {
        get {
            if let cached = _gamesCache { return cached }
            let decoded = completedGamesData.flatMap {
                try? JSONDecoder().decode([WatchGame].self, from: $0)
            } ?? []
            _gamesCache = decoded
            return decoded
        }
        set {
            _gamesCache = newValue
            _gamesDirty = true
        }
    }

    var currentRallyLog: [RallyEvent] {
        get {
            if let cached = _rallyLogCache { return cached }
            let decoded = currentRallyLogData.flatMap {
                try? JSONDecoder().decode([RallyEvent].self, from: $0)
            } ?? []
            _rallyLogCache = decoded
            return decoded
        }
        set {
            _rallyLogCache = newValue
            _rallyLogDirty = true
        }
    }

    /// Encode dirty caches back to Data for SwiftData persistence.
    /// Call this before `modelContext.save()`.
    func flushCaches() {
        if _rallyLogDirty, let cache = _rallyLogCache {
            do {
                currentRallyLogData = try JSONEncoder().encode(cache)
                _rallyLogDirty = false
            } catch {
                print("[WatchMatch] Failed to encode rallyLog: \(error)")
                // Keep _rallyLogDirty = true so next flush retries
            }
        }
        if _gamesDirty, let cache = _gamesCache {
            do {
                completedGamesData = try JSONEncoder().encode(cache)
                _gamesDirty = false
            } catch {
                print("[WatchMatch] Failed to encode completedGames: \(error)")
                // Keep _gamesDirty = true so next flush retries
            }
        }
    }

    // MARK: - Convenience

    var isSingles: Bool { matchType == "singles" }
    var isDoubles: Bool { matchType == "doubles" }
    var isActive: Bool { status == "active" }
    var isCompleted: Bool { status == "completed" }
    var isScheduled: Bool { status == "scheduled" }

    var team1GameWins: Int {
        completedGames.filter { $0.winnerTeam == 1 }.count
    }

    var team2GameWins: Int {
        completedGames.filter { $0.winnerTeam == 2 }.count
    }

    var gamesNeededToWin: Int {
        (numberOfGames / 2) + 1
    }

    var totalRallyCount: Int {
        let completedCount = completedGames.reduce(0) { $0 + $1.rallyLog.count }
        return completedCount + currentRallyLog.count
    }
}
