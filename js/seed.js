// Starting roster and games 1 and 2, transcribed from the Google Sheets.
// Imported games are zone totals per player: { jersey: { zone: [wins, losses] } }.

export const SEED_ROSTER = [
  { num: 2, name: 'Gibbons', hand: 'R', center: true },
  { num: 8, name: 'Zimovcak', hand: 'L', center: false },
  { num: 9, name: 'Floccare', hand: '', center: false },
  { num: 10, name: 'Spaulding', hand: 'L', center: false },
  { num: 11, name: 'Terry', hand: '', center: false },
  { num: 12, name: 'Chenevert', hand: 'R', center: true },
  { num: 14, name: 'Tang', hand: 'R', center: false },
  { num: 15, name: 'Jenkins', hand: 'R', center: true },
  { num: 16, name: 'Fogu', hand: 'L', center: true },
  { num: 17, name: 'Angelopoulos', hand: 'R', center: false },
  { num: 18, name: 'Baker', hand: 'R', center: false },
  { num: 19, name: 'Mackenzie', hand: 'L', center: false },
  { num: 20, name: 'Urban', hand: '', center: false },
  { num: 21, name: 'Stratton', hand: 'L', center: false },
  { num: 22, name: 'Rice', hand: 'R', center: false },
  { num: 25, name: 'Pierson', hand: 'R', center: false },
];

export const SEED_GAMES = [
  {
    id: 'imported-game-1',
    opponent: 'Game 1',
    date: '',
    imported: true,
    faceoffs: [],
    totals: {
      2: { D1: [1, 0], O1: [1, 0], O2: [0, 1], N: [2, 0] },
      12: { D1: [0, 2], D2: [0, 1], O1: [2, 0], O2: [1, 1], N: [3, 3] },
      15: { D1: [1, 2], D2: [3, 0], O1: [0, 3], O2: [2, 1], N: [0, 5] },
      16: { D1: [1, 2], O1: [3, 2], O2: [0, 2], N: [4, 1] },
      19: { D1: [0, 1], D2: [0, 1], O1: [2, 0] },
      21: { N: [1, 0] },
      22: { D2: [0, 1], N: [1, 0] },
    },
  },
  {
    id: 'imported-game-2',
    opponent: 'Game 2',
    date: '',
    imported: true,
    faceoffs: [],
    totals: {
      9: { N: [0, 1] },
      12: { D1: [0, 2], D2: [0, 1], O1: [2, 0], O2: [1, 2], N: [1, 3] },
      15: { D1: [2, 0], D2: [1, 0], O1: [2, 3], O2: [6, 2], N: [3, 0] },
      16: { D1: [6, 2], D2: [1, 1], O1: [6, 0], N: [3, 2] },
      19: { O2: [0, 1] },
      20: { D1: [0, 3], D2: [1, 1], O1: [0, 2], O2: [0, 2], N: [1, 2] },
      21: { O1: [1, 0] },
      22: { N: [1, 0] },
    },
  },
];
