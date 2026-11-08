import {
  CIRCLES, MIN_DRAWS, PERIODS, ZONES, circleKey, circlePosition, circleRecords, compareRecords,
  draws, filterFaceoffs, formatPct, formatRecord, headToHead, isFlipped, lastStretchLength,
  needsPeriodCheck, nextPeriod, opponentNumbers, opponents, pct, repairFaceoffs, summaryText,
  swapEnds, tally, zoneOf,
} from './stats.js';
import { KEY, downloadFile, gameToCsv, isValidState, load, save } from './store.js';

const state = load();
const ui = {
  view: 'live',
  sel: { circle: null, skid: null, opp: null },
  message: '',
  outcome: '',
  filter: 'all',
  sort: { key: 'total', dir: 1 },
  openOpp: null,
  statsScope: null,
  editingId: null,
  editingGameId: null,
  periodCheckShown: false,
  jerseyTyped: '',
  jerseyTimer: null,
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
const zoneLabel = (id) => (zoneOf(id) === 'N' ? 'Neutral' : zoneOf(id));
const activeFilter = (game) => (ui.filter === 'now' ? game.period : ui.filter);

const NEUTRAL_NAMES = { 'N-DB': 'Neutral by D1', 'N-DT': 'Neutral by D2', 'N-OT': 'Neutral by O1', 'N-OB': 'Neutral by O2' };
const circleLabel = (circle) => (circle.id === 'C' ? 'Center ice' : NEUTRAL_NAMES[circle.id] ?? circle.zone);

const ICON_ARROW = '<svg class="icon" viewBox="0 0 24 12" aria-hidden="true"><path d="M0 6h20M15 1l6 5-6 5" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>';
const ICON_SORT = '<svg class="icon-small" viewBox="0 0 8 6" aria-hidden="true"><path d="M4 0l4 6H0z" fill="currentColor"/></svg>';
const ICON_OPEN = '<svg class="icon-small" viewBox="0 0 6 8" aria-hidden="true"><path d="M0 0l6 4-6 4z" fill="currentColor"/></svg>';

function persist() {
  showNotice(save(state) ? '' : 'This browser did not save your last change. Download a backup from Games and roster now.');
}

function showNotice(text) {
  $('notice').textContent = text;
  $('notice').hidden = !text;
}

function formatDate(date) {
  if (!date) return '';
  return new Date(`${date}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function gameTitle(game) {
  return game.date ? `${game.opponent}, ${formatDate(game.date)}` : game.opponent;
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
  const game = ui.view === 'live' ? currentGame() : null;
  $('matchup').textContent = game ? `Skidmore vs ${game.opponent}` : 'Skidmore faceoffs';
  const total = game && tally([game]).team.total;
  $('barGame').innerHTML = !game ? '' : `
    <span class="score" aria-label="Skidmore faceoff record">${formatRecord(total)}<small>${formatPct(total)}</small></span>
    <button type="button" class="send" data-action="openText">Coach message</button>`;
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.value === ui.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

// Period and rink direction

function renderRinkStatus() {
  const game = currentGame();
  const flipped = isFlipped(game);
  $('rinkStatus').innerHTML = `
    <span class="group" role="group" aria-label="Period being played">
      <span class="group-label">Now playing</span>
      ${PERIODS.map((p) => `<button type="button" class="pick" data-action="period" data-value="${p}" aria-pressed="${game.period === p}">${periodLabel(p)}</button>`).join('')}
    </span>
    <span class="direction ${flipped ? 'left' : ''}">Skidmore attacks ${flipped ? 'left' : 'right'} ${ICON_ARROW}</span>
    <button type="button" class="plain" data-action="flip">Flip rink</button>`;
}

function renderPeriodCheck() {
  const game = currentGame();
  const show = needsPeriodCheck(game);
  ui.periodCheckShown = show;
  $('periodCheck').hidden = !show;
  if (!show) return;
  const minutes = Math.floor((Date.now() - Date.parse(game.faceoffs.at(-1).at)) / 60000);
  const next = nextPeriod(game.period);
  $('periodCheck').innerHTML = `
    <p><b>${minutes} minutes since the last faceoff.</b> Is it still ${periodLabel(game.period)}?</p>
    <button type="button" class="primary" data-action="period" data-value="${next}">Move to ${periodLabel(next)}</button>
    <button type="button" class="plain" data-action="keepPeriod">Still ${periodLabel(game.period)}</button>`;
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
  const records = circleRecords(filterFaceoffs(game.faceoffs, activeFilter(game)));
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
    const key = circleKey(circle, flipped);
    return `<g class="${classes}" role="button" tabindex="0" data-action="circle" data-value="${circle.id}"
        aria-pressed="${ui.sel.circle === circle.id}" aria-label="${circleLabel(circle)}${summary}" aria-keyshortcuts="${key}">
      <circle cx="${x}" cy="${y}" r="${circle.r}"/>
      <text class="dot-key" x="${x + circle.r * 0.8}" y="${y - circle.r * 0.78}">${key.toUpperCase()}</text>
      <text class="dot-name" x="${x}" y="${nameY}">${name}</text>
      ${hasStats ? `<text class="dot-rec" x="${x}" y="${nameY + step * 0.9}">${formatRecord(rec)}</text>
      <text class="dot-pct ${thin}" x="${x}" y="${nameY + step * 1.65}">${formatPct(rec)}</text>` : ''}
    </g>`;
  }).join('');

  $('rink').classList.toggle('waiting', nextStep() === 'circle');
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
  const { circle, skid, opp } = ui.sel;
  const oppNums = opponentNumbers(game);
  const canRemoveOpp = opp !== null && !game.faceoffs.some((f) => f.opp === opp);
  const showMessage = step === 'circle' && skid === null && opp === null && ui.message;
  const blocked = step === 'winner' && needsPeriodCheck(game);
  const ready = step === 'winner' && !blocked;
  const hasSelection = circle !== null || skid !== null || opp !== null;
  const promptText = blocked ? 'Answer the period question above to save' : PROMPTS[step];

  $('entry').innerHTML = `
    <div class="prompt-row">
      <p class="prompt ${showMessage ? ui.outcome : ''}" id="prompt" role="status">${esc(showMessage || promptText)}</p>
      ${showMessage && ui.outcome ? '<button type="button" class="plain" data-action="undo">Undo <kbd>U</kbd></button>' : ''}
      ${hasSelection ? '<button type="button" class="plain" data-action="clear">Clear <kbd>Esc</kbd></button>' : ''}
    </div>
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
          <input id="oppInput" inputmode="numeric" maxlength="2" placeholder="New number" autocomplete="off">
          <button type="submit">Add</button>
        </form>
        ${canRemoveOpp ? `<button type="button" class="plain" data-action="removeOpp" data-value="${opp}">Remove #${opp}</button>` : ''}
      </div>
    </div>
    <p class="context">${contextLine(game)}</p>
    <div class="winners ${ready ? 'active' : ''}" id="winners" tabindex="-1">
      <button type="button" class="win us" data-action="win" data-value="S" ${ready ? '' : 'disabled'}>Skidmore won <kbd>J</kbd><small>${skid !== null ? esc(skidLabel(skid)) : 'Pick both players first'}</small></button>
      <button type="button" class="win them" data-action="win" data-value="O" ${ready ? '' : 'disabled'}>${esc(game.opponent)} won <kbd>K</kbd><small>${opp !== null ? `#${opp}` : 'Pick both players first'}</small></button>
    </div>`;
}

// Puts focus on the next step, so the keyboard flow carries on from where it is.
function advanceFocus() {
  const step = nextStep();
  if (step === 'circle') document.querySelector('.dot')?.focus({ preventScroll: true });
  if (step === 'skid') document.querySelector('.jersey')?.focus({ preventScroll: true });
  if (step === 'opp') $('oppInput').focus({ preventScroll: true });
  if (step === 'winner') $('winners').focus({ preventScroll: true });
}

function flashSave(outcome, circleId) {
  const entry = $('entry');
  entry.classList.remove('flash-win', 'flash-loss');
  void entry.offsetWidth; // Restarts the animation when two saves land close together.
  entry.classList.add(`flash-${outcome}`);
  document.querySelector(`.dot[data-value="${circleId}"]`)?.classList.add('pulse');
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
  const arrow = active ? `<span class="${ascending ? '' : 'down'}">${ICON_SORT}</span>` : '';
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
      ${extended ? '<th scope="col" class="left">Shoots</th>' : ''}
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
  const options = [['all', 'Game'], ['now', 'This period'], ...PERIODS.map((p) => [p, periodLabel(p)])];
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
  const period = activeFilter(game);
  const faceoffs = filterFaceoffs(game.faceoffs, period);
  const { team, players } = tally([game], period);
  const opps = opponents(faceoffs);
  const recent = game.faceoffs.slice(-20).reverse();
  const stale = period !== 'all' && period !== game.period;
  const none = period === 'all' ? 'after the first faceoff' : `once ${periodLabel(period)} has a faceoff`;

  const oppRows = opps.map((o) => {
    const open = ui.openOpp === o.num;
    return `<tr><th scope="row" class="left"><button type="button" class="link opp-link ${open ? 'open' : ''}" data-action="toggleOpp" data-value="${o.num}" aria-expanded="${open}">#${o.num} ${ICON_OPEN}</button></th>
      ${recCell(o.rec)}${pctCell(o.rec)}<td class="left">${o.vs.size} ${o.vs.size === 1 ? 'player' : 'players'}</td></tr>
      ${open ? `<tr class="expanded"><td colspan="4">${[...o.vs.entries()].sort((a, b) => draws(b[1]) - draws(a[1])).map(([num, rec]) => `<span>${esc(skidLabel(num))} ${formatRecord(rec)}</span>`).join('')}</td></tr>` : ''}`;
  }).join('');

  $('panel').innerHTML = `
    <div class="panel-head"><h2 class="panel-title">Live stats</h2><span class="spacer"></span>${periodFilters()}</div>
    ${stale ? `<p class="filter-note">Showing ${periodLabel(period)} while you log ${periodLabel(game.period)}. New faceoffs won't appear here. <button type="button" class="link" data-action="filter" data-value="all">Show whole game</button></p>` : ''}
    <div class="glance">${glanceItem('Overall', team.total)}${glanceItem('Defense', team.D)}${glanceItem('Offense', team.O)}${glanceItem('Neutral', team.N)}</div>
    <section class="panel-section big">
      <h2 class="panel-title">Skidmore by zone</h2>
      <div class="scroll">${players.size ? playerTable(players) : `<p class="empty">Player records appear ${none}.</p>`}</div>
    </section>
    <section class="panel-section">
      <h2 class="panel-title">Skidmore against each opponent</h2>
      <div class="scroll">${opps.length ? `<table><thead><tr><th scope="col" class="left">Their #</th><th scope="col">Skidmore</th><th scope="col">%</th><th scope="col" class="left">Faced</th></tr></thead><tbody>${oppRows}</tbody></table>` : `<p class="empty">Opposing players appear ${none}.</p>`}</div>
    </section>
    <section class="panel-section">
      <div class="panel-head"><h2 class="panel-title">Recent faceoffs</h2><span class="spacer"></span>
        ${game.faceoffs.length ? `<button type="button" class="link" data-action="openRepair">Fix period mistake</button>
        <button type="button" class="link" data-action="undo">Undo last</button>` : ''}</div>
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
      <h2>Start a game to log faceoffs</h2>
      <p>Enter the opponent, then click the circle, both players and the winner for each draw.</p>
      <button type="button" class="primary" data-action="newGame">Start a game</button>
    </div>`);
    return;
  }
  renderRinkStatus();
  renderPeriodCheck();
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
  const period = canFilter ? activeFilter(game) : 'all';
  const { team, players } = tally(games, period);
  const noDraws = state.roster.filter((p) => !players.has(p.num)).length;

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
    <div class="page-head sticky">
      <label>Show <select id="scopeSelect">
        <option value="season" ${scope === 'season' ? 'selected' : ''}>Season, all games</option>
        ${state.games.map((g) => `<option value="${esc(g.id)}" ${scope === g.id ? 'selected' : ''}>${esc(gameTitle(g))}</option>`).join('')}
      </select></label>
      ${canFilter ? periodFilters() : ''}
    </div>
    <section class="sheet">
      <h2>Skidmore by zone</h2>
      <p class="hint">Zone 1 is left of the goal, facing that goal. Percentages are muted under ${MIN_DRAWS} draws.</p>
      ${players.size ? playerTable(players, { extended: true, team }) : '<p class="empty">No faceoffs here yet.</p>'}
      ${players.size && noDraws ? `<p class="hint table-note">${noDraws} other roster ${noDraws === 1 ? 'player has' : 'players have'} no draws here.</p>` : ''}
    </section>
    <section class="sheet">
      <h2>Skidmore against each opponent</h2>
      ${scope === 'season' ? '<p class="hint">Covers logged games only, because the sheets for games 1 and 2 have no opposing numbers.</p>' : ''}
      ${matchups}
    </section>`;
}

// Games and roster view

function backupStatus() {
  const logged = state.games.flatMap((g) => g.faceoffs);
  if (!state.lastBackupAt) return logged.length ? `No backup yet, and ${logged.length} logged faceoffs are only in this browser.` : 'No backup yet.';
  const when = new Date(state.lastBackupAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const newer = logged.filter((f) => f.at > state.lastBackupAt).length;
  return `Last backup ${when}. ${newer ? `${newer} ${newer === 1 ? 'faceoff' : 'faceoffs'} logged since.` : 'Nothing logged since.'}`;
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
              ${g.imported || current ? '' : `<button type="button" class="plain" data-action="openGame" data-value="${esc(g.id)}">Open</button>`}
              ${g.imported ? '' : `<button type="button" class="plain" data-action="exportCsv" data-value="${esc(g.id)}">Export CSV</button>`}
              <button type="button" class="plain" data-action="renameGame" data-value="${esc(g.id)}">Rename</button>
              <button type="button" class="quiet" data-action="deleteGame" data-value="${esc(g.id)}">Delete</button>
            </div></td></tr>`;
        }).join('')}</tbody></table>
      </section>
      <section class="sheet">
        <h2>Backup</h2>
        <p class="hint">Game data is saved only in this browser on this laptop. Download a backup after each game.</p>
        <p class="backup-status" id="backupStatus">${esc(backupStatus())}</p>
        <div class="row-actions start-aligned">
          <button type="button" class="plain" data-action="backup">Download backup</button>
          <label class="plain file-button">Restore from backup<input type="file" id="restoreFile" accept="application/json,.json"></label>
        </div>
      </section>
    </div>
    <section class="sheet">
      <h2>Roster</h2>
      <p class="hint">Regular centers get the large buttons when logging.</p>
      <table><thead><tr><th scope="col" class="left">#</th><th scope="col" class="left">Name</th><th scope="col" class="left">Shoots</th><th scope="col" class="left">Center</th><th scope="col"><span class="visually-hidden">Remove</span></th></tr></thead>
      <tbody>${[...state.roster].sort((a, b) => a.num - b.num).map((p) => `<tr>
        <th scope="row" class="left">${p.num}</th>
        <td><input type="text" aria-label="Name for number ${p.num}" data-roster="name" data-num="${p.num}" value="${esc(p.name)}"></td>
        <td><select aria-label="Shoots, number ${p.num}" data-roster="hand" data-num="${p.num}">
          ${['', 'L', 'R'].map((h) => `<option value="${h}" ${p.hand === h ? 'selected' : ''}>${h || 'Not set'}</option>`).join('')}
        </select></td>
        <td><input type="checkbox" aria-label="Regular center, number ${p.num}" data-roster="center" data-num="${p.num}" ${p.center ? 'checked' : ''}></td>
        <td><button type="button" class="quiet" data-action="removePlayer" data-value="${p.num}">Remove</button></td>
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
  ui.sel[field] = value;
  ui.message = '';
  ui.outcome = '';
}

function faceoffPhrase(f) {
  return `${periodLabel(f.period)} ${zoneLabel(f.circle)}: ${skidLabel(f.skid)} vs #${f.opp}`;
}

function openGame(id) {
  state.currentGameId = id;
  clearSelection();
  ui.message = '';
  ui.outcome = '';
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
    const game = currentGame();
    game.period = value;
    game.periodConfirmedAt = new Date().toISOString();
    // The rink may turn, so a circle picked before the change would point at the wrong spot.
    ui.sel.circle = null;
    persist();
  },
  keepPeriod() {
    currentGame().periodConfirmedAt = new Date().toISOString();
    persist();
  },
  flip() {
    const game = currentGame();
    game.startFlipped = !game.startFlipped;
    ui.sel.circle = null;
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
  clear() {
    clearSelection();
    ui.message = '';
    ui.outcome = '';
  },
  win(value) {
    const game = currentGame();
    if (nextStep() !== 'winner' || needsPeriodCheck(game)) return;
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
    ui.message = `${value === 'S' ? 'Skidmore' : game.opponent} won. ${faceoffPhrase(f)}`;
    ui.outcome = value === 'S' ? 'win' : 'loss';
    persist();
  },
  undo() {
    const game = currentGame();
    const f = game.faceoffs.pop();
    if (f) {
      ui.message = `Removed ${faceoffPhrase(f)}`;
      ui.outcome = '';
    }
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
    const f = game.faceoffs.find((x) => x.id === ui.editingId);
    if (!confirm(`Delete this faceoff? ${faceoffPhrase(f)}. This cannot be undone.`)) return false;
    game.faceoffs = game.faceoffs.filter((x) => x.id !== ui.editingId);
    ui.message = `Deleted ${faceoffPhrase(f)}`;
    ui.outcome = '';
    $('editDialog').close();
    persist();
    return undefined;
  },
  closeDialog(value) { $(value).close(); return false; },
  openText() { openTextDialog(); return false; },
  copyText() { copyMessage(); return false; },
  openHelp() { $('helpDialog').showModal(); return false; },
  openRepair() { openRepairDialog(); return false; },
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
    state.lastBackupAt = new Date().toISOString();
    persist();
    downloadFile(`skidmore-faceoffs-backup-${today}.json`, JSON.stringify(state, null, 2), 'application/json');
    return undefined;
  },
  removePlayer(value) {
    const num = Number(value);
    if (!confirm(`Remove ${skidLabel(num)} from the roster? Their logged faceoffs stay and show by number.`)) return false;
    state.roster = state.roster.filter((p) => p.num !== num);
    persist();
    return undefined;
  },
};

const STEP_ACTIONS = new Set(['circle', 'skid', 'opp', 'win', 'undo']);

function perform(action, value) {
  const selector = `[data-action="${action}"]${value === undefined ? '' : `[data-value="${CSS.escape(value)}"]`}`;
  const circle = ui.sel.circle;
  if (actions[action](value) === false) return;
  render();
  if (action === 'win' && ui.outcome) flashSave(ui.outcome, circle);
  if (ui.view === 'live' && STEP_ACTIONS.has(action)) advanceFocus();
  // Rendering replaces the buttons, so put keyboard focus back on the one that was used.
  else if (document.activeElement === document.body) document.querySelector(selector)?.focus({ preventScroll: true });
}

document.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]');
  if (element && !element.disabled) perform(element.dataset.action, element.dataset.value);
});

// Typing a jersey number. "1" waits briefly in case it's the start of "12".
function typeJersey(digit) {
  clearTimeout(ui.jerseyTimer);
  const typed = ui.jerseyTyped + digit;
  const numbers = state.roster.map((p) => String(p.num));
  const exact = numbers.includes(typed);
  const longer = numbers.some((n) => n !== typed && n.startsWith(typed));
  ui.jerseyTyped = '';
  if (longer) {
    ui.jerseyTyped = typed;
    $('prompt').textContent = `Skidmore #${typed}`;
    ui.jerseyTimer = setTimeout(() => {
      ui.jerseyTyped = '';
      if (exact) perform('skid', typed);
      else renderEntry();
    }, 700);
  } else if (exact) {
    perform('skid', typed);
  } else {
    $('prompt').textContent = `No #${typed} on the roster`;
  }
}

function handleShortcut(event) {
  if (ui.view !== 'live' || !currentGame() || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  const flipped = isFlipped(currentGame());
  const circle = CIRCLES.find((c) => circleKey(c, flipped) === key);

  if (circle) {
    event.preventDefault();
    perform('circle', circle.id);
  } else if ((key === 'j' || key === 'k') && !document.querySelector('.win').disabled) {
    event.preventDefault();
    perform('win', key === 'j' ? 'S' : 'O');
  } else if (key === 'u' && currentGame().faceoffs.length) {
    event.preventDefault();
    perform('undo');
  } else if (/^\d$/.test(key)) {
    if (ui.sel.skid === null) {
      event.preventDefault();
      typeJersey(key);
    } else if (ui.sel.opp === null) {
      $('oppInput').focus(); // The digit lands in the opposing number box.
    }
  }
}

document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]')) return;
  const dot = event.target.closest?.('.dot');
  if (dot && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    perform('circle', dot.dataset.value);
  } else if (event.key === 'Escape' && ui.view === 'live' && currentGame()) {
    actions.clear();
    render();
  } else {
    handleShortcut(event);
  }
});

// Forms and dialogs

document.addEventListener('input', (event) => {
  const { target } = event;
  if (target.id === 'oppInput' || target.id === 'editOpp') target.value = target.value.replace(/\D/g, '');
  if (target.id === 'repairCount') updateRepairPreview();
});

document.addEventListener('submit', (event) => {
  if (event.target.id === 'oppForm') {
    event.preventDefault();
    const text = $('oppInput').value.trim();
    if (!text) {
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
    ui.outcome = '';
    render();
    if (midEntry) advanceFocus();
    else $('oppInput').focus();
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
  if (target.id === 'textPeriod') writeCoachMessage();
  if (target.id === 'repairPeriod' || target.id === 'repairSwap') updateRepairPreview();
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
    <label>Opposing number <input id="editOpp" inputmode="numeric" required maxlength="2" value="${f.opp}"></label>
    <fieldset><legend>Winner</legend>
      <label><input type="radio" name="editWinner" value="S" ${f.winner === 'S' ? 'checked' : ''}> Skidmore</label>
      <label><input type="radio" name="editWinner" value="O" ${f.winner === 'O' ? 'checked' : ''}> ${esc(currentGame().opponent)}</label>
    </fieldset>`;
  $('editDialog').showModal();
}

$('editForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const f = currentGame().faceoffs.find((x) => x.id === ui.editingId);
  if (f) {
    f.period = $('editPeriod').value;
    f.circle = $('editCircle').value;
    f.skid = Number($('editSkid').value);
    f.opp = Number($('editOpp').value);
    f.winner = $('editForm').elements.editWinner.value;
    persist();
  }
  $('editDialog').close();
});

function writeCoachMessage() {
  $('textBody').value = summaryText(currentGame(), state.roster, $('textPeriod').value);
  $('copyStatus').textContent = '';
}

function openTextDialog() {
  const game = currentGame();
  const played = PERIODS.filter((p) => game.faceoffs.some((f) => f.period === p));
  $('textPeriod').innerHTML = `<option value="all">Whole game so far</option>
    ${played.map((p) => `<option value="${p}">${periodLabel(p)} only</option>`).join('')}`;
  writeCoachMessage();
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

function openRepairDialog() {
  const game = currentGame();
  $('repairCount').max = game.faceoffs.length;
  $('repairCount').value = lastStretchLength(game.faceoffs);
  $('repairPeriod').innerHTML = PERIODS.map((p) => `<option value="${p}" ${game.period === p ? 'selected' : ''}>${periodLabel(p)}</option>`).join('');
  $('repairSwap').checked = true;
  updateRepairPreview();
  $('repairDialog').showModal();
}

function updateRepairPreview() {
  const { faceoffs } = currentGame();
  const count = Math.min(Number($('repairCount').value), faceoffs.length);
  if (count < 1) {
    $('repairPreview').textContent = '';
    return;
  }
  const first = faceoffs[faceoffs.length - count];
  const swap = $('repairSwap').checked;
  const example = swap ? `, for example ${zoneLabel(first.circle)} becomes ${zoneLabel(swapEnds(first.circle))}` : '';
  $('repairPreview').textContent = `Changes ${count} ${count === 1 ? 'faceoff' : 'faceoffs'}, starting with ${faceoffPhrase(first)}. Moves them to ${periodLabel($('repairPeriod').value)}${example}.`;
}

$('repairForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const game = currentGame();
  const count = Number($('repairCount').value);
  const period = $('repairPeriod').value;
  game.faceoffs = repairFaceoffs(game.faceoffs, count, period, $('repairSwap').checked);
  ui.message = `Fixed ${count} ${count === 1 ? 'faceoff' : 'faceoffs'}, now in ${periodLabel(period)}`;
  ui.outcome = '';
  persist();
  $('repairDialog').close();
});

// Closing an edit or repair dialog changes the page behind it.
$('editDialog').addEventListener('close', render);
$('repairDialog').addEventListener('close', render);

// Keeps two open tabs on the same data, so one can't overwrite the other's faceoffs.
window.addEventListener('storage', (event) => {
  if (event.key !== KEY || !event.newValue) return;
  Object.assign(state, load());
  render();
});

// A long gap can start while the page sits idle, such as during an intermission.
setInterval(() => {
  const game = currentGame();
  if (ui.view === 'live' && game && needsPeriodCheck(game) !== ui.periodCheckShown) render();
}, 30000);

navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
persist();
render();
