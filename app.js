// stop iOS pinch-zoom gestures (extra safety)
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
document.addEventListener("gestureend", (e) => e.preventDefault());

const $ = (id) => document.getElementById(id);

const STORE = "macros_v1";
const THEME_KEY = "macros_theme";

function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function defaultState(){
  return {
    days: {},
    goals: { cals: 0, p: 0, c: 0, f: 0 },
    colors: { cal:"#8b95ff", p:"#ff4b4b", c:"#c49a6c", f:"#2aff62" }
  };
}

function load(){
  try{
    const x = JSON.parse(localStorage.getItem(STORE));
    return x || defaultState();
  }catch{
    return defaultState();
  }
}
function save(data){
  localStorage.setItem(STORE, JSON.stringify(data));
}

function ensureDay(data, key){
  if(!data.days[key]) data.days[key] = { entries: [], weight:"", water:"" };
  return data.days[key];
}

function num(v){
  const s = String(v ?? "").replace(/,/g,"").trim();
  if(!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function fmt(n){
  const x = Number(n);
  if(!Number.isFinite(x)) return "0";
  return Number.isInteger(x) ? String(x) : String(Math.round(x*10)/10);
}
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

function sumEntries(entries){
  return entries.reduce((acc,e)=>{
    acc.cals += e.cals;
    acc.p += e.p;
    acc.c += e.c;
    acc.f += e.f;
    return acc;
  }, {cals:0,p:0,c:0,f:0});
}

/* numeric-only filters */
function sanitizeInt(s){ return String(s).replace(/[^\d]/g, ""); }
function sanitizeDec(s){
  s = String(s).replace(/[^\d.]/g, "");
  const parts = s.split(".");
  if(parts.length <= 2) return s;
  return parts[0] + "." + parts.slice(1).join("");
}
function attachNumericFilters(){
  document.querySelectorAll("[data-num]").forEach((el)=>{
    el.addEventListener("input", ()=>{
      const mode = el.getAttribute("data-num");
      const before = el.value;
      let after = before;
      if(mode === "int") after = sanitizeInt(before);
      if(mode === "dec") after = sanitizeDec(before);
      if(after !== before) el.value = after;
    });
  });
}

/* caret to end */
function attachEndCaret(){
  document.querySelectorAll(".endCaret").forEach((el)=>{
    el.addEventListener("focus", ()=>{
      const v = el.value ?? "";
      requestAnimationFrame(()=>{
        try{ el.setSelectionRange(v.length, v.length); }catch{}
      });
    });
  });
}

/* theme */
function applyTheme(theme){
  const t = (theme === "light") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(THEME_KEY, t);

  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", t === "light" ? "#f6f7fb" : "#07080b");
}
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved || "dark");
}
function toggleTheme(){
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

/* colors */
function setMacroColors(colors){
  const root = document.documentElement;
  if(colors?.cal) root.style.setProperty("--cal", colors.cal);
  if(colors?.p) root.style.setProperty("--p", colors.p);
  if(colors?.c) root.style.setProperty("--c", colors.c);
  if(colors?.f) root.style.setProperty("--f", colors.f);
}

/* toast */
let toastTimer = null;
function toast(msg){
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.add("hidden"), 1200);
}

/* modal confirm */
let modalResolve = null;
function confirmModal(title, body){
  $("modalTitle").textContent = title;
  $("modalBody").textContent = body;
  $("modalOverlay").classList.remove("hidden");
  $("modalOverlay").setAttribute("aria-hidden", "false");
  return new Promise((resolve)=>{ modalResolve = resolve; });
}
function closeModal(result){
  $("modalOverlay").classList.add("hidden");
  $("modalOverlay").setAttribute("aria-hidden", "true");
  if(modalResolve) modalResolve(result);
  modalResolve = null;
}
$("modalCancel").addEventListener("click", ()=> closeModal(false));
$("modalOK").addEventListener("click", ()=> closeModal(true));
$("modalOverlay").addEventListener("click", (e)=>{
  if(e.target === $("modalOverlay")) closeModal(false);
});

/* tabs */
const tabOrder = ["today","history","goals"];
let currentTab = "today";

function showView(idToShow){
  const ids = ["viewToday","viewHistory","viewGoals"];
  ids.forEach((id)=>{
    const el = $(id);
    const show = id === idToShow;
    el.classList.toggle("hidden", !show);
  });
}
function setTab(which){
  currentTab = which;

  $("tabToday").classList.toggle("active", which==="today");
  $("tabHistory").classList.toggle("active", which==="history");
  $("tabGoals").classList.toggle("active", which==="goals");

  if(which==="today"){ showView("viewToday"); renderToday(); }
  if(which==="history"){ showView("viewHistory"); renderHistory(); }
  if(which==="goals"){ showView("viewGoals"); renderGoals(); }
}
$("tabToday").addEventListener("click", ()=> setTab("today"));
$("tabHistory").addEventListener("click", ()=> setTab("history"));
$("tabGoals").addEventListener("click", ()=> setTab("goals"));

/* swipe between tabs */
(function enableSwipeTabs(){
  let startX = 0, startY = 0, tracking = false;

  document.addEventListener("touchstart", (e)=>{
    if(!e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
  }, {passive:true});

  document.addEventListener("touchend", (e)=>{
    if(!tracking) return;
    tracking = false;

    const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
    if(!t) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if(Math.abs(dy) > Math.abs(dx)) return;
    if(Math.abs(dx) < 60) return;

    const idx = tabOrder.indexOf(currentTab);
    if(dx < 0 && idx < tabOrder.length - 1){
      setTab(tabOrder[idx + 1]);
    }else if(dx > 0 && idx > 0){
      setTab(tabOrder[idx - 1]);
    }
  }, {passive:true});
})();

/* render today */
function renderToday(){
  const data = load();
  setMacroColors(data.colors);

  const key = todayKey();
  const day = ensureDay(data, key);

  $("todayLabel").textContent = key;

  const totals = sumEntries(day.entries);
  $("tCals").textContent = fmt(totals.cals);
  $("tP").textContent = fmt(totals.p);
  $("tC").textContent = fmt(totals.c);
  $("tF").textContent = fmt(totals.f);

  $("entryCount").textContent = day.entries.length ? `${day.entries.length} item${day.entries.length===1?"":"s"}` : "No entries";

  const g = data.goals || defaultState().goals;
  const hasGoals = (num(g.cals) > 0) && (num(g.p) > 0 || num(g.c) > 0 || num(g.f) > 0);

  $("barsWrap").classList.toggle("hidden", !hasGoals);
  $("noGoalsHint").classList.toggle("hidden", hasGoals);
  $("goalSummary").textContent = hasGoals ? `${fmt(g.cals)} cals goal` : "";

  if(hasGoals){
    const calGoal = Math.max(1, Math.round(num(g.cals)));
    const pGoal = Math.max(0, Math.round(num(g.p)));
    const cGoal = Math.max(0, Math.round(num(g.c)));
    const fGoal = Math.max(0, Math.round(num(g.f)));

    const pctCals = clamp(totals.cals / calGoal, 0, 1);
    const pctP = pGoal ? clamp(totals.p / pGoal, 0, 1) : 0;
    const pctC = cGoal ? clamp(totals.c / cGoal, 0, 1) : 0;
    const pctF = fGoal ? clamp(totals.f / fGoal, 0, 1) : 0;

    $("barCals").style.width = `${pctCals*100}%`;
    $("barP").style.width = `${pctP*100}%`;
    $("barC").style.width = `${pctC*100}%`;
    $("barF").style.width = `${pctF*100}%`;

    $("barCalsText").textContent = `${fmt(totals.cals)} / ${fmt(calGoal)}`;
    $("barPText").textContent = `${fmt(totals.p)} / ${fmt(pGoal)}`;
    $("barCText").textContent = `${fmt(totals.c)} / ${fmt(cGoal)}`;
    $("barFText").textContent = `${fmt(totals.f)} / ${fmt(fGoal)}`;
  }

  $("weight").value = day.weight ?? "";
  $("water").value = day.water ?? "";

  const list = $("entryList");
  list.innerHTML = "";

  day.entries.slice().reverse().forEach((e, idxFromEnd)=>{
    const li = document.createElement("li");
    li.className = "item";
    li.style.cursor = "pointer";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = e.note?.trim() ? e.note : "Entry";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = new Date(e.ts).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "meta";
    right.textContent = `${fmt(e.cals)}c • P${fmt(e.p)} C${fmt(e.c)} F${fmt(e.f)}`;

    li.appendChild(left);
    li.appendChild(right);

    li.addEventListener("click", async ()=>{
      const ok = await confirmModal("Delete entry?", "This will remove it from today.");
      if(!ok) return;

      const data2 = load();
      const day2 = ensureDay(data2, key);
      const actualIndex = day2.entries.length - 1 - idxFromEnd;
      day2.entries.splice(actualIndex, 1);
      save(data2);
      toast("Deleted");
      renderToday();
    });

    list.appendChild(li);
  });

  save(data);
}

/* history */
function renderHistory(){
  const data = load();
  const keys = Object.keys(data.days).sort().reverse();

  const dayList = $("dayList");
  dayList.innerHTML = "";

  keys.forEach((k)=>{
    const d = data.days[k];
    const totals = sumEntries(d.entries);

    const li = document.createElement("li");
    li.className = "item";
    li.style.cursor = "pointer";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = k;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `Wt: ${d.weight || "-"} • Water: ${d.water || "-"}`;
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "meta";
    right.textContent = `${fmt(totals.cals)}c • P${fmt(totals.p)} C${fmt(totals.c)} F${fmt(totals.f)}`;

    li.appendChild(left);
    li.appendChild(right);

    li.addEventListener("click", ()=> openDayDetail(k));
    dayList.appendChild(li);
  });
}

function openDayDetail(key){
  const data = load();
  const day = ensureDay(data, key);
  const totals = sumEntries(day.entries);

  $("dayDetailCard").classList.remove("hidden");
  $("detailTitle").textContent = key;
  $("detailMeta").textContent = `${fmt(totals.cals)}c • P${fmt(totals.p)} C${fmt(totals.c)} F${fmt(totals.f)} • Wt: ${day.weight || "-"} • Water: ${day.water || "-"}`;

  const list = $("detailEntries");
  list.innerHTML = "";

  day.entries.forEach((e)=>{
    const li = document.createElement("li");
    li.className = "item";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = e.note?.trim() ? e.note : "Entry";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = new Date(e.ts).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "meta";
    right.textContent = `${fmt(e.cals)}c • P${fmt(e.p)} C${fmt(e.c)} F${fmt(e.f)}`;

    li.appendChild(left);
    li.appendChild(right);
    list.appendChild(li);
  });
}
$("closeDetail").addEventListener("click", ()=> $("dayDetailCard").classList.add("hidden"));

/* goals */
function renderGoals(){
  const data = load();
  setMacroColors(data.colors);

  const g = data.goals || defaultState().goals;
  $("goalCals").value = g.cals ? String(g.cals) : "";
  $("goalP").value = g.p ? String(g.p) : "";
  $("goalC").value = g.c ? String(g.c) : "";
  $("goalF").value = g.f ? String(g.f) : "";

  $("colCal").value = data.colors?.cal || "#8b95ff";
  $("colP").value = data.colors?.p || "#ff4b4b";
  $("colC").value = data.colors?.c || "#c49a6c";
  $("colF").value = data.colors?.f || "#2aff62";

  save(data);
}

$("saveGoals").addEventListener("click", ()=>{
  const data = load();
  data.goals = {
    cals: Math.round(num($("goalCals").value)),
    p: Math.round(num($("goalP").value)),
    c: Math.round(num($("goalC").value)),
    f: Math.round(num($("goalF").value))
  };
  save(data);
  toast("Goals saved");
  renderGoals();
  renderToday();
});

["colCal","colP","colC","colF"].forEach((id)=>{
  $(id).addEventListener("input", ()=>{
    const data = load();
    const map = { colCal:"cal", colP:"p", colC:"c", colF:"f" };
    data.colors[map[id]] = $(id).value;
    save(data);
    renderGoals();
    renderToday();
  });
});

/* entry add */
$("entryForm").addEventListener("submit", (e)=>{
  e.preventDefault();

  const data = load();
  const key = todayKey();
  const day = ensureDay(data, key);

  day.entries.push({
    ts: Date.now(),
    note: $("note").value || "",
    cals: num($("cals").value),
    p: num($("p").value),
    c: num($("c").value),
    f: num($("f").value)
  });

  save(data);
  e.target.reset();
  $("note").focus();
  toast("Added");
  renderToday();
});

/* clear today */
$("clearToday").addEventListener("click", async ()=>{
  const ok = await confirmModal("Clear today?", "This deletes all of today’s entries.");
  if(!ok) return;

  const data = load();
  const key = todayKey();
  data.days[key] = { entries: [], weight:"", water:"" };
  save(data);
  toast("Cleared");
  renderToday();
});

/* weight/water */
$("saveMetrics").addEventListener("click", ()=>{
  const data = load();
  const key = todayKey();
  const day = ensureDay(data, key);
  day.weight = $("weight").value;
  day.water = $("water").value;
  save(data);
  toast("Saved");
  renderToday();
});

/* theme toggle */
$("themeToggle").addEventListener("click", toggleTheme);

/* init */
initTheme();
attachNumericFilters();
attachEndCaret();
setTab("today");
renderToday();
