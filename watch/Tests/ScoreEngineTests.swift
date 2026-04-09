import XCTest
@testable import PickleGoWatch

final class ScoreEngineTests: XCTestCase {

    let engine = SideOutScoringEngine()

    // MARK: - Game Over Detection (ported from scoreValidation.test.ts)

    func testGameOver_11_9_isValid() { XCTAssertEqual(engine.isGameOver(team1Score: 11, team2Score: 9, pointsToWin: 11), 1) }
    func testGameOver_11_10_isNotOver() { XCTAssertNil(engine.isGameOver(team1Score: 11, team2Score: 10, pointsToWin: 11)) }
    func testGameOver_12_10_isValid() { XCTAssertEqual(engine.isGameOver(team1Score: 12, team2Score: 10, pointsToWin: 11), 1) }
    func testGameOver_14_11_isNotOver() { XCTAssertNil(engine.isGameOver(team1Score: 14, team2Score: 11, pointsToWin: 11)) }
    func testGameOver_14_12_isValid() { XCTAssertEqual(engine.isGameOver(team1Score: 14, team2Score: 12, pointsToWin: 11), 1) }
    func testGameOver_0_11_team2Wins() { XCTAssertEqual(engine.isGameOver(team1Score: 0, team2Score: 11, pointsToWin: 11), 2) }
    func testGameOver_5_3_notReached() { XCTAssertNil(engine.isGameOver(team1Score: 5, team2Score: 3, pointsToWin: 11)) }
    func testGameOver_21_19_customPointsToWin() { XCTAssertEqual(engine.isGameOver(team1Score: 21, team2Score: 19, pointsToWin: 21), 1) }
    func testGameOver_0_0_notOver() { XCTAssertNil(engine.isGameOver(team1Score: 0, team2Score: 0, pointsToWin: 11)) }

    // MARK: - Singles Side-Out

    func testSingles_servingTeamWins_scoresPoint() {
        let match = makeMatch(matchType: "singles", servingTeam: 1)
        let (event, _) = engine.processRally(winner: 1, match: match)
        XCTAssertEqual(event.type, .point)
        XCTAssertEqual(match.currentTeam1Score, 1)
        XCTAssertEqual(match.servingTeam, 1)
    }

    func testSingles_receivingTeamWins_sideout() {
        let match = makeMatch(matchType: "singles", servingTeam: 1)
        let (event, _) = engine.processRally(winner: 2, match: match)
        XCTAssertEqual(event.type, .sideout)
        XCTAssertEqual(match.currentTeam1Score, 0)
        XCTAssertEqual(match.servingTeam, 2)
    }

    // MARK: - Doubles Side-Out

    func testDoubles_firstServe_servingTeamWins_scoresPoint() {
        let match = makeMatch(matchType: "doubles", servingTeam: 1, isFirstServe: true)
        let (event, _) = engine.processRally(winner: 1, match: match)
        XCTAssertEqual(event.type, .point)
        XCTAssertEqual(match.currentTeam1Score, 1)
        XCTAssertEqual(match.servingTeam, 1)
    }

    func testDoubles_firstServe_servingTeamLoses_immediateSideout() {
        let match = makeMatch(matchType: "doubles", servingTeam: 1, isFirstServe: true)
        let (event, _) = engine.processRally(winner: 2, match: match)
        XCTAssertEqual(event.type, .sideout)
        XCTAssertEqual(match.servingTeam, 2)
        XCTAssertEqual(match.serverNumber, 1)
        XCTAssertFalse(match.isFirstServeOfGame)
    }

    func testDoubles_server1Loses_advancesToServer2() {
        let match = makeMatch(matchType: "doubles", servingTeam: 1, serverNumber: 1, isFirstServe: false)
        let (event, _) = engine.processRally(winner: 2, match: match)
        XCTAssertEqual(event.type, .sideout)
        XCTAssertEqual(match.servingTeam, 1)
        XCTAssertEqual(match.serverNumber, 2)
    }

    func testDoubles_server2Loses_sideoutToOtherTeam() {
        let match = makeMatch(matchType: "doubles", servingTeam: 1, serverNumber: 2, isFirstServe: false)
        let (event, _) = engine.processRally(winner: 2, match: match)
        XCTAssertEqual(event.type, .sideout)
        XCTAssertEqual(match.servingTeam, 2)
        XCTAssertEqual(match.serverNumber, 1)
    }

    func testDoubles_server2Wins_scoresPointAndKeepsServing() {
        let match = makeMatch(matchType: "doubles", servingTeam: 1, serverNumber: 2, isFirstServe: false)
        let (event, _) = engine.processRally(winner: 1, match: match)
        XCTAssertEqual(event.type, .point)
        XCTAssertEqual(match.currentTeam1Score, 1)
        XCTAssertEqual(match.serverNumber, 2)
    }

    // MARK: - Rally Log

    func testRallyLog_recordsEachRally() {
        let match = makeMatch(matchType: "singles", servingTeam: 1)
        engine.processRally(winner: 1, match: match)
        engine.processRally(winner: 2, match: match)
        engine.processRally(winner: 2, match: match)
        XCTAssertEqual(match.currentRallyLog.count, 3)
        XCTAssertEqual(match.currentTeam1Score, 1)
        XCTAssertEqual(match.currentTeam2Score, 1)
    }

    // MARK: - Undo

    func testUndo_revertsLastPoint() {
        let match = makeMatch(matchType: "singles", servingTeam: 1)
        engine.processRally(winner: 1, match: match)
        engine.processRally(winner: 1, match: match)
        XCTAssertTrue(engine.undoLastRally(match: match))
        XCTAssertEqual(match.currentTeam1Score, 1)
        XCTAssertEqual(match.currentRallyLog.count, 1)
    }

    func testUndo_revertsSideout() {
        let match = makeMatch(matchType: "singles", servingTeam: 1)
        engine.processRally(winner: 2, match: match)
        XCTAssertEqual(match.servingTeam, 2)
        XCTAssertTrue(engine.undoLastRally(match: match))
        XCTAssertEqual(match.servingTeam, 1)
    }

    func testUndo_emptyLog_returnsFalse() {
        XCTAssertFalse(engine.undoLastRally(match: makeMatch()))
    }

    func testUndo_backToZero_restoresFirstServe() {
        let match = makeMatch(matchType: "doubles", servingTeam: 1, isFirstServe: true)
        engine.processRally(winner: 1, match: match)
        engine.undoLastRally(match: match)
        XCTAssertTrue(match.isFirstServeOfGame)
        XCTAssertEqual(match.currentTeam1Score, 0)
    }

    func testDoubles_undoFromServer2_restoresServer1() {
        let match = makeMatch(matchType: "doubles", servingTeam: 1, serverNumber: 1, isFirstServe: false)
        engine.processRally(winner: 2, match: match)
        XCTAssertEqual(match.serverNumber, 2)
        engine.undoLastRally(match: match)
        XCTAssertEqual(match.serverNumber, 1)
        XCTAssertEqual(match.servingTeam, 1)
    }

    func testDoubles_undoFromSideout_restoresServer2() {
        let match = makeMatch(matchType: "doubles", servingTeam: 1, serverNumber: 2, isFirstServe: false)
        engine.processRally(winner: 2, match: match)
        XCTAssertEqual(match.servingTeam, 2)
        engine.undoLastRally(match: match)
        XCTAssertEqual(match.servingTeam, 1)
        XCTAssertEqual(match.serverNumber, 2)
    }

    // MARK: - Game Finalization

    func testFinalizeGame_setsWinner() {
        let match = makeMatch(matchType: "singles", servingTeam: 1, pointsToWin: 2)
        engine.processRally(winner: 1, match: match)
        engine.processRally(winner: 1, match: match)
        let game = engine.finalizeGame(match: match)
        XCTAssertEqual(game.winnerTeam, 1)
        XCTAssertEqual(game.team1Score, 2)
        XCTAssertEqual(match.completedGames.count, 1)
    }

    func testFinalizeGame_matchEnds_whenMajorityWon() {
        let match = makeMatch(matchType: "singles", servingTeam: 1, pointsToWin: 2, numberOfGames: 3)
        engine.processRally(winner: 1, match: match)
        engine.processRally(winner: 1, match: match)
        engine.finalizeGame(match: match)

        engine.resetForNewGame(match: match, firstServingTeam: 2)
        engine.processRally(winner: 2, match: match)
        engine.processRally(winner: 1, match: match)
        engine.processRally(winner: 1, match: match)
        engine.processRally(winner: 1, match: match)
        engine.finalizeGame(match: match)

        XCTAssertEqual(match.status, "completed")
        XCTAssertEqual(match.winnerTeam, 1)
    }

    func testFinalizeGame_team2WinsBestOf3() {
        let match = makeMatch(matchType: "singles", servingTeam: 1, pointsToWin: 2, numberOfGames: 3)
        engine.processRally(winner: 2, match: match)
        engine.processRally(winner: 2, match: match)
        engine.processRally(winner: 2, match: match)
        engine.finalizeGame(match: match)
        XCTAssertNil(match.winnerTeam)

        engine.resetForNewGame(match: match, firstServingTeam: 1)
        engine.processRally(winner: 2, match: match)
        engine.processRally(winner: 2, match: match)
        engine.processRally(winner: 2, match: match)
        engine.finalizeGame(match: match)

        XCTAssertEqual(match.status, "completed")
        XCTAssertEqual(match.winnerTeam, 2)
        XCTAssertEqual(match.team2GameWins, 2)
    }

    // MARK: - JSON Round-Trip

    func testRallyEvent_jsonRoundTrip() {
        let event = RallyEvent(rallyNumber: 1, rallyWinner: 1, type: .point, team1Score: 1, team2Score: 0, servingTeam: 1, serverNumber: 1, timestamp: Date())
        let data = try! JSONEncoder().encode(event)
        let decoded = try! JSONDecoder().decode(RallyEvent.self, from: data)
        XCTAssertEqual(decoded, event)
    }

    func testWatchGame_jsonRoundTrip() {
        let game = WatchGame(team1Score: 11, team2Score: 8, winnerTeam: 1, rallyLog: [
            RallyEvent(rallyNumber: 1, rallyWinner: 1, type: .point, team1Score: 1, team2Score: 0, servingTeam: 1, serverNumber: 1, timestamp: Date())
        ])
        let data = try! JSONEncoder().encode(game)
        let decoded = try! JSONDecoder().decode(WatchGame.self, from: data)
        XCTAssertEqual(decoded.team1Score, 11)
        XCTAssertEqual(decoded.rallyLog.count, 1)
    }

    // MARK: - Helpers

    private func makeMatch(matchType: String = "singles", servingTeam: Int = 1, serverNumber: Int = 1, isFirstServe: Bool = true, pointsToWin: Int = 11, numberOfGames: Int = 1) -> WatchMatch {
        let match = WatchMatch(phoneMatchId: "test-\(UUID().uuidString)", matchType: matchType, pointsToWin: pointsToWin, numberOfGames: numberOfGames, team1Label: "Team 1", team2Label: "Team 2", scheduledDate: Date(), status: "active")
        match.servingTeam = servingTeam
        match.serverNumber = serverNumber
        match.isFirstServeOfGame = isFirstServe
        return match
    }
}
