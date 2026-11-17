// Data layer. The app talks to one of two stores with the same interface:
//  - FirebaseStore: the real thing. Logins via Firebase Auth, live data in
//    Firestore, with writes enforced server-side by firestore.rules.
//  - PreviewStore: only on localhost, before Firebase is configured, so you can
//    try the app. Data stays in this browser; open a second tab to see "live"
//    updates. It never runs on the published site.
import { firebaseConfig } from './firebase-config.js';

const configured = !!firebaseConfig.apiKey && !/REPLACE_ME/.test(JSON.stringify(firebaseConfig));
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export async function openStore() {
  if (configured) return firebaseStore();
  if (local) return previewStore();
  return { mode: 'unconfigured' };
}

async function firebaseStore() {
  const fb = await import('./firebase.js');
  const app = fb.initializeApp(firebaseConfig);
  // initializeAuth without a popup/redirect resolver: no hidden iframes are loaded.
  const auth = fb.initializeAuth(app, { persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence] });
  let db;
  try {
    db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
  } catch { db = fb.initializeFirestore(app, {}); }

  return {
    mode: 'firebase',
    onAuth: (cb) => fb.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email || '' } : null)),
    signIn: (email, pw) => fb.signInWithEmailAndPassword(auth, email, pw),
    signOut: () => fb.signOut(auth),
    resetPassword: (email) => fb.sendPasswordResetEmail(auth, email),
    async isAdmin(uid) { return (await fb.getDoc(fb.doc(db, 'admins', uid))).exists(); }, // throws when offline with nothing cached
    watchMatch: (tk, cb, err) => fb.onSnapshot(fb.doc(db, 'matches', tk), { includeMetadataChanges: true },
      (s) => cb(s.exists() ? s.data() : null, { pending: s.metadata.hasPendingWrites, cached: s.metadata.fromCache }), err),
    watchResults: (cb, err) => fb.onSnapshot(fb.collection(db, 'results'), (q) => cb(q.docs.map((d) => d.data())), err),
    saveMatch: (tk, data) => fb.setDoc(fb.doc(db, 'matches', tk), data),
    saveResult: (r) => fb.setDoc(fb.doc(db, 'results', r.id), r),
    deleteResult: (id) => fb.deleteDoc(fb.doc(db, 'results', id)),
    // League page links set by coaches (read by the league robot too).
    watchLeague: (tk, cb) => fb.onSnapshot(fb.doc(db, 'leagues', tk), (s) => cb(s.exists() ? s.data() : null), () => cb(null)),
    saveLeague: (tk, url) => fb.setDoc(fb.doc(db, 'leagues', tk), { url, upd: Date.now() }),
    // Optional GitHub key for one-tap league updates. Only coaches can read it.
    async getGithubToken() { const s = await fb.getDoc(fb.doc(db, 'private', 'github')); return s.exists() ? s.data().token || null : null; },
    setGithubToken: (t) => (t ? fb.setDoc(fb.doc(db, 'private', 'github'), { token: t, upd: Date.now() }) : fb.deleteDoc(fb.doc(db, 'private', 'github')))
  };
}

function previewStore() {
  const K = 'preview-v3-', listeners = {};
  const read = (k) => { try { return JSON.parse(localStorage.getItem(K + k)); } catch { return null; } };
  const emit = (k) => (listeners[k] || []).forEach((f) => f(read(k)));
  const write = (k, v) => { localStorage.setItem(K + k, JSON.stringify(v)); emit(k); };
  const on = (k, f) => { (listeners[k] = listeners[k] || []).push(f); f(read(k)); return () => {}; };
  addEventListener('storage', (e) => { if (e.key && e.key.startsWith(K)) emit(e.key.slice(K.length)); });
  return {
    mode: 'preview',
    onAuth: (cb) => on('user', cb),
    async signIn(email) { write('user', { uid: 'preview', email: email || 'coach@preview' }); },
    async signOut() { localStorage.removeItem(K + 'user'); emit('user'); },
    async resetPassword() {},
    async isAdmin() { return true; },
    watchMatch: (tk, cb) => on('match-' + tk, (d) => cb(d, { pending: false, cached: false })),
    watchResults: (cb) => on('results', (d) => cb(Object.values(d || {}))),
    async saveMatch(tk, data) { write('match-' + tk, data); },
    async saveResult(r) { const all = read('results') || {}; all[r.id] = r; write('results', all); },
    async deleteResult(id) { const all = read('results') || {}; delete all[id]; write('results', all); },
    watchLeague: (tk, cb) => on('league-' + tk, cb),
    async saveLeague(tk, url) { write('league-' + tk, { url, upd: Date.now() }); },
    async getGithubToken() { return (read('github') || {}).token || null; },
    async setGithubToken(t) { if (t) write('github', { token: t }); else { localStorage.removeItem(K + 'github'); emit('github'); } }
  };
}
