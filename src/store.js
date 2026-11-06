// Where the displays are kept.
// Demo (no Firebase settings in config.js): the sample displays, with new entries and approvals kept on this phone.
// Live: Firebase Firestore. Anyone can add a display (it waits as "pending"); only admins can approve it.
// The database rules in firestore.rules enforce the same, so the app can't be got around.
import { CONFIG } from './config.js';
import { SAMPLE_DISPLAYS } from './sample-displays.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};

export const FIELDS = ['address', 'suburb', 'lat', 'lng', 'size', 'features', 'viewing', 'from', 'until', 'hours', 'notes'];

export function cleanEntry(d) {
  const s = (v, max) => String(v || '').trim().slice(0, max);
  return {
    address: s(d.address, 120), suburb: s(d.suburb, 60),
    lat: Math.round(Number(d.lat) * 1e5) / 1e5, lng: Math.round(Number(d.lng) * 1e5) / 1e5,
    size: Math.min(4, Math.max(1, Math.round(Number(d.size) || 2))),
    features: (d.features || []).slice(0, 6).map(f => s(f, 20)),
    viewing: d.viewing === 'walk' ? 'walk' : 'drive',
    from: s(d.from, 10), until: s(d.until, 10), hours: s(d.hours, 30), notes: s(d.notes, 200)
  };
}

function demoStore() {
  const extra = () => LS.get('lm.demo.entries', []);
  const save = list => LS.set('lm.demo.entries', list);
  const removed = () => new Set(LS.get('lm.demo.removed', []));
  return {
    mode: 'demo',
    async listApproved() {
      const gone = removed();
      return SAMPLE_DISPLAYS.filter(d => !gone.has(d.id)).concat(extra().filter(d => d.status === 'approved'));
    },
    async submit(entry) {
      const list = extra();
      list.push({ ...cleanEntry(entry), id: 'u' + Date.now().toString(36), status: 'pending', createdAt: Date.now(), mine: true });
      save(list);
    },
    async isAdmin() { return true; },
    async signIn() { return true; },
    async listPending() { return extra().filter(d => d.status === 'pending'); },
    watchPending(onList) { onList(extra().filter(d => d.status === 'pending')); return () => {}; },
    async approve(id) { save(extra().map(d => (d.id === id ? { ...d, status: 'approved' } : d))); },
    async unapprove(id) { save(extra().map(d => (d.id === id ? { ...d, status: 'pending' } : d))); },
    async myDisplays() { return extra().filter(d => d.mine); },
    async update(id, entry, status) { save(extra().map(d => (d.id === id ? { ...d, ...cleanEntry(entry), status, updatedAt: Date.now() } : d))); },
    async reject(id) { save(extra().filter(d => d.id !== id)); },
    async remove(id) {
      if (id.startsWith('s')) { const g = removed(); g.add(id); LS.set('lm.demo.removed', [...g]); }
      else save(extra().filter(d => d.id !== id));
    }
  };
}

async function liveStore(cfg) {
  const v = '11.10.0', base = `https://www.gstatic.com/firebasejs/${v}`;
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(`${base}/firebase-app.js`), import(`${base}/firebase-firestore.js`), import(`${base}/firebase-auth.js`)
  ]);
  const app = initializeApp(cfg);
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);
  // Testing only: point at Google's local test database instead of the real one (never set in the live app)
  if (cfg.emulators) {
    fs.connectFirestoreEmulator(db, ...cfg.emulators.firestore);
    au.connectAuthEmulator(auth, cfg.emulators.auth, { disableWarnings: true });
  }
  const col = fs.collection(db, 'displays');
  const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Coming back from Google's sign-in page (used when a pop-up isn't allowed): collect that sign-in first.
  // Only when we sent them there, and never wait more than a few seconds.
  const REDIRECT = 'tcl.signinRedirect';
  let wentToGoogle = false;
  try { wentToGoogle = !!sessionStorage.getItem(REDIRECT); sessionStorage.removeItem(REDIRECT); } catch (e) { /* private mode */ }
  const redirectDone = wentToGoogle
    ? Promise.race([au.getRedirectResult(auth).catch(e => console.warn('Sign-in on return', e.code || e)), new Promise(r => setTimeout(r, 6000))])
    : Promise.resolve();
  // Wait until the saved sign-in has fully loaded (Google's own "ready" signal), so nobody is checked too early
  const authReady = redirectDone.then(() => (auth.authStateReady ? auth.authStateReady() : new Promise(r => au.onAuthStateChanged(auth, () => r(), () => r()))))
    .catch(() => {});
  const userListeners = new Set();
  let adminCheck = null;
  // Whoever is signed in on this phone; if nobody, a private anonymous ID (needs Anonymous sign-in on in Firebase)
  const phoneId = async () => {
    await authReady;
    if (auth.currentUser) return auth.currentUser;
    try { return (await au.signInAnonymously(auth)).user; } catch (e) { console.warn('No anonymous sign-in', e.code || e); return null; }
  };
  au.onAuthStateChanged(auth, () => { adminCheck = null; userListeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); });

  return {
    mode: 'live',
    // Tell the app when someone signs in or out (including a sign-in that finishes loading late)
    onUserChange(f) { userListeners.add(f); return () => userListeners.delete(f); },
    async listApproved() {
      try {
        const list = rows(await fs.getDocs(fs.query(col, fs.where('status', '==', 'approved'))));
        LS.set('lm.cache.approved', list);
        return list;
      } catch (e) {
        const cached = LS.get('lm.cache.approved', null); // no signal: use the last list this phone saw
        if (cached) return cached;
        throw e;
      }
    },
    async submit(entry) {
      const data = { ...cleanEntry(entry), status: 'pending', createdAt: fs.serverTimestamp() };
      const u = await phoneId();
      if (u) data.ownerUid = u.uid;
      try { await fs.addDoc(col, data); }
      catch (e) {
        // Older database rules don't know about ownerUid yet: send it without, so nobody is ever turned away
        if (!data.ownerUid || e.code !== 'permission-denied') throw e;
        delete data.ownerUid;
        await fs.addDoc(col, data);
      }
    },
    async myDisplays() {
      await authReady;
      const u = auth.currentUser;
      if (!u) return [];
      try { return rows(await fs.getDocs(fs.query(col, fs.where('ownerUid', '==', u.uid)))); } catch (e) { return []; }
    },
    async update(id, entry, status) {
      await fs.updateDoc(fs.doc(db, 'displays', id), { ...cleanEntry(entry), status, updatedAt: fs.serverTimestamp() });
    },
    isAdmin() {
      // Remembered for this signed-in person, so the check happens once rather than on every screen
      adminCheck ??= (async () => {
        await authReady;
        const u = auth.currentUser;
        if (!u || u.isAnonymous) return false;
        try { return (await fs.getDoc(fs.doc(db, 'admins', u.uid))).exists(); } catch (e) { console.warn('admin check failed', e.code || e.message); adminCheck = null; return false; }
      })();
      return adminCheck;
    },
    async signIn() {
      const provider = new au.GoogleAuthProvider();
      try { await au.signInWithPopup(auth, provider); }
      catch (e) {
        try { sessionStorage.setItem(REDIRECT, '1'); } catch (x) { /* private mode */ }
        await au.signInWithRedirect(auth, provider);
      }
      adminCheck = null;
      return this.isAdmin();
    },
    async whoAmI() { await authReady; const u = auth.currentUser; return u && !u.isAnonymous ? { uid: u.uid, email: u.email } : null; },
    async listPending() { await authReady; return rows(await fs.getDocs(fs.query(col, fs.where('status', '==', 'pending')))); },
    // Calls onList with the waiting displays now and again whenever one is added or changes; returns "stop"
    watchPending(onList, onError) {
      let stop = () => {}, stopped = false;
      authReady.then(() => {
        if (stopped) return;
        stop = fs.onSnapshot(fs.query(col, fs.where('status', '==', 'pending')), snap => onList(rows(snap)), onError);
      });
      return () => { stopped = true; stop(); };
    },
    async approve(id) { await fs.updateDoc(fs.doc(db, 'displays', id), { status: 'approved', approvedAt: fs.serverTimestamp() }); },
    async unapprove(id) { await fs.updateDoc(fs.doc(db, 'displays', id), { status: 'pending' }); },
    async signOut() { await au.signOut(auth); adminCheck = null; },
    async reject(id) { await fs.deleteDoc(fs.doc(db, 'displays', id)); },
    async remove(id) { await fs.deleteDoc(fs.doc(db, 'displays', id)); }
  };
}

// Live, but the database couldn't be reached (no signal, or it's down): show the last list this phone saw,
// never the made-up sample displays
function offlineStore() {
  const fail = async () => { throw new Error("Can't reach the database right now"); };
  return {
    mode: 'offline',
    async listApproved() { return LS.get('lm.cache.approved', []); },
    async myDisplays() { return []; },
    update: fail,
    submit: fail, signIn: fail, listPending: fail, approve: fail, reject: fail, remove: fail,
    async isAdmin() { return false; },
    async whoAmI() { return null; }
  };
}

export async function openStore() {
  if (CONFIG.firebase) {
    try { return await liveStore(CONFIG.firebase); }
    catch (e) { console.error('Could not reach Firebase', e); return offlineStore(); }
  }
  return demoStore();
}
