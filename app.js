import { $, h, fill, safeUrl } from './dom.js';
import * as M from './model.js';
import { openStore } from './store.js';
import { Vault, purgeExpired, legacyKeys, wipeLegacy, hasLegacySheet } from './vault.js';
import { initSheet, renderSheet, shRes, playerName, sheetTeam, lockSheet } from './sheet.js';
import { initLeague, leaguePanel, resetLeagueAdmin, LEAGUE_URL } from './league.js';

/* ---------- state ---------- */
let store, FX = { club: '', highlight: '', teams: {} }, TK = [];
let role = 'viewer', user = null, view = '';
let AT = '', LT = '', LGT = '';            // squad being managed / watched live / shown in League
const MS = {}, META = {}, vaults = {};     // matches, snapshot metadata, encrypted sheets
const LINKS = {};                          // league links set by coaches in the app
const linkFor = (k) => LINKS[k] || ((FX.teams[k] || {}).leagueUrl || '');
let m = null, results = [], saveT = null, lastSaid = '', hiddenAt = 0;
const notes = new Map();

const squad = (k) => (FX.teams[k] && FX.teams[k].name) || k;
const vault = () => (vaults[AT] = vaults[AT] || new Vault(AT));
// Greystones is always shown in green, whether home or away.
function gsSideOf(names) {
  const hl = (FX.highlight || '').toLowerCase();
  const i = hl ? names.findIndex((n) => (n || '').toLowerCase().includes(hl)) : -1;
  return i < 0 ? 0 : i;
}
const side = (x, t) => (t === gsSideOf([M.name(x, 0), M.name(x, 1)]) ? 'us' : 'them');

/* ---------- notes ---------- */
function note(key, text, opts) {
  if (!text) notes.delete(key); else notes.set(key, { text, ...(opts || {}) });
  const el = $('note');
  fill(el, [...notes.values()].map((n) => h('div', null, n.text, n.actions ? h('div', null, n.actions.map(([l, f]) => h('button', { text: l, onclick: f }))) : null)));
  el.hidden = !notes.size;
  el.classList.toggle('bad', [...notes.values()].some((n) => n.bad));
}

/* ---------- confirm dialog ---------- */
function ask(msg, label, fn) {
  const d = $('dlg');
  $('dmsg').textContent = msg; $('dyes').textContent = label;
  $('dyes').onclick = () => { d.close(); fn(); };
  $('dno').onclick = () => d.close();
  d.showModal(); $('dno').focus();
}

/* ---------- saving ---------- */
function plain(x) { return JSON.parse(JSON.stringify(x)); }
function persist() {
  clearTimeout(saveT); saveT = null;
  m.upd = M.now(); MS[AT] = m;
  store.saveMatch(AT, plain(m)).then(() => note('save'), (e) => {
    note('save', e && e.code === 'permission-denied'
      ? 'The last change was refused by the server. Your account may not be on the coaches list, or firestore.rules needs updating. See SETUP.md.'
      : 'Could not save the last change. Check your connection.', { bad: true });
  });
  syncStatus();
}
function saveResult() {
  store.saveResult(M.resultFrom(m)).catch(() => note('save', 'Could not save the result to Results.', { bad: true }));
}
function dropResult(id) { store.deleteResult(id).catch(() => {}); }

function syncStatus() {
  const s = $('sync');
  s.hidden = role !== 'admin' || store.mode !== 'firebase';
  if (s.hidden) return;
  const off = !navigator.onLine, pend = META[AT] && META[AT].pending;
  s.className = 'sync' + (off ? ' offline' : pend ? ' pending' : '');
  $('synctxt').textContent = off ? 'Offline. Scoring still works and will sync when signal returns.' : pend ? 'Saving…' : 'All changes saved';
}

/* ---------- scoreboard ---------- */
function board(p) {
  return [h('div', { class: 'meta', id: p + '-meta' }),
    h('div', { class: 'board' },
      h('div', { class: 'team', id: p + '-ht' }, h('div', { class: 'tn', id: p + '-hn' }), h('div', { class: 'score', id: p + '-hs', text: '0' })),
      h('div', { class: 'clock' }, h('div', { class: 'time', id: p + '-time', text: '00:00' }), h('div', { class: 'half', id: p + '-half' })),
      h('div', { class: 'team', id: p + '-at' }, h('div', { class: 'tn', id: p + '-an' }), h('div', { class: 'score', id: p + '-as', text: '0' })))];
}
function updBoard(p, x) {
  $(p + '-meta').textContent = M.metaLine(x);
  $(p + '-hn').textContent = M.name(x, 0); $(p + '-an').textContent = M.name(x, 1);
  $(p + '-ht').className = 'team ' + side(x, 0); $(p + '-at').className = 'team ' + side(x, 1);
  $(p + '-hs').textContent = M.score(x, 0); $(p + '-as').textContent = M.score(x, 1);
  tickBoard(p, x);
}
function tickBoard(p, x) {
  $(p + '-time').textContent = M.clockText(M.elapsed(x));
  $(p + '-half').textContent = M.status(x);
  fill(p + '-bins', M.sinBins(x).map((b) => h('li', { class: side(x, b.t) },
    h('span', null, M.name(x, b.t) + ' sin bin' + (b.no ? ' #' + b.no : '')), h('b', { text: M.clockText(b.left + 999) }))));
}
function ourSide(x) {
  const t = (sheetTeam() || '').toLowerCase().trim(), hl = (FX.highlight || '').toLowerCase();
  for (const s of [0, 1]) { const n = M.name(x, s).toLowerCase(); if ((t && n === t) || (hl && n.includes(hl))) return s; }
  return -1;
}
function logList(id, x, showNames) {
  const our = showNames ? ourSide(x) : -1;
  const items = x.ev.slice().reverse().map((e) => {
    const who = e.no && e.t === our ? playerName(e.no) : '';
    return h('li', null, h('b', { text: e.m + '’' }), h('span', { class: e.t === 2 ? 'tag' : 'tag ' + side(x, e.t) }), h('span', { text: M.eventText(x, e) + (who ? ' (' + who + ')' : '') }));
  });
  fill(id, items.length ? items : h('li', { class: 'empty', text: 'Nothing yet.' }));
}
function totals(x) {
  const rate = (t) => { const k = M.count(x, t, 'con') + M.count(x, t, 'conx'); return k ? Math.round(M.count(x, t, 'con') / k * 100) + '%' : '–'; };
  const rows = [['Tries', 'try'], ['Penalty tries', 'pentry'], ['Conversions made', 'con'], ['Conversions missed', 'conx'], ['Conversion rate'], ['Penalties', 'pen'], ['Drop goals', 'drop'], ['Yellow cards', 'yc'], ['Red cards', 'rc']];
  fill('l-tbl', h('tr', null, h('th'), h('th', { class: side(x, 0), text: M.name(x, 0) }), h('th', { class: side(x, 1), text: M.name(x, 1) })),
    rows.map(([l, k]) => h('tr', null, h('td', { text: l }), h('td', { text: k ? M.count(x, 0, k) : rate(0) }), h('td', { text: k ? M.count(x, 1, k) : rate(1) }))));
}

/* ---------- admin: scoring ---------- */
function draw() {
  if (role === 'admin' && m) {
    updBoard('a', m); logList('a-log', m, true); shRes();
    $('hb').className = 'col ' + side(m, 0); $('ab').className = 'col ' + side(m, 1);
    $('d-hn').className = side(m, 0); $('d-an').className = side(m, 1);
    $('run').textContent = m.run ? 'Pause' : (m.el > 0 && !m.over ? 'Resume' : 'Start');
    $('run').disabled = m.over;
    $('phase').textContent = m.half === 1 ? 'Half time' : 'Full time'; $('phase').disabled = m.over;
    document.querySelectorAll('#hb button,#ab button').forEach((b) => { b.disabled = m.over; });
    const showPend = m.pend !== null && !m.over;
    $('pend').hidden = !showPend;
    if (showPend) drawPending();
    drawAsw();
  }
  drawLive(); syncStatus();
}
function drawPending() {
  $('pendtxt').textContent = 'Conversion for ' + M.name(m, m.pend) + '?';
  if (document.activeElement === $('scorer')) return;
  const last = lastTry(), our = ourSide(m) === m.pend;
  fill('scorer', h('option', { value: '0', text: '–' }), M.SHIRTS.map((n) => {
    const p = our ? playerName(n) : '';
    return h('option', { value: String(n), text: n + (p ? ' ' + p : '') });
  }));
  $('scorer').value = String((last && last.no) || 0);
}
function lastTry() { for (let i = m.ev.length - 1; i >= 0; i--) if (m.ev[i].k === 'try') return m.ev[i]; return null; }
function add(t, k) {
  if (m.over) return;
  m.ev.push({ t, k, m: M.minute(m), at: M.playTime(m) });
  m.pend = k === 'try' ? t : null;
  persist(); draw();
}
function setupScoring() {
  const btns = () => M.BUTTONS.map(([k, l, p]) => h('button', { class: p ? '' : 'sm', dataset: { k } }, l, p ? h('i', { text: '+' + p }) : null));
  fill('hb', btns()); fill('ab', btns());
  ['hb', 'ab'].forEach((id, t) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) add(t, b.dataset.k); }));
  $('cy').onclick = () => { const t = m.pend; m.pend = null; add(t, 'con'); };
  $('cn').onclick = () => { m.ev.push({ t: m.pend, k: 'conx', m: M.minute(m), at: M.playTime(m) }); m.pend = null; persist(); draw(); };
  $('scorer').onchange = (e) => { const tr = lastTry(); if (!tr) return; const n = +e.target.value; if (n) tr.no = n; else delete tr.no; persist(); draw(); };
  $('run').onclick = () => { if (m.run) { m.el = M.elapsed(m); m.run = false; } else { m.t0 = M.now(); m.run = true; } persist(); draw(); };
  $('phase').onclick = () => {
    m.el = M.elapsed(m); m.run = false; m.pend = null;
    if (m.half === 1) {
      const j = Math.max(0, m.hl * 60000 - m.el);
      m.ev.push({ t: 2, k: 'ht', m: M.minute(m), at: M.playTime(m), j });
      m.el += j; m.adj += j; m.half = 2; persist();
    } else {
      m.ev.push({ t: 2, k: 'ft', m: M.minute(m), at: M.playTime(m) });
      m.over = true; persist(); saveResult();
    }
    draw();
  };
  $('undo').onclick = () => {
    const e = m.ev.pop(); if (!e) return;
    m.pend = e.k === 'con' || e.k === 'conx' ? e.t : null;
    if (e.k === 'ft') { m.over = false; dropResult(m.id); }
    if (e.k === 'ht') { m.half = 1; m.el = Math.max(0, m.el - (e.j || 0)); m.adj = Math.max(0, m.adj - (e.j || 0)); }
    persist(); draw();
  };
  $('rscore').onclick = () => {
    if (!m.ev.length && !m.el && !m.run) { ask('There is no score to reset.', 'OK', () => {}); return; }
    ask('This resets the score to 0–0 and clears the match log and clock for everyone watching.' + (m.over ? ' The saved result for this match will also be removed from Results.' : '') + '\n\nThis cannot be undone.', 'Reset score', () => {
      if (m.over) dropResult(m.id);
      Object.assign(m, { ev: [], pend: null, half: 1, el: 0, adj: 0, run: false, t0: 0, over: false });
      persist(); draw();
    });
  };
  $('reset').onclick = () => ask('This clears the teams, details, score, log and clock for everyone watching. A match that reached full time stays in Results; an unfinished one is lost.\n\nStart a new match?', 'Start new match', () => {
    const { hl, sb } = m; m = M.blank(AT); m.hl = hl; m.sb = sb; MS[AT] = m; fillForm(); persist(); draw(); show('game');
  });
}

/* ---------- admin: game details ---------- */
const FIELDS = {
  'd-hn': (v) => { m.n[0] = v.trim().slice(0, 40); }, 'd-an': (v) => { m.n[1] = v.trim().slice(0, 40); },
  'd-comp': (v) => { m.comp = v.slice(0, 80); }, 'd-venue': (v) => { m.venue = v.slice(0, 60); },
  'd-date': (v) => { m.date = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }, 'd-ko': (v) => { m.ko = /^\d{2}:\d{2}$/.test(v) ? v : ''; },
  'd-hl': (v) => { m.hl = Math.max(1, Math.min(60, Math.round(+v) || 40)); }, 'd-sb': (v) => { m.sb = Math.max(1, Math.min(20, Math.round(+v) || 10)); }
};
function setupForm() {
  Object.keys(FIELDS).forEach((id) => $(id).addEventListener('input', function () {
    FIELDS[id](this.value); m.upd = M.now(); clearTimeout(saveT); saveT = setTimeout(persist, 500); draw();
  }));
  $('fxall').onchange = () => buildFx();
  $('fx').onchange = function () {
    const k = this.value; if (!k) return;
    const f = (FX.teams[AT].fixtures || []).find((x) => fxKey(x) === k); if (!f) return;
    const apply = () => {
      Object.assign(m, { n: [f.home.slice(0, 40), f.away.slice(0, 40)], venue: f.venue.slice(0, 60), date: f.date, ko: f.time || '', comp: (FX.teams[AT].competition || '').slice(0, 80), fx: k.slice(0, 200) });
      persist(); fillForm(); draw();
    };
    if (m.ev.length) { this.value = m.fx || ''; ask('This match already has events logged. Change the teams and details anyway?', 'Change details', apply); return; }
    apply();
  };
  $('go-score').onclick = () => show('score');
}
function fillForm() {
  buildFx();
  const vals = { 'd-hn': m.n[0], 'd-an': m.n[1], 'd-comp': m.comp, 'd-venue': m.venue, 'd-date': m.date, 'd-ko': m.ko, 'd-hl': m.hl, 'd-sb': m.sb };
  for (const [id, v] of Object.entries(vals)) if (document.activeElement !== $(id)) $(id).value = v;
  const T = FX.teams[AT] || {};
  $('fx-asof').textContent = 'Fills in teams, venue, date and kick-off.' + (T.asOf ? ' Fixtures last updated ' + T.asOf + '.' : '');
}
const fxKey = (f) => f.date + '|' + f.home + '|' + f.away;
const fxOpen = (f) => !f.score && !f.note;
function buildFx() {
  const all = $('fxall').checked, list = ((FX.teams[AT] || {}).fixtures || []);
  fill('fx', h('option', { value: '', text: 'Choose a game…' }), list.filter((f) => all || fxOpen(f) || fxKey(f) === m.fx).map((f) =>
    h('option', { value: fxKey(f), text: f.date.slice(8) + '/' + f.date.slice(5, 7) + (f.time ? ' ' + f.time : '') + ' · ' + f.home + ' v ' + f.away + (f.score ? ' (' + f.score.replace('-', '–') + ')' : '') + (f.note ? ' (conceded)' : '') })));
  $('fx').value = m.fx || '';
}
function applyDetails(d) {
  if (m.ev.length) return ' Match details were left alone because scoring has started.';
  m.n = [d.home.slice(0, 40), d.away.slice(0, 40)];
  if (/^\d{4}-\d{2}-\d{2}$/.test(d.date)) m.date = d.date;
  if (/^\d{2}:\d{2}$/.test(d.ko)) m.ko = d.ko;
  if (d.venue) m.venue = d.venue.slice(0, 60);
  if (d.comp) m.comp = d.comp.slice(0, 80);
  persist(); fillForm(); draw();
  return ' Match details were updated from the sheet.';
}
function defTeam() { const hl = (FX.highlight || '').toLowerCase(); return [M.name(m, 0), M.name(m, 1)].find((x) => hl && x.toLowerCase().includes(hl)) || M.name(m, 0); }

/* ---------- squad switchers ---------- */
function drawAsw() {
  fill('a-sw', TK.map((k) => h('button', { 'aria-pressed': String(k === AT), dataset: { at: k } },
    h('span', { text: squad(k) }), h('i', { text: k === AT ? 'Managing now' : 'Tap to switch' }))));
}
function switchTeam(k) {
  if (k === AT || !TK.includes(k)) return;
  if (saveT) persist();
  AT = k; m = MS[k] || (MS[k] = M.blank(k)); localStorage.setItem('gs-squad', k);
  fillForm(); draw();
  if (view === 'sheet') renderSheet();
}
function drawLive() {
  fill('l-sw', TK.map((k) => {
    const x = MS[k] || M.blank(k), b = M.isBlank(x);
    return h('button', { 'aria-pressed': String(k === LT), dataset: { lt: k } }, h('span', { text: squad(k) }),
      h('b', { text: b ? 'No match yet' : M.name(x, 0) + ' ' + M.score(x, 0) + '–' + M.score(x, 1) + ' ' + M.name(x, 1) }),
      h('i', { text: b ? '' : M.status(x) }));
  }));
  const x = MS[LT] || M.blank(LT), b = M.isBlank(x);
  $('l-empty').hidden = !b; $('l-body').hidden = b;
  if (!b) { updBoard('l', x); totals(x); logList('l-log', x, role === 'admin' && LT === AT); }
  const said = b ? '' : M.name(x, 0) + ' ' + M.score(x, 0) + ', ' + M.name(x, 1) + ' ' + M.score(x, 1);
  if (said !== lastSaid) { if (lastSaid && view === 'live') $('announce').textContent = 'Score: ' + said; lastSaid = said; }
}

/* ---------- results & league ---------- */
function drawRes() {
  const list = results.slice().sort((a, b) => b.upd - a.upd);
  if (!list.length) { fill('r-list', h('p', { class: 'empty-msg', text: 'No finished matches yet. Results appear here at full time.' })); return; }
  fill('r-list', list.map((r) => {
    const meta = M.metaLine({ comp: r.comp, venue: r.venue, date: r.date });
    return h('div', { class: 'card res' }, r.tk && FX.teams[r.tk] ? h('div', { class: 'sq', text: squad(r.tk) }) : null,
      [0, 1].map((t) => { const c = t === gsSideOf(r.n) ? ' us' : ''; return h('div', { class: 'top' }, h('span', { class: 'nm' + (r.s[t] > r.s[1 - t] ? ' w' : '') + c, text: r.n[t] }), h('span', { class: 'sc' + c, text: r.s[t] })); }),
      h('p', { class: 'sub', text: 'Tries ' + r.t[0] + '–' + r.t[1] + ' · Conversions ' + r.c[0] + '–' + r.c[1] + ' · Penalties ' + r.p[0] + '–' + r.p[1] + ' · Drops ' + r.d[0] + '–' + r.d[1] }),
      meta ? h('p', { class: 'sub', text: meta }) : null);
  }));
}
function drawLeague() {
  const T = FX.teams[LGT];
  if (!T) { fill('lg-list', h('p', { class: 'empty-msg', text: 'League data could not be loaded. Refresh to try again.' })); return; }
  const hl = (FX.highlight || '').toLowerCase(), groups = [];
  (T.fixtures || []).forEach((f) => { const g = groups[groups.length - 1]; if (g && g.date === f.date) g.list.push(f); else groups.push({ date: f.date, list: [f] }); });
  fill('lg-list',
    h('div', { class: 'lsw' }, TK.map((k) => h('button', { 'aria-pressed': String(k === LGT), dataset: { lg: k } }, h('span', { text: squad(k) })))),
    role === 'admin' && store && store.mode !== 'unconfigured' ? leaguePanel(LGT) : null,
    linkFor(LGT) ? h('div', { class: 'foot' }, h('a', { class: 'abtn', href: safeUrl(linkFor(LGT)), target: '_blank', rel: 'noopener noreferrer', text: 'Open live league page (Leinster Rugby)' })) : null,
    h('div', { class: 'card mt' }, h('h3', { text: T.competition || '' }),
      h('table', { class: 'lt' }, h('tr', null, ['#', 'Team', 'P', 'W', 'D', 'L', 'Pts'].map((t) => h('th', { text: t }))),
        (T.table || []).map((r, i) => h('tr', { class: hl && r.team.toLowerCase().includes(hl) ? 'me' : null },
          [i + 1, r.team, r.p, r.w, r.d, r.l, r.pts].map((v) => h('td', { text: v }))))),
      h('p', { class: 'sub', text: 'Table and fixtures as of ' + (T.asOf || 'unknown') + '.' })),
    groups.map((g) => [h('h2', { text: M.fmtDate(g.date, { weekday: 'short', day: 'numeric', month: 'short' }) || g.date }),
      h('div', { class: 'card tight' }, g.list.map((f) => h('div', { class: 'fxr' }, h('span', { class: 'ft', text: f.time || 'TBC' }),
        h('span', null, f.home + ' v ' + f.away, f.note ? h('span', { class: 'sub', text: ' ' + f.note }) : null),
        h('span', { class: 'fs', text: (f.score || '').replace('-', '–') }))))]));
}
function validFixtures(d) {
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const out = { club: s(d && d.club, 60), highlight: s(d && d.highlight, 40), teams: {},
    updatedAt: d && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(d.updatedAt || '') ? d.updatedAt : '' };
  for (const [k, t] of Object.entries((d && d.teams) || {})) {
    if (!/^[a-z0-9-]{1,20}$/.test(k) || !t) continue;
    out.teams[k] = { name: s(t.name, 40) || k, competition: s(t.competition, 80), leagueUrl: s(t.leagueUrl, 300), asOf: s(t.asOf, 30),
      fixtures: (Array.isArray(t.fixtures) ? t.fixtures : []).filter((f) => f && /^\d{4}-\d{2}-\d{2}$/.test(f.date)).map((f) => ({
        date: f.date, time: /^\d{2}:\d{2}$/.test(f.time) ? f.time : '', home: s(f.home, 40), away: s(f.away, 40),
        score: /^\d{1,3}-\d{1,3}$/.test(f.score) ? f.score : '', venue: s(f.venue, 60), note: s(f.note, 80) }))
        .sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))),
      table: (Array.isArray(t.table) ? t.table : []).map((r) => ({ team: s(r && r.team, 40), p: +r.p || 0, w: +r.w || 0, d: +r.d || 0, l: +r.l || 0, pts: +r.pts || 0 })) };
  }
  return out;
}

// Re-read fixtures.json (after the league robot has updated it).
async function reloadFixtures() {
  try {
    const r = await fetch('fixtures.json?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return FX.updatedAt;
    const nx = validFixtures(await r.json());
    if (!Object.keys(nx.teams).length) return FX.updatedAt;
    FX = nx; note('fx');
    drawLeague(); if (role === 'admin' && m) fillForm();
  } catch {}
  return FX.updatedAt;
}

/* ---------- views & tabs ---------- */
function show(v) {
  if (role !== 'admin' && ['game', 'score', 'sheet'].includes(v)) v = 'live';
  view = v;
  ['game', 'score', 'sheet', 'live', 'res', 'league'].forEach((x) => { $('v-' + x).hidden = x !== v; });
  if (v === 'sheet') renderSheet();
  if (v === 'league') drawLeague();
  $('a-sw').hidden = !(role === 'admin' && ['game', 'score', 'sheet'].includes(v));
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.v === v ? 'page' : 'false'));
}
function mkTabs() {
  const items = (role === 'admin' ? [['game', 'Game'], ['score', 'Score'], ['sheet', 'Sheet']] : [])
    .concat(store.mode === 'unconfigured' ? [['league', 'League']] : [['live', 'Live'], ['res', 'Results'], ['league', 'League']]);
  fill('tabs', items.map(([v, l]) => h('button', { dataset: { v }, text: l })));
}
function drawAcct() {
  const a = $('acct');
  if (store.mode === 'unconfigured') { fill(a); return; }
  if (user && role === 'admin') fill(a, 'Signed in as ' + user.email + ' ', h('button', { text: 'Sign out', onclick: () => { lockAll(); store.signOut(); } }));
  else if (user) fill(a, 'Signed in as ' + user.email + ' ', h('button', { text: 'Sign out', onclick: () => store.signOut() }));
  else fill(a, h('button', { text: 'Coach sign-in', onclick: openLogin }));
}
function lockAll() { if (vaults[AT]) lockSheet(); Object.values(vaults).forEach((v) => v.lock()); if (view === 'sheet') renderSheet(); if (m) draw(); }

/* ---------- sign-in ---------- */
function openLogin() {
  $('li-msg').textContent = store.mode === 'preview' ? 'Preview mode: any email works, and nothing leaves this browser.' : '';
  $('li-pass').value = ''; $('login').showModal(); $('li-email').focus();
}
function setupLogin() {
  const go = async () => {
    const email = $('li-email').value.trim(), pw = $('li-pass').value, msg = $('li-msg');
    if (store.mode !== 'preview' && (!email || !pw)) { msg.textContent = 'Enter your email and password.'; return; }
    msg.textContent = 'Signing in…'; $('li-go').disabled = true;
    try { await store.signIn(email, pw); $('login').close(); }
    catch (e) {
      const c = e && e.code;
      msg.textContent = c === 'auth/too-many-requests' ? 'Too many attempts. Wait a few minutes and try again.'
        : c === 'auth/network-request-failed' ? 'No connection. Check your signal and try again.'
        : /api-key/.test(c || '') ? 'This site\'s Firebase key is not right. The site owner should redo Step 8 in SETUP.md.'
        : 'That email and password do not match a coach account.';
    } finally { $('li-go').disabled = false; $('li-pass').value = ''; }
  };
  $('li-go').onclick = go;
  $('li-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $('li-cancel').onclick = () => $('login').close();
  $('li-reset').onclick = async () => {
    const email = $('li-email').value.trim();
    if (!email) { $('li-msg').textContent = 'Enter your email above first.'; return; }
    try { await store.resetPassword(email); } catch {}
    $('li-msg').textContent = 'If that email belongs to a coach account, a reset link is on its way.';
  };
}
// The server rules decide what a coach can actually change. This only decides
// which tabs to show, and remembers the answer so a coach who reloads at a
// pitch with no signal still sees the scoring screen.
async function checkAdmin(uid) {
  const k = 'gs-coach-' + uid;
  try { const ok = await store.isAdmin(uid); ok ? localStorage.setItem(k, '1') : localStorage.removeItem(k); return ok; }
  catch { return localStorage.getItem(k) === '1'; }
}
async function onAuth(u) {
  user = u;
  const was = role;
  role = u && (await checkAdmin(u.uid)) ? 'admin' : 'viewer';
  note('auth', u && role !== 'admin' ? 'You are signed in as ' + u.email + ', but this account is not on the coaches list. Ask the site owner to add it (SETUP.md, step 4).' : '', { bad: true });
  if (role !== 'admin') { lockAll(); resetLeagueAdmin(); }
  if (role === 'admin' && !m) { m = MS[AT] || (MS[AT] = M.blank(AT)); }
  mkTabs(); drawAcct(); fillForm(); legacyNote();
  show(role === 'admin' && was !== 'admin' ? 'game' : (view || 'live'));
  draw();
}

/* ---------- old unprotected data ---------- */
function legacyNote() {
  if (!legacyKeys().length) { note('legacy'); return; }
  const sheets = hasLegacySheet();
  note('legacy', (sheets ? 'This device has player details saved by the old version of the tracker, stored without protection.' +
      (role === 'admin' ? ' To keep them, open the Sheet tab and set a passphrase first; they will be moved across.' : '')
    : 'This device has old scores saved by the previous version of the tracker. They are no longer used.'),
    { bad: sheets, actions: [['Delete old data now', () => ask('Delete everything the old version saved on this device' + (sheets ? ', including player details and signatures' : '') + '?', 'Delete', () => { wipeLegacy(); legacyNote(); })]] });
}

/* ---------- boot ---------- */
async function boot() {
  purgeExpired();
  const clock = M.syncClock();
  try {
    const r = await fetch('fixtures.json', { cache: 'no-cache' });
    FX = validFixtures(await r.json());
  } catch { note('fx', 'Fixtures could not be loaded. Live scores still work.', { bad: true }); }
  TK = Object.keys(FX.teams);
  if (!TK.length) { FX.teams = { kb: { name: 'Killer Bees', fixtures: [], table: [] }, ma: { name: 'The Avengers', fixtures: [], table: [] } }; TK = ['kb', 'ma']; }
  const q = new URLSearchParams(location.search).get('team');
  LT = TK.includes(q) ? q : TK[0]; LGT = LT;
  const saved = localStorage.getItem('gs-squad'); AT = TK.includes(saved) ? saved : TK[0];
  TK.forEach((k) => { MS[k] = M.blank(k); });
  m = MS[AT];

  store = await openStore();
  await clock;
  $('a-board').append(...board('a')); $('l-board').append(...board('l'));
  setupScoring(); setupForm(); setupLogin();
  initSheet({ vault, match: () => m, squadName: () => squad(AT), ask, applyDetails, defTeam, onChange: draw, ourSide: () => ourSide(m) });
  initLeague({ store, fx: () => FX, squad, linkFor, savedLink: (k) => LINKS[k] || '', reloadFixtures, redraw: () => { if (view === 'league') drawLeague(); } });

  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.v); });
  $('a-sw').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) switchTeam(b.dataset.at); });
  $('l-sw').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { LT = b.dataset.lt; lastSaid = ''; draw(); } });
  $('lg-list').addEventListener('click', (e) => { const b = e.target.closest('button[data-lg]'); if (b) { LGT = b.dataset.lg; drawLeague(); } });
  $('share').onclick = async () => {
    const url = location.origin + location.pathname + '?team=' + encodeURIComponent(LT);
    try {
      if (navigator.share) await navigator.share({ title: squad(LT) + ' live score', url });
      else { await navigator.clipboard.writeText(url); note('share', 'Link copied. Paste it into the team WhatsApp.'); setTimeout(() => note('share'), 4000); }
    } catch {}
  };
  addEventListener('online', syncStatus); addEventListener('offline', syncStatus);
  // Lock team sheets if the phone has been away from this page for 15 minutes.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 15 * 60000) lockAll();
  });
  setInterval(() => { if (role === 'admin' && view === 'score') tickBoard('a', m); if (view === 'live' && !$('l-body').hidden) tickBoard('l', MS[LT]); }, 500);
  setInterval(M.syncClock, 10 * 60000);

  $('boot').remove();
  drawLeague();
  if (store.mode === 'unconfigured') {
    note('cfg', 'Live scores are not switched on yet. The site owner needs to connect it to Firebase (see SETUP.md).', { bad: true });
    mkTabs(); drawAcct(); show('league'); legacyNote(); return;
  }
  if (store.mode === 'preview') note('cfg', 'Preview mode: running on this computer only. Data stays in this browser. Open a second tab to see the parent view update live.');

  TK.forEach((k) => store.watchMatch(k, (data, meta) => {
    META[k] = meta;
    const x = M.sanitizeMatch(data, k);
    if (role === 'admin' && k === AT && m && x.upd < m.upd) { syncStatus(); return; } // keep newer local edits
    MS[k] = x;
    if (k === AT) { m = x; if (role === 'admin') fillForm(); }
    draw();
  }, () => note('load', 'Could not load live scores. Refresh to try again.', { bad: true })));
  TK.forEach((k) => store.watchLeague(k, (d) => { LINKS[k] = d && LEAGUE_URL.test(d.url || '') ? d.url : ''; if (view === 'league') drawLeague(); }));
  store.watchResults((list) => { results = list.map(M.sanitizeResult).filter(Boolean); drawRes(); }, () => {});
  drawRes();
  mkTabs(); show('live');
  store.onAuth((u) => { onAuth(u); });
}
boot();
