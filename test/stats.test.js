import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_GAMES, SEED_ROSTER } from '../js/seed.js';
import {
  CIRCLES, PERIOD_GAP_MS, circleKey, circlePosition, circleRecords, compareRecords, headToHead,
  isFlipped, lastStretchLength, needsPeriodCheck, opponentNumbers, opponents, repairFaceoffs,
  summaryText, swapEnds, tally, zoneOf,
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
  assert.deepEqual(opponentNumbers({ ...game([fo('C', 15, 9, 'S'), fo('C', 15, 30, 'S')]), oppNumbers: [30, 7] }), [9, 30, 7]);
});

test('opposing numbers rank by faceoffs taken, with ties by number', () => {
  const list = [fo('C', 15, 30, 'S'), fo('C', 15, 30, 'O'), fo('C', 15, 30, 'S'), fo('C', 15, 12, 'S'), fo('C', 15, 12, 'S'), fo('C', 15, 44, 'S'), fo('C', 15, 5, 'S')];
  assert.deepEqual(opponentNumbers(game(list)), [30, 12, 5, 44]);
});

test('swapping ends gives the circle really played at that screen position', () => {
  for (const c of CIRCLES) {
    const shownAt = circlePosition(c, true);
    const swapped = CIRCLES.find((x) => x.id === swapEnds(c.id));
    assert.deepEqual(circlePosition(swapped, false), shownAt, c.id);
    assert.equal(swapEnds(swapEnds(c.id)), c.id);
  }
});

test('circle keys follow screen position and each key is used once', () => {
  const at = (id) => CIRCLES.find((c) => c.id === id);
  assert.equal(circleKey(at('D2'), false), 'q');
  assert.equal(circleKey(at('D1'), false), 'z');
  assert.equal(circleKey(at('O1'), false), 'r');
  assert.equal(circleKey(at('C'), false), 'd');
  assert.equal(circleKey(at('D1'), true), 'r');
  assert.equal(circleKey(at('O1'), true), 'z');
  for (const flipped of [false, true]) {
    assert.equal(new Set(CIRCLES.map((c) => circleKey(c, flipped))).size, 9);
  }
});

const timed = (minutes) => ({ ...fo('O1', 15, 9, 'S'), at: new Date(minutes * 60000).toISOString() });

test('a long gap asks about the period until it is answered', () => {
  const g = { ...game([timed(0)]), period: '1' };
  assert.equal(needsPeriodCheck(g, PERIOD_GAP_MS - 1), false);
  assert.equal(needsPeriodCheck(g, PERIOD_GAP_MS), true);
  assert.equal(needsPeriodCheck({ ...g, periodConfirmedAt: new Date(PERIOD_GAP_MS).toISOString() }, PERIOD_GAP_MS + 1), false);
  assert.equal(needsPeriodCheck({ ...g, period: 'OT' }, PERIOD_GAP_MS), false);
  assert.equal(needsPeriodCheck(game([]), PERIOD_GAP_MS), false);
});

test('the default repair covers the faceoffs since the last long gap', () => {
  assert.equal(lastStretchLength([]), 0);
  assert.equal(lastStretchLength([timed(0), timed(1), timed(2)]), 1);
  assert.equal(lastStretchLength([timed(0), timed(1), timed(30), timed(31), timed(32)]), 3);
});

test('repair moves only the latest faceoffs and corrects zones when asked', () => {
  const list = [fo('D1', 15, 9, 'S'), fo('O1', 15, 9, 'S'), fo('N-DB', 15, 9, 'O')];
  const fixed = repairFaceoffs(list, 2, '2', true);
  assert.deepEqual(fixed.map((f) => [f.period, f.circle]), [['1', 'D1'], ['2', 'D1'], ['2', 'N-OT']]);
  assert.deepEqual(repairFaceoffs(list, 1, '2', false).at(-1).circle, 'N-DB');
  assert.equal(list[2].period, '1');
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

const notable = [
  fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'S'),
  fo('D1', 12, 9, 'O'), fo('D1', 12, 9, 'O'), fo('D1', 12, 9, 'O'),
  fo('D2', 15, 7, 'S'), fo('D2', 15, 7, 'S'), fo('D2', 15, 7, 'O'),
];

test('coach message leaves out each player overall record', () => {
  const text = summaryText(game(notable), SEED_ROSTER);
  assert.doesNotMatch(text, /\(\d+%\): /);
  assert.doesNotMatch(text, /^#\d+ \w+ \d+-\d+ \(/m);
  assert.doesNotMatch(text, /Others|Toughest|Easiest/);
});

test('coach message names the best and worst player on each side of the ice', () => {
  const text = summaryText(game(notable), SEED_ROSTER);
  assert.match(text, /^Defense 2-4 \(33%\)\nBest: #15 Jenkins 2-1\nWorst: #12 Chenevert 0-3$/m);
  assert.match(text, /^Offense 3-0 \(100%\)\nBest: #16 Fogu 3-0\nNeutral 0-0$/m);
});

test('coach message lists strong and weak circles', () => {
  const text = summaryText(game(notable), SEED_ROSTER);
  assert.match(text, /^Strong spots:\n#16 Fogu O1 3-0\n#15 Jenkins D2 2-1$/m);
  assert.match(text, /^Weak spots:\n#12 Chenevert D1 0-3$/m);
});

test('coach message lists best and worst individual matchups', () => {
  const text = summaryText(game(notable), SEED_ROSTER);
  assert.match(text, /^Best matchups:\n#16 Fogu vs their #9 3-0\n#15 Jenkins vs their #7 2-1$/m);
  assert.match(text, /^Worst matchups:\n#12 Chenevert vs their #9 0-3$/m);
});

test('coach message ignores small samples and caps each list', () => {
  const few = summaryText(game([fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'S'), fo('D1', 12, 9, 'O')]), SEED_ROSTER);
  assert.doesNotMatch(few, /Best|Worst|spots/);
  assert.match(few, /No clear matchups yet \(needs 3\+ draws/);

  const many = [12, 15, 16, 20].flatMap((num) => [fo('O1', num, 9, 'S'), fo('O1', num, 9, 'S'), fo('O1', num, 9, 'S')]);
  const text = summaryText(game(many), SEED_ROSTER);
  assert.equal(text.match(/vs their #9 3-0/g).length, 2);
  assert.equal(text.match(/O1 3-0/g).length, 2);
});

test('coach message never calls a losing record best or a winning record worst', () => {
  const losing = summaryText(game([fo('D1', 12, 9, 'O'), fo('D1', 12, 9, 'O'), fo('D1', 12, 9, 'O')]), SEED_ROSTER);
  assert.doesNotMatch(losing, /Best/);
  const winning = summaryText(game([fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'S')]), SEED_ROSTER);
  assert.doesNotMatch(winning, /Worst|Weak/);
});

test('an even record is neither best nor worst', () => {
  const list = [fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'S'), fo('O1', 16, 9, 'O'), fo('O1', 16, 9, 'O')];
  assert.doesNotMatch(summaryText(game(list), SEED_ROSTER), /Best|Worst|spots/);
});
