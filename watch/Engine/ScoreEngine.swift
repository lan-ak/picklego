import Foundation

/// Protocol for scoring engines. V1 implements side-out scoring.
/// V2 can add RallyScoringEngine without refactoring.
protocol ScoringEngine {
    func processRally(winner: Int, match: WatchMatch) -> (event: RallyEvent, gameOver: Bool)
    func isGameOver(team1Score: Int, team2Score: Int, pointsToWin: Int) -> Int?
}

/// Traditional pickleball side-out scoring engine.
final class SideOutScoringEngine: ScoringEngine {

    func processRally(winner: Int, match: WatchMatch) -> (event: RallyEvent, gameOver: Bool) {
        precondition(winner == 1 || winner == 2, "Winner must be 1 or 2")
        precondition(match.servingTeam == 1 || match.servingTeam == 2, "Serving team must be 1 or 2")

        let servingTeam = match.servingTeam
        let isServingTeamWinner = (winner == servingTeam)

        var newTeam1Score = match.currentTeam1Score
        var newTeam2Score = match.currentTeam2Score
        var rallyType: RallyEvent.RallyType
        var newServingTeam = match.servingTeam
        var newServerNumber = match.serverNumber
        var newIsFirstServe = match.isFirstServeOfGame

        if isServingTeamWinner {
            rallyType = .point
            if servingTeam == 1 {
                newTeam1Score += 1
            } else {
                newTeam2Score += 1
            }
        } else {
            rallyType = .sideout

            if match.isSingles {
                newServingTeam = servingTeam == 1 ? 2 : 1
                newServerNumber = 1
                newIsFirstServe = false
            } else {
                if match.isFirstServeOfGame {
                    newServingTeam = servingTeam == 1 ? 2 : 1
                    newServerNumber = 1
                    newIsFirstServe = false
                } else if match.serverNumber == 1 {
                    newServerNumber = 2
                } else {
                    newServingTeam = servingTeam == 1 ? 2 : 1
                    newServerNumber = 1
                }
            }
        }

        let event = RallyEvent(
            rallyNumber: match.currentRallyLog.count + 1,
            rallyWinner: winner,
            type: rallyType,
            team1Score: newTeam1Score,
            team2Score: newTeam2Score,
            servingTeam: servingTeam,
            serverNumber: match.serverNumber,
            timestamp: Date()
        )

        match.currentTeam1Score = newTeam1Score
        match.currentTeam2Score = newTeam2Score
        match.servingTeam = newServingTeam
        match.serverNumber = newServerNumber
        match.isFirstServeOfGame = newIsFirstServe

        var log = match.currentRallyLog
        log.append(event)
        match.currentRallyLog = log
        match.lastModifiedAt = Date()

        let gameOver = self.isGameOver(
            team1Score: newTeam1Score,
            team2Score: newTeam2Score,
            pointsToWin: match.pointsToWin
        ) != nil

        return (event: event, gameOver: gameOver)
    }

    func isGameOver(team1Score: Int, team2Score: Int, pointsToWin: Int) -> Int? {
        let maxScore = max(team1Score, team2Score)
        let minScore = min(team1Score, team2Score)

        guard maxScore >= pointsToWin else { return nil }
        guard maxScore - minScore >= 2 else { return nil }

        if maxScore > pointsToWin && maxScore - minScore != 2 {
            return nil
        }

        return team1Score > team2Score ? 1 : 2
    }

    func undoLastRally(match: WatchMatch) -> Bool {
        var log = match.currentRallyLog
        guard let lastEvent = log.popLast() else { return false }

        if let previousEvent = log.last {
            match.currentTeam1Score = previousEvent.team1Score
            match.currentTeam2Score = previousEvent.team2Score
        } else {
            match.currentTeam1Score = 0
            match.currentTeam2Score = 0
        }

        match.servingTeam = lastEvent.servingTeam
        match.serverNumber = lastEvent.serverNumber

        if log.isEmpty {
            match.isFirstServeOfGame = true
        }

        match.currentRallyLog = log
        match.lastModifiedAt = Date()
        return true
    }

    func finalizeGame(match: WatchMatch) -> WatchGame {
        let winnerTeam = isGameOver(
            team1Score: match.currentTeam1Score,
            team2Score: match.currentTeam2Score,
            pointsToWin: match.pointsToWin
        ) ?? (match.currentTeam1Score > match.currentTeam2Score ? 1 : 2)

        let game = WatchGame(
            team1Score: match.currentTeam1Score,
            team2Score: match.currentTeam2Score,
            winnerTeam: winnerTeam,
            team1PlayerIds: nil,
            team2PlayerIds: nil,
            rallyLog: match.currentRallyLog
        )

        var games = match.completedGames
        games.append(game)
        match.completedGames = games
        match.currentGameIndex += 1
        match.lastModifiedAt = Date()

        let team1Wins = games.filter { $0.winnerTeam == 1 }.count
        let team2Wins = games.filter { $0.winnerTeam == 2 }.count
        let neededToWin = match.gamesNeededToWin

        if team1Wins >= neededToWin {
            match.winnerTeam = 1
            match.status = "completed"
        } else if team2Wins >= neededToWin {
            match.winnerTeam = 2
            match.status = "completed"
        }

        return game
    }

    func resetForNewGame(match: WatchMatch, firstServingTeam: Int) {
        match.currentTeam1Score = 0
        match.currentTeam2Score = 0
        match.servingTeam = firstServingTeam
        match.serverNumber = 2
        match.isFirstServeOfGame = true
        match.currentRallyLog = []
        match.lastModifiedAt = Date()
    }
}
