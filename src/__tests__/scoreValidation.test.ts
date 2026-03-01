// Test the pickleball score validation rules
describe('Pickleball Score Validation', () => {
  const pointsToWin = 11;

  function validateGame(t1: number, t2: number, declaredWinner: 'team1' | 'team2', ptw: number = pointsToWin): { valid: boolean; message?: string } {
    const winScore = Math.max(t1, t2);
    const loseScore = Math.min(t1, t2);

    if (t1 < 0 || t2 < 0) return { valid: false, message: 'Negative scores' };
    if (winScore < ptw) return { valid: false, message: 'No team reached points to win' };
    if (winScore - loseScore < 2) return { valid: false, message: 'Must win by 2' };
    if (winScore > ptw && winScore - loseScore !== 2) return { valid: false, message: 'Past threshold, must be exactly 2 apart' };
    if (declaredWinner === 'team1' && t1 <= t2) return { valid: false, message: 'Winner mismatch' };
    if (declaredWinner === 'team2' && t2 <= t1) return { valid: false, message: 'Winner mismatch' };
    return { valid: true };
  }

  test('11-9 is valid', () => {
    expect(validateGame(11, 9, 'team1').valid).toBe(true);
  });

  test('11-10 is invalid (must win by 2)', () => {
    expect(validateGame(11, 10, 'team1').valid).toBe(false);
  });

  test('12-10 is valid (win by 2 past threshold)', () => {
    expect(validateGame(12, 10, 'team1').valid).toBe(true);
  });

  test('14-11 is invalid (not exactly win by 2 above threshold)', () => {
    expect(validateGame(14, 11, 'team1').valid).toBe(false);
  });

  test('14-12 is valid', () => {
    expect(validateGame(14, 12, 'team1').valid).toBe(true);
  });

  test('0-11 is valid', () => {
    expect(validateGame(0, 11, 'team2').valid).toBe(true);
  });

  test('negative scores are invalid', () => {
    expect(validateGame(-1, 11, 'team2').valid).toBe(false);
  });

  test('11-0 with team2 declared winner is invalid', () => {
    expect(validateGame(11, 0, 'team2').valid).toBe(false);
  });

  test('5-3 is invalid (no team reached points to win)', () => {
    expect(validateGame(5, 3, 'team1').valid).toBe(false);
  });

  test('21-19 with pointsToWin=21 is valid', () => {
    expect(validateGame(21, 19, 'team1', 21).valid).toBe(true);
  });
});
