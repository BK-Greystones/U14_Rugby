// Match data, scoring rules and validation. Every match read from the database
// passes through sanitizeMatch() before the app uses it, so a corrupted or
// tampered record can't break the page or smuggle in unexpected values.

export const PTS = { try: 5, pentry: 7, con: 2, pen: 3, drop: 3 };
export const LABEL = {
  try: 'Try', pentry: 'Penalty try', con: 'Conversion', conx: 'Conversion missed',
  pen: 'Penalty', drop: 'Drop goal', yc: 'Yellow card', rc: 'Red card', ht: 'Half time', ft: 'Full time'
};
export const BUTTONS = [
  ['try', 'Try', 5], ['pen', 'Penalty', 3], ['drop', 'Drop goal', 3], ['con', 'Conversion', 2],
  ['pentry', 'Penalty try', 7], ['yc', 'Yellow card', 0], ['rc', 'Red card', 0]
];
export const SHIRTS = Array.from({ length: 23 }, (_, i) => i + 1);
const KINDS = new Set(Object.keys(LABEL));

/* ---------- shared clock ----------
   Each device's clock can be off by seconds or minutes. We estimate the
   difference from the web server's Date header so the coach's phone and every
   parent's phone count from the same reference. Accurate to about a second. */
let offset = 0;
export const now = () => Date.now() + offset;
export async function syncClock() {
  try {
    const t1 = Date.now();
    const r = await fetch('data/fixtures.json?clock=' + t1, { method: 'HEAD', cache: 'no-store' });
    const t2 = Date.now();
    const d = Date.parse(r.headers.get('Date') || '');
    if (!isNaN(d) && t2 - t1 < 3000) offset = d + 500 - (t1 + t2) / 2;
  } catch { /* keep previous offset */ }
}

export function blank(tk) {
  return { id: 'm' + now().toString(36) + Math.random().toString(36).slice(2, 7), tk,
    n: ['', ''], comp: '', venue: '', date: '', ko: '', fx: '',
    hl: 40, sb: 10, half: 1, el: 0, adj: 0, run: false, t0: 0, over: false,
    ev: [], pend: null, upd: 0 };
}

const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max);
const int = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : dflt);
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;

export function sanitizeMatch(raw, tk) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const b = blank(tk);
  const n = Array.isArray(d.n) ? d.n : [];
  const ev = (Array.isArray(d.ev) ? d.ev : []).slice(0, 400).map(sanitizeEvent).filter(Boolean);
  return {
    id: /^[a-z0-9]{4,40}$/i.test(d.id) ? d.id : b.id, tk,
    n: [str(n[0], 40), str(n[1], 40)],
    comp: str(d.comp, 80), venue: str(d.venue, 60),
    date: DATE.test(d.date) ? d.date : '', ko: TIME.test(d.ko) ? d.ko : '',
    fx: str(d.fx, 200),
    hl: int(d.hl, 1, 60, b.hl), sb: int(d.sb, 1, 20, b.sb),
    half: d.half === 2 ? 2 : 1,
    el: int(d.el, 0, 6 * 3600e3, 0), adj: int(d.adj, 0, 6 * 3600e3, 0),
    run: d.run === true, t0: int(d.t0, 0, 9e15, 0), over: d.over === true,
    ev, pend: d.pend === 0 || d.pend === 1 ? d.pend : null,
    upd: int(d.upd, 0, 9e15, 0)
  };
}
function sanitizeEvent(e) {
  if (!e || typeof e !== 'object' || !KINDS.has(e.k)) return null;
  const sys = e.k === 'ht' || e.k === 'ft';
  const t = sys ? 2 : (e.t === 1 ? 1 : e.t === 0 ? 0 : -1);
  if (t < 0) return null;
  const out = { t, k: e.k, m: int(e.m, 0, 999, 0), at: int(e.at, 0, 6 * 3600e3, 0) };
  const no = int(e.no, 0, 23, 0);
  if (e.k === 'ht') out.j = int(e.j, 0, 3600e3, 0);
  if (no && (e.k === 'try' || e.k === 'yc' || e.k === 'rc' || e.k === 'drop' || e.k === 'pen' || e.k === 'con')) out.no = no;
  return out;
}

/* ---------- derived values ---------- */
export const elapsed = (m) => m.el + (m.run ? Math.max(0, now() - m.t0) : 0);
export const playTime = (m) => elapsed(m) - m.adj; // real playing time, ignoring the jump at half time
export const minute = (m) => Math.floor(elapsed(m) / 60000) + 1;
export const pts = (e) => PTS[e.k] || 0;
export const score = (m, t) => m.ev.reduce((a, e) => a + (e.t === t ? pts(e) : 0), 0);
export const count = (m, t, k) => m.ev.filter((e) => e.t === t && e.k === k).length;
export const name = (m, t) => m.n[t] || (t ? 'Away' : 'Home');
export const isBlank = (m) => !m.n[0] && !m.n[1] && !m.ev.length && !m.el && !m.run;

export function clockText(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
export function status(m) {
  if (m.over) return 'Full time';
  if (m.half === 1) return m.run || m.el > 0 ? '1st half' : 'Not started';
  return m.run ? '2nd half' : (m.ev.length && m.ev[m.ev.length - 1].k === 'ht' ? 'Half time' : '2nd half (paused)');
}
export function sinBins(m) {
  if (m.over) return [];
  const p = playTime(m), len = m.sb * 60000;
  return m.ev.filter((e) => e.k === 'yc').map((e) => ({ t: e.t, no: e.no || 0, left: len - (p - e.at) }))
    .filter((b) => b.left > 0);
}
export function eventText(m, e) {
  if (e.t === 2) return LABEL[e.k];
  return name(m, e.t) + ' – ' + LABEL[e.k] + (e.no ? ' #' + e.no : '') + (pts(e) ? ' (+' + pts(e) + ')' : '');
}

export function fmtDate(d, opts) {
  if (!DATE.test(d || '')) return '';
  const [y, mo, da] = d.split('-').map(Number);
  try { return new Date(y, mo - 1, da).toLocaleDateString('en-IE', opts || { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}
export function metaLine(o) {
  return [o.comp, o.venue, fmtDate(o.date) + (o.ko && !o.over ? ' ' + o.ko : '')].filter((x) => x && x.trim()).join(' · ');
}

/* ---------- results ---------- */
export function resultFrom(m) {
  return {
    id: m.id, tk: m.tk, n: [name(m, 0), name(m, 1)], comp: m.comp, venue: m.venue, date: m.date,
    s: [score(m, 0), score(m, 1)],
    t: [0, 1].map((x) => count(m, x, 'try') + count(m, x, 'pentry')),
    c: [count(m, 0, 'con'), count(m, 1, 'con')], p: [count(m, 0, 'pen'), count(m, 1, 'pen')],
    d: [count(m, 0, 'drop'), count(m, 1, 'drop')], upd: now()
  };
}
export function sanitizeResult(r) {
  if (!r || typeof r !== 'object' || !/^[a-z0-9]{4,40}$/i.test(r.id)) return null;
  const pair = (a, hi) => (Array.isArray(a) ? [int(a[0], 0, hi, 0), int(a[1], 0, hi, 0)] : [0, 0]);
  const n = Array.isArray(r.n) ? r.n : [];
  return { id: r.id, tk: str(r.tk, 20), n: [str(n[0], 40) || 'Home', str(n[1], 40) || 'Away'],
    comp: str(r.comp, 80), venue: str(r.venue, 60), date: DATE.test(r.date) ? r.date : '',
    s: pair(r.s, 999), t: pair(r.t, 99), c: pair(r.c, 99), p: pair(r.p, 99), d: pair(r.d, 99),
    upd: int(r.upd, 0, 9e15, 0) };
}
