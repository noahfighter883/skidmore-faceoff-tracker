// Pure stat functions. Nothing here touches the page or storage.

export const ZONES = ['D1', 'D2', 'O1', 'O2', 'N'];
export const PERIODS = ['1', '2', '3', 'OT'];

// Win % is muted, and players are left out of "toughest/easiest", below this many draws.
export const MIN_DRAWS = 4;
// Fewer draws than this in one zone is not enough to call it a best or worst zone.
export const MIN_ZONE_DRAWS = 3;

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

// Period 2 and OT are played from the opposite end to periods 1 and 3.
export function isFlipped(game) {
  const swapped = game.period === '2' || game.period === 'OT';
  return swapped !== Boolean(game.startFlipped);
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

function bestAndWorstZones(zones) {
  const ranked = ZONES
    .map((zone) => ({ zone, rec: zones[zone] }))
    .filter(({ rec }) => draws(rec) >= MIN_ZONE_DRAWS)
    .sort((a, b) => compareRecords(a.rec, b.rec));
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  return {
    best: best && pct(best.rec) > 50 ? best : null,
    worst: worst && pct(worst.rec) < 50 ? worst : null,
  };
}

const line = (label, rec) => `${label} ${formatRecord(rec)}${draws(rec) ? ` (${formatPct(rec)})` : ''}`;

// The key findings to text the coach. Plain text, short enough to read on a phone.
export function summaryText(game, roster, period = 'all') {
  const faceoffs = filterFaceoffs(game.faceoffs, period);
  const { team, players } = tally([game], period);
  const nameOf = (num) => roster.find((p) => p.num === num)?.name;
  const label = (num) => (nameOf(num) ? `#${num} ${nameOf(num)}` : `#${num}`);
  const scope = period === 'all' ? '' : period === 'OT' ? ' in OT' : ` in period ${period}`;

  if (!draws(team.total)) return `No faceoffs logged${scope} against ${game.opponent} yet.`;

  const out = [
    `Faceoffs vs ${game.opponent}${scope}: ${formatRecord(team.total)} (${formatPct(team.total)})`,
    [line('Defense', team.D), line('Offense', team.O), line('Neutral', team.N)].join('\n'),
    '',
  ];

  const isCenter = (num) => roster.find((p) => p.num === num)?.center;
  const takers = [...players.entries()]
    .filter(([num, z]) => isCenter(num) || draws(z.total) >= MIN_DRAWS)
    .sort((a, b) => draws(b[1].total) - draws(a[1].total));
  for (const [num, zones] of takers) {
    const { best, worst } = bestAndWorstZones(zones);
    const notes = [];
    if (best) notes.push(`best ${best.zone} ${formatRecord(best.rec)}`);
    if (worst) notes.push(`worst ${worst.zone} ${formatRecord(worst.rec)}`);
    out.push(`${line(label(num), zones.total)}${notes.length ? `: ${notes.join(', ')}` : ''}`);
  }

  const qualified = opponents(faceoffs)
    .filter((o) => draws(o.rec) >= MIN_DRAWS)
    .sort((a, b) => compareRecords(a.rec, b.rec));
  if (qualified.length) {
    const easiest = qualified[0];
    const toughest = qualified[qualified.length - 1];
    out.push('');
    if (pct(toughest.rec) < 50) out.push(`Toughest: their #${toughest.num}, we are ${formatRecord(toughest.rec)} against them`);
    if (pct(easiest.rec) > 50) out.push(`Easiest: their #${easiest.num}, we are ${formatRecord(easiest.rec)} against them`);
    if (out[out.length - 1] === '') out.pop();
  }
  return out.join('\n');
}
