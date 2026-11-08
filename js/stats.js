// Pure stat functions. Nothing here touches the page or storage.

export const ZONES = ['D1', 'D2', 'O1', 'O2', 'N'];
export const PERIODS = ['1', '2', '3', 'OT'];

// Win % is muted, and players are left out of "toughest/easiest", below this many draws.
export const MIN_DRAWS = 4;
// Fewer draws than this is not enough to call out a player in a zone or a matchup.
export const MIN_NOTABLE_DRAWS = 3;
// How many strong spots, weak spots and matchups the coach message lists.
const NOTABLE_LIST_LENGTH = 2;

// The nine faceoff circles, positioned for Skidmore defending the left end.
// x and y are in feet on a 200 x 85 rink. Zone 1 is left of the goal, facing that goal.
export const CIRCLES = [
  { id: 'D1', zone: 'D1', x: 31, y: 64.5, r: 15 },
  { id: 'D2', zone: 'D2', x: 31, y: 20.5, r: 15 },
  { id: 'O1', zone: 'O1', x: 169, y: 20.5, r: 15 },
  { id: 'O2', zone: 'O2', x: 169, y: 64.5, r: 15 },
  { id: 'N-DB', zone: 'N', x: 80, y: 64.5, r: 9.5 },
  { id: 'N-DT', zone: 'N', x: 80, y: 20.5, r: 9.5 },
  { id: 'N-OT', zone: 'N', x: 120, y: 20.5, r: 9.5 },
  { id: 'N-OB', zone: 'N', x: 120, y: 64.5, r: 9.5 },
  { id: 'C', zone: 'N', x: 100, y: 42.5, r: 13 },
];

export function zoneOf(circleId) {
  return CIRCLES.find((c) => c.id === circleId)?.zone;
}

// A rink flip is a half turn, so each circle stays in the same place relative to the goals.
export function circlePosition(circle, flipped) {
  return flipped ? { x: 200 - circle.x, y: 85 - circle.y } : { x: circle.x, y: circle.y };
}

// The key for each circle follows where it sits on screen, so it changes when the rink flips.
export function circleKey(circle, flipped) {
  if (circle.id === 'C') return 'd';
  const { x, y } = circlePosition(circle, flipped);
  const column = [31, 80, 120, 169].indexOf(x);
  return (y < 42.5 ? 'qwer' : 'zxcv')[column];
}

// Period 2 and OT are played from the opposite end to periods 1 and 3.
export function isFlipped(game) {
  const swapped = game.period === '2' || game.period === 'OT';
  return swapped !== Boolean(game.startFlipped);
}

// A gap this long between draws usually means an intermission.
export const PERIOD_GAP_MS = 8 * 60 * 1000;

export function nextPeriod(period) {
  return PERIODS[PERIODS.indexOf(period) + 1];
}

// True when a long gap means the period may have changed without being updated.
export function needsPeriodCheck(game, now = Date.now()) {
  const lastAt = game.faceoffs.at(-1)?.at;
  if (!lastAt || !nextPeriod(game.period)) return false;
  const confirmedAt = game.periodConfirmedAt ? Date.parse(game.periodConfirmedAt) : 0;
  const since = Math.max(Date.parse(lastAt), confirmedAt);
  return now - since >= PERIOD_GAP_MS;
}

// How many of the latest faceoffs came after the last long gap, or 1 if there was no gap.
export function lastStretchLength(faceoffs) {
  for (let i = faceoffs.length - 1; i > 0; i -= 1) {
    if (Date.parse(faceoffs[i].at) - Date.parse(faceoffs[i - 1].at) >= PERIOD_GAP_MS) {
      return faceoffs.length - i;
    }
  }
  return Math.min(faceoffs.length, 1);
}

const END_SWAPS = {
  D1: 'O1', O1: 'D1', D2: 'O2', O2: 'D2',
  'N-DB': 'N-OT', 'N-OT': 'N-DB', 'N-DT': 'N-OB', 'N-OB': 'N-DT',
  C: 'C',
};

// The circle actually played at the same spot on screen if the rink was facing the wrong way.
export function swapEnds(circleId) {
  return END_SWAPS[circleId];
}

// Moves the latest faceoffs to the right period, optionally correcting a backwards rink.
export function repairFaceoffs(faceoffs, count, period, swap) {
  const start = Math.max(faceoffs.length - count, 0);
  return faceoffs.map((f, i) => (i < start ? f : {
    ...f,
    period,
    circle: swap ? swapEnds(f.circle) : f.circle,
  }));
}

const blank = () => ({ w: 0, l: 0 });

function addTo(rec, w, l) {
  rec.w += w;
  rec.l += l;
}

export function draws(rec) {
  return rec.w + rec.l;
}

export function pct(rec) {
  return draws(rec) ? Math.round((100 * rec.w) / draws(rec)) : null;
}

export function formatRecord(rec) {
  return `${rec.w}-${rec.l}`;
}

export function formatPct(rec) {
  const p = pct(rec);
  return p === null ? '' : `${p}%`;
}

function blankZones() {
  return {
    D1: blank(), D2: blank(), O1: blank(), O2: blank(), N: blank(),
    D: blank(), O: blank(), total: blank(),
  };
}

function addToZones(zones, zone, w, l) {
  addTo(zones[zone], w, l);
  if (zone !== 'N') addTo(zones[zone[0]], w, l);
  addTo(zones.total, w, l);
}

export function filterFaceoffs(faceoffs, period) {
  return !period || period === 'all' ? faceoffs : faceoffs.filter((f) => f.period === period);
}

// Team and per-player zone records for any set of games, logged or imported.
export function tally(games, period = 'all') {
  const team = blankZones();
  const players = new Map();
  const forPlayer = (num) => {
    if (!players.has(num)) players.set(num, blankZones());
    return players.get(num);
  };

  for (const game of games) {
    for (const f of filterFaceoffs(game.faceoffs, period)) {
      const won = f.winner === 'S' ? 1 : 0;
      const zone = zoneOf(f.circle);
      addToZones(team, zone, won, 1 - won);
      addToZones(forPlayer(f.skid), zone, won, 1 - won);
    }
    if (game.totals && period === 'all') {
      for (const [num, zones] of Object.entries(game.totals)) {
        for (const [zone, [w, l]] of Object.entries(zones)) {
          addToZones(team, zone, w, l);
          addToZones(forPlayer(Number(num)), zone, w, l);
        }
      }
    }
  }
  return { team, players };
}

// Skidmore's record at each circle.
export function circleRecords(faceoffs) {
  const records = {};
  for (const c of CIRCLES) records[c.id] = blank();
  for (const f of faceoffs) {
    addTo(records[f.circle], f.winner === 'S' ? 1 : 0, f.winner === 'S' ? 0 : 1);
  }
  return records;
}

// Skidmore's record against each opposing number, overall and by Skidmore player.
// Records are always from Skidmore's side: 3-1 means Skidmore won 3 of 4.
export function opponents(faceoffs) {
  const map = new Map();
  for (const f of faceoffs) {
    if (!map.has(f.opp)) map.set(f.opp, { num: f.opp, rec: blank(), vs: new Map() });
    const entry = map.get(f.opp);
    if (!entry.vs.has(f.skid)) entry.vs.set(f.skid, blank());
    const won = f.winner === 'S' ? 1 : 0;
    addTo(entry.rec, won, 1 - won);
    addTo(entry.vs.get(f.skid), won, 1 - won);
  }
  return [...map.values()].sort((a, b) => draws(b.rec) - draws(a.rec) || a.num - b.num);
}

// Every opposing number to offer as a button, most faceoffs first. Ties go by jersey number.
export function opponentNumbers(game) {
  const counts = new Map((game.oppNumbers ?? []).map((n) => [n, 0]));
  for (const f of game.faceoffs) counts.set(f.opp, (counts.get(f.opp) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a - b);
}

export function headToHead(faceoffs, skid, opp) {
  const rec = blank();
  for (const f of faceoffs) {
    if (f.skid === skid && f.opp === opp) addTo(rec, f.winner === 'S' ? 1 : 0, f.winner === 'S' ? 0 : 1);
  }
  return rec;
}

// Ranks win % first, then the larger sample. Empty records sort last in either direction.
export function compareRecords(a, b, direction = 1) {
  const pa = pct(a);
  const pb = pct(b);
  if (pa === null || pb === null) return (pa === null) - (pb === null);
  return direction * (pb - pa) || draws(b) - draws(a);
}

const line = (label, rec) => `${label} ${formatRecord(rec)}${draws(rec) ? ` (${formatPct(rec)})` : ''}`;

// Winning records, best first: highest win %, then the larger sample.
function bestOf(items) {
  return items.filter(({ rec }) => pct(rec) > 50).sort((a, b) => compareRecords(a.rec, b.rec));
}

// Losing records, worst first: lowest win %, then the larger sample.
function worstOf(items) {
  return items.filter(({ rec }) => pct(rec) < 50)
    .sort((a, b) => pct(a.rec) - pct(b.rec) || draws(b.rec) - draws(a.rec));
}

const enoughDraws = ({ rec }) => draws(rec) >= MIN_NOTABLE_DRAWS;

// The key findings to text the coach: who stands out by zone and in individual matchups.
// He already gets each player's overall numbers, so those are left out. Plain text for a phone.
export function summaryText(game, roster, period = 'all') {
  const faceoffs = filterFaceoffs(game.faceoffs, period);
  const { team, players } = tally([game], period);
  const nameOf = (num) => roster.find((p) => p.num === num)?.name;
  const label = (num) => (nameOf(num) ? `#${num} ${nameOf(num)}` : `#${num}`);
  const scope = period === 'all' ? '' : period === 'OT' ? ' in OT' : ` in period ${period}`;

  if (!draws(team.total)) return `No faceoffs logged${scope} against ${game.opponent} yet.`;

  const out = [`Faceoffs vs ${game.opponent}${scope}: ${formatRecord(team.total)} (${formatPct(team.total)})`, ''];

  // Team record for each part of the ice, with the players who stand out there.
  const areas = [['Defense', 'D'], ['Offense', 'O'], ['Neutral', 'N']];
  for (const [name, key] of areas) {
    const inArea = [...players.entries()]
      .map(([num, zones]) => ({ text: label(num), rec: zones[key] }))
      .filter(enoughDraws);
    const [best] = bestOf(inArea);
    const [worst] = worstOf(inArea);
    out.push(line(name, team[key]));
    if (best) out.push(`Best: ${best.text} ${formatRecord(best.rec)}`);
    if (worst) out.push(`Worst: ${worst.text} ${formatRecord(worst.rec)}`);
  }

  // Single circles, where a player's split can differ from their side of the ice.
  const spots = [...players.entries()].flatMap(([num, zones]) => ['D1', 'D2', 'O1', 'O2']
    .map((zone) => ({ text: `${label(num)} ${zone}`, rec: zones[zone] })))
    .filter(enoughDraws);
  const listRecords = (items) => items.slice(0, NOTABLE_LIST_LENGTH)
    .map(({ text, rec }) => `${text} ${formatRecord(rec)}`);
  const strong = listRecords(bestOf(spots));
  const weak = listRecords(worstOf(spots));
  if (strong.length || weak.length) out.push('');
  if (strong.length) out.push('Strong spots:', ...strong);
  if (weak.length) out.push('Weak spots:', ...weak);

  // Individual matchups.
  const matchups = opponents(faceoffs).flatMap((o) => [...o.vs.entries()]
    .map(([num, rec]) => ({ text: `${label(num)} vs their #${o.num}`, rec })))
    .filter(enoughDraws);
  const bestMatchups = listRecords(bestOf(matchups));
  const worstMatchups = listRecords(worstOf(matchups));
  out.push('');
  if (bestMatchups.length) out.push('Best matchups:', ...bestMatchups);
  if (worstMatchups.length) out.push('Worst matchups:', ...worstMatchups);
  if (!bestMatchups.length && !worstMatchups.length) {
    out.push(`No clear matchups yet (needs ${MIN_NOTABLE_DRAWS}+ draws between the same two players).`);
  }
  return out.join('\n');
}
