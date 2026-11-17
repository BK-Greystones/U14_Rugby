// League robot. GitHub runs this on its own servers (see update-league.yml).
// For each squad it:
//   1. finds the league page link (the one a coach set in the app, otherwise
//      the leagueUrl already in fixtures.json),
//   2. reads the Leinster Rugby (SportLoMo) league page,
//   3. pulls out every fixture, result and the league table,
//   4. writes them into fixtures.json, but only if something has changed.
// If a page can't be read or doesn't look right, that squad is left exactly as
// it was, so a bad read can never wipe out good data.
//
// Run it yourself with:  node update-league.mjs            (updates the file)
//                        node update-league.mjs --dry-run  (only shows what it found)

import { readFileSync, writeFileSync } from 'node:fs';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export const LEAGUE_URL = /^https:\/\/[a-z0-9.-]*sportlomo\.com\/league\/\d+\/?(\?[\w=&%.-]*)?$/i;

/* ---------- turning HTML into text ---------- */
function decode(s) {
  return s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, '’').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)));
}
function strip(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ');
}
// One line per block element; inline elements become spaces.
export function htmlLines(html) {
  const t = strip(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|tr|table|thead|tbody|h[1-6]|section|article|header|footer|nav|main|aside|dl|dt|dd|form)\b[^>]*>/gi, '\n')
    .replace(/<\/?(td|th)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decode(t).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
const cellText = (html) => decode(strip(html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- reading a league page ---------- */
function tables(html) {
  return [...strip(html).matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((t) =>
    [...t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => cellText(c[1]))));
}
const SCORE = /(\d+)?(?:\s*-\s*\d*)?\s*\bV\b\s*(\d+)?(?:\s*-\s*\d*)?/;
const DATE = /\b(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2}))?/;

function parseDate(s) {
  const q = s.match(DATE); if (!q) return null;
  const mo = MONTHS[q[2].toLowerCase()]; if (!mo) return null;
  const y = q[3].length === 2 ? 2000 + +q[3] : +q[3];
  const date = y + '-' + String(mo).padStart(2, '0') + '-' + String(q[1]).padStart(2, '0');
  const time = q[4] && !(q[4] === '00' && q[5] === '00') ? q[4].padStart(2, '0') + ':' + q[5] : '';
  return { date, time };
}

export function parseLeague(html) {
  const lines = htmlLines(html);
  const title = (html.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi) || []).map(cellText)
    .find((t) => /U\d{2}|league|grading|group|grp|div/i.test(t) && t.length < 120) || '';

  // 1. The results grid ("matrix"): teams across the top and down the side,
  //    each square holding "42-11 V 12-2" and "09-Nov-25 12:00".
  let teams = [], fixtures = [];
  for (const t of tables(html)) {
    if (t.length < 3) continue;
    const head = t[0].slice(1).filter(Boolean);
    const games = [];
    for (const row of t.slice(1)) {
      const home = row[0];
      row.slice(1).forEach((cell, j) => {
        const away = t[0][j + 1];
        if (!home || !away || home === away || !SCORE.test(cell)) return;
        const when = parseDate(cell); if (!when) return;
        const s = cell.match(SCORE);
        games.push({ date: when.date, time: when.time, home, away, score: s[1] !== undefined && s[2] !== undefined ? s[1] + '-' + s[2] : '', venue: '', note: '' });
      });
    }
    if (games.length >= 2 && head.length >= 3) { teams = head; fixtures = games; break; }
  }
  if (!fixtures.length) return { ok: false, why: 'Could not find the results grid on the league page.' };

  // 2. Venue and "Conceded by …" notes from the fixture list further down.
  //    A fixture shows as: home team / score / away team / venue / referee.
  const isTeam = (l) => teams.includes(l);
  const listLines = htmlLines(html.replace(/<table\b[\s\S]*?<\/table>/gi, ' '));
  let current = null;
  for (let i = 0; i < listLines.length; i++) {
    const l = listLines[i];
    if (isTeam(l)) {
      let matched = false;
      for (let k = i + 1; k <= i + 3 && k < listLines.length; k++) {
        if (isTeam(listLines[k]) && listLines[k] !== l) {
          const f = fixtures.find((x) => x.home === l && x.away === listLines[k]);
          if (f) {
            current = f; matched = true;
            const v = listLines[k + 1];
            const isVenue = v && !/^[-–\d\sV]+$/.test(v) && !/^\**\s*comment/i.test(v) && v.length <= 60;
            if (isVenue && !f.venue) f.venue = v;
            i = isVenue ? k + 1 : k;
          }
          break;
        }
      }
      if (matched) continue;
    }
    const c = l.match(/^\**\s*comment:?\**\s*:?\s*(.+)$/i);
    if (c && current && !current.note) current.note = c[1].trim().slice(0, 80);
  }

  // 3. The league table: "1 0 Greystones RFC 6 6 0 0 24".
  const flat = lines.join(' ');
  const hi = flat.search(/\bPld\b[\s\S]{0,40}\bPts\b/i);
  const after = hi >= 0 ? flat.slice(hi) : flat;
  // Some pages put a "movement" number between the position and the team
  // name; some don't. Try both and keep whichever gives positions 1, 2, 3…
  const readTable = (extraCol) => {
    const out = [];
    for (const team of teams) {
      const re = new RegExp('(?:^|\\s)(\\d{1,2})\\s+' + (extraCol ? '[-+]?\\d{1,2}\\s+' : '') + esc(team) + '\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(-?\\d+)(?=\\s|$)');
      const q = after.match(re);
      if (q) out.push({ pos: +q[1], team, p: +q[2], w: +q[3], d: +q[4], l: +q[5], pts: +q[6] });
    }
    const valid = out.every((r) => r.pos >= 1 && r.pos <= teams.length) && new Set(out.map((r) => r.pos)).size >= out.length - 1;
    return valid ? out : [];
  };
  const a1 = readTable(true), a2 = readTable(false);
  const table = (a1.length >= a2.length ? a1 : a2).sort((a, b) => a.pos - b.pos || b.pts - a.pts);
  if (table.length < Math.min(3, teams.length)) return { ok: false, why: 'Found the fixtures but not the league table.' };

  fixtures.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
  return { ok: true, competition: title, teams, fixtures, table: table.map(({ pos, ...r }) => r) };
}

/* ---------- reading the league link a coach set in the app ---------- */
async function linkFromApp(tk, cfg, referer) {
  if (!cfg.projectId) return '';
  const url = 'https://firestore.googleapis.com/v1/projects/' + cfg.projectId + '/databases/(default)/documents/leagues/' + tk + (cfg.apiKey ? '?key=' + cfg.apiKey : '');
  try {
    const r = await fetch(url, { headers: referer ? { Referer: referer } : {} });
    if (!r.ok) return '';
    const j = await r.json();
    const u = j.fields && j.fields.url && j.fields.url.stringValue;
    return LEAGUE_URL.test(u || '') ? u : '';
  } catch { return ''; }
}

/* ---------- writing fixtures.json in the same easy-to-edit layout ---------- */
export function formatFixtures(d) {
  const J = (v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? '{' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ': ' + JSON.stringify(x)).join(', ') + '}'
    : JSON.stringify(v));
  const L = ['{', '  "club": ' + J(d.club) + ',', '  "highlight": ' + J(d.highlight) + ','];
  if (d.updatedAt) L.push('  "updatedAt": ' + J(d.updatedAt) + ',');
  L.push('  "teams": {');
  const keys = Object.keys(d.teams);
  keys.forEach((k, i) => {
    const t = d.teams[k];
    L.push('    ' + J(k) + ': {');
    for (const f of ['name', 'competition', 'leagueUrl', 'asOf']) L.push('      ' + J(f) + ': ' + J(t[f] || '') + ',');
    L.push('      "fixtures": [');
    t.fixtures.forEach((x, j) => L.push('        ' + J(x) + (j < t.fixtures.length - 1 ? ',' : '')));
    L.push('      ],', '      "table": [');
    t.table.forEach((x, j) => L.push('        ' + J(x) + (j < t.table.length - 1 ? ',' : '')));
    L.push('      ]', '    }' + (i < keys.length - 1 ? ',' : ''));
  });
  L.push('  }', '}');
  return L.join('\n') + '\n';
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const cfgText = readFileSync('firebase-config.js', 'utf8');
  const cfg = { projectId: (cfgText.match(/projectId:\s*"([^"]+)"/) || [])[1], apiKey: (cfgText.match(/apiKey:\s*"([^"]+)"/) || [])[1] };
  if (/REPLACE_ME/.test(cfg.projectId || '')) cfg.projectId = '';
  const repo = process.env.GITHUB_REPOSITORY || '';
  const referer = repo ? 'https://' + repo.split('/')[0].toLowerCase() + '.github.io/' : '';
  const data = JSON.parse(readFileSync('fixtures.json', 'utf8'));
  const before = JSON.stringify(data.teams);
  let ok = 0, failed = 0;

  for (const [tk, t] of Object.entries(data.teams)) {
    const appLink = await linkFromApp(tk, cfg, referer);
    const url = appLink || t.leagueUrl;
    if (!LEAGUE_URL.test(url || '')) { console.log(`${t.name}: no valid league link, skipped.`); continue; }
    console.log(`${t.name}: reading ${url}${appLink ? ' (link set in the app)' : ''}`);
    let html;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GreystonesU14Tracker/1.0; +https://github.com/' + repo + ')' } });
      if (!r.ok) throw new Error('the page answered ' + r.status);
      html = await r.text();
    } catch (e) { console.log(`  ✗ Could not open the page: ${e.message}`); failed++; continue; }
    const res = parseLeague(html);
    if (!res.ok) { console.log('  ✗ ' + res.why + ' Nothing was changed for this squad.'); failed++; continue; }
    const played = res.fixtures.filter((f) => f.score).length;
    console.log(`  ✓ ${res.fixtures.length} fixtures (${played} with scores), ${res.table.length} teams in the table.`);
    // Keep venues typed in by hand if the page didn't give one.
    const old = new Map((t.fixtures || []).map((f) => [f.home + '|' + f.away, f]));
    res.fixtures.forEach((f) => { const o = old.get(f.home + '|' + f.away); if (o && !f.venue) f.venue = o.venue || ''; });
    const changed = JSON.stringify([res.fixtures, res.table, url]) !== JSON.stringify([t.fixtures, t.table, t.leagueUrl]);
    if (changed) {
      Object.assign(t, { competition: res.competition || t.competition, leagueUrl: url, fixtures: res.fixtures, table: res.table,
        asOf: new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Dublin' }) });
    }
    console.log(changed ? '  New information found.' : '  Already up to date.');
    ok++;
  }

  if (JSON.stringify(data.teams) !== before) {
    data.updatedAt = new Date().toISOString();
    if (dry) console.log('\n(dry run) fixtures.json would be updated.');
    else { writeFileSync('fixtures.json', formatFixtures(data)); console.log('\nfixtures.json updated.'); }
  } else console.log('\nNo changes to save.');
  // A squad that couldn't be read makes the run show as failed (so coaches are
  // told), but anything read successfully above has still been saved.
  if (failed) { console.log(`\n${failed} squad(s) could not be read. Check the league link in the app.`); process.exit(1); }
}

if (import.meta.url === 'file://' + process.argv[1]) main();
