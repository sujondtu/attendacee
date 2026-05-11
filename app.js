// Attendance tracker -- vanilla JS state + views

const STORAGE_KEY = "attendance.v1";
const VIEW_KEY = "attendance.view";
const CLASS_KEY = "attendance.class";
const DRAFT_KEY = "attendance.drafts";
const DEVICE_KEY = "attendance.device";
const FIREBASE_SDK_VERSION = "12.13.0";

// ---------- helpers ----------
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const el = (tag, attrs={}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === false) {
      if (k.startsWith("aria-")) node.setAttribute(k, "false");
      else continue;
    }
    else if (v == null) continue;
    else if (v === true) node.setAttribute(k, k.startsWith("aria-") ? "true" : "");
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
};
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso, opts={}) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: opts.weekday ? "short" : undefined, year: opts.year ? "numeric" : undefined });
};
const initials = (name, sid) => {
  if (!name) return "#" + sid.slice(-2);
  const parts = name.trim().split(/\s+/).filter(p => !/^(md\.?|mst\.?|mohammad)$/i.test(p));
  if (parts.length === 0) return name[0].toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
const displayName = (s) => s.name || `Student #${s.sid.slice(-3)}`;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function storageGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch (err) {
    console.warn("Local storage read failed", err);
    return fallback;
  }
}
function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn("Local storage write failed", err);
    return false;
  }
}
function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn("Local storage remove failed", err);
  }
}
function loadJSON(key, fallback) {
  const raw = storageGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Stored JSON was invalid", err);
    return fallback;
  }
}
function makeId(prefix = "") {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${time}_${rand}`;
}
function getDeviceId() {
  let id = storageGet(DEVICE_KEY);
  if (!id) {
    id = makeId("device_");
    storageSet(DEVICE_KEY, id);
  }
  return id;
}

// ---------- state ----------
const deviceId = getDeviceId();
let state;
function normalizeState(data) {
  const normalized = data && typeof data === "object" ? data : {};
  normalized.classes ||= {};
  normalized.meta = {
    updatedAt: Number(normalized.meta?.updatedAt) || 0,
    updatedBy: normalized.meta?.updatedBy || ""
  };
  return normalized;
}
function touchState() {
  state.meta = {
    updatedAt: Date.now(),
    updatedBy: deviceId
  };
}
function load() {
  const stored = loadJSON(STORAGE_KEY, null);
  if (stored?.classes) return normalizeState(stored);

  // Seed from SEED rosters
  const seeded = {};
  for (const k of Object.keys(window.SEED)) {
    const c = window.SEED[k];
    seeded[k] = {
      name: c.name,
      fullName: c.fullName,
      students: c.students.map(s => ({ ...s })),
      sessions: [] // { id, date, slot ("C1"|"C2"), attendance: { sid: "P"|"A" }, note? }
    };
  }
  return normalizeState({ classes: seeded });
}
function save(options = {}) {
  const { sync = true, touch = true } = options;
  if (touch) touchState();
  const ok = storageSet(STORAGE_KEY, JSON.stringify(state));
  if (ok && sync) queueCloudSave();
  return ok;
}

async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return;
    if (navigator.storage.persisted && await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch (_) {}
}

state = load();
requestPersistentStorage();

let view = storageGet(VIEW_KEY, "today") || "today";
let currentClass = storageGet(CLASS_KEY, "IPE") || "IPE";
if (!state.classes[currentClass]) currentClass = Object.keys(state.classes)[0];

// Working session draft (not yet saved)
let draft = null;
// {date, slot, attendance: {sid: 'P'|'A'}, editingId?}
let draftStore = loadDraftStore();

function newDraft(date = today(), slot = "C1") {
  return { date, slot, attendance: {}, editingId: null };
}
function findSession(cls, date, slot) {
  return cls.sessions.find(s => s.date === date && s.slot === slot);
}
function cleanAttendance(attendance = {}) {
  const clean = {};
  for (const [sid, value] of Object.entries(attendance || {})) {
    if (value === "P" || value === "A") clean[sid] = value;
  }
  return clean;
}
function normalizeDraft(source, fallbackDate = today(), fallbackSlot = "C1") {
  const slot = source?.slot === "C2" ? "C2" : source?.slot === "C1" ? "C1" : fallbackSlot;
  return {
    date: source?.date || fallbackDate,
    slot,
    attendance: cleanAttendance(source?.attendance),
    editingId: source?.editingId || null
  };
}
function loadDraftStore() {
  const stored = loadJSON(DRAFT_KEY, {});
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
}
function persistDraft() {
  if (!draft || !currentClass) return;
  draftStore[currentClass] = normalizeDraft(draft);
  storageSet(DRAFT_KEY, JSON.stringify(draftStore));
}
function clearStoredDraft(classKey = currentClass) {
  delete draftStore[classKey];
  storageSet(DRAFT_KEY, JSON.stringify(draftStore));
}
function loadDraftFor(date, slot) {
  const cls = state.classes[currentClass];
  const existing = findSession(cls, date, slot);
  const existingId = existing?.id || null;

  if (draft && draft.date === date && draft.slot === slot && (draft.editingId || null) === existingId) return;

  const stored = draftStore[currentClass];
  if (stored?.date === date && stored?.slot === slot) {
    const storedDraft = normalizeDraft(stored, date, slot);
    if (!existing || (storedDraft.editingId || null) === existingId) {
      draft = { ...storedDraft, editingId: existingId };
      return;
    }
  }

  if (existing) draft = { date, slot, attendance: { ...existing.attendance }, editingId: existing.id };
  else draft = newDraft(date, slot);
}
function retargetDraft(date, slot) {
  const cls = state.classes[currentClass];
  const existing = findSession(cls, date, slot);
  if (existing) {
    draft = { date, slot, attendance: { ...existing.attendance }, editingId: existing.id };
  } else {
    draft = normalizeDraft({ ...draft, date, slot, editingId: null }, date, slot);
  }
  persistDraft();
  render();
}
function markStudent(sid, value) {
  if (draft.attendance[sid] === value) delete draft.attendance[sid];
  else draft.attendance[sid] = value;
  persistDraft();
  render();
}

// ---------- optional Firestore cloud sync ----------
let cloudSync = {
  status: "Cloud not configured",
  ready: false,
  starting: false,
  firestoreStarted: false,
  applyingRemote: false,
  saveTimer: null,
  app: null,
  firestore: null,
  authRequired: false,
  auth: null,
  user: null,
  signInWithEmailAndPassword: null,
  createUserWithEmailAndPassword: null,
  signOut: null,
  ref: null,
  setDoc: null
};

function setCloudStatus(status) {
  cloudSync.status = status;
  if (view === "more") render();
}
function getFirebaseConfig() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || typeof cfg !== "object") return null;
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) return null;
  return cfg;
}
function getCloudDocId() {
  const configured = window.FIREBASE_ATTENDANCE_DOC_ID || "main";
  return String(configured).replace(/[\/#?[\]]/g, "_").slice(0, 120) || "main";
}
async function initCloudSync() {
  if (cloudSync.ready || cloudSync.starting || cloudSync.firestoreStarted) return;

  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig) {
    setCloudStatus("Cloud not configured");
    return;
  }

  cloudSync.starting = true;
  setCloudStatus("Connecting to cloud...");
  try {
    cloudSync.authRequired = window.FIREBASE_REQUIRE_AUTH !== false;
    const imports = [
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`)
    ];
    if (cloudSync.authRequired) {
      imports.push(import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`));
    }

    const [{ initializeApp }, firestore, authModule] = await Promise.all(imports);
    cloudSync.app = initializeApp(firebaseConfig);
    cloudSync.firestore = firestore;
    cloudSync.setDoc = firestore.setDoc;

    if (cloudSync.authRequired && authModule) {
      cloudSync.auth = authModule.getAuth(cloudSync.app);
      cloudSync.signInWithEmailAndPassword = authModule.signInWithEmailAndPassword;
      cloudSync.createUserWithEmailAndPassword = authModule.createUserWithEmailAndPassword;
      cloudSync.signOut = authModule.signOut;
      authModule.onAuthStateChanged(cloudSync.auth, (user) => {
        cloudSync.user = user;
        if (user) {
          startFirestoreSync();
          setCloudStatus("Cloud signed in");
        } else {
          setCloudStatus("Sign in for cloud sync");
        }
      });
    } else {
      startFirestoreSync();
    }
  } catch (err) {
    console.warn("Firebase could not start", err);
    setCloudStatus("Cloud unavailable");
  } finally {
    cloudSync.starting = false;
  }
}
function startFirestoreSync() {
  if (cloudSync.firestoreStarted || !cloudSync.app || !cloudSync.firestore) return;

  const {
      doc,
      getFirestore,
      initializeFirestore,
      onSnapshot,
      persistentLocalCache,
      persistentMultipleTabManager
    } = cloudSync.firestore;

  let db;
  try {
    db = initializeFirestore(cloudSync.app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (_) {
    db = getFirestore(cloudSync.app);
  }

  cloudSync.ref = doc(db, "attendanceTrackers", getCloudDocId());
  cloudSync.ready = true;
  cloudSync.firestoreStarted = true;

  onSnapshot(cloudSync.ref, { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) {
      setCloudStatus(navigator.onLine ? "Syncing..." : "Offline changes queued");
      return;
    }

    if (!snapshot.exists()) {
      setCloudStatus("Cloud ready");
      queueCloudSave();
      return;
    }

    const remote = snapshot.data();
    const remoteState = normalizeState(remote.state);
    const remoteUpdatedAt = Number(remote.updatedAt || remoteState.meta?.updatedAt) || 0;
    const localUpdatedAt = Number(state.meta?.updatedAt) || 0;

    if (remoteState.classes && remoteUpdatedAt > localUpdatedAt) {
      cloudSync.applyingRemote = true;
      state = remoteState;
      save({ sync: false, touch: false });
      cloudSync.applyingRemote = false;
      loadDraftFor(draft?.date || today(), draft?.slot || "C1");
      render();
      toast("Cloud data restored");
    }
    setCloudStatus("Cloud synced");
  }, (err) => {
    console.warn("Cloud sync failed", err);
    setCloudStatus("Cloud sync error");
  });
}
function queueCloudSave() {
  if (!cloudSync.ready || cloudSync.applyingRemote) return;
  clearTimeout(cloudSync.saveTimer);
  cloudSync.saveTimer = setTimeout(pushCloudState, 350);
}
async function pushCloudState() {
  if (!cloudSync.ready || !cloudSync.ref || !cloudSync.setDoc) return;
  try {
    setCloudStatus(navigator.onLine ? "Syncing..." : "Offline changes queued");
    await cloudSync.setDoc(cloudSync.ref, {
      state,
      updatedAt: state.meta?.updatedAt || Date.now(),
      updatedBy: deviceId
    }, { merge: true });
    setCloudStatus(navigator.onLine ? "Cloud synced" : "Offline changes queued");
  } catch (err) {
    console.warn("Cloud save failed", err);
    setCloudStatus("Cloud sync error");
  }
}
function openCloudAccount() {
  if (!getFirebaseConfig()) {
    toast("Paste Firebase config first");
    return;
  }
  if (!cloudSync.authRequired) {
    toast(cloudSync.status);
    return;
  }

  openSheet("Cloud sync", (sheet, close) => {
    if (cloudSync.user) {
      sheet.appendChild(el("div", { class: "card", style: "padding:14px; margin-bottom:12px" },
        el("div", { class: "meta" }, "Signed in"),
        el("div", { class: "name", style: "font-weight:600; margin-top:2px" }, cloudSync.user.email || cloudSync.user.uid)
      ));
      sheet.appendChild(el("div", { class: "btn-row" },
        el("button", { class: "btn btn-secondary", onclick: close }, "Close"),
        el("button", {
          class: "btn btn-danger",
          onclick: async () => {
            try {
              await cloudSync.signOut(cloudSync.auth);
              close();
              toast("Signed out");
            } catch (_) {
              toast("Could not sign out");
            }
          }
        }, "Sign out")
      ));
      return;
    }

    let email = "", password = "";
    const emailInput = el("input", {
      type: "email",
      placeholder: "Email",
      autocomplete: "email",
      oninput: (e) => email = e.target.value.trim()
    });
    const passInput = el("input", {
      type: "password",
      placeholder: "Password",
      autocomplete: "current-password",
      oninput: (e) => password = e.target.value
    });
    const runAuth = async (mode) => {
      if (!email || !password) {
        toast("Email and password required");
        return;
      }
      try {
        if (mode === "create") {
          await cloudSync.createUserWithEmailAndPassword(cloudSync.auth, email, password);
        } else {
          await cloudSync.signInWithEmailAndPassword(cloudSync.auth, email, password);
        }
        close();
        toast("Cloud signed in");
      } catch (err) {
        console.warn("Cloud auth failed", err);
        toast(mode === "create" ? "Could not create account" : "Sign in failed");
      }
    };

    sheet.appendChild(el("div", { class: "form-row" }, el("label", {}, "Email"), emailInput));
    sheet.appendChild(el("div", { class: "form-row" }, el("label", {}, "Password"), passInput));
    sheet.appendChild(el("div", { class: "btn-row" },
      el("button", { class: "btn btn-secondary", onclick: () => runAuth("create") }, "Create"),
      el("button", { class: "btn btn-primary", onclick: () => runAuth("signin") }, "Sign in")
    ));
    setTimeout(() => emailInput.focus(), 50);
  });
}
window.addEventListener("online", () => queueCloudSave());

// Initial draft
loadDraftFor(today(), "C1");

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1900);
}

// ---------- sheet modal ----------
function openSheet(title, builder) {
  const scrim = $("#scrim");
  const sheet = $("#sheet");
  sheet.innerHTML = '<div class="grabber"></div>';
  const h = el("h3", {}, title);
  sheet.appendChild(h);
  builder(sheet, closeSheet);
  scrim.classList.add("open");
}
function closeSheet() {
  $("#scrim").classList.remove("open");
}
$("#scrim").addEventListener("click", (e) => {
  if (e.target.id === "scrim") closeSheet();
});

// ---------- header / class switching ----------
function syncHeader() {
  const cls = state.classes[currentClass];
  $("#className").textContent = cls.name;
  $("#classSub").textContent = `${cls.students.length} students · ${cls.sessions.length} session${cls.sessions.length === 1 ? "" : "s"} logged`;
  $$(".class-pill").forEach(p => p.setAttribute("aria-pressed", p.dataset.class === currentClass));
  $$(".subnav button").forEach(b => b.setAttribute("aria-current", b.dataset.view === view));
  $$(".tabbar button").forEach(b => b.setAttribute("aria-current", b.dataset.view === view));
}
$$(".class-pill").forEach(p => p.addEventListener("click", () => {
  persistDraft();
  currentClass = p.dataset.class;
  storageSet(CLASS_KEY, currentClass);
  loadDraftFor(draft?.date || today(), draft?.slot || "C1");
  render();
}));
$$(".subnav button, .tabbar button").forEach(b => b.addEventListener("click", () => {
  view = b.dataset.view;
  storageSet(VIEW_KEY, view);
  render();
  $("#main").scrollTo({ top: 0, behavior: "instant" });
}));
$("#addSessionBtn").addEventListener("click", () => {
  view = "today";
  draft = newDraft(today(), "C1");
  persistDraft();
  render();
});

// ---------- icons ----------
const I = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H7a5 5 0 1 1 1.2-9.85A6.5 6.5 0 0 1 20 12.9 3.2 3.2 0 0 1 17.5 19Z"/></svg>',
  trash2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};

// ---------- views ----------
function render() {
  syncHeader();
  const main = $("#main");
  main.innerHTML = "";
  if (view === "today") renderToday(main);
  else if (view === "roster") renderRoster(main);
  else if (view === "sessions") renderSessions(main);
  else if (view === "more") renderMore(main);
  else if (view === "student") renderStudent(main);
}

// ----- TODAY VIEW -----
function renderToday(main) {
  const cls = state.classes[currentClass];
  loadDraftFor(draft.date, draft.slot);

  // Header card: date + slot
  const sessBar = el("div", { class: "card session-bar" },
    el("div", { class: "field" },
      el("label", {}, "Date"),
      el("input", {
        type: "date", value: draft.date,
        onchange: (e) => retargetDraft(e.target.value || today(), draft.slot)
      })
    ),
    el("div", { class: "field", style: "flex:0 0 auto" },
      el("label", {}, "Class"),
      slotToggle()
    )
  );
  main.appendChild(sessBar);

  const presentCount = cls.students.reduce((n, s) => n + (draft.attendance[s.sid] === "P" ? 1 : 0), 0);
  const absentCount  = cls.students.reduce((n, s) => n + (draft.attendance[s.sid] === "A" ? 1 : 0), 0);
  const unmarked     = cls.students.length - presentCount - absentCount;

  main.appendChild(el("div", { class: "summary-row" },
    statTile("present", presentCount, "Present"),
    statTile("absent",  absentCount,  "Absent"),
    statTile("unmark",  unmarked,     "Unmarked")
  ));

  // Quick actions
  main.appendChild(el("div", { class: "quick-actions" },
    chip("Mark all present", I.check, () => {
      for (const s of cls.students) draft.attendance[s.sid] = "P";
      persistDraft();
      render();
    }),
    chip("Clear", I.x, () => {
      draft.attendance = {};
      persistDraft();
      render();
    }, true)
  ));

  // Sticky top save action
  const existing = findSession(cls, draft.date, draft.slot);
  const pending = unmarked > 0 ? unmarked : 0;
  const marked = presentCount + absentCount;
  const progressText = marked === 0 ? "No marks yet" : pending > 0 ? `${pending} unmarked` : "All marked";
  const saveBar = el("button", {
    class: "save-action" + (marked > 0 ? " is-pending" : ""),
    onclick: saveDraft
  },
    el("span", { class: "save-copy" },
      el("span", { class: "label" }, existing ? "Update session" : "Save session"),
      el("span", { class: "hint" }, progressText)
    ),
    el("span", { class: "count" }, `${marked}/${cls.students.length}`)
  );
  main.appendChild(el("div", { class: "save-actions" }, saveBar));

  // Student rows with P / A toggle
  const list = el("div", { class: "roster-list" });
  const sorted = cls.students;
  for (const s of sorted) {
    const val = draft.attendance[s.sid];
    const row = el("div", { class: "row" + (val === "P" ? " is-present" : val === "A" ? " is-absent" : "") },
      el("div", { class: "avatar" }, initials(s.name, s.sid)),
      el("div", { class: "who" },
        el("div", { class: "name" }, displayName(s)),
        el("div", { class: "meta" }, `${s.sid} · Roll ${s.roll}`)
      ),
      el("div", { class: "pa-toggle" },
        el("button", {
          class: "p",
          "aria-pressed": val === "P",
          title: "Present",
          onclick: () => markStudent(s.sid, "P")
        }, "P"),
        el("button", {
          class: "a",
          "aria-pressed": val === "A",
          title: "Absent",
          onclick: () => markStudent(s.sid, "A")
        }, "A")
      )
    );
    list.appendChild(row);
  }
  main.appendChild(list);
}

function slotToggle() {
  const t = el("div", { class: "slot-toggle" },
    el("button", { "aria-pressed": draft.slot === "C1", onclick: () => retargetDraft(draft.date, "C1") }, "C1"),
    el("button", { "aria-pressed": draft.slot === "C2", onclick: () => retargetDraft(draft.date, "C2") }, "C2"),
  );
  return t;
}
function statTile(kind, value, label) {
  return el("div", { class: "stat " + kind },
    el("span", { class: "v" }, String(value)),
    el("span", { class: "l" }, label)
  );
}
function chip(text, iconHtml, onclick, danger=false) {
  const b = el("button", { class: "chip" + (danger ? " danger" : ""), onclick });
  b.innerHTML = (iconHtml || "") + `<span>${text}</span>`;
  return b;
}

function saveDraft() {
  const cls = state.classes[currentClass];
  const total = Object.keys(draft.attendance).length;
  if (total === 0) { toast("Mark at least one student"); return; }
  const existing = findSession(cls, draft.date, draft.slot);
  let savedSession = existing;
  if (existing) {
    existing.attendance = { ...draft.attendance };
  } else {
    savedSession = {
      id: "s_" + Math.random().toString(36).slice(2, 9),
      date: draft.date,
      slot: draft.slot,
      attendance: { ...draft.attendance }
    };
    cls.sessions.push(savedSession);
  }
  if (!save()) {
    toast("Storage is full. Export a backup.");
    return;
  }
  draft.editingId = savedSession.id;
  clearStoredDraft();
  toast(existing ? "Session updated" : "Session saved");
  render();
}

// ----- ROSTER VIEW -----
function renderRoster(main) {
  const cls = state.classes[currentClass];
  let query = "";

  const search = el("div", { class: "search" });
  search.innerHTML = I.search;
  const input = el("input", {
    type: "search",
    placeholder: `Search ${cls.students.length} students…`,
    oninput: (e) => { query = e.target.value.toLowerCase(); redraw(); }
  });
  search.appendChild(input);
  main.appendChild(search);

  // Stats up top
  const totalSessions = cls.sessions.length;
  const studentsTotal = cls.students.length;
  const presentCount = cls.sessions.reduce((n, s) => n + Object.values(s.attendance).filter(v => v === "P").length, 0);
  const possible = totalSessions * studentsTotal;
  const overall = possible ? Math.round(presentCount / possible * 100) : 0;
  main.appendChild(el("div", { class: "summary-row" },
    statTile("", studentsTotal, "Students"),
    statTile("", totalSessions, "Sessions"),
    statTile("present", overall + "%", "Attendance")
  ));

  main.appendChild(el("div", { class: "section-h" },
    el("h2", {}, "Students"),
    el("button", { class: "link", onclick: openAddStudent }, "+ Add")
  ));

  const wrap = el("div", { class: "roster-list" });
  main.appendChild(wrap);

  function redraw() {
    wrap.innerHTML = "";
    const list = [...cls.students]
      .map(s => {
        const totalSess = cls.sessions.length;
        const present = cls.sessions.reduce((n, sess) => n + (sess.attendance[s.sid] === "P" ? 1 : 0), 0);
        const absent = cls.sessions.reduce((n, sess) => n + (sess.attendance[s.sid] === "A" ? 1 : 0), 0);
        const counted = present + absent;
        const pct = counted ? Math.round(present / counted * 100) : null;
        return { s, present, absent, pct };
      })
      .filter(({ s }) => {
        if (!query) return true;
        return [s.name, s.sid, String(s.roll), s.email].some(v => v && v.toLowerCase().includes(query));
      })
      ;

    if (list.length === 0) {
      wrap.appendChild(el("div", { class: "empty" },
        el("div", { class: "ill", html: I.search }),
        el("h3", {}, "No matches"),
        el("p", {}, "Try a different name, ID or roll number.")
      ));
      return;
    }
    for (const item of list) {
      const { s, pct } = item;
      const pctClass = pct == null ? "" : pct < 60 ? " danger" : pct < 80 ? " warn" : "";
      const row = el("div", {
        class: "row",
        onclick: () => { view = "student"; selectedStudentSid = s.sid; render(); }
      },
        el("div", { class: "avatar" }, initials(s.name, s.sid)),
        el("div", { class: "who" },
          el("div", { class: "name" }, displayName(s)),
          el("div", { class: "meta" }, `${s.sid} · Roll ${s.roll}` + (s.email ? ` · ${s.email.split("@")[0]}` : ""))
        ),
        pct == null
          ? el("div", { class: "pct" }, el("span", { style: "color:var(--muted);font-weight:500" }, "—"), el("small", {}, "no data"))
          : el("div", { class: "pct" + pctClass }, pct + "%", el("small", {}, `${item.present}/${item.present + item.absent}`))
      );
      wrap.appendChild(row);
    }
  }
  redraw();
}

let selectedStudentSid = null;

function renderStudent(main) {
  const cls = state.classes[currentClass];
  const s = cls.students.find(x => x.sid === selectedStudentSid);
  if (!s) { view = "roster"; render(); return; }

  // back button
  const back = el("button", { class: "chip", onclick: () => { view = "roster"; render(); } });
  back.innerHTML = I.back + "<span>Back to roster</span>";
  main.appendChild(back);

  const sessions = [...cls.sessions].sort((a, b) => cmp(a.date + a.slot, b.date + b.slot));
  const present = sessions.reduce((n, sess) => n + (sess.attendance[s.sid] === "P" ? 1 : 0), 0);
  const absent  = sessions.reduce((n, sess) => n + (sess.attendance[s.sid] === "A" ? 1 : 0), 0);
  const counted = present + absent;
  const pct = counted ? Math.round(present / counted * 100) : 0;

  main.appendChild(el("div", { class: "card", style: "margin-top:12px" },
    el("div", { class: "detail-header" },
      el("div", { class: "big-name" }, displayName(s)),
      el("div", { class: "meta" }, `${s.sid} · Roll ${s.roll}` + (s.email ? ` · ${s.email}` : ""))
    )
  ));

  main.appendChild(el("div", { class: "summary-row" },
    statTile("present", present, "Present"),
    statTile("absent",  absent,  "Absent"),
    statTile("",        pct + "%", "Rate")
  ));

  if (sessions.length === 0) {
    main.appendChild(el("div", { class: "card empty", style: "margin-top:12px" },
      el("div", { class: "ill", html: I.info }),
      el("h3", {}, "No sessions yet"),
      el("p", {}, "Take attendance to populate this view.")
    ));
  } else {
    main.appendChild(el("div", { class: "section-h" }, el("h2", {}, "History")));
    const card = el("div", { class: "card" });
    const grid = el("div", { class: "history-grid" });
    for (const sess of sessions) {
      const v = sess.attendance[s.sid];
      const cellClass = v === "P" ? "p" : v === "A" ? "a" : "";
      const cell = el("div", {
        class: "cell " + cellClass,
        title: `${sess.date} ${sess.slot}`
      }, v || "·");
      grid.appendChild(cell);
    }
    card.appendChild(grid);
    main.appendChild(card);
  }

  main.appendChild(el("div", { class: "section-h" }, el("h2", {}, "Manage")));
  main.appendChild(el("div", { class: "card", style: "padding:6px" },
    el("button", {
      class: "setting-row",
      style: "width:100%",
      onclick: () => openEditStudent(s)
    },
      el("div", { class: "icon", html: I.user }),
      el("div", { class: "label" }, "Edit details"),
      el("span", { class: "chev", html: I.chev })
    ),
    el("button", {
      class: "setting-row",
      style: "width:100%; color: var(--absent)",
      onclick: () => {
        if (confirm(`Remove ${displayName(s)} from ${cls.name}? Their attendance records stay in past sessions.`)) {
          const idx = cls.students.findIndex(x => x.sid === s.sid);
          if (idx >= 0) cls.students.splice(idx, 1);
          save();
          view = "roster";
          render();
          toast("Student removed");
        }
      }
    },
      el("div", { class: "icon", style: "color:var(--absent)", html: I.trash2 }),
      el("div", { class: "label" }, "Remove from class"),
      el("span", { class: "chev", html: I.chev })
    )
  ));
}

// ----- SESSIONS VIEW -----
function renderSessions(main) {
  const cls = state.classes[currentClass];
  const sessions = [...cls.sessions].sort((a, b) => cmp(b.date + b.slot, a.date + a.slot));

  if (sessions.length === 0) {
    main.appendChild(el("div", { class: "card empty" },
      el("div", { class: "ill", html: I.plus }),
      el("h3", {}, "No sessions yet"),
      el("p", {}, "Mark attendance on the Today tab to start a log."),
    ));
    return;
  }

  main.appendChild(el("div", { class: "summary-row" },
    statTile("", sessions.length, "Sessions"),
    statTile("present", cls.sessions.reduce((n, s) => n + Object.values(s.attendance).filter(v => v === "P").length, 0), "Total P"),
    statTile("absent",  cls.sessions.reduce((n, s) => n + Object.values(s.attendance).filter(v => v === "A").length, 0), "Total A"),
  ));

  // Group by date
  const byDate = {};
  for (const s of sessions) {
    (byDate[s.date] ||= []).push(s);
  }
  const dates = Object.keys(byDate).sort((a, b) => cmp(b, a));

  for (const date of dates) {
    main.appendChild(el("div", { class: "section-h" }, el("h2", {}, fmtDate(date, { weekday: true, year: true }))));
    const card = el("div", { class: "card" });
    for (const sess of byDate[date].sort((a, b) => cmp(a.slot, b.slot))) {
      const present = Object.values(sess.attendance).filter(v => v === "P").length;
      const absent = Object.values(sess.attendance).filter(v => v === "A").length;
      const total = present + absent;
      const pct = total ? Math.round(present / total * 100) : 0;
      const d = new Date(sess.date + "T00:00:00");
      const card2 = el("div", {
        class: "session-card",
        onclick: () => {
          view = "today";
          draft = { date: sess.date, slot: sess.slot, attendance: { ...sess.attendance }, editingId: sess.id };
          render();
        }
      },
        el("div", { class: "date-block" },
          el("span", { class: "m" }, d.toLocaleString(undefined, { month: "short" })),
          el("span", { class: "d" }, String(d.getDate()))
        ),
        el("div", { class: "info" },
          el("div", { class: "h" }, sess.slot === "C1" ? "Class 1" : "Class 2"),
          el("div", { class: "s" }, `${present} present · ${absent} absent`)
        ),
        el("div", { class: "pct-circle" }, pct + "%")
      );
      card.appendChild(card2);
    }
    main.appendChild(card);
  }
}

// ----- MORE VIEW -----
function renderMore(main) {
  const cls = state.classes[currentClass];

  main.appendChild(el("div", { class: "section-h" }, el("h2", {}, "Class")));
  main.appendChild(el("div", { class: "settings-group" },
    settingRow(I.user, "Add student", `${cls.students.length} enrolled`, openAddStudent),
    settingRow(I.download, "Export CSV", "Roster + every session", () => exportCSV(cls)),
    settingRow(I.upload, "Import CSV", "Merge a roster export", openImportCSV),
  ));

  main.appendChild(el("div", { class: "section-h" }, el("h2", {}, "Data")));
  main.appendChild(el("div", { class: "settings-group" },
    settingRow(I.cloud, "Cloud sync", cloudSync.status, openCloudAccount),
    settingRow(I.download, "Backup all (JSON)", "Both classes + history", () => exportJSON()),
    settingRow(I.upload, "Restore from JSON", "Replace local data", openImportJSON),
    settingRow(I.trash2, "Clear sessions", `Delete the ${cls.sessions.length} logged session${cls.sessions.length === 1 ? "" : "s"} for ${cls.name}`,
      () => {
        if (confirm(`Delete all ${cls.sessions.length} sessions for ${cls.name}? This cannot be undone.`)) {
          cls.sessions = [];
          save(); render();
          toast("Sessions cleared");
        }
      }, true),
    settingRow(I.trash2, "Reset everything", "Re-seed from original rosters", () => {
      if (confirm("Wipe all attendance data and re-seed both classes from the original rosters?")) {
        storageRemove(STORAGE_KEY);
        storageRemove(DRAFT_KEY);
        draftStore = {};
        state = load();
        loadDraftFor(today(), "C1");
        save(); render();
        toast("Reset");
      }
    }, true),
  ));

  main.appendChild(el("div", { class: "section-h" }, el("h2", {}, "About")));
  main.appendChild(el("div", { class: "card", style: "padding: 14px; color: var(--muted); font-size: 13px; line-height: 1.55" },
    "Mobile attendance tracker for IPE & ME. Everything is stored locally in your browser — there is no server. Export to CSV/JSON to back up or move between devices."
  ));
}
function settingRow(icon, label, hint, onclick, danger=false) {
  return el("button", {
    class: "setting-row",
    style: "width:100%" + (danger ? "; color: var(--absent)" : ""),
    onclick
  },
    el("div", { class: "icon", style: danger ? "color:var(--absent)" : undefined, html: icon }),
    el("div", { class: "label" },
      el("div", {}, label),
      hint ? el("div", { class: "hint" }, hint) : null
    ),
    el("span", { class: "chev", html: I.chev })
  );
}

// ----- CRUD / import / export -----
function openAddStudent() {
  openSheet("Add student", (sheet, close) => {
    let name = "", sid = "", roll = "", email = "";
    const fNameInput = el("input", { type: "text", placeholder: "Full name", oninput: (e) => name = e.target.value });
    const fSidInput  = el("input", { type: "text", placeholder: "e.g. 210012XXX", oninput: (e) => sid = e.target.value });
    const fRollInput = el("input", { type: "number", placeholder: "e.g. 28", oninput: (e) => roll = e.target.value });
    const fEmailInput= el("input", { type: "email", placeholder: "name@iut-dhaka.edu", oninput: (e) => email = e.target.value });
    sheet.appendChild(el("div", { class: "form-row" }, el("label", {}, "Name"), fNameInput));
    sheet.appendChild(el("div", { class: "form-row" }, el("label", {}, "Student ID"), fSidInput));
    sheet.appendChild(el("div", { class: "form-row" }, el("label", {}, "Roll"), fRollInput));
    sheet.appendChild(el("div", { class: "form-row" }, el("label", {}, "Email"), fEmailInput));
    sheet.appendChild(el("div", { class: "btn-row" },
      el("button", { class: "btn btn-secondary", onclick: close }, "Cancel"),
      el("button", { class: "btn btn-primary", onclick: () => {
        if (!sid.trim()) { toast("Student ID is required"); return; }
        const cls = state.classes[currentClass];
        if (cls.students.find(x => x.sid === sid.trim())) { toast("That ID already exists"); return; }
        cls.students.push({
          roll: Number(roll) || (Math.max(0, ...cls.students.map(s => Number(s.roll) || 0)) + 1),
          sid: sid.trim(),
          name: name.trim(),
          email: email.trim()
        });
        save(); close(); render(); toast("Student added");
      } }, "Add")
    ));
    setTimeout(() => fNameInput.focus(), 50);
  });
}

function openEditStudent(s) {
  openSheet("Edit student", (sheet, close) => {
    let name = s.name, roll = s.roll, email = s.email;
    const fNameInput = el("input", { type: "text", value: name, oninput: (e) => name = e.target.value });
    const fRollInput = el("input", { type: "number", value: roll, oninput: (e) => roll = e.target.value });
    const fEmailInput= el("input", { type: "email", value: email, oninput: (e) => email = e.target.value });
    sheet.appendChild(el("div", { class: "form-row" }, el("label", {}, "Name"), fNameInput));
    sheet.appendChild(el("div", { class: "form-row" }, el("label", {}, "Roll"), fRollInput));
    sheet.appendChild(el("div", { class: "form-row" }, el("label", {}, "Email"), fEmailInput));
    sheet.appendChild(el("div", { class: "form-row" }, el("label", {}, "Student ID"),
      el("input", { type: "text", value: s.sid, disabled: true })
    ));
    sheet.appendChild(el("div", { class: "btn-row" },
      el("button", { class: "btn btn-secondary", onclick: close }, "Cancel"),
      el("button", { class: "btn btn-primary", onclick: () => {
        s.name = name.trim();
        s.email = email.trim();
        s.roll = Number(roll) || s.roll;
        save(); close(); render(); toast("Saved");
      } }, "Save")
    ));
  });
}

function csvEscape(v) {
  v = v == null ? "" : String(v);
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}
function exportCSV(cls) {
  const dates = [...new Set(cls.sessions.map(s => s.date + "|" + s.slot))].sort();
  const head = ["Roll", "Student ID", "Name", "Email", ...dates.map(d => d.replace("|", " ")), "Present", "Absent", "Rate"];
  const rows = [head.map(csvEscape).join(",")];
  for (const s of cls.students) {
    let p = 0, a = 0;
    const cells = [s.roll, s.sid, displayName(s), s.email];
    for (const k of dates) {
      const [date, slot] = k.split("|");
      const sess = findSession(cls, date, slot);
      const v = sess?.attendance[s.sid] || "";
      if (v === "P") p++; else if (v === "A") a++;
      cells.push(v);
    }
    const rate = (p + a) ? Math.round(p / (p + a) * 100) + "%" : "";
    cells.push(p, a, rate);
    rows.push(cells.map(csvEscape).join(","));
  }
  download(rows.join("\n"), `${cls.name}_attendance_${today()}.csv`, "text/csv");
  toast("CSV downloaded");
}

function exportJSON() {
  download(JSON.stringify(state, null, 2), `attendance_backup_${today()}.json`, "application/json");
  toast("Backup downloaded");
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openImportCSV() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".csv,text/csv";
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.length);
    if (lines.length < 2) { toast("Empty CSV"); return; }
    // Naive parse: assumes commas inside fields are quoted properly enough
    const parse = (line) => {
      const out = []; let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
          if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') inQ = false;
          else cur += c;
        } else {
          if (c === ",") { out.push(cur); cur = ""; }
          else if (c === '"') inQ = true;
          else cur += c;
        }
      }
      out.push(cur);
      return out;
    };
    const head = parse(lines[0]);
    const cls = state.classes[currentClass];
    const rollIdx = head.findIndex(h => /^roll/i.test(h));
    const sidIdx = head.findIndex(h => /student\s*id|^id$/i.test(h));
    const nameIdx = head.findIndex(h => /^name/i.test(h));
    const emailIdx = head.findIndex(h => /^email/i.test(h));
    let added = 0;
    for (let i = 1; i < lines.length; i++) {
      const r = parse(lines[i]);
      const sid = (r[sidIdx] || "").trim();
      if (!sid) continue;
      const existing = cls.students.find(s => s.sid === sid);
        if (existing) {
          if (nameIdx >= 0 && r[nameIdx]) existing.name = r[nameIdx].trim();
          if (emailIdx >= 0 && r[emailIdx]) existing.email = r[emailIdx].trim();
        if (rollIdx >= 0 && r[rollIdx]) existing.roll = Number(r[rollIdx]) || existing.roll;
      } else {
        cls.students.push({
          roll: rollIdx >= 0 ? Number(r[rollIdx]) || cls.students.length + 1 : cls.students.length + 1,
          sid,
          name: nameIdx >= 0 ? (r[nameIdx] || "").trim() : "",
          email: emailIdx >= 0 ? (r[emailIdx] || "").trim() : "",
        });
        added++;
      }
    }
    save(); render();
    toast(added ? `${added} added` : "Roster updated");
  };
  inp.click();
}

function openImportJSON() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json,application/json";
  inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.classes) throw new Error("Missing 'classes' key");
      if (!confirm("Replace local data with the contents of this backup?")) return;
      state = parsed;
      if (!save()) {
        toast("Storage is full. Export a backup.");
        return;
      }
      storageRemove(DRAFT_KEY);
      draftStore = {};
      loadDraftFor(today(), "C1");
      render();
      toast("Restored");
    } catch (e) {
      toast("Invalid backup file");
    }
  };
  inp.click();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  });
}

// ---------- initial render ----------
render();
registerServiceWorker();
initCloudSync();
