import {
  CIRCLES, MIN_DRAWS, PERIODS, ZONES, circlePosition, circleRecords, compareRecords, draws,
  filterFaceoffs, formatPct, formatRecord, headToHead, isFlipped, opponentNumbers, opponents, pct,
  summaryText, tally, zoneOf,
} from './stats.js';
import { downloadFile, gameToCsv, isValidState, load, save } from './store.js';

const state = load();
const ui = {
  view: 'live',
  sel: { circle: null, skid: null, opp: null },
  message: '',
  filter: 'all',
  sort: { key: 'total', dir: 1 },
  openOpp: null,
  statsScope: null,
  editingId: null,
  editingGameId: null,
};

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const currentGame = () => state.games.find((g) => g.id === state.currentGameId);
const player = (num) => state.roster.find((p) => p.num === num);
const skidLabel = (num) => (player(num) ? `#${num} ${player(num).name}` : `#${num}`);
const rosterOrder = () => [...state.roster].sort((a, b) => (b.center - a.center) || (a.num - b.num));
const periodLabel = (p) => (p === 'OT' ? 'OT' : `P${p}`);
const circleLabel = (circle) => (circle.zone === 'N' ? (circle.id === 'C' ? 'Center ice' : `Neutral ${circle.id.slice(2)}`) : circle.zone);
const zoneLabel = (id) => (zoneOf(id) === 'N' ? 'Neutral' : zoneOf(id));

function persist() {
  showNotice(save(state) ? '' : 'This browser did not save your last change. Download a backup from Games and roster now.');
}

function showNotice(text) {
  $('notice').textContent = text;
  $('notice').hidden = !text;
}

function toneClass(rec) {
  if (draws(rec) < MIN_DRAWS) return '';
  if (pct(rec) >= 55) return 'good';
  return pct(rec) <= 45 ? 'bad' : '';
}

function pctCell(rec) {
  if (!draws(rec)) return '<td class="rec-empty"></td>';
  return `<td class="${draws(rec) < MIN_DRAWS ? 'thin' : ''}">${formatPct(rec)}</td>`;
}

function recCell(rec) {
  return draws(rec)
    ? `<td class="${toneClass(rec)}">${formatRecord(rec)}</td>`
    : '<td class="rec-empty">&nbsp;</td>';
}

// Top bar

function renderBar() {
  const game = currentGame();
  $('matchup').textContent = game ? `Skidmore vs ${game.opponent}` : 'Skidmore faceoffs';
  $('barGame').innerHTML = !game ? '' : `
    <span class="score" aria-label="Skidmore faceoff record">${formatRecord(tally([game]).team.total)}<small>${formatPct(tally([game]).team.total)}</small></span>
    <span class="group" role="group" aria-label="Current period">
      <span class="group-label">Period</span>
      ${PERIODS.map((p) => `<button type="button" class="pick" data-action="period" data-value="${p}" aria-pressed="${game.period === p}">${p}</button>`).join('')}
    </span>
    <button type="button" class="ghost" data-action="flip">Flip rink</button>
    <button type="button" class="send" data-action="openText">Text the coach</button>`;
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.value === ui.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

// Rink

const RINK_MARKINGS = `
  <rect class="rink-surface" x="0" y="0" width="200" height="85" rx="28" ry="28"/>
  <line class="rink-goal-line" x1="11" y1="2" x2="11" y2="83"/>
  <line class="rink-goal-line" x1="189" y1="2" x2="189" y2="83"/>
  <path class="rink-crease" d="M11 36.5 h3.5 a6 6 0 0 1 0 12 h-3.5 z"/>
  <path class="rink-crease" d="M189 36.5 h-3.5 a6 6 0 0 0 0 12 h3.5 z"/>
  <path class="rink-net" d="M11 39.5 h-3 v6 h3"/>
  <path class="rink-net" d="M189 39.5 h3 v6 h-3"/>
  <line class="rink-blue-line" x1="75" y1="0" x2="75" y2="85"/>
  <line class="rink-blue-line" x1="125" y1="0" x2="125" y2="85"/>
  <line class="rink-center-line" x1="100" y1="0" x2="100" y2="85"/>`;

function renderRink() {
  const game = currentGame();
  const flipped = isFlipped(game);
  const records = circleRecords(filterFaceoffs(game.faceoffs, ui.filter));
  const captions = flipped
    ? ['Skidmore attacks', 'Skidmore defends']
    : ['Skidmore defends', 'Skidmore attacks'];

  const dots = CIRCLES.map((circle) => {
    const { x, y } = circlePosition(circle, flipped);
    const rec = records[circle.id];
    const small = circle.r < 12;
    const name = circle.zone === 'N' ? (circle.id === 'C' ? 'Center' : 'N') : circle.zone;
    const thin = draws(rec) < MIN_DRAWS ? 'thin' : '';
    const hasStats = draws(rec) > 0;
    const step = small ? 4.2 : 6;
    const nameY = hasStats ? y - step * 0.55 : y + (small ? 1.6 : 2.2);
    const classes = ['dot', small ? 'small' : '', circle.id === 'C' ? 'center' : '', toneClass(rec),
      ui.sel.circle === circle.id ? 'selected' : ''].join(' ');
    const summary = hasStats ? `, Skidmore ${formatRecord(rec)}, ${formatPct(rec)}` : '';
    return `<g class="${classes}" role="button" tabindex="0" data-action="circle" data-value="${circle.id}"
        aria-pressed="${ui.sel.circle === circle.id}" aria-label="${circleLabel(circle)}${summary}">
      <circle cx="${x}" cy="${y}" r="${circle.r}"/>
      <text class="dot-name" x="${x}" y="${nameY}">${name}</text>
      ${hasStats ? `<text class="dot-rec" x="${x}" y="${nameY + step * 0.9}">${formatRecord(rec)}</text>
      <text class="dot-pct ${thin}" x="${x}" y="${nameY + step * 1.65}">${formatPct(rec)}</text>` : ''}
    </g>`;
  }).join('');

  $('rink').innerHTML = `${RINK_MARKINGS}
    <text class="rink-caption" x="60" y="43.7">${captions[0]}</text>
    <text class="rink-caption" x="140" y="43.7">${captions[1]}</text>
    ${dots}`;
}

// Entry steps

function nextStep() {
  const { circle, skid, opp } = ui.sel;
  if (circle === null) return 'circle';
  if (skid === null) return 'skid';
  return opp === null ? 'opp' : 'winner';
}

const PROMPTS = {
  circle: 'Click the faceoff circle on the rink',
  skid: 'Click the Skidmore player',
  opp: 'Click or type the opposing number',
  winner: 'Who won the faceoff?',
};

function contextLine(game) {
  const { circle, skid, opp } = ui.sel;
  if (skid !== null) {
    const zones = tally([game]).players.get(skid);
    const parts = zones ? ZONES.map((z) => {
      const text = `${z === 'N' ? 'Neutral' : z} ${formatRecord(zones[z])}`;
      return circle && zoneOf(circle) === z ? `<span class="now">${text}</span>` : text;
    }) : [];
    const vs = opp !== null && draws(headToHead(game.faceoffs, skid, opp))
      ? `, against #${opp} ${formatRecord(headToHead(game.faceoffs, skid, opp))}` : '';
    if (!zones) return `<b>${esc(skidLabel(skid))}</b> has no draws yet this game`;
    return `<b>${esc(skidLabel(skid))}</b> ${formatRecord(zones.total)} (${formatPct(zones.total)}): ${parts.join(', ')}${vs}`;
  }
  if (opp !== null) {
    const entry = opponents(game.faceoffs).find((o) => o.num === opp);
    if (entry) return `<b>Their #${opp}</b>: Skidmore is ${formatRecord(entry.rec)} against them`;
  }
  return '';
}

function renderEntry() {
  const game = currentGame();
  const step = nextStep();
  const { skid, opp } = ui.sel;
  const oppNums = opponentNumbers(game);
  const canRemoveOpp = opp !== null && !game.faceoffs.some((f) => f.opp === opp);
  const showMessage = step === 'circle' && ui.message;
  const ready = step === 'winner';

  $('entry').innerHTML = `
    <p class="prompt ${showMessage ? 'saved' : ''}" role="status">${esc(showMessage || PROMPTS[step])}</p>
    <div class="step ${step === 'skid' ? 'active' : ''}">
      <span class="step-label">Skidmore</span>
      <div class="jerseys">
        ${rosterOrder().map((p) => `<button type="button" class="jersey ${p.center ? 'center' : ''}" data-action="skid" data-value="${p.num}" aria-pressed="${skid === p.num}">
          <b>${p.num}</b><small>${esc(p.name)}</small></button>`).join('')}
      </div>
    </div>
    <div class="step ${step === 'opp' ? 'active' : ''}">
      <span class="step-label">Opponent</span>
      <div class="opp-row">
        ${oppNums.map((n) => `<button type="button" class="jersey" data-action="opp" data-value="${n}" aria-pressed="${opp === n}"><b>${n}</b></button>`).join('')}
        <form class="opp-form" id="oppForm">
          <label class="visually-hidden" for="oppInput">New opposing number</label>
          <input id="oppInput" inputmode="numeric" maxlength="2" pattern="[0-9]{1,2}" placeholder="New number" autocomplete="off">
          <button type="submit">Add</button>
        </form>
        ${canRemoveOpp ? `<button type="button" class="plain" data-action="removeOpp" data-value="${opp}">Remove #${opp}</button>` : ''}
      </div>
    </div>
    <p class="context">${contextLine(game)}</p>
    <div class="winners">
      <button type="button" class="win us" data-action="win" data-value="S" ${ready ? '' : 'disabled'}>Skidmore won<small>${skid !== null ? esc(skidLabel(skid)) : 'Pick both players first'}</small></button>
      <button type="button" class="win them" data-action="win" data-value="O" ${ready ? '' : 'disabled'}>${esc(game.opponent)} won<small>${opp !== null ? `#${opp}` : 'Pick both players first'}</small></button>
      <button type="button" class="plain" data-action="clear">Clear</button>
    </div>`;
}

// Live stats panel

function sortedPlayers(players) {
  const { key, dir } = ui.sort;
  const rows = [...players.entries()].map(([num, zones]) => ({ num, zones }));
  const byNum = (a, b) => a.num - b.num;
  return rows.sort((a, b) => {
    if (key === 'num') return dir * byNum(a, b);
    if (key === 'name') {
      return dir * (player(a.num)?.name ?? '').localeCompare(player(b.num)?.name ?? '') || byNum(a, b);
    }
    if (key === 'total') return dir * (draws(b.zones.total) - draws(a.zones.total)) || byNum(a, b);
    const zone = key === 'pct' ? 'total' : key;
    return compareRecords(a.zones[zone], b.zones[zone], dir) || byNum(a, b);
  });
}

function sortHeader(key, label, cls = '') {
  const active = ui.sort.key === key;
  const ascending = (key === 'num' || key === 'name') === (ui.sort.dir === 1);
  const aria = active ? `aria-sort="${ascending ? 'ascending' : 'descending'}"` : '';
  const arrow = active ? (ascending ? ' ▲' : ' ▼') : '';
  return `<th scope="col" class="${cls}" ${aria}><button type="button" data-action="sort" data-value="${key}">${label}${arrow}</button></th>`;
}

function playerTable(players, { extended = false, team = null } = {}) {
  const zoneCols = extended
    ? [['D1', 'D1'], ['D2', 'D2'], ['D', 'Defense'], ['O1', 'O1'], ['O2', 'O2'], ['O', 'Offense'], ['N', 'Neutral']]
    : [['D1', 'D1'], ['D2', 'D2'], ['O1', 'O1'], ['O2', 'O2'], ['N', 'N']];
  const row = (label, zones, cls = '') => `<tr class="${cls}">${label}
      ${recCell(zones.total)}${pctCell(zones.total)}
      ${zoneCols.map(([z]) => recCell(zones[z])).join('')}
    </tr>`;
  return `<table>
    <thead><tr>
      ${sortHeader('num', '#', 'left')}${sortHeader('name', 'Player', 'left')}
      ${extended ? '<th scope="col" class="left">Hand</th>' : ''}
      ${sortHeader('total', 'Total')}${sortHeader('pct', '%')}
      ${zoneCols.map(([z, label]) => sortHeader(z, label)).join('')}
    </tr></thead>
    <tbody>
      ${sortedPlayers(players).map(({ num, zones }) => {
        const p = player(num);
        const label = `<th scope="row" class="left">${num}</th><td class="left">${esc(p?.name ?? '')}</td>${extended ? `<td class="left">${esc(p?.hand ?? '')}</td>` : ''}`;
        return row(label, zones, extended && p?.center ? 'is-center' : '');
      }).join('')}
      ${team ? row(`<th scope="row" class="left" colspan="${extended ? 3 : 2}">Team</th>`, team, 'team-row') : ''}
    </tbody>
  </table>`;
}

function periodFilters() {
  const options = [['all', 'Game'], ...PERIODS.map((p) => [p, p === 'OT' ? 'OT' : `P${p}`])];
  return `<div class="filters" role="group" aria-label="Show stats for">
    ${options.map(([value, label]) => `<button type="button" data-action="filter" data-value="${value}" aria-pressed="${ui.filter === value}">${label}</button>`).join('')}
  </div>`;
}

function glanceItem(label, rec) {
  const tone = toneClass(rec);
  const textClass = tone ? `${tone}-text` : '';
  return `<div><span>${label}</span><b>${formatRecord(rec)}</b><span class="pct-label ${textClass}">${formatPct(rec) || 'No draws'}</span></div>`;
}

function renderPanel() {
  const game = currentGame();
  const faceoffs = filterFaceoffs(game.faceoffs, ui.filter);
  const { team, players } = tally([game], ui.filter);
  const opps = opponents(faceoffs);
  const recent = game.faceoffs.slice(-20).reverse();

  const oppRows = opps.map((o) => {
    const open = ui.openOpp === o.num;
    return `<tr><th scope="row" class="left"><button type="button" class="link" data-action="toggleOpp" data-value="${o.num}" aria-expanded="${open}">#${o.num}</button></th>
      ${recCell(o.rec)}${pctCell(o.rec)}<td class="left">${o.vs.size} ${o.vs.size === 1 ? 'player' : 'players'} faced</td></tr>
      ${open ? `<tr class="expanded"><td colspan="4">${[...o.vs.entries()].sort((a, b) => draws(b[1]) - draws(a[1])).map(([num, rec]) => `<span>${esc(skidLabel(num))} ${formatRecord(rec)}</span>`).join('')}</td></tr>` : ''}`;
  }).join('');

  $('panel').innerHTML = `
    <div class="panel-head"><h2 class="panel-title">Live stats</h2><span class="spacer"></span>${periodFilters()}</div>
    <div class="glance">${glanceItem('Overall', team.total)}${glanceItem('Defense', team.D)}${glanceItem('Offense', team.O)}${glanceItem('Neutral', team.N)}</div>
    <section class="panel-section grow">
      <h2 class="panel-title">Skidmore by zone</h2>
      <div class="scroll">${players.size ? playerTable(players) : '<p class="empty">Player records appear after the first faceoff.</p>'}</div>
    </section>
    <section class="panel-section grow">
      <h2 class="panel-title">Skidmore against each opponent</h2>
      <div class="scroll">${opps.length ? `<table><thead><tr><th scope="col" class="left">Their #</th><th scope="col">Skidmore</th><th scope="col">%</th><th scope="col" class="left">Click # for split</th></tr></thead><tbody>${oppRows}</tbody></table>` : '<p class="empty">Opposing players appear after the first faceoff.</p>'}</div>
    </section>
    <section class="panel-section short">
      <div class="panel-head"><h2 class="panel-title">Recent faceoffs</h2><span class="spacer"></span>
        ${game.faceoffs.length ? '<button type="button" class="link" data-action="undo">Undo last</button>' : ''}</div>
      <div class="scroll">${recent.length ? `<ul class="recent">${recent.map((f) => `<li><button type="button" data-action="editFaceoff" data-value="${f.id}" aria-label="Edit ${periodLabel(f.period)} ${zoneLabel(f.circle)} faceoff">
        <span>${periodLabel(f.period)}</span><span>${zoneOf(f.circle)}</span><span>${esc(skidLabel(f.skid))} vs #${f.opp}</span>
        <span class="${f.winner === 'S' ? 'res-win' : 'res-loss'}">${f.winner === 'S' ? 'Won' : 'Lost'}</span></button></li>`).join('')}</ul>` : '<p class="empty">Nothing logged yet.</p>'}</div>
    </section>`;
}

function renderLive() {
  const live = $('view-live');
  const hasGame = Boolean(currentGame());
  live.querySelector('.ice').hidden = !hasGame;
  $('panel').hidden = !hasGame;
  live.querySelector('.start')?.remove();
  if (!hasGame) {
    live.insertAdjacentHTML('beforeend', `<div class="start">
      <h1>Start a game to log faceoffs</h1>
      <p>Enter the opponent, then click the circle, both players and the winner for each draw.</p>
      <button type="button" class="primary" data-action="newGame">Start a game</button>
    </div>`);
    return;
  }
  renderRink();
  renderEntry();
  renderPanel();
}

// Full stats view

function statsScope() {
  if (ui.statsScope && (ui.statsScope === 'season' || state.games.some((g) => g.id === ui.statsScope))) return ui.statsScope;
  return state.currentGameId ?? 'season';
}

function matchupGrid(faceoffs) {
  const opps = opponents(faceoffs);
  const skidNums = [...new Set(faceoffs.map((f) => f.skid))].sort((a, b) => a - b);
  if (!opps.length) return '<p class="empty">No opposing players logged here yet.</p>';
  return `<table><thead><tr><th scope="col" class="left">Their #</th><th scope="col">Skidmore</th><th scope="col">%</th>
      ${skidNums.map((n) => `<th scope="col">${esc(skidLabel(n))}</th>`).join('')}</tr></thead>
    <tbody>${opps.map((o) => `<tr><th scope="row" class="left">#${o.num}</th>${recCell(o.rec)}${pctCell(o.rec)}
      ${skidNums.map((n) => recCell(o.vs.get(n) ?? { w: 0, l: 0 })).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderFull() {
  const scope = statsScope();
  const game = state.games.find((g) => g.id === scope);
  const games = game ? [game] : state.games;
  const canFilter = Boolean(game) && !game.imported;
  const period = canFilter ? ui.filter : 'all';
  const { team, players } = tally(games, period);
  for (const p of state.roster) {
    if (!players.has(p.num)) players.set(p.num, tally([]).team);
  }

  let matchups;
  if (game) {
    matchups = game.imported
      ? '<p class="empty">The sheet for this game has no opposing numbers.</p>'
      : matchupGrid(filterFaceoffs(game.faceoffs, period));
  } else {
    const byOpponent = new Map();
    for (const g of state.games.filter((x) => !x.imported)) {
      byOpponent.set(g.opponent, [...(byOpponent.get(g.opponent) ?? []), ...g.faceoffs]);
    }
    matchups = byOpponent.size
      ? [...byOpponent.entries()].map(([name, list]) => `<h3>${esc(name)}</h3>${matchupGrid(list)}`).join('')
      : '<p class="empty">No logged games yet.</p>';
  }

  $('view-full').innerHTML = `
    <div class="page-head">
      <label>Show <select id="scopeSelect">
        <option value="season" ${scope === 'season' ? 'selected' : ''}>Season, all games</option>
        ${state.games.map((g) => `<option value="${esc(g.id)}" ${scope === g.id ? 'selected' : ''}>${esc(gameTitle(g))}</option>`).join('')}
      </select></label>
      ${canFilter ? periodFilters() : ''}
    </div>
    <section class="sheet">
      <h2>Skidmore by zone</h2>
      <p class="hint">Zone 1 is left of the goal, facing that goal. Percentages are muted under ${MIN_DRAWS} draws.</p>
      ${playerTable(players, { extended: true, team })}
    </section>
    <section class="sheet">
      <h2>Skidmore against each opponent</h2>
      ${scope === 'season' ? '<p class="hint">Covers logged games only, because the sheets for games 1 and 2 have no opposing numbers.</p>' : ''}
      ${matchups}
    </section>`;
}

// Games and roster view

function gameTitle(game) {
  return game.date ? `${game.opponent}, ${game.date}` : game.opponent;
}

function renderManage() {
  const games = [...state.games].reverse();
  $('view-manage').innerHTML = `<div class="manage-grid">
    <div>
      <section class="sheet">
        <div class="page-head"><h2>Games</h2><span class="spacer"></span><button type="button" class="primary" data-action="newGame">Start a game</button></div>
        <table><thead><tr><th scope="col" class="left">Game</th><th scope="col">Record</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
        <tbody>${games.map((g) => {
          const total = tally([g]).team.total;
          const current = g.id === state.currentGameId;
          return `<tr><th scope="row" class="left">${esc(gameTitle(g))}${current ? ' (open)' : ''}${g.imported ? ' <span class="hint">from sheet</span>' : ''}</th>
            <td>${formatRecord(total)}</td>
            <td><div class="row-actions">
              ${g.imported ? '' : `<button type="button" class="plain" data-action="openGame" data-value="${esc(g.id)}">Open</button>
              <button type="button" class="plain" data-action="exportCsv" data-value="${esc(g.id)}">Export CSV</button>`}
              <button type="button" class="plain" data-action="renameGame" data-value="${esc(g.id)}">Rename</button>
              <button type="button" class="plain" data-action="deleteGame" data-value="${esc(g.id)}">Delete</button>
            </div></td></tr>`;
        }).join('')}</tbody></table>
      </section>
      <section class="sheet">
        <h2>Backup</h2>
        <p class="hint">Game data is saved only in this browser on this laptop. Download a backup after each game.</p>
        <div class="row-actions" style="justify-content:flex-start">
          <button type="button" class="plain" data-action="backup">Download backup</button>
          <label class="plain file-button">Restore from backup<input type="file" id="restoreFile" accept="application/json,.json"></label>
        </div>
      </section>
    </div>
    <section class="sheet">
      <h2>Roster</h2>
      <p class="hint">Regular centers appear first when logging.</p>
      <table><thead><tr><th scope="col" class="left">#</th><th scope="col" class="left">Name</th><th scope="col" class="left">Shoots</th><th scope="col" class="left">Center</th><th scope="col"><span class="visually-hidden">Remove</span></th></tr></thead>
      <tbody>${[...state.roster].sort((a, b) => a.num - b.num).map((p) => `<tr>
        <th scope="row" class="left">${p.num}</th>
        <td><input type="text" aria-label="Name for number ${p.num}" data-roster="name" data-num="${p.num}" value="${esc(p.name)}"></td>
        <td><select aria-label="Shoots, number ${p.num}" data-roster="hand" data-num="${p.num}">
          ${['', 'L', 'R'].map((h) => `<option value="${h}" ${p.hand === h ? 'selected' : ''}>${h || 'Not set'}</option>`).join('')}
        </select></td>
        <td><input type="checkbox" aria-label="Regular center, number ${p.num}" data-roster="center" data-num="${p.num}" ${p.center ? 'checked' : ''}></td>
        <td><button type="button" class="plain" data-action="removePlayer" data-value="${p.num}">Remove</button></td>
      </tr>`).join('')}</tbody></table>
      <form class="add-player" id="addPlayer">
        <input type="number" id="newNum" min="0" max="99" placeholder="#" aria-label="New player number" required>
        <input id="newName" placeholder="Name" aria-label="New player name" required autocomplete="off">
        <button type="submit" class="plain">Add player</button>
      </form>
    </section>
  </div>`;
}

function render() {
  renderBar();
  for (const view of ['live', 'full', 'manage']) $(`view-${view}`).hidden = ui.view !== view;
  if (ui.view === 'live') renderLive();
  if (ui.view === 'full') renderFull();
  if (ui.view === 'manage') renderManage();
}

// Actions

function clearSelection() {
  ui.sel = { circle: null, skid: null, opp: null };
}

function pick(field, value) {
  ui.sel[field] = ui.sel[field] === value ? null : value;
  ui.message = '';
}

function faceoffPhrase(f, game) {
  const winner = f.winner === 'S' ? 'Skidmore' : game.opponent;
  return `${zoneLabel(f.circle)}: ${skidLabel(f.skid)} vs #${f.opp}, ${winner} won`;
}

function openGame(id) {
  state.currentGameId = id;
  clearSelection();
  ui.message = '';
  ui.filter = 'all';
  ui.openOpp = null;
  ui.statsScope = null;
  ui.view = 'live';
  persist();
}

const actions = {
  view(value) {
    ui.view = value;
    ui.statsScope = value === 'full' ? null : ui.statsScope;
    persist();
  },
  period(value) {
    currentGame().period = value;
    persist();
  },
  flip() {
    const game = currentGame();
    game.startFlipped = !game.startFlipped;
    persist();
  },
  circle(value) { pick('circle', value); },
  skid(value) { pick('skid', Number(value)); },
  opp(value) { pick('opp', Number(value)); },
  removeOpp(value) {
    const game = currentGame();
    game.oppNumbers = (game.oppNumbers ?? []).filter((n) => n !== Number(value));
    ui.sel.opp = null;
    persist();
  },
  clear() { clearSelection(); ui.message = ''; },
  win(value) {
    const game = currentGame();
    const f = {
      id: crypto.randomUUID(),
      period: game.period,
      circle: ui.sel.circle,
      skid: ui.sel.skid,
      opp: ui.sel.opp,
      winner: value,
      at: new Date().toISOString(),
    };
    game.faceoffs.push(f);
    clearSelection();
    ui.message = `Saved ${faceoffPhrase(f, game)}`;
    persist();
  },
  undo() {
    const game = currentGame();
    const f = game.faceoffs.pop();
    if (f) ui.message = `Removed ${faceoffPhrase(f, game)}`;
    persist();
  },
  filter(value) { ui.filter = value; },
  sort(value) {
    if (ui.sort.key === value) ui.sort.dir = -ui.sort.dir;
    else ui.sort = { key: value, dir: 1 };
  },
  toggleOpp(value) { ui.openOpp = ui.openOpp === Number(value) ? null : Number(value); },
  editFaceoff(value) { openEditDialog(value); return false; },
  deleteFaceoff() {
    const game = currentGame();
    game.faceoffs = game.faceoffs.filter((f) => f.id !== ui.editingId);
    $('editDialog').close();
    persist();
  },
  closeDialog(value) { $(value).close(); return false; },
  openText() { openTextDialog(); return false; },
  copyText() { copyMessage(); return false; },
  newGame() { openGameDialog(null); return false; },
  renameGame(value) { openGameDialog(value); return false; },
  openGame(value) { openGame(value); },
  deleteGame(value) {
    const game = state.games.find((g) => g.id === value);
    const count = draws(tally([game]).team.total);
    if (!confirm(`Delete ${gameTitle(game)} and its ${count} faceoffs? This cannot be undone.`)) return false;
    state.games = state.games.filter((g) => g.id !== value);
    if (state.currentGameId === value) state.currentGameId = null;
    persist();
    return undefined;
  },
  exportCsv(value) {
    const game = state.games.find((g) => g.id === value);
    const safeName = gameTitle(game).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    downloadFile(`faceoffs-${safeName}.csv`, gameToCsv(game, state.roster), 'text/csv');
    return false;
  },
  backup() {
    const today = new Date().toLocaleDateString('en-CA');
    downloadFile(`skidmore-faceoffs-backup-${today}.json`, JSON.stringify(state, null, 2), 'application/json');
    return false;
  },
  removePlayer(value) {
    const num = Number(value);
    if (!confirm(`Remove ${skidLabel(num)} from the roster? Their logged faceoffs stay and show by number.`)) return false;
    state.roster = state.roster.filter((p) => p.num !== num);
    persist();
    return undefined;
  },
};

function run(element) {
  const { action, value } = element.dataset;
  const selector = `[data-action="${action}"]${value === undefined ? '' : `[data-value="${CSS.escape(value)}"]`}`;
  if (actions[action](value) === false) return;
  render();
  // Rendering replaces the buttons, so put keyboard focus back on the one that was used.
  if (document.activeElement === document.body) document.querySelector(selector)?.focus({ preventScroll: true });
  if ((action === 'skid' || action === 'circle') && nextStep() === 'opp') $('oppInput')?.focus();
}

document.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]');
  if (element && !element.disabled) run(element);
});

document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]')) return;
  const dot = event.target.closest?.('.dot');
  if (dot && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    run(dot);
  } else if (event.key === 'Escape' && ui.view === 'live' && currentGame()) {
    actions.clear();
    render();
  }
});

// Forms and dialogs

document.addEventListener('submit', (event) => {
  if (event.target.id === 'oppForm') {
    event.preventDefault();
    const text = $('oppInput').value.trim();
    if (!/^\d{1,2}$/.test(text)) {
      $('oppInput').focus();
      return;
    }
    const num = Number(text);
    const game = currentGame();
    game.oppNumbers = [...new Set([...(game.oppNumbers ?? []), num])];
    persist();
    // Mid-entry the new number is the one being logged. Otherwise keep typing the lineup.
    const midEntry = ui.sel.circle !== null || ui.sel.skid !== null;
    if (midEntry) ui.sel.opp = num;
    ui.message = '';
    render();
    if (!midEntry) $('oppInput').focus();
  }
  if (event.target.id === 'addPlayer') {
    event.preventDefault();
    const num = Number($('newNum').value);
    if (player(num)) {
      showNotice(`#${num} is already on the roster.`);
      return;
    }
    state.roster.push({ num, name: $('newName').value.trim(), hand: '', center: false });
    persist();
    render();
    $('newNum').focus();
  }
});

document.addEventListener('change', async (event) => {
  const { target } = event;
  if (target.id === 'scopeSelect') {
    ui.statsScope = target.value;
    render();
    $('scopeSelect').focus();
  }
  if (target.dataset.roster) {
    // The table is not re-rendered here, so tabbing through the roster keeps its place.
    const p = player(Number(target.dataset.num));
    p[target.dataset.roster] = target.type === 'checkbox' ? target.checked : target.value.trim();
    persist();
  }
  if (target.id === 'restoreFile') await restoreBackup(target);
});

async function restoreBackup(input) {
  const [file] = input.files;
  input.value = '';
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    data = null;
  }
  if (!isValidState(data)) {
    showNotice(`${file.name} is not a faceoff backup, so nothing changed.`);
    return;
  }
  if (!confirm(`Replace everything in this browser with ${file.name}? It holds ${data.games.length} games.`)) return;
  Object.assign(state, data);
  clearSelection();
  ui.statsScope = null;
  persist();
  render();
}

function openEditDialog(id) {
  const f = currentGame().faceoffs.find((x) => x.id === id);
  ui.editingId = id;
  const skidOptions = rosterOrder().map((p) => [p.num, `#${p.num} ${p.name}`]);
  if (!player(f.skid)) skidOptions.push([f.skid, `#${f.skid}`]);
  $('editFields').innerHTML = `
    <label>Period <select id="editPeriod">${PERIODS.map((p) => `<option value="${p}" ${f.period === p ? 'selected' : ''}>${periodLabel(p)}</option>`).join('')}</select></label>
    <label>Circle <select id="editCircle">${CIRCLES.map((c) => `<option value="${c.id}" ${f.circle === c.id ? 'selected' : ''}>${circleLabel(c)}</option>`).join('')}</select></label>
    <label>Skidmore player <select id="editSkid">${skidOptions.map(([n, label]) => `<option value="${n}" ${f.skid === n ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
    <label>Opposing number <input id="editOpp" inputmode="numeric" required pattern="[0-9]{1,2}" maxlength="2" value="${f.opp}"></label>
    <fieldset><legend>Winner</legend>
      <label><input type="radio" name="editWinner" value="S" ${f.winner === 'S' ? 'checked' : ''}> Skidmore</label>
      <label><input type="radio" name="editWinner" value="O" ${f.winner === 'O' ? 'checked' : ''}> ${esc(currentGame().opponent)}</label>
    </fieldset>`;
  $('editDialog').showModal();
}

$('editForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const f = currentGame().faceoffs.find((x) => x.id === ui.editingId);
  f.period = $('editPeriod').value;
  f.circle = $('editCircle').value;
  f.skid = Number($('editSkid').value);
  f.opp = Number($('editOpp').value);
  f.winner = $('editForm').elements.editWinner.value;
  persist();
  $('editDialog').close();
  render();
});

function openTextDialog() {
  const game = currentGame();
  $('textBody').value = summaryText(game, state.roster, ui.filter);
  $('textScope').textContent = ui.filter === 'all'
    ? 'Whole game so far. Edit anything before copying.'
    : `${periodLabel(ui.filter)} only, following the live stats filter. Edit anything before copying.`;
  $('copyStatus').textContent = '';
  $('textDialog').showModal();
}

async function copyMessage() {
  try {
    await navigator.clipboard.writeText($('textBody').value);
    $('copyStatus').textContent = 'Copied';
  } catch {
    // Some browsers block the clipboard API, so fall back to copying the selected text.
    $('textBody').select();
    $('copyStatus').textContent = document.execCommand('copy') ? 'Copied' : 'Press Cmd+C to copy';
  }
}

function openGameDialog(id) {
  ui.editingGameId = id;
  const game = state.games.find((g) => g.id === id);
  $('gameTitle').textContent = game ? 'Rename game' : 'Start a game';
  $('gameSubmit').textContent = game ? 'Save changes' : 'Start game';
  $('gameOpponent').value = game?.opponent ?? '';
  $('gameDate').value = game ? game.date : new Date().toLocaleDateString('en-CA');
  $('gameDialog').showModal();
}

$('gameForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const opponent = $('gameOpponent').value.trim();
  if (!opponent) return;
  const date = $('gameDate').value;
  const existing = state.games.find((g) => g.id === ui.editingGameId);
  if (existing) {
    existing.opponent = opponent;
    existing.date = date;
    persist();
  } else {
    const game = { id: crypto.randomUUID(), opponent, date, imported: false, period: '1', startFlipped: false, faceoffs: [] };
    state.games.push(game);
    openGame(game.id);
  }
  $('gameDialog').close();
  render();
});

// The delete button inside the edit dialog changes the page behind it.
$('editDialog').addEventListener('close', render);

navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
persist();
render();
