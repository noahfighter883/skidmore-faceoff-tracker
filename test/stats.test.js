import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_GAMES, SEED_ROSTER } from '../js/seed.js';
import {
  CIRCLES, circlePosition, circleRecords, compareRecords, headToHead, isFlipped,
  opponentNumbers, opponents, summaryText, tally, zoneOf,
} from '../js/stats.js';

const pair = (rec) => [rec.w, rec.l];

// Defense total, offense total and overall, as printed on each sheet.
const SHEET_TOTALS = {
  'imported-game-1': {
    2: [[1, 0], [1, 1], [4, 1]],
    12: [[0, 3], [3, 1], [6, 7]],
    15: [[4, 2], [2, 4], [6, 11]],
    16: [[1, 2], [3, 4], [8, 7]],
    19: [[0, 2], [2, 0], [2, 2]],
    21: [[0, 0], [0, 0], [1, 0]],
    22: [[0, 1], [0, 0], [1, 1]],
  },
  'imported-game-2': {
    9: [[0, 0], [0, 0], [0, 1]],
    12: [[0, 3], [3, 2], [4, 8]],
    15: [[3, 0], [8, 5], [14, 5]],
    16: [[7, 3], [6, 0], [16, 5]],
    19: [[0, 0], [0, 1], [0, 1]],
    20: [[1, 4], [0, 4], [2, 10]],
    21: [[0, 0], [1, 0], [1, 0]],
    22: [[0, 0], [0, 0], [1, 0]],
  },
};

const game = (faceoffs) => ({ id: 'g', opponent: 'Hamilton', faceoffs, period: '1' });
const fo = (circle, skid, opp, winner, period = '1') => ({ circle, skid, opp, winner, period });

test('imported games reproduce every player total on the sheets', () => {
  for (const g of SEED_GAMES) {
    const { players } = tally([g]);
    const expected = SHEET_TOTALS[g.id];
    assert.deepEqual([...players.keys()].sort((a, b) => a - b), Object.keys(expected).map(Number));
    for (const [num, [d, o, total]] of Object.entries(expected)) {
      const p = players.get(Number(num));
      assert.deepEqual([pair(p.D), pair(p.O), pair(p.total)], [d, o, total], `#${num} in ${g.id}`);
    }
  }
});

test('team totals are 28-29 and 38-30, including the neutral zone', () => {
  const [g1, g2] = SEED_GAMES.map((g) => tally([g]).team);
  assert.deepEqual([pair(g1.D), pair(g1.O), pair(g1.N), pair(g1.total)], [[6, 10], [11, 10], [11, 9], [28, 29]]);
  assert.deepEqual([pair(g2.D), pair(g2.O), pair(g2.N), pair(g2.total)], [[11, 10], [18, 12], [9, 8], [38, 30]]);
});

test('season totals combine imported and logged games', () => {
  const logged = game([fo('O1', 15, 9, 'S')]);
  const { team, players } = tally([...SEED_GAMES, logged]);
  assert.deepEqual(pair(team.total), [67, 59]);
  assert.deepEqual(pair(players.get(15).total), [21, 16]);
});

test('every neutral circle counts toward one neutral group', () => {
  const neutral = CIRCLES.filter((c) => c.zone === 'N');
  assert.equal(neutral.length, 5);
  const { team } = tally([game(neutral.map((c) => fo(c.id, 16, 9, 'S')))]);
  assert.deepEqual(pair(team.N), [5, 0]);
  assert.deepEqual(pair(team.D), [0, 0]);
  assert.deepEqual(pair(team.O), [0, 0]);
  assert.deepEqual(pair(team.total), [5, 0]);
});

test('zones roll up into defense and offense totals', () => {
  const { team } = tally([game([
    fo('D1', 12, 9, 'S'), fo('D2', 12, 9, 'O'), fo('O1', 12, 9, 'S'), fo('O2', 12, 9, 'S'),
  ])]);
  assert.deepEqual(pair(team.D), [1, 1]);
  assert.deepEqual(pair(team.O), [2, 0]);
});

test('zone 1 is left of the goal when facing that goal', () => {
  const at = (id) => CIRCLES.find((c) => c.id === id);
  // Skidmore defends the left end, and y grows toward the bottom of the screen.
  assert.ok(at('D1').y > at('D2').y, 'facing the left goal, left is the bottom of the screen');
  assert.ok(at('O1').y < at('O2').y, 'facing the right goal, left is the top of the screen');
});

test('flipping the rink keeps each circle on the same side of its goal', () => {
  const flippedD1 = circlePosition(CIRCLES.find((c) => c.id === 'D1'), true);
  assert.deepEqual(flippedD1, { x: 169, y: 20.5 });
  assert.equal(zoneOf('D1'), 'D1');
  const logged = fo('D1', 15, 9, 'S');
  const a = tally([{ ...game([logged]), startFlipped: false }]);
  const b = tally([{ ...game([logged]), startFlipped: true }]);
  assert.deepEqual(a.team, b.team);
});

test('the rink flips at each period change and a manual flip swaps the sequence', () => {
  const flips = (startFlipped) => ['1', '2', '3', 'OT'].map((period) => isFlipped({ period, startFlipped }));
  assert.deepEqual(flips(false), [false, true, false, true]);
  assert.deepEqual(flips(true), [true, false, true, false]);
});

test('period filter applies to logged faceoffs', () => {
  const g = game([fo('O1', 15, 9, 'S', '1'), fo('O1', 15, 9, 'O', '2')]);
  assert.deepEqual(pair(tally([g], '1').team.total), [1, 0]);
  assert.deepEqual(pair(tally([g], '2').team.total), [0, 1]);
  assert.deepEqual(pair(tally([g]).team.total), [1, 1]);
});

test('opponent records stay on Skidmore\'s side and split by player', () => {
  const list = [fo('O1', 15, 9, 'S'), fo('O1', 15, 9, 'S'), fo('D1', 16, 9, 'O'), fo('N-DB', 16, 7, 'S')];
  const [nine, seven] = opponents(list);
  assert.equal(nine.num, 9);
  assert.deepEqual(pair(nine.rec), [2, 1]);
  assert.deepEqual(pair(nine.vs.get(15)), [2, 0]);
  assert.deepEqual(pair(nine.vs.get(16)), [0, 1]);
  assert.deepEqual(pair(seven.rec), [1, 0]);
  assert.deepEqual(pair(headToHead(list, 16, 9)), [0, 1]);
});

test('opposing numbers stay listed with or without a faceoff', () => {
  assert.deepEqual(opponentNumbers(game([])), []);
  assert.deepEqual(opponentNumbers({ ...game([]), oppNumbers: [30, 7] }), [7, 30]);
  assert.deepEqual(opponentNumbers({ ...game([fo('C', 15, 9, 'S'), fo('C', 15, 30, 'S')]), oppNumbers: [30, 7] }), [7, 9, 30]);
});

test('circle records separate neutral circles', () => {
  const records = circleRecords([fo('C', 15, 9, 'S'), fo('N-DB', 15, 9, 'O')]);
  assert.deepEqual(pair(records.C), [1, 0]);
  assert.deepEqual(pair(records['N-DB']), [0, 1]);
  assert.deepEqual(pair(records['N-OT']), [0, 0]);
});

test('empty records sort last in both directions', () => {
  const empty = { w: 0, l: 0 };
  const some = { w: 1, l: 1 };
  assert.ok(compareRecords(empty, some, 1) > 0);
  assert.ok(compareRecords(empty, some, -1) > 0);
});

test('summary leaves out opponents below the minimum sample', () => {
  const few = summaryText(game([fo('O1', 15, 9, 'S'), fo('O1', 15, 9, 'S'), fo('O1', 15, 9, 'S')]), SEED_ROSTER);
  assert.doesNotMatch(few, /Easiest|Toughest/);

  const enough = summaryText(game([
    fo('O1', 15, 9, 'S'), fo('O1', 15, 9, 'S'), fo('O1', 15, 9, 'S'), fo('O2', 15, 9, 'S'),
    fo('D1', 16, 7, 'O'), fo('D1', 16, 7, 'O'), fo('D1', 16, 7, 'O'), fo('D2', 16, 7, 'S'),
  ]), SEED_ROSTER);
  assert.match(enough, /Easiest: their #9, we are 4-0/);
  assert.match(enough, /Toughest: their #7, we are 1-3/);
});

test('summary names best and worst zones only with enough draws', () => {
  const text = summaryText(game([
    fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'S'),
    fo('D1', 16, 9, 'O'), fo('D1', 16, 9, 'O'), fo('D1', 16, 9, 'O'),
    fo('D2', 16, 9, 'O'),
  ]), SEED_ROSTER);
  assert.match(text, /#16 Fogu 3-4 \(43%\): best O1 3-0, worst D1 0-3/);
  assert.doesNotMatch(text, /D2 0-1/);
});

test('summary never calls a losing zone the best or a winning zone the worst', () => {
  const losing = summaryText(game([fo('D1', 12, 9, 'O'), fo('D1', 12, 9, 'O'), fo('D1', 12, 9, 'O')]), SEED_ROSTER);
  assert.match(losing, /#12 Chenevert 0-3 \(0%\): worst D1 0-3$/m);
  const winning = summaryText(game([fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'S')]), SEED_ROSTER);
  assert.match(winning, /#16 Fogu 3-0 \(100%\): best O1 3-0$/m);
});

test('summary states the score and handles an empty game', () => {
  const text = summaryText(game([fo('O1', 15, 9, 'S'), fo('D1', 15, 9, 'O')]), SEED_ROSTER);
  assert.match(text, /^Faceoffs vs Hamilton: 1-1 \(50%\)/);
  assert.match(text, /Defense 0-1 \(0%\)/);
  assert.match(text, /Neutral 0-0$/m);
  assert.equal(summaryText(game([]), SEED_ROSTER), 'No faceoffs logged against Hamilton yet.');
});

test('summary lists period scope', () => {
  const g = game([fo('O1', 15, 9, 'S', '2')]);
  assert.match(summaryText(g, SEED_ROSTER, '2'), /Hamilton in period 2:/);
  assert.equal(summaryText(g, SEED_ROSTER, 'OT'), 'No faceoffs logged in OT against Hamilton yet.');
});
