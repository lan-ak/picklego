import Foundation
import os
import WatchConnectivity
import SwiftData

private let logger = Logger(subsystem: "com.picklego.watchsync", category: "WatchSync")
private let appGroupID = "group.com.picklego.picklego"
private let sharedFileName = "scheduled_matches.json"

final class WatchSessionManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    @Published var isReachable = false
    private var modelContext: ModelContext?
    private var isProcessingMatches = false

    private override init() { super.init() }

    func configure(modelContext: ModelContext) {
        self.modelContext = modelContext
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        logger.notice("[WatchSync] Watch activated: state=\(activationState.rawValue), error=\(error?.localizedDescription ?? "none"), isReachable=\(session.isReachable)")
        DispatchQueue.main.async { self.isReachable = session.isReachable }

        // Production path: check applicationContext
        let ctx = session.receivedApplicationContext
        if !ctx.isEmpty, let matchesData = ctx["scheduledMatches"] as? [[String: Any]], let modelContext = modelContext {
            logger.notice("[WatchSync] Found pending applicationContext with \(matchesData.count) matches")
            DispatchQueue.main.async { self.processScheduledMatches(matchesData, context: modelContext) }
            return
        }

        // Fallback: read from shared App Group file
        loadFromSharedFile()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        logger.notice("[WatchSync] Watch reachability changed: \(session.isReachable)")
        DispatchQueue.main.async { self.isReachable = session.isReachable }

        // Phone became reachable — likely wrote new data to shared file
        if session.isReachable {
            loadFromSharedFile()
        }
    }

    /// Pull-to-refresh / sync button: awaits until sync completes.
    func refreshAsync() async {
        guard let modelContext = modelContext else { return }
        logger.notice("[WatchSync] Refresh triggered")

        // 1. Re-read any cached applicationContext (production)
        let ctx = WCSession.default.receivedApplicationContext
        if let matchesData = ctx["scheduledMatches"] as? [[String: Any]], !matchesData.isEmpty {
            await MainActor.run { processScheduledMatches(matchesData, context: modelContext) }
            logger.notice("[WatchSync] Refresh: loaded from applicationContext")
            return
        }

        // 2. Read from shared App Group file (simulator + real device)
        let fileResult = await loadFromSharedFileAsync()
        if fileResult {
            logger.notice("[WatchSync] Refresh: loaded from shared file")
            return
        }

        logger.notice("[WatchSync] Refresh: no data found")
    }

    /// Async version of loadFromSharedFile that returns true if matches were found.
    private func loadFromSharedFileAsync() async -> Bool {
        guard let modelContext = modelContext else { return false }
        guard let url = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupID)?
            .appendingPathComponent(sharedFileName) else { return false }

        return await withCheckedContinuation { continuation in
            Self.fileQueue.async { [weak self] in
                guard FileManager.default.fileExists(atPath: url.path) else {
                    continuation.resume(returning: false)
                    return
                }
                do {
                    let data = try Data(contentsOf: url)
                    guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let matchesData = payload["scheduledMatches"] as? [[String: Any]] else {
                        continuation.resume(returning: false)
                        return
                    }
                    DispatchQueue.main.async {
                        self?.processScheduledMatches(matchesData, context: modelContext)
                        continuation.resume(returning: true)
                    }
                } catch {
                    logger.notice("[WatchSync] Refresh file read failed: \(error.localizedDescription)")
                    continuation.resume(returning: false)
                }
            }
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        logger.notice("[WatchSync] Watch received applicationContext with \(applicationContext.count) keys")
        guard let matchesData = applicationContext["scheduledMatches"] as? [[String: Any]] else { return }
        guard let modelContext = modelContext else { return }
        logger.notice("[WatchSync] Processing \(matchesData.count) matches from applicationContext")
        DispatchQueue.main.async { self.processScheduledMatches(matchesData, context: modelContext) }
    }

    // MARK: - Shared App Group file (simulator fallback)

    private static let fileQueue = DispatchQueue(label: "com.picklego.watchsync.file")

    private func loadFromSharedFile() {
        guard let modelContext = modelContext else {
            logger.notice("[WatchSync] Cannot read shared file — no modelContext")
            return
        }
        guard let url = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupID)?
            .appendingPathComponent(sharedFileName) else {
            logger.notice("[WatchSync] App Group container not available")
            return
        }
        Self.fileQueue.async { [weak self] in
            guard FileManager.default.fileExists(atPath: url.path) else {
                logger.notice("[WatchSync] No shared file found")
                return
            }
            do {
                let data = try Data(contentsOf: url)
                guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let matchesData = payload["scheduledMatches"] as? [[String: Any]] else {
                    logger.notice("[WatchSync] Shared file has no scheduledMatches")
                    return
                }
                logger.notice("[WatchSync] Read \(matchesData.count) matches from shared file")
                DispatchQueue.main.async {
                    self?.processScheduledMatches(matchesData, context: modelContext)
                }
            } catch {
                logger.notice("[WatchSync] Failed to read shared file: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Receive via sendMessage (direct push)

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        if let matchesData = message["scheduledMatches"] as? [[String: Any]], let modelContext = modelContext {
            DispatchQueue.main.async { self.processScheduledMatches(matchesData, context: modelContext) }
            replyHandler(["status": "received", "count": matchesData.count])
        } else {
            replyHandler(["status": "no_matches"])
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let matchesData = message["scheduledMatches"] as? [[String: Any]], let modelContext = modelContext {
            DispatchQueue.main.async { self.processScheduledMatches(matchesData, context: modelContext) }
        }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        if let matchesData = userInfo["scheduledMatches"] as? [[String: Any]], let modelContext = modelContext {
            DispatchQueue.main.async { self.processScheduledMatches(matchesData, context: modelContext) }
        }
    }

    // MARK: - Process scheduled matches

    private func processScheduledMatches(_ matchesData: [[String: Any]], context: ModelContext) {
        // Guard against concurrent calls from multiple delivery paths
        guard !isProcessingMatches else {
            logger.notice("[WatchSync] Already processing matches, skipping")
            return
        }
        isProcessingMatches = true
        defer { isProcessingMatches = false }

        let incomingIds = Set(matchesData.compactMap { $0["id"] as? String })
        let existing = (try? context.fetch(FetchDescriptor<WatchMatch>())) ?? []

        for match in existing {
            if (match.isCompleted && !match.needsSync) || (match.isScheduled && !incomingIds.contains(match.phoneMatchId)) {
                context.delete(match)
            }
        }

        let existingPhoneIds = Set(existing.map(\.phoneMatchId))
        for data in matchesData {
            guard let phoneId = data["id"] as? String, !existingPhoneIds.contains(phoneId) else { continue }
            let match = WatchMatch(
                phoneMatchId: phoneId,
                matchType: data["matchType"] as? String ?? "singles",
                pointsToWin: data["pointsToWin"] as? Int ?? 11,
                numberOfGames: data["numberOfGames"] as? Int ?? 1,
                team1Label: data["team1Label"] as? String ?? "Team 1",
                team2Label: data["team2Label"] as? String ?? "Team 2",
                team1PlayerIds: data["team1PlayerIds"] as? [String] ?? [],
                team2PlayerIds: data["team2PlayerIds"] as? [String] ?? [],
                scheduledDate: parseISO8601(data["scheduledDate"] as? String) ?? Date()
            )
            context.insert(match)
        }
        try? context.save()
        logger.notice("[WatchSync] Saved \(matchesData.count) matches to watch storage")
    }

    // MARK: - Send completed match

    func sendCompletedMatch(_ match: WatchMatch) {
        let payload = buildCompletedMatchPayload(match)
        let matchId = match.id

        if WCSession.default.isReachable {
            WCSession.default.sendMessage(payload, replyHandler: { [weak self] _ in
                self?.markSynced(matchId: matchId)
            }, errorHandler: { [weak self] error in
                logger.notice("[WatchSync] sendMessage failed, falling back to transferUserInfo: \(error.localizedDescription)")
                // transferUserInfo is guaranteed delivery by the OS
                WCSession.default.transferUserInfo(payload)
                self?.markSynced(matchId: matchId)
            })
        } else {
            // transferUserInfo survives app termination — safe to mark synced
            WCSession.default.transferUserInfo(payload)
            markSynced(matchId: matchId)
        }
    }

    private func markSynced(matchId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let ctx = self?.modelContext else { return }
            let descriptor = FetchDescriptor<WatchMatch>(predicate: #Predicate { $0.id == matchId })
            if let m = try? ctx.fetch(descriptor).first {
                m.needsSync = false
                try? ctx.save()
            }
        }
    }

    private func buildCompletedMatchPayload(_ match: WatchMatch) -> [String: Any] {
        let games: [[String: Any]] = match.completedGames.map { game in
            let rallyLog: [[String: Any]] = game.rallyLog.map { event in
                ["rallyNumber": event.rallyNumber, "rallyWinner": event.rallyWinner,
                 "type": event.type.rawValue, "team1Score": event.team1Score,
                 "team2Score": event.team2Score, "servingTeam": event.servingTeam,
                 "serverNumber": event.serverNumber, "timestamp": event.timestamp.timeIntervalSince1970 * 1000]
            }
            return ["team1Score": game.team1Score, "team2Score": game.team2Score,
                    "winnerTeam": game.winnerTeam, "rallyLog": rallyLog]
        }
        return ["action": "matchCompleted", "match": [
            "phoneMatchId": match.phoneMatchId, "games": games,
            "winnerTeam": match.winnerTeam ?? 0, "completedAt": Date().timeIntervalSince1970 * 1000
        ]]
    }

    private func parseISO8601(_ string: String?) -> Date? {
        guard let string = string else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }
}
