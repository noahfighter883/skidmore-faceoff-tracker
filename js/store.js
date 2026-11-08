// Saving to the browser, CSV export, and backup and restore.
import { SEED_GAMES, SEED_ROSTER } from './seed.js';
import { zoneOf } from './stats.js';

const KEY = 'skidmore-faceoffs-v1';

export function initialState() {
  return {
    roster: structuredClone(SEED_ROSTER),
    games: structuredClone(SEED_GAMES),
    currentGameId: null,
  };
}

export function isValidState(data) {
  return Boolean(data) && Array.isArray(data.roster) && Array.isArray(data.games)
    && data.games.every((g) => Array.isArray(g.faceoffs));
}

export function load(storage = localStorage) {
  const raw = storage.getItem(KEY);
  if (!raw) return initialState();
  const data = JSON.parse(raw);
  return isValidState(data) ? data : initialState();
}

// Returns false when the browser refuses the write, so the page can warn straight away.
export function save(state, storage = localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function gameToCsv(game, roster) {
  const nameOf = (num) => roster.find((p) => p.num === num)?.name ?? '';
  const rows = [['Faceoff', 'Period', 'Zone', 'Circle', 'Skidmore #', 'Skidmore player', 'Opponent #', 'Winner', 'Time']];
  game.faceoffs.forEach((f, i) => {
    rows.push([
      i + 1, f.period, zoneOf(f.circle), f.circle, f.skid, nameOf(f.skid), f.opp,
      f.winner === 'S' ? 'Skidmore' : game.opponent, f.at ?? '',
    ]);
  });
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function downloadFile(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
