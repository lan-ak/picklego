import ExpoModulesCore
import os
import WatchConnectivity

private let logger = Logger(subsystem: "com.picklego.watchsync", category: "WatchSync")
private let appGroupID = "group.com.picklego.picklego"
private let sharedFileName = "scheduled_matches.json"

/// Expo Module that bridges WatchConnectivity on the phone side.
/// Sends scheduled matches via applicationContext (production).
/// Also writes to shared App Group file for simulator fallback.
public class WatchSyncModule: Module {
    private var session: WCSession?
    private var sessionDelegate: PhoneSessionDelegate?

    public func definition() -> ModuleDefinition {
        Name("WatchSync")

        Events("onMatchCompletedFromWatch")

        OnCreate {
            guard WCSession.isSupported() else {
                logger.notice("[WatchSync] WCSession not supported on this device")
                return
            }

            let delegate = PhoneSessionDelegate { [weak self] payload in
                self?.sendEvent("onMatchCompletedFromWatch", payload)
            }
            self.sessionDelegate = delegate
            self.session = WCSession.default
            WCSession.default.delegate = delegate
            WCSession.default.activate()
        }

        /// Send scheduled matches to the watch.
        Function("sendScheduledMatchesToWatch") { (matchesJson: String) -> Bool in
            guard let session = self.session else {
                logger.notice("[WatchSync] No session available")
                return false
            }

            logger.notice("[WatchSync] Session state - isPaired: \(session.isPaired), isWatchAppInstalled: \(session.isWatchAppInstalled), activationState: \(session.activationState.rawValue), isReachable: \(session.isReachable)")

            guard session.activationState == .activated else {
                logger.notice("[WatchSync] Session not activated yet")
                return false
            }

            guard let data = matchesJson.data(using: .utf8),
                  let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                logger.notice("[WatchSync] Failed to parse JSON payload")
                return false
            }

            let matchCount = (payload["scheduledMatches"] as? [Any])?.count ?? 0

            // Always write to shared App Group file (works on real device; on simulator needs symlink)
            Self.writeToSharedFile(data: data)

            // Production path: applicationContext (requires isWatchAppInstalled)
            if session.isWatchAppInstalled {
                do {
                    try session.updateApplicationContext(payload)
                    logger.notice("[WatchSync] Sent via applicationContext (\(matchCount) matches)")
                    return true
                } catch {
                    logger.notice("[WatchSync] applicationContext failed: \(error.localizedDescription)")
                }
            }

            logger.notice("[WatchSync] Written \(matchCount) matches to shared file")
            return true
        }

        /// Check if a watch is paired and reachable.
        Function("isWatchAvailable") { () -> Bool in
            guard let session = self.session else { return false }
            return session.isPaired || session.isReachable
        }
    }

    // MARK: - Shared App Group file

    private static let fileQueue = DispatchQueue(label: "com.picklego.watchsync.file")

    private static func writeToSharedFile(data: Data) {
        fileQueue.async {
            guard let url = FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: appGroupID)?
                .appendingPathComponent(sharedFileName) else {
                logger.notice("[WatchSync] App Group container not available for writing")
                return
            }
            do {
                try data.write(to: url, options: .atomic)
                logger.notice("[WatchSync] Wrote \(data.count) bytes to shared file")
            } catch {
                logger.notice("[WatchSync] Failed to write shared file: \(error.localizedDescription)")
            }
        }
    }
}

/// WCSessionDelegate for the phone side.
private class PhoneSessionDelegate: NSObject, WCSessionDelegate {
    private let onMatchCompleted: ([String: Any]) -> Void
    private var pendingCompletedMessages: [[String: Any]] = []
    private var isActivated = false
    private let queue = DispatchQueue(label: "com.picklego.watchsync")

    init(onMatchCompleted: @escaping ([String: Any]) -> Void) {
        self.onMatchCompleted = onMatchCompleted
        super.init()
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        logger.notice("[WatchSync] Phone activated: state=\(activationState.rawValue), isPaired=\(session.isPaired), isReachable=\(session.isReachable)")
        queue.sync {
            isActivated = activationState == .activated
            if isActivated {
                let messages = pendingCompletedMessages
                pendingCompletedMessages.removeAll()
                for msg in messages {
                    DispatchQueue.main.async { self.onMatchCompleted(msg) }
                }
            }
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        queue.sync {
            isActivated = false
            pendingCompletedMessages.removeAll()
        }
        session.activate()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        logger.notice("[WatchSync] Phone reachability changed: \(session.isReachable)")
    }

    // MARK: - Incoming from watch

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        if let action = message["action"] as? String, action == "requestMatches" {
            // Reply with the latest applicationContext so the watch can refresh
            let ctx = session.applicationContext
            if let matches = ctx["scheduledMatches"] {
                replyHandler(["scheduledMatches": matches])
            } else {
                replyHandler(["scheduledMatches": []])
            }
            return
        }
        handleIncoming(message)
        replyHandler(["status": "received"])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        handleIncoming(userInfo)
    }

    private func handleIncoming(_ payload: [String: Any]) {
        guard let action = payload["action"] as? String, action == "matchCompleted" else { return }
        queue.sync {
            if isActivated {
                DispatchQueue.main.async { self.onMatchCompleted(payload) }
            } else {
                pendingCompletedMessages.append(payload)
            }
        }
    }
}
