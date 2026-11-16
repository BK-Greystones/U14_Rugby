// Reads an IRFU team sheet PDF on this device. Nothing is uploaded.
// pdf.js pulls the text out of the PDF along with where each piece sits on the
// page. We rebuild the table rows from those positions, find the column
// headings (Pos, FR H or P, First Name, Surname, School, IRFU ID, DOB) and
// place each value under the heading it lines up with.

import { POSITIONS } from './vault.js';

let lib = null;
async function pdfjs() {
  if (!lib) {
    lib = await import('./pdf.min.js');
    lib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.js', document.baseURI).href;
  }
  return lib;
}

// PDF → list of rows, each a left-to-right list of {s, x}
export async function pdfRows(file) {
  const { getDocument } = await pdfjs();
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, enableXfa: false });
  const doc = await task.promise;
  const rows = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 4); n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      const items = tc.items.filter((i) => i.str && i.str.trim())
        .map((i) => ({ s: i.str.replace(/\s+/g, ' ').trim(), x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
      const pageRows = [];
      items.sort((a, b) => b.y - a.y);
      for (const it of items) {
        const r = pageRows.find((p) => Math.abs(p.y - it.y) < 3);
        if (r) r.items.push(it); else pageRows.push({ y: it.y, items: [it] });
      }
      pageRows.sort((a, b) => b.y - a.y).forEach((r) => rows.push(r.items.sort((a, b) => a.x - b.x)));
    }
  } finally { task.destroy(); }
  return rows;
}

const HEAD = [
  ['pos', /^pos\b|^pos\.|^no\.?$|^#$/i], ['r', /^fr\b|^fr$|^role\b|^fr\s*h/i], ['f', /^first\b|^forename/i],
  ['s', /^surname|^last\s*name|^family/i], ['sc', /^school/i], ['id', /^irfu|^id\b|^member/i], ['dob', /^dob\b|^d\.o\.b|^date of birth/i]
];
function headerCols(row) {
  const cols = [];
  for (const it of row) {
    const hit = HEAD.find(([k, re]) => re.test(it.s) && !cols.some((c) => c.k === k));
    if (hit) cols.push({ k: hit[0], x: it.x });
  }
  return cols.some((c) => c.k === 'f') && cols.some((c) => c.k === 's') ? cols.sort((a, b) => a.x - b.x) : null;
}
function assign(row, cols) {
  const cells = {};
  for (const it of row) {
    let col = cols[0];
    for (const c of cols) if (c.x <= it.x + 4) col = c;
    cells[col.k] = cells[col.k] ? cells[col.k] + ' ' + it.s : it.s;
  }
  return cells;
}

const DOB = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/;
export function normDob(v) {
  const q = (v || '').match(DOB); if (!q) return '';
  const [d, m, y] = q[3] ? [q[1], q[2], q[3]] : [q[6], q[5], q[4]];
  return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + y;
}
const ID = /\b(\d{6,10})\b/;
const ROLES = /^(Team Manager|Medic|Lead\/Head Coach|Head Coach|Lead Coach|Forwards Coach|Backs Coach|Defence Coach|Scrum Coach|Assistant Coach|Coach|Manager|Physio|First Aider)\b/i;

// Fallback when no column headings are found: read each line as
// "pos [role] first surname [school] id dob".
function lineParse(text, off) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const pm = flat.match(/^(\d{1,2})\b/), dob = normDob(flat), dm = flat.match(DOB);
  if (!pm || !dob) return null;
  const im = flat.slice(pm[0].length).match(ID);
  let t = flat.slice(pm[0].length, Math.min(dm.index, im ? im.index + pm[0].length : 1e9)).trim(), r = '';
  if (off) { const k = t.match(ROLES); if (k) { r = k[1]; t = t.slice(k[0].length).trim(); } }
  else { const tk = t.split(' '); while (tk.length > 2 && /^(FR|H|P|C|VC|Capt\.?|Captain)$/i.test(tk[0])) r += (r ? ' ' : '') + tk.shift(); t = tk.join(' '); }
  const tk = t.split(' ');
  return { pos: +pm[1], r, f: tk.shift() || '', s: tk.join(' '), sc: '', id: im ? im[1] : '', dob };
}

export function parseSheet(rows) {
  const out = { players: [], officials: [], fields: {}, chars: 0 };
  let cols = null, off = false;
  const text = rows.map((r) => r.map((i) => i.s).join(' ')).join('\n');
  out.chars = text.replace(/\s/g, '').length;
  for (const row of rows) {
    const line = row.map((i) => i.s).join(' ');
    if (/^\s*officials\b/i.test(line) || /\bOFFICIALS\b/.test(line)) { off = true; }
    const hc = headerCols(row);
    if (hc) { cols = hc; continue; }
    let rec = null;
    if (cols) {
      const c = assign(row, cols);
      const pos = parseInt((c.pos || '').replace(/\D/g, ''), 10);
      const dob = normDob(c.dob || line);
      if (pos && (c.f || c.s) && dob) {
        rec = { pos, r: (c.r || '').trim(), f: (c.f || '').trim(), s: (c.s || '').trim(), sc: (c.sc || '').trim(),
          id: ((c.id || '').match(ID) || [])[1] || '', dob };
        if (off && !rec.r) { const k = rec.f.concat(' ', rec.s).match(ROLES); if (k) { rec.r = k[1]; } }
      }
    }
    if (!rec) rec = lineParse(line, off);
    if (!rec) continue;
    if (!off && POSITIONS.includes(rec.pos)) out.players.push(rec);
    else if (off && rec.pos >= 1 && rec.pos <= 8) out.officials.push(rec);
  }
  // Match details at the top of the sheet: "Competition: … Fixture: A V B Date: … KO Time: … Venue: … Team: …"
  const flat = text.replace(/\s+/g, ' ');
  const STOP = '(?=\\s+(?:Competition:|Fixture:|Date:|KO Time:|K\\.?O\\.? Time:|Kick[- ]off:|Venue:|Team:|Pos\\b|FR H|$))';
  const field = (label) => { const q = flat.match(new RegExp(label + '\\s*(.*?)' + STOP, 'i')); return q ? q[1].trim() : ''; };
  const fx = field('Fixture:').match(/^(.*?)\s+(?:V|v|vs\.?|VS)\s+(.*)$/);
  const ko = (field('KO Time:') || field('Kick[- ]off:')).match(/\b(\d{1,2})[:.](\d{2})\b/);
  const d = normDob(field('Date:'));
  out.fields = {
    comp: field('Competition:'), team: field('Team:'), venue: field('Venue:'),
    home: fx ? fx[1].trim() : '', away: fx ? fx[2].trim() : '',
    date: d ? d.slice(6) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2) : '',
    ko: ko ? ko[1].padStart(2, '0') + ':' + ko[2] : ''
  };
  return out;
}
