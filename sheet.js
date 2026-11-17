import { $, h, fill } from './dom.js';
import { POSITIONS, emptySheet, hasLegacySheet, takeLegacySheet } from './vault.js';
import { name, score, count, fmtDate, LABEL, PTS } from './model.js';
import { pdfRows, parseSheet } from './pdfimport.js';

const SIGN = ['Club Team Coach', 'Opposing Team Coach', 'Referee'];
let ctx, saveTimer = null;

// ctx: { vault(), match(), squadName(), ask(msg,label,fn), applyDetails(d) -> string, defTeam(), onChange() }
export function initSheet(c) {
  ctx = c;
  $('sh-unlock').addEventListener('click', unlock);
  $('sh-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') ($('sh-pass2-row').hidden ? unlock() : $('sh-pass2').focus()); });
  $('sh-pass2').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
  $('sh-wipe-locked').addEventListener('click', () => ctx.ask(
    'Erase the encrypted team sheet for ' + ctx.squadName() + ' from this device?\n\nPlayers, officials and signatures will be gone. Match scores are not affected.',
    'Erase sheet', () => { ctx.vault().wipe(); renderSheet(); ctx.onChange(); }));
  $('sh-wipe').addEventListener('click', () => ctx.ask(
    'Erase this team sheet from this device now?\n\nSave the PDF first if you still need it.', 'Erase sheet',
    () => { ctx.vault().wipe(); renderSheet(); ctx.onChange(); }));
  $('sh-lock').addEventListener('click', () => { flush(); ctx.vault().lock(); renderSheet(); ctx.onChange(); });
  $('sh-keep').addEventListener('change', async () => {
    const v = Math.min(30, Math.max(1, +$('sh-keep').value || 14));
    $('sh-keep').value = v; await ctx.vault().save(v); privacyText();
  });
  $('sh-team').addEventListener('input', (e) => { ctx.vault().data.team = e.target.value.slice(0, 60); queueSave(); });
  $('v-sheet').addEventListener('input', (e) => {
    const t = e.target, g = t.dataset.g;
    if (!g || !ctx.vault().data) return;
    ctx.vault().data[g][+t.dataset.i][t.dataset.k] = t.value;
    queueSave();
  });
  $('sh-file').addEventListener('change', importPdf);
  $('sh-save').addEventListener('click', savePdf);
  $('sh-clr').addEventListener('click', () => ctx.ask('Clear all three signatures?', 'Clear signatures', () => {
    const d = ctx.vault().data; d.sig = [null, null, null]; d.sigAt = [0, 0, 0]; queueSave(); sigInit();
  }));
  buildSigPads();
  addEventListener('pagehide', flush);
}

function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => ctx.vault().save(), 400); }
function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; ctx.vault().save(); } }
export function lockSheet() { flush(); ctx.vault().lock(); }

export function renderSheet() {
  const v = ctx.vault();
  $('sh-locked').hidden = v.unlocked;
  $('sh-open').hidden = !v.unlocked;
  if (!v.unlocked) {
    const legacy = hasLegacySheet();
    $('sh-pass').value = ''; $('sh-pass2').value = ''; $('sh-lock-msg').textContent = '';
    $('sh-pass2-row').hidden = v.exists;
    $('sh-wipe-locked').parentElement.hidden = !v.exists;
    $('sh-lock-title').textContent = v.exists ? 'Unlock the ' + ctx.squadName() + ' team sheet' : 'Protect player details';
    $('sh-unlock').textContent = v.exists ? 'Unlock' : 'Set passphrase and open';
    $('sh-pass').setAttribute('autocomplete', v.exists ? 'current-password' : 'new-password');
    $('sh-lock-text').textContent = v.exists
      ? 'Player details are encrypted on this device. Enter the passphrase you set to open them.'
      : 'Choose a passphrase of at least 8 characters for the ' + ctx.squadName() + ' sheet. Players, officials and signatures are encrypted and stay on this device only. They are never uploaded. If the passphrase is forgotten, the sheet can only be erased.' +
        (legacy ? '\n\nThis device has player details saved by the old version without protection. They will be moved into the protected sheet and the unprotected copy deleted.' : '');
    return;
  }
  buildTables(); shRes(); privacyText(); sigInit();
}

async function unlock() {
  const v = ctx.vault(), p = $('sh-pass').value, msg = $('sh-lock-msg');
  if (!v.exists) {
    if (p.length < 8) { msg.textContent = 'Use at least 8 characters.'; return; }
    if (p !== $('sh-pass2').value) { msg.textContent = 'The two passphrases are different. Type them again.'; return; }
  }
  msg.textContent = v.exists ? 'Unlocking…' : 'Protecting…';
  $('sh-unlock').disabled = true;
  try {
    if (v.exists) await v.unlock(p);
    else await v.create(p, takeLegacySheet(v.tk) || emptySheet());
    renderSheet(); ctx.onChange();
  } catch (e) {
    msg.textContent = e.message === 'wrong-pass' ? 'That passphrase is not right. Try again.' : 'Could not open the sheet on this browser.';
  } finally { $('sh-unlock').disabled = false; $('sh-pass').value = ''; $('sh-pass2').value = ''; }
}

function privacyText() {
  const v = ctx.vault();
  $('sh-keep').value = v.keep;
  $('sh-priv').textContent = 'Encrypted on this device and never uploaded. It locks when you sign out or close the page, and is erased automatically if not opened for ' + v.keep + ' days (next: ' +
    new Date(v.expires).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) + ').';
}

const cell = (g, i, k, val, label) => h('td', null, h('input', { value: val, 'aria-label': label, dataset: { g, i: String(i), k }, autocomplete: 'off', maxlength: '60' }));
function buildTables() {
  const d = ctx.vault().data;
  $('sh-team').value = d.team;
  fill('sh-pl', h('tr', null, ['Pos', 'FR / H / P', 'First name', 'Surname', 'School', 'IRFU ID', 'DOB'].map((t) => h('th', { text: t }))),
    POSITIONS.map((p, i) => { const r = d.pl[i]; return h('tr', null, h('td', { class: 'p', text: p }),
      cell('pl', i, 'r', r.r, 'Role ' + p), cell('pl', i, 'f', r.f, 'First name ' + p), cell('pl', i, 's', r.s, 'Surname ' + p),
      cell('pl', i, 'sc', r.sc, 'School ' + p), cell('pl', i, 'id', r.id, 'IRFU ID ' + p), cell('pl', i, 'dob', r.dob, 'Date of birth ' + p)); }));
  fill('sh-of', h('tr', null, ['#', 'Role', 'First name', 'Surname', 'IRFU ID', 'DOB'].map((t) => h('th', { text: t }))),
    d.of.map((r, i) => h('tr', null, h('td', { class: 'p', text: i + 1 }), cell('of', i, 'r', r.r, 'Official ' + (i + 1) + ' role'),
      cell('of', i, 'f', r.f, 'Official ' + (i + 1) + ' first name'), cell('of', i, 's', r.s, 'Official ' + (i + 1) + ' surname'),
      cell('of', i, 'id', r.id, 'Official ' + (i + 1) + ' IRFU ID'), cell('of', i, 'dob', r.dob, 'Official ' + (i + 1) + ' date of birth'))));
  fill('sh-cd', h('tr', null, h('th', { colspan: '3', text: 'Red card' }), h('th', { colspan: '3', text: 'Yellow card' })),
    h('tr', null, ['Player', 'Offence', 'Law', 'Player', 'Offence', 'Law'].map((t) => h('th', { text: t }))),
    d.cd.map((r, i) => h('tr', null, cell('cd', i, 'rp', r.rp, 'Red card player'), cell('cd', i, 'ro', r.ro, 'Red card offence'),
      cell('cd', i, 'rl', r.rl, 'Red card law'), cell('cd', i, 'yp', r.yp, 'Yellow card player'),
      cell('cd', i, 'yo', r.yo, 'Yellow card offence'), cell('cd', i, 'yl', r.yl, 'Yellow card law'))));
}

export function shRes() {
  if ($('sh-open').hidden) return;
  const m = ctx.match();
  fill('sh-res', h('tr', null, ['Team', 'Pts', 'Tries', 'Conv', 'Pen', 'Drop'].map((t) => h('th', { text: t }))),
    [0, 1].map((t) => h('tr', null, h('td', { text: name(m, t) }), h('td', { text: score(m, t) }),
      h('td', { text: count(m, t, 'try') + count(m, t, 'pentry') }), h('td', { text: count(m, t, 'con') }),
      h('td', { text: count(m, t, 'pen') }), h('td', { text: count(m, t, 'drop') }))));
  $('sh-head').textContent = [m.comp, name(m, 0) + ' v ' + name(m, 1), fmtDate(m.date) + (m.ko ? ' ' + m.ko : ''), m.venue]
    .filter((x) => x && x.trim()).join(' · ');
  $('sh-team').placeholder = ctx.defTeam();
}

// Shirt number → "J. Murphy", only on this device and only while unlocked.
export function playerName(no) {
  const d = ctx.vault().data;
  if (!d || !no) return '';
  const r = d.pl[POSITIONS.indexOf(no)];
  return r && (r.f || r.s) ? ((r.f ? r.f[0] + '. ' : '') + r.s).trim() : '';
}
export function sheetTeam() { const d = ctx.vault().data; return d ? d.team : ''; }

/* ---------- signatures ---------- */
function buildSigPads() {
  fill('sh-sig', SIGN.map((n, i) => h('div', { class: 'sigb' },
    h('div', { class: 'row' }, h('span', { id: 'sgl' + i, text: n }), h('button', { text: 'Clear', 'aria-label': 'Clear ' + n + ' signature', onclick: () => { const d = ctx.vault().data; d.sig[i] = null; d.sigAt[i] = 0; queueSave(); sigInit(); } })),
    h('canvas', { id: 'sg' + i, role: 'img', 'aria-labelledby': 'sgl' + i }),
    h('div', { class: 'when', id: 'sgw' + i }),
    h('div', { class: 'signame' }, h('input', { id: 'sgn' + i, placeholder: 'Name in capitals', 'aria-label': n + ' name', maxlength: '40', autocomplete: 'off',
      oninput: (e) => { ctx.vault().data.sigName[i] = e.target.value.slice(0, 40); queueSave(); } }))
  )));
  [0, 1, 2].forEach((i) => {
    const c = $('sg' + i); let on = false, lx = 0, ly = 0;
    c.addEventListener('pointerdown', (e) => { on = true; const r = c.getBoundingClientRect(); lx = e.clientX - r.left; ly = e.clientY - r.top; try { c.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); });
    c.addEventListener('pointermove', (e) => {
      if (!on) return; const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, g = c.getContext('2d');
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(x, y); g.stroke(); lx = x; ly = y; e.preventDefault();
    });
    const end = () => {
      if (!on) return; on = false; const d = ctx.vault().data; if (!d) return;
      d.sig[i] = c.toDataURL('image/png'); d.sigAt[i] = Date.now(); queueSave(); sigWhen(i);
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  });
}
const stamp = (t) => new Date(t).toLocaleString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function sigWhen(i) { const d = ctx.vault().data; $('sgw' + i).textContent = d && d.sig[i] && d.sigAt[i] ? 'Signed ' + stamp(d.sigAt[i]) : 'Not signed yet'; }
export function sigInit() {
  const d = ctx.vault().data; if (!d) return;
  for (let i = 0; i < 3; i++) {
    $('sgn' + i).value = d.sigName[i] || ''; sigWhen(i);
    const c = $('sg' + i), dpr = devicePixelRatio || 1, w = c.clientWidth; if (!w) continue;
    c.width = Math.round(w * dpr); c.height = Math.round(110 * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000';
    if (d.sig[i]) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0, w, 110); im.src = d.sig[i]; }
  }
}

/* ---------- import from an uploaded PDF (read on this device only) ---------- */
async function importPdf(e) {
  const file = e.target.files && e.target.files[0], out = $('sh-imsg');
  e.target.value = '';
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { out.textContent = 'That file is not a PDF. Choose the team sheet PDF downloaded from the IRFU site.'; return; }
  if (file.size > 20e6) { out.textContent = 'That PDF is too large to be a team sheet (over 20 MB).'; return; }
  const filled = ctx.vault().data.pl.some((p) => p.f || p.s);
  const go = async () => {
    out.textContent = 'Reading the team sheet…'; $('sh-file').disabled = true;
    let res;
    try { res = parseSheet(await pdfRows(file)); }
    catch (err) {
      out.textContent = err && err.name === 'PasswordException'
        ? 'This PDF is password-protected. Download an unprotected copy, or type the players in.'
        : 'Could not read this PDF. Check it opens normally on your phone, or type the players in.';
      return;
    } finally { $('sh-file').disabled = false; }
    if (res.chars < 20) { out.textContent = 'This PDF has no readable text. It is probably a scan or a photo. Download the team sheet as a PDF from the IRFU site, or type the players in.'; return; }
    const d = ctx.vault().data, blank = emptySheet();
    if (res.players.length) d.pl = blank.pl;
    if (res.officials.length) d.of = blank.of;
    res.players.forEach((q) => { const ix = POSITIONS.indexOf(q.pos); if (ix >= 0) d.pl[ix] = { r: q.r.slice(0, 20), f: q.f.slice(0, 40), s: q.s.slice(0, 40), sc: q.sc.slice(0, 60), id: q.id, dob: q.dob }; });
    res.officials.forEach((q) => { d.of[q.pos - 1] = { r: (q.r || d.of[q.pos - 1].r).slice(0, 40), f: q.f.slice(0, 40), s: q.s.slice(0, 40), id: q.id, dob: q.dob }; });
    const f = res.fields;
    if (f.team) d.team = f.team.slice(0, 60);
    const extra = f.home && f.away ? ctx.applyDetails(f) : '';
    ctx.vault().save(); buildTables(); shRes();
    out.textContent = res.players.length || res.officials.length
      ? 'Read ' + res.players.length + ' players and ' + res.officials.length + ' officials from ' + file.name + '.' + extra + ' Check every name, IRFU ID and date of birth against the PDF.'
      : 'No player rows were found in this PDF. If it is the IRFU team sheet, tell the site owner so the reader can be adjusted. You can type the players in meanwhile.';
  };
  if (filled) ctx.ask('The sheet already has players on it. Replace them with the players in ' + file.name + '?', 'Replace players', go);
  else go();
}

/* ---------- signed team sheet PDF ---------- */
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'jspdf.umd.min.js'; s.onload = res; s.onerror = rej; document.head.append(s); });
}
async function buildPdf() {
  await loadJsPdf();
  const m = ctx.match(), d = ctx.vault().data;
  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  const PW = 595.28, PH = 841.89, L = 32, W = PW - 2 * L, RH = 12.5, GREEN = [17, 130, 59], LIGHT = [227, 244, 231];
  let y = 40;
  const font = (sz, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(sz); };
  const fit = (v, w) => { v = v == null ? '' : String(v); if (doc.getTextWidth(v) <= w) return v; while (v && doc.getTextWidth(v + '…') > w) v = v.slice(0, -1); return v + '…'; };
  const room = (need) => { if (y + need > PH - 40) { doc.addPage(); y = 40; } };
  const table = (widths, head, rows, opts = {}) => {
    const tw = widths.reduce((a, b) => a + b, 0), all = (head ? [head] : []).concat(rows);
    room(all.length * RH + 4);
    all.forEach((r, ri) => {
      const isH = head && ri === 0;
      if (isH) { doc.setFillColor(...LIGHT); doc.rect(L, y, tw, RH, 'F'); }
      let x = L;
      r.forEach((v, ci) => { font(8, isH || (opts.boldCol === ci)); doc.setTextColor(isH ? GREEN[0] : 0, isH ? GREEN[1] : 0, isH ? GREEN[2] : 0); doc.text(fit(v, widths[ci] - 6), x + 3, y + RH - 3.6); x += widths[ci]; });
      y += RH;
    });
    doc.setDrawColor(170, 190, 172); doc.setLineWidth(0.5);
    const top = y - all.length * RH;
    for (let i = 0; i <= all.length; i++) doc.line(L, top + i * RH, L + tw, top + i * RH);
    let x = L; doc.line(x, top, x, y); widths.forEach((w) => { x += w; doc.line(x, top, x, y); });
    doc.setTextColor(0, 0, 0);
  };
  const label = (t) => { room(22); y += 12; font(10, true); doc.setTextColor(...GREEN); doc.text(t, L, y); doc.setTextColor(0, 0, 0); y += 5; };
  const dmy = (s) => { const p = (s || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; };

  // Title and match details
  font(16, true); doc.setTextColor(...GREEN); doc.text('Youth Competition Team Sheet', PW / 2, y, { align: 'center' }); y += 12;
  doc.setDrawColor(212, 160, 23); doc.setLineWidth(1.5); doc.line(L, y, L + W, y); y += 14;
  const kv = (k, v, x, w) => { font(8.5, true); doc.text(k, x, y); const kw = doc.getTextWidth(k); font(8.5); doc.text(fit(v, w - kw), x + kw + 4, y); };
  kv('Competition:', m.comp, L, 200); kv('Fixture:', name(m, 0) + '  V  ' + name(m, 1), L + 260, 230); y += 13;
  kv('Date:', dmy(m.date), L, 120); kv('KO Time:', m.ko, L + 130, 60); kv('Venue:', m.venue, L + 260, 230); y += 13;
  kv('Team:', d.team || ctx.defTeam(), L, 400); y += 8;

  label('Players');
  table([30, 46, 86, 96, 124, 74, 75.28], ['Pos.', 'FR H or P', 'First Name', 'Surname', 'School', 'IRFU ID', 'DOB'],
    POSITIONS.map((p, i) => { const r = d.pl[i]; return [p, r.r, r.f, r.s, r.sc, r.id, r.dob]; }));
  label('Officials');
  table([30, 136, 96, 110, 80, 79.28], ['#', 'Role', 'First Name', 'Surname', 'IRFU ID', 'DOB'], d.of.map((r, i) => [i + 1, r.r, r.f, r.s, r.id, r.dob]));
  label('Match result');
  table([191.28, 60, 60, 75, 75, 70], ['Team', 'Points', 'Tries', 'Conversions', 'Penalty Goals', 'Drop Goals'],
    [0, 1].map((t) => [name(m, t), score(m, t), count(m, t, 'try') + count(m, t, 'pentry'), count(m, t, 'con'), count(m, t, 'pen'), count(m, t, 'drop')]), { boldCol: 1 });
  label('Red and yellow cards');
  table([95, 122, 48.64, 95, 122, 48.64], ['Red card: player', 'Offence', 'Law', 'Yellow card: player', 'Offence', 'Law'],
    d.cd.map((r) => [r.rp, r.ro, r.rl, r.yp, r.yo, r.yl]));

  // Signatures
  label('Signatures'); room(92); y += 4;
  const imgs = await Promise.all(d.sig.map((v) => new Promise((r) => { if (!v) return r(null); const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = v; })));
  const cw = W / 3;
  SIGN.forEach((n, i) => {
    const x = L + i * cw;
    if (imgs[i]) { const hh = 46, ww = Math.min(cw - 16, imgs[i].width / imgs[i].height * hh); doc.addImage(d.sig[i], 'PNG', x, y, ww, hh); }
    doc.setDrawColor(120, 140, 125); doc.setLineWidth(0.6); doc.line(x, y + 50, x + cw - 16, y + 50);
    font(8, true); doc.text(n, x, y + 61);
    font(8); doc.text(fit(d.sigName[i] || '', cw - 16), x, y + 72);
    doc.setTextColor(90, 110, 95); doc.text(d.sig[i] && d.sigAt[i] ? 'Signed ' + stamp(d.sigAt[i]) : 'Not signed', x, y + 83); doc.setTextColor(0, 0, 0);
  });
  y += 92;

  // Match log (page 2) – the scoring detail behind the result
  if (m.ev.length) {
    doc.addPage(); y = 40;
    font(13, true); doc.setTextColor(...GREEN); doc.text('Match log: ' + name(m, 0) + ' ' + score(m, 0) + ' – ' + score(m, 1) + ' ' + name(m, 1), L, y); doc.setTextColor(0, 0, 0); y += 10;
    const our = ctx.ourSide ? ctx.ourSide() : -1;
    table([50, 200, 200, 81.28], ['Minute', 'Team', 'Event', 'Points'], m.ev.map((e) => {
      const who = e.no && e.t === our ? playerName(e.no) : '';
      return [e.m + "'", e.t === 2 ? '' : name(m, e.t), LABEL[e.k] + (e.no ? ' #' + e.no : '') + (who ? ' (' + who + ')' : ''), PTS[e.k] ? '+' + PTS[e.k] : ''];
    }));
  }
  // Footer on every page
  const pages = doc.getNumberOfPages(), made = stamp(Date.now());
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); font(7); doc.setTextColor(100, 120, 105);
    doc.text('Created ' + made + ' with the Greystones RFC U14 match tracker. Signatures are drawn on screen and are a record of agreement, not a certified electronic signature.', L, PH - 22, { maxWidth: W });
    doc.text('Page ' + p + ' of ' + pages, PW - L, PH - 12, { align: 'right' });
  }
  return doc;
}
async function savePdf() {
  const msg = $('sh-msg'), m = ctx.match(), d = ctx.vault().data;
  const missing = SIGN.filter((n, i) => !d.sig[i]);
  const go = async () => {
    msg.textContent = 'Creating the signed team sheet…';
    try {
      flush();
      const doc = await buildPdf();
      const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
      const fn = 'team-sheet-' + (m.date || 'game') + '-' + slug(name(m, 0)) + '-v-' + slug(name(m, 1)) + '.pdf';
      const a = h('a', { href: URL.createObjectURL(doc.output('blob')), download: fn });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      msg.textContent = 'Saved ' + fn + '. It contains player details, so store and share it carefully.';
    } catch { msg.textContent = 'Could not create the team sheet. Try again.'; }
  };
  if (missing.length) ctx.ask('Not signed yet: ' + missing.join(', ') + '.\n\nCreate the PDF anyway?', 'Create PDF', go); else go();
}
