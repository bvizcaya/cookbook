import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ---------------- tabs ----------------
const TABS = [["recipes", "Recipes"], ["add", "Add"], ["grocery", "Grocery"], ["settings", "Settings"]];
const ICONS = {
  recipes: '<path d="M4.5 5.5A2 2 0 0 1 6.5 3.5H19v14H6.5a2 2 0 0 0-2 2z"/><path d="M4.5 19.5a2 2 0 0 0 2 2H19v-4"/><path d="M9 8h6M9 11.5h4"/>',
  add: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  grocery: '<path d="M3.5 4.5h2.2l2 10.5h10.6l1.9-7.5H7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
};
const CATS = ["Breakfast", "Appetizers", "Soups & Salads", "Mains", "Sides", "Breads & Baking", "Desserts", "Drinks", "Sauces & Dips", "Other"];
const SWATCH = [["#FF8A4C", "#C2410C"], ["#F7B733", "#E2711D"], ["#E76F51", "#9D2F1C"], ["#7FB069", "#3F7D20"], ["#D4A373", "#8B5E34"], ["#E85D75", "#A4243B"], ["#5FA8D3", "#1B4965"]];

// ---------------- appearance ----------------
function applyTheme(choice) {
  if (choice === "light" || choice === "dark") document.documentElement.dataset.theme = choice;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("cook.theme", choice); } catch {}
  document.querySelectorAll("#themeSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === choice)));
}
let themeNow = "system"; try { themeNow = localStorage.getItem("cook.theme") || "system"; } catch {}
applyTheme(themeNow);

// ---------------- helpers ----------------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const optNum = v => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
const iso = d => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 10); };
const today = () => iso(new Date());
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const short = s => parseD(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: parseD(s).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mins = m => { m = Math.round(m || 0); if (!m) return "—"; if (m < 60) return m + " min"; const h = Math.floor(m / 60), r = m % 60; return h + " hr" + (r ? " " + r : ""); };
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200); }
const fail = er => { console.error(er); toast(er && er.code === "permission-denied" ? "You don't have permission to change that." : "Couldn't save. Check your connection and try again."); };

// ---------------- amounts: read "1 1/2 cups", scale, and write back nicely ----------------
const UF = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8, "⅕": 1 / 5, "⅖": 2 / 5, "⅗": 3 / 5, "⅘": 4 / 5, "⅙": 1 / 6, "⅚": 5 / 6 };
const UFC = Object.keys(UF).join("");
const QTOK = `(?:\\d+\\s*[${UFC}]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|\\.\\d+|[${UFC}])`;
const QRE = new RegExp(`^(\\s*)(${QTOK})(?:(\\s*(?:-|–|to)\\s*)(${QTOK}))?`);
function tokVal(t) {
  t = t.trim();
  const u = t.match(new RegExp(`^(\\d*)\\s*([${UFC}])$`)); if (u) return (u[1] ? +u[1] : 0) + UF[u[2]];
  const m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + (+m[3] ? +m[2] / +m[3] : 0);
  const f = t.match(/^(\d+)\/(\d+)$/); if (f) return +f[2] ? +f[1] / +f[2] : 0;
  return parseFloat(t);
}
const FR = [[1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"]];
function fmtQty(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  let w = Math.floor(n), r = n - w;
  if (r < 0.04) return String(w || (n > 0 ? "⅛" : 0));
  if (r > 0.96) return String(w + 1);
  let best = null, bd = 1;
  for (const [v, s] of FR) { const d = Math.abs(r - v); if (d < bd) { bd = d; best = s; } }
  if (bd < 0.04 || n < 10) return (w ? w : "") + best;
  return String(Math.round(n * 10) / 10);
}
// Splits an ingredient line into amount + rest, scaled by factor.
function scaleLine(line, k) {
  const norm = line.replace(/⁄/g, "/");
  const m = norm.match(QRE);
  if (!m) return { q: "", rest: line };
  const a = tokVal(m[2]), b = m[4] ? tokVal(m[4]) : null;
  const rest = norm.slice(m[0].length);
  if (k === 1) return { q: m[0].trim(), rest };
  const q = fmtQty(a * k) + (b != null ? "–" + fmtQty(b * k) : "");
  return { q, rest };
}
const isHead = l => /:\s*$/.test(l) && !QRE.test(l.replace(/⁄/g, "/")) && l.length < 60 || /^#+\s*/.test(l);
const headText = l => l.replace(/^#+\s*/, "").replace(/:\s*$/, "");
const cleanIng = l => l.replace(/^\s*(?:[-•*▢□◻☐▪︎·–]|\[\s?\])\s*/, "").trim();
const cleanStep = l => l.replace(/^\s*(?:step\s*\d+\s*[:.)-]?|\d+\s*[.):-]|[-•*▪︎·])\s*/i, "").trim();
const toLines = s => String(s || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);

// ---------------- firebase ----------------
if (!firebaseConfig || firebaseConfig.apiKey === "PASTE_HERE") {
  document.body.innerHTML = `<div class="wrap"><div class="notice" style="margin-top:20vh">Setup isn't finished yet. Paste your Firebase settings into <b>firebase-config.js</b> (see README).</div></div>`;
  throw new Error("Missing Firebase config");
}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
// Keeps a copy on the phone so recipes open in the kitchen even with bad signal; changes sync when back online.
try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch { db = getFirestore(app); }

// ---------------- state ----------------
const S = {
  uid: null, recipes: [], grocery: [], loaded: false,
  tab: "recipes", cat: "All", q: "", sort: "new",
  viewId: null, serv: null, checks: {}, editing: null, img: "", imgChanged: false,
};
let unsubs = [];
const sub = (...p) => doc(db, "cookbook", S.uid, ...p);
const col = name => collection(db, "cookbook", S.uid, name);
const byId = id => S.recipes.find(r => r.id === id);

// ---------------- login ----------------
try { $("email").value = localStorage.getItem("cook.email") || localStorage.getItem("fit.email") || ""; } catch {}
$("loginForm").onsubmit = async e => {
  e.preventDefault();
  const err = $("loginErr"); err.hidden = true;
  $("loginBtn").disabled = true;
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("pw").value);
    try { localStorage.setItem("cook.email", $("email").value.trim()); } catch {}
    $("pw").value = "";
  } catch (er) {
    err.textContent = er.code === "auth/too-many-requests" ? "Too many tries. Wait a few minutes and try again." : "That email and password didn't match. Try again.";
    err.hidden = false;
  } finally { $("loginBtn").disabled = false; }
};
$("forgot").onclick = async () => {
  const em = $("email").value.trim();
  if (!em) { $("loginErr").textContent = "Type your email first, then tap Forgot password."; $("loginErr").hidden = false; return; }
  try { await sendPasswordResetEmail(auth, em); toast("Reset email sent"); } catch { toast("Couldn't send the reset email."); }
};

onAuthStateChanged(auth, user => {
  unsubs.forEach(u => u()); unsubs = [];
  if (!user) { $("appView").hidden = true; $("loginView").hidden = false; return; }
  S.uid = user.uid;
  $("loginView").hidden = true; $("appView").hidden = false;
  const em = user.email || "";
  $("meBadge").textContent = (em[0] || "?");
  $("acctEmail").textContent = "Signed in as " + em;
  buildTabs();
  start();
});
$("signOut").onclick = () => signOut(auth);
$("pwForm").onsubmit = async e => {
  e.preventDefault();
  try { await updatePassword(auth.currentUser, $("newPw").value); $("newPw").value = ""; toast("Password changed"); }
  catch (er) { toast(er.code === "auth/requires-recent-login" ? "Sign out and back in, then change your password." : "Couldn't change the password."); }
};

// ---------------- data ----------------
function start() {
  S.recipes = []; S.grocery = []; S.loaded = false;
  unsubs.push(onSnapshot(col("recipes"), snap => {
    S.recipes = []; snap.forEach(d => S.recipes.push({ id: d.id, ...d.data() }));
    S.loaded = true;
    renderList(); renderStats();
    if (S.tab === "view") { if (byId(S.viewId)) renderView(); else showTab("recipes"); }
  }, fail));
  unsubs.push(onSnapshot(sub("meta", "grocery"), snap => {
    S.grocery = (snap.exists() && snap.data().items) || []; renderGrocery();
  }, fail));
}
const saveGrocery = items => setDoc(sub("meta", "grocery"), { items }).catch(fail);

// ---------------- tabs ----------------
function buildTabs() {
  $("tabs").innerHTML = TABS.map(([k, t]) => `<button role="tab" data-tab="${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>${t}${k === "grocery" ? '<span class="count" id="gCount" hidden></span>' : ""}</button>`).join("");
  let t = "recipes"; try { t = localStorage.getItem("cook.tab") || "recipes"; } catch {}
  showTab(TABS.some(x => x[0] === t) ? t : "recipes");
  renderGrocery();
}
let listScroll = 0;
function showTab(t, keepScroll) {
  if (S.tab === "recipes" && t === "view") listScroll = window.scrollY;
  if (S.tab === "view" && t !== "view") releaseWake();
  S.tab = t;
  const sel = t === "view" ? "recipes" : t;
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === sel)));
  document.querySelectorAll("section.panel").forEach(s => s.hidden = s.id !== "tab-" + t);
  $("topHeader").hidden = t === "view";
  if (t !== "view") $("pageTitle").textContent = t === "add" ? (S.editing ? "Edit Recipe" : "Add Recipe") : TABS.find(x => x[0] === t)[1];
  if (t !== "view") { try { localStorage.setItem("cook.tab", t); } catch {} }
  window.scrollTo(0, keepScroll ? listScroll : 0);
}
$("tabs").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.tab === "recipes" && S.tab === "recipes") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (b.dataset.tab === "add" && S.editing && S.tab !== "add") { /* returning to an edit in progress */ }
  showTab(b.dataset.tab, b.dataset.tab === "recipes" && S.tab === "view");
};
$("themeSeg").onclick = e => { const b = e.target.closest("[data-theme-choice]"); if (b) applyTheme(b.dataset.themeChoice); };

// =====================================================================
// RECIPES LIST
// =====================================================================
function catCount(c) { return c === "All" ? S.recipes.length : c === "★" ? S.recipes.filter(r => r.fav).length : S.recipes.filter(r => (r.cat || "Other") === c).length; }
function renderChips() {
  const used = CATS.filter(c => catCount(c) > 0);
  const list = ["All", ...(catCount("★") ? ["★"] : []), ...used];
  if (!list.includes(S.cat)) S.cat = "All";
  $("catChips").innerHTML = list.map(c => `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="${c === S.cat}">${c === "★" ? "★ Favorites" : esc(c)}</button>`).join("");
  $("catChips").hidden = S.recipes.length === 0;
}
$("catChips").onclick = e => { const b = e.target.closest("[data-cat]"); if (!b) return; S.cat = b.dataset.cat; renderList(); };
$("q").oninput = () => { S.q = $("q").value; renderList(); };
try { S.sort = localStorage.getItem("cook.sort") || "new"; } catch {}
$("sortSel").value = S.sort;
$("sortSel").onchange = () => { S.sort = $("sortSel").value; try { localStorage.setItem("cook.sort", S.sort); } catch {} renderList(); };

function matches(r, q) {
  if (!q) return true;
  const hay = [r.title, r.cat, (r.tags || []).join(" "), (r.ing || []).join(" "), r.notes].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}
function placeholder(r) {
  const [c1, c2] = SWATCH[hash(r.title) % SWATCH.length];
  const letter = (String(r.title || "?").trim()[0] || "?").toUpperCase();
  return `<div class="ph" style="--c1:${c1};--c2:${c2}" aria-hidden="true">${esc(letter)}</div>`;
}
function renderList() {
  renderChips();
  let list = S.recipes.filter(r => (S.cat === "All" || (S.cat === "★" ? r.fav : (r.cat || "Other") === S.cat)) && matches(r, S.q.trim()));
  const sorters = {
    new: (a, b) => (b.created || 0) - (a.created || 0),
    az: (a, b) => String(a.title).localeCompare(String(b.title)),
    cooked: (a, b) => (b.cooked || 0) - (a.cooked || 0) || String(a.title).localeCompare(String(b.title)),
    recent: (a, b) => String(b.lastCooked || "").localeCompare(String(a.lastCooked || "")) || (b.created || 0) - (a.created || 0),
  };
  list.sort(sorters[S.sort] || sorters.new);
  const none = S.loaded && S.recipes.length === 0;
  $("firstRun").hidden = !none;
  $("countLine").parentElement.hidden = none;
  $("q").parentElement.hidden = none;
  $("countLine").textContent = S.q || S.cat !== "All" ? `${plural(list.length, "recipe")} found` : plural(S.recipes.length, "recipe");
  if (!list.length && !none) { $("grid").innerHTML = `<div class="empty" style="grid-column:1/-1">No recipes match. Try another word or category.</div>`; return; }
  $("grid").innerHTML = list.map(r => {
    const total = (+r.prep || 0) + (+r.cook || 0);
    const bits = [total ? mins(total) : "", r.serv ? plural(+r.serv, "serving") : ""].filter(Boolean).join(" · ") || esc(r.cat || "");
    return `<button class="rc" type="button" data-id="${esc(r.id)}">
      ${r.img ? `<img class="thumb" src="${esc(r.img)}" alt="" loading="lazy">` : placeholder(r)}
      <div class="meta"><div class="t">${r.fav ? '<span class="star" aria-label="Favorite">★</span> ' : ""}${esc(r.title)}</div><div class="s">${bits}</div></div>
    </button>`;
  }).join("");
}
$("grid").onclick = e => { const b = e.target.closest("[data-id]"); if (b) openRecipe(b.dataset.id); };
$("firstAdd").onclick = () => showTab("add");

// =====================================================================
// RECIPE DETAIL
// =====================================================================
function openRecipe(id, fromPop) {
  const r = byId(id); if (!r) return;
  if (S.viewId !== id) { S.serv = null; }
  S.viewId = id;
  if (!S.checks[id]) S.checks[id] = { ing: new Set(), step: new Set() };
  if (!fromPop) { try { history.state && history.state.recipe ? history.replaceState({ recipe: id }, "") : history.pushState({ recipe: id }, ""); } catch {} }
  showTab("view");
  renderView();
}
window.addEventListener("popstate", e => {
  if (e.state && e.state.recipe && byId(e.state.recipe)) openRecipe(e.state.recipe, true);
  else if (S.tab === "view") showTab("recipes", true);
});
$("backBtn").onclick = () => { if (history.state && history.state.recipe) history.back(); else showTab("recipes", true); };

function renderView() {
  const r = byId(S.viewId); if (!r) return;
  const base = +r.serv || 0, serv = S.serv || base, k = base ? serv / base : 1;
  const ch = S.checks[r.id];
  $("vTitle").textContent = r.title;
  $("vHero").hidden = !r.img; if (r.img) $("vImg").src = r.img;
  $("favBtn").classList.toggle("on", !!r.fav);
  $("favBtn").setAttribute("aria-pressed", String(!!r.fav));
  $("favBtn").querySelector("path").setAttribute("fill", r.fav ? "currentColor" : "none");
  $("vChips").innerHTML = [`<span class="pill accent">${esc(r.cat || "Other")}</span>`, ...(r.tags || []).map(t => `<span class="pill">${esc(t)}</span>`)].join("");
  const st = [["Prep", mins(r.prep)], ["Cook", mins(r.cook)], r.temp ? ["Oven", esc(r.temp)] : ["Total", mins((+r.prep || 0) + (+r.cook || 0))]];
  $("vStats").innerHTML = st.map(([a, b]) => `<div class="stat"><b>${b}</b><span>${a}</span></div>`).join("");

  // servings
  $("servLabel").textContent = base ? plural(serv, "serving") : "Servings —";
  $("servMinus").disabled = !base || serv <= 1;
  $("servPlus").disabled = !base;
  $("scaleNote").hidden = k === 1;

  // ingredients
  const ing = r.ing || [];
  $("vIng").innerHTML = ing.length ? ing.map((l, i) => {
    if (isHead(l)) return `<li class="sec"><h3>${esc(headText(l))}</h3></li>`;
    const { q, rest } = scaleLine(l, k);
    return `<li data-i="${i}" class="${ch.ing.has(i) ? "done" : ""}" role="checkbox" aria-checked="${ch.ing.has(i)}" tabindex="0"><span class="cb"></span><span class="txt">${q ? `<span class="q">${esc(q)}</span>` : ""}${esc(rest)}</span></li>`;
  }).join("") : `<li class="empty">No ingredients added.</li>`;
  $("toGrocery").hidden = !ing.some(l => !isHead(l));

  // steps
  let n = 0;
  const steps = r.steps || [];
  $("vSteps").innerHTML = steps.length ? steps.map((l, i) => {
    if (isHead(l)) return `<li class="sec"><h3>${esc(headText(l))}</h3></li>`;
    n++;
    return `<li data-s="${i}" class="${ch.step.has(i) ? "done" : ""}" role="checkbox" aria-checked="${ch.step.has(i)}" tabindex="0"><span class="n">${ch.step.has(i) ? "✓" : n}</span><span>${esc(l)}</span></li>`;
  }).join("") : `<li class="sec"><span class="muted">No instructions added.</span></li>`;
  $("resetChecks").hidden = !(ch.ing.size || ch.step.size);

  // notes, source, log
  $("vNotesCard").hidden = !r.notes;
  $("vNotes").textContent = r.notes || "";
  const src = (r.src || "").trim();
  $("vSource").innerHTML = !src ? "" : /^https?:\/\//i.test(src)
    ? `<div class="foot">Source</div><a class="src" href="${esc(src)}" target="_blank" rel="noopener">${esc(src.replace(/^https?:\/\/(www\.)?/i, "").slice(0, 70))}</a>`
    : `<div class="foot">Source: ${esc(src)}</div>`;
  $("vCooked").textContent = r.cooked ? `Made ${plural(r.cooked, "time")} · last ${short(r.lastCooked)}` : "Not cooked yet";
  $("vCooked").className = r.cooked ? "pill accent" : "pill";
  const doneToday = r.lastCooked === today();
  $("cookedBtn").textContent = doneToday ? "Made Today ✓  (tap to undo)" : "I Made This Today";
  $("wakeRow").hidden = !("wakeLock" in navigator);
  $("wakeBox").checked = !!wakeLock;
}
function toggleCheck(kind, i) {
  const set = S.checks[S.viewId][kind];
  set.has(i) ? set.delete(i) : set.add(i);
  renderView();
}
$("vIng").onclick = e => { const li = e.target.closest("[data-i]"); if (li) toggleCheck("ing", +li.dataset.i); };
$("vSteps").onclick = e => { const li = e.target.closest("[data-s]"); if (li) toggleCheck("step", +li.dataset.s); };
[$("vIng"), $("vSteps")].forEach(el => el.onkeydown = e => { if ((e.key === " " || e.key === "Enter") && e.target.matches("[data-i],[data-s]")) { e.preventDefault(); e.target.click(); } });
$("resetChecks").onclick = () => { S.checks[S.viewId] = { ing: new Set(), step: new Set() }; renderView(); };
$("servMinus").onclick = () => { const r = byId(S.viewId); S.serv = Math.max(1, (S.serv || +r.serv) - 1); renderView(); };
$("servPlus").onclick = () => { const r = byId(S.viewId); S.serv = (S.serv || +r.serv) + 1; renderView(); };

$("favBtn").onclick = () => {
  const r = byId(S.viewId); if (!r) return;
  r.fav = !r.fav; renderView();
  setDoc(sub("recipes", r.id), { fav: r.fav }, { merge: true }).catch(fail);
  toast(r.fav ? "Added to Favorites" : "Removed from Favorites");
};
$("cookedBtn").onclick = () => {
  const r = byId(S.viewId); if (!r) return;
  let patch;
  if (r.lastCooked === today()) {
    const hist = (r.cookLog || []).filter(d => d !== today());
    patch = { cooked: Math.max(0, (r.cooked || 1) - 1), lastCooked: hist[hist.length - 1] || "", cookLog: hist };
  } else {
    const hist = [...(r.cookLog || []), today()].slice(-50);
    patch = { cooked: (r.cooked || 0) + 1, lastCooked: today(), cookLog: hist };
    toast("Nice! Logged for today");
  }
  Object.assign(r, patch); renderView(); renderStats();
  setDoc(sub("recipes", r.id), patch, { merge: true }).catch(fail);
};
$("editBtn").onclick = () => startEdit(S.viewId);
$("delBtn").onclick = async () => {
  const r = byId(S.viewId); if (!r) return;
  if (!confirm(`Delete "${r.title}"? This can't be undone.`)) return;
  try { await deleteDoc(sub("recipes", r.id)); toast("Recipe deleted"); S.recipes = S.recipes.filter(x => x.id !== r.id); showTab("recipes", true); renderList(); }
  catch (er) { fail(er); }
};

function recipeText(r) {
  const k = S.serv && r.serv ? S.serv / r.serv : 1;
  const out = [r.title];
  const meta = [r.serv ? `Serves ${S.serv || r.serv}` : "", r.prep ? `Prep ${mins(r.prep)}` : "", r.cook ? `Cook ${mins(r.cook)}` : "", r.temp ? `Oven ${r.temp}` : ""].filter(Boolean).join(" · ");
  if (meta) out.push(meta);
  out.push("", "INGREDIENTS");
  (r.ing || []).forEach(l => { if (isHead(l)) out.push("", headText(l) + ":"); else { const { q, rest } = scaleLine(l, k); out.push("• " + (q ? q + rest : rest).trim()); } });
  out.push("", "INSTRUCTIONS");
  let n = 0; (r.steps || []).forEach(l => { if (isHead(l)) out.push("", headText(l) + ":"); else out.push(`${++n}. ${l}`); });
  if (r.notes) out.push("", "NOTES", r.notes);
  if (r.src) out.push("", "Source: " + r.src);
  return out.join("\n");
}
$("shareBtn").onclick = async () => {
  const r = byId(S.viewId); if (!r) return;
  const text = recipeText(r);
  if (navigator.share) { try { await navigator.share({ title: r.title, text }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(text); toast("Recipe copied"); } catch { toast("Couldn't copy the recipe"); }
};

// Keep the screen awake while cooking
let wakeLock = null;
async function getWake() { try { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { if (!keepWake) wakeLock = null; }); } catch { wakeLock = null; $("wakeBox").checked = false; toast("Your phone didn't allow keeping the screen on"); } }
let keepWake = false;
function releaseWake() { keepWake = false; if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
$("wakeBox").onchange = async () => { if ($("wakeBox").checked) { keepWake = true; await getWake(); if (wakeLock) toast("Screen will stay on"); } else releaseWake(); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && keepWake && S.tab === "view") getWake(); });

// Ingredients → grocery list
$("toGrocery").onclick = () => {
  const r = byId(S.viewId); if (!r) return;
  const k = S.serv && r.serv ? S.serv / r.serv : 1;
  const have = new Set(S.grocery.map(g => g.t.toLowerCase() + "|" + (g.from || "")));
  const add = [];
  (r.ing || []).forEach((l, i) => {
    if (isHead(l)) return;
    if (S.checks[r.id] && S.checks[r.id].ing.has(i)) return; // checked = already have it
    const { q, rest } = scaleLine(l, k); const t = (q ? q + rest : rest).replace(/\s+/g, " ").trim();
    if (!have.has(t.toLowerCase() + "|" + r.title)) add.push({ id: newId(), t, from: r.title, done: false });
  });
  if (!add.length) { toast("Already on your list"); return; }
  saveGrocery([...S.grocery, ...add]);
  toast(`Added ${plural(add.length, "item")} to Grocery`);
};

// =====================================================================
// ADD / EDIT
// =====================================================================
$("rCat").innerHTML = CATS.map(c => `<option>${esc(c)}</option>`).join("");
$("rCat").value = "Mains";
const FIELDS = ["rTitle", "rCat", "rServ", "rPrep", "rCook", "rTemp", "rIng", "rSteps", "rNotes", "rTags", "rSrc"];

function setImg(src) {
  S.img = src || "";
  $("rImgPrev").hidden = !S.img; if (S.img) $("rImgPrev").src = S.img;
  $("rImgDel").hidden = !S.img;
  $("rImgBtn").textContent = S.img ? "Change Photo" : "Add Photo";
}
function clearForm() {
  S.editing = null; $("rForm").reset(); $("rCat").value = "Mains"; setImg(""); S.imgChanged = false;
  $("formTitle").textContent = "New recipe"; $("cancelEdit").hidden = true; $("rSubmit").textContent = "Save Recipe";
  $("pasteBox").hidden = false;
}
function fillForm(r) {
  $("rTitle").value = r.title || ""; $("rCat").value = CATS.includes(r.cat) ? r.cat : "Other";
  $("rServ").value = r.serv || ""; $("rPrep").value = r.prep || ""; $("rCook").value = r.cook || ""; $("rTemp").value = r.temp || "";
  $("rIng").value = (r.ing || []).join("\n"); $("rSteps").value = (r.steps || []).join("\n");
  $("rNotes").value = r.notes || ""; $("rTags").value = (r.tags || []).join(", "); $("rSrc").value = r.src || "";
}
function startEdit(id) {
  const r = byId(id); if (!r) return;
  S.editing = id; fillForm(r); setImg(r.img || ""); S.imgChanged = false;
  $("formTitle").textContent = "Edit recipe"; $("cancelEdit").hidden = false; $("rSubmit").textContent = "Save Changes";
  $("pasteBox").hidden = true;
  showTab("add");
}
$("cancelEdit").onclick = () => { const id = S.editing; clearForm(); restoreDraft(); if (byId(id)) openRecipe(id); else showTab("recipes"); };

// Draft of a new recipe survives closing the app
const saveDraft = () => { if (S.editing) return; try { const d = {}; FIELDS.forEach(f => d[f] = $(f).value); localStorage.setItem("cook.draft", JSON.stringify(d)); } catch {} };
function restoreDraft() { try { const d = JSON.parse(localStorage.getItem("cook.draft") || "null"); if (d) FIELDS.forEach(f => { if (d[f] != null) $(f).value = d[f]; }); } catch {} }
const clearDraft = () => { try { localStorage.removeItem("cook.draft"); } catch {} };
$("rForm").addEventListener("input", saveDraft);
restoreDraft();

$("rForm").onsubmit = async e => {
  e.preventDefault();
  const title = $("rTitle").value.trim();
  if (!title) { $("rTitle").focus(); return; }
  const ing = toLines($("rIng").value).map(cleanIng).filter(Boolean);
  const steps = toLines($("rSteps").value).map(l => isHead(l) ? l : cleanStep(l)).filter(Boolean);
  const data = {
    title, cat: $("rCat").value, serv: optNum($("rServ").value) ? Math.round(optNum($("rServ").value)) : null,
    prep: optNum($("rPrep").value), cook: optNum($("rCook").value), temp: $("rTemp").value.trim(),
    ing, steps, notes: $("rNotes").value.trim(),
    tags: $("rTags").value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 12),
    src: $("rSrc").value.trim(), updated: Date.now(),
  };
  const id = S.editing || newId();
  const old = byId(id);
  if (!old) { data.created = Date.now(); data.fav = false; data.cooked = 0; data.lastCooked = ""; }
  if (!old || S.imgChanged) data.img = S.img || "";
  $("rSubmit").disabled = true;
  try {
    const p = setDoc(sub("recipes", id), data, { merge: true });
    // Offline: the write is queued on the phone and syncs later, so don't wait forever.
    await Promise.race([p, new Promise(r => setTimeout(r, 1500))]);
    p.catch(fail);
    const wasEdit = !!S.editing;
    if (old) Object.assign(old, data); else S.recipes.push({ id, ...data });
    if (!wasEdit) clearDraft();
    clearForm(); if (wasEdit) restoreDraft();
    if (wasEdit) delete S.checks[id];
    toast(wasEdit ? "Changes saved" : "Recipe saved");
    renderList(); renderStats();
    S.serv = null; openRecipe(id);
  } catch (er) { fail(er); }
  finally { $("rSubmit").disabled = false; }
};

// Photo: shrink on the phone so it saves fast and fits in the database
$("rImgBtn").onclick = () => $("rImg").click();
$("rImgDel").onclick = () => { setImg(""); S.imgChanged = true; };
$("rImg").onchange = async () => {
  const f = $("rImg").files[0]; $("rImg").value = ""; if (!f) return;
  try { setImg(await shrink(f)); S.imgChanged = true; }
  catch { toast("Couldn't read that photo. Try a JPG or PNG."); }
};
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    for (const [max, q] of [[1100, .72], [900, .65], [700, .6], [500, .55]]) {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length < 420000) return out;
    }
    throw new Error("too big");
  } finally { URL.revokeObjectURL(url); }
}

// Paste a whole recipe → split into the form
function parseRecipe(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim());
  const H_ING = /^(ingredients?|what you(?:'|’)?ll need|you(?:'|’)?ll need)\b\s*:?\s*$/i;
  const H_STEP = /^(instructions?|directions?|method|steps|preparation|how to make(?: it)?)\b\s*:?\s*$/i;
  const H_NOTE = /^(notes?|tips?|recipe notes?|cook(?:'|’)?s notes?)\b\s*:?\s*$/i;
  const out = { title: "", ing: [], steps: [], notes: [], serv: null, prep: null, cook: null, temp: "" };
  const toMin = s => { let m = 0; const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i); const n = s.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/i); if (h) m += parseFloat(h[1]) * 60; if (n) m += +n[1]; return m || null; };
  let mode = "head";
  for (const l of lines) {
    if (!l) continue;
    if (H_ING.test(l)) { mode = "ing"; continue; }
    if (H_STEP.test(l)) { mode = "step"; continue; }
    if (H_NOTE.test(l)) { mode = "note"; continue; }
    const sv = l.match(/^(?:serves|servings|yield|makes)\s*:?\s*(\d+)/i);
    if (sv && mode !== "step") { out.serv = +sv[1]; continue; }
    const pt = l.match(/^prep(?:\s*time)?\s*:?\s*(.+)$/i); if (pt && mode !== "step" && toMin(pt[1])) { out.prep = toMin(pt[1]); continue; }
    const ct = l.match(/^(?:cook|bake|cooking)(?:\s*time)?\s*:?\s*(.+)$/i); if (ct && mode !== "step" && toMin(ct[1])) { out.cook = toMin(ct[1]); continue; }
    if (/^total(?:\s*time)?\s*:?/i.test(l) && mode !== "step") continue;
    if (mode === "head") { if (!out.title) out.title = l.replace(/^#+\s*/, "").slice(0, 100); else out.notes.push(l); }
    else if (mode === "ing") out.ing.push(cleanIng(l));
    else if (mode === "step") out.steps.push(isHead(l) ? l : cleanStep(l));
    else out.notes.push(l);
  }
  // No headings found: lines starting with an amount are ingredients, the rest are steps.
  if (!out.ing.length && !out.steps.length) {
    const rest = out.notes; out.notes = [];
    for (const l of rest) (QRE.test(l.replace(/⁄/g, "/")) && l.length < 90 && !/^\d+\s*[.)]/.test(l) ? out.ing : out.steps).push(QRE.test(l) && !/^\d+\s*[.)]/.test(l) ? cleanIng(l) : cleanStep(l));
  }
  const all = [...out.steps, ...out.notes].join(" ");
  const tm = all.match(/(\d{3})\s*°?\s*([FC])\b/); if (tm) out.temp = `${tm[1]}°${tm[2].toUpperCase()}`;
  return out;
}
$("pasteGo").onclick = () => {
  const p = parseRecipe($("pasteText").value);
  if (!p.title && !p.ing.length && !p.steps.length) { toast("Paste a recipe first"); return; }
  if (p.title) $("rTitle").value = p.title;
  const guess = [[/pancake|waffle|oat|granola|omelet|frittata|french toast|breakfast|muffin/i, "Breakfast"], [/cookie|cake|brownie|pie\b|cobbler|pudding|ice cream|frosting|dessert/i, "Desserts"],
    [/bread|biscuit|roll|scone|focaccia|loaf/i, "Breads & Baking"], [/soup|stew|chili|salad|chowder/i, "Soups & Salads"], [/sauce|dip|dressing|salsa|gravy|pesto/i, "Sauces & Dips"],
    [/smoothie|lemonade|cocktail|latte|tea\b|punch/i, "Drinks"]].find(([re]) => re.test(p.title || ""));
  if (guess && !S.editing) $("rCat").value = guess[1];
  if (p.serv) $("rServ").value = p.serv;
  if (p.prep) $("rPrep").value = p.prep;
  if (p.cook) $("rCook").value = p.cook;
  if (p.temp && !$("rTemp").value) $("rTemp").value = p.temp;
  if (p.ing.length) $("rIng").value = p.ing.join("\n");
  if (p.steps.length) $("rSteps").value = p.steps.join("\n");
  if (p.notes.length) $("rNotes").value = p.notes.join("\n");
  $("pasteText").value = ""; $("pasteBox").open = false;
  saveDraft();
  toast("Filled in. Check it over, then save");
  $("rTitle").scrollIntoView({ behavior: "smooth", block: "center" });
};

// =====================================================================
// GROCERY
// =====================================================================
function renderGrocery() {
  const open = S.grocery.filter(g => !g.done).length;
  const c = $("gCount"); if (c) { c.hidden = !open; c.textContent = open > 99 ? "99+" : open; }
  if (!S.grocery.length) { $("gList").innerHTML = `<li class="empty">Your list is empty.</li>`; $("gActions").hidden = true; return; }
  $("gActions").hidden = false;
  const items = [...S.grocery.filter(g => !g.done), ...S.grocery.filter(g => g.done)];
  $("gList").innerHTML = items.map(g => `<li data-g="${esc(g.id)}" class="${g.done ? "done" : ""}" role="checkbox" aria-checked="${!!g.done}" tabindex="0">
    <span class="cb" style="${g.done ? "background:var(--accent);border-color:var(--accent)" : ""}"></span>
    <div class="grow"><div>${esc(g.t)}</div>${g.from ? `<div class="sub">${esc(g.from)}</div>` : ""}</div>
    <button class="x" type="button" data-gdel="${esc(g.id)}" aria-label="Remove ${esc(g.t)}">×</button></li>`).join("");
}
$("gList").onclick = e => {
  const del = e.target.closest("[data-gdel]");
  if (del) { saveGrocery(S.grocery.filter(g => g.id !== del.dataset.gdel)); return; }
  const li = e.target.closest("[data-g]"); if (!li) return;
  saveGrocery(S.grocery.map(g => g.id === li.dataset.g ? { ...g, done: !g.done } : g));
};
$("gList").onkeydown = e => { if ((e.key === " " || e.key === "Enter") && e.target.matches("[data-g]")) { e.preventDefault(); e.target.click(); } };
$("gForm").onsubmit = e => {
  e.preventDefault(); const t = $("gItem").value.trim(); if (!t) return;
  saveGrocery([...S.grocery, { id: newId(), t, from: "", done: false }]); $("gItem").value = "";
};
$("gClearDone").onclick = () => { if (!S.grocery.some(g => g.done)) { toast("Nothing checked yet"); return; } saveGrocery(S.grocery.filter(g => !g.done)); };
$("gClearAll").onclick = () => { if (confirm("Clear the whole grocery list?")) saveGrocery([]); };

// =====================================================================
// SETTINGS
// =====================================================================
function renderStats() {
  $("sCount").textContent = S.recipes.length;
  $("sFav").textContent = S.recipes.filter(r => r.fav).length;
  $("sMade").textContent = S.recipes.reduce((s, r) => s + (r.cooked || 0), 0);
}
$("exportBtn").onclick = () => {
  const data = { app: "cookbook", version: 1, exported: new Date().toISOString(), recipes: S.recipes, grocery: S.grocery };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  a.download = `cookbook-backup-${today()}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async () => {
  const f = $("importFile").files[0]; $("importFile").value = ""; if (!f) return;
  let data; try { data = JSON.parse(await f.text()); } catch { toast("That file isn't a backup"); return; }
  if (data.app !== "cookbook") { toast("That file isn't a Cookbook backup"); return; }
  if (!confirm(`Restore ${plural((data.recipes || []).length, "recipe")}? Recipes that are in both are replaced; everything else stays.`)) return;
  try {
    const ops = (data.recipes || []).map(r => { const { id, ...rest } = r; return [sub("recipes", id || newId()), rest]; });
    if (data.grocery) ops.push([sub("meta", "grocery"), { items: data.grocery }]);
    // Photos make recipes large, so write in small batches.
    for (let i = 0; i < ops.length; i += 20) {
      const b = writeBatch(db); ops.slice(i, i + 20).forEach(([ref, v]) => b.set(ref, v)); await b.commit();
    }
    toast("Backup restored");
  } catch (er) { fail(er); }
};

// init
clearForm(); restoreDraft();
