// Encrypted, device-only storage for team sheets (children's names, dates of
// birth, IRFU IDs, schools and signatures). This data is never sent to Firebase.
//
// - The key is derived from a passphrase (PBKDF2-SHA-256, 600,000 rounds) and
//   held in memory only while the sheet is unlocked. It is never stored.
// - Data is encrypted with AES-256-GCM; a fresh random IV is used on every save.
// - Each sheet is erased automatically if not opened for `keep` days.

const PREFIX = 'gs-sheet-v3-';
const ROUNDS = 600000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (buf) => {
  const a = new Uint8Array(buf); let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const DAY = 86400000;

export const POSITIONS = [15, 14, 13, 12, 11, 10, 9, 1, 2, 3, 4, 5, 6, 7, 8, 16, 17, 18, 19, 20, 21, 22, 23];
const ROLES = ['Team Manager', 'Medic', 'Lead/Head Coach', 'Forwards Coach', '', '', '', ''];

export function emptySheet() {
  return {
    team: '',
    pl: POSITIONS.map(() => ({ r: '', f: '', s: '', sc: '', id: '', dob: '' })),
    of: ROLES.map((r) => ({ r, f: '', s: '', id: '', dob: '' })),
    cd: [0, 1, 2].map(() => ({ rp: '', ro: '', rl: '', yp: '', yo: '', yl: '' })),
    sig: [null, null, null]
  };
}

// Make sure a decrypted or imported sheet has exactly the expected shape.
export function normalizeSheet(d) {
  const e = emptySheet(), s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  if (!d || typeof d !== 'object') return e;
  e.team = s(d.team, 60);
  e.pl = e.pl.map((x, i) => { const r = (d.pl || [])[i] || {}; return { r: s(r.r, 20), f: s(r.f, 40), s: s(r.s, 40), sc: s(r.sc, 60), id: s(r.id, 20), dob: s(r.dob, 10) }; });
  e.of = e.of.map((x, i) => { const r = (d.of || [])[i] || {}; return { r: s(r.r, 40) || x.r, f: s(r.f, 40), s: s(r.s, 40), id: s(r.id, 20), dob: s(r.dob, 10) }; });
  e.cd = e.cd.map((x, i) => { const r = (d.cd || [])[i] || {}; return { rp: s(r.rp, 40), ro: s(r.ro, 60), rl: s(r.rl, 20), yp: s(r.yp, 40), yo: s(r.yo, 60), yl: s(r.yl, 20) }; });
  e.sig = [0, 1, 2].map((i) => { const v = (d.sig || [])[i]; return typeof v === 'string' && v.startsWith('data:image/png;base64,') && v.length < 400000 ? v : null; });
  return e;
}

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ROUNDS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function readBox(tk) { try { return JSON.parse(localStorage.getItem(PREFIX + tk)); } catch { return null; } }

export function purgeExpired() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) {
      const box = readBox(k.slice(PREFIX.length));
      if (!box || !box.exp || box.exp < Date.now()) localStorage.removeItem(k);
    }
  }
}

export class Vault {
  constructor(tk) { this.tk = tk; this.key = null; this.salt = null; this.data = null; }
  get exists() { return !!readBox(this.tk); }
  get unlocked() { return !!this.key; }
  get keep() { return (readBox(this.tk) || {}).keep || 14; }
  get expires() { return (readBox(this.tk) || {}).exp || 0; }

  async create(pass, initial) {
    this.salt = crypto.getRandomValues(new Uint8Array(16));
    this.key = await deriveKey(pass, this.salt);
    this.data = normalizeSheet(initial);
    await this.save(14);
  }
  async unlock(pass) {
    const box = readBox(this.tk);
    if (!box) throw new Error('missing');
    const salt = unb64(box.salt), key = await deriveKey(pass, salt);
    let plain;
    try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)); }
    catch { throw new Error('wrong-pass'); }
    this.key = key; this.salt = salt;
    this.data = normalizeSheet(JSON.parse(dec.decode(plain)));
    await this.save(box.keep);
  }
  async save(keep) {
    if (!this.key) return;
    const k = Math.min(30, Math.max(1, keep || this.keep));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, enc.encode(JSON.stringify(this.data)));
    localStorage.setItem(PREFIX + this.tk, JSON.stringify({ v: 3, salt: b64(this.salt), iv: b64(iv), ct: b64(ct), keep: k, exp: Date.now() + k * DAY }));
  }
  lock() { this.key = null; this.salt = null; this.data = null; }
  wipe() { this.lock(); localStorage.removeItem(PREFIX + this.tk); }
}

/* ---------- unprotected data left by the old version ---------- */
const LEGACY_SHEETS = { kb: ['rt-sheet-v1-kb', 'rt-sheet-v1'], ma: ['rt-sheet-v1-ma'] };
const LEGACY_OTHER = /^(rt-sheet-v1|rugby-tracker-v2|rugby-results-v2)/;

export function legacyKeys() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && LEGACY_OTHER.test(k)) out.push(k); }
  return out;
}
export function hasLegacySheet() { return legacyKeys().some((k) => k.startsWith('rt-sheet-v1')); }
export function takeLegacySheet(tk) {
  for (const k of LEGACY_SHEETS[tk] || []) {
    const raw = localStorage.getItem(k);
    if (raw) { try { const d = JSON.parse(raw); localStorage.removeItem(k); return d; } catch { localStorage.removeItem(k); } }
  }
  return null;
}
export function wipeLegacy() { legacyKeys().forEach((k) => localStorage.removeItem(k)); }
