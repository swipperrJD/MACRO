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
    const shouldShow = (id === idToShow);

    if (shouldShow) {
      el.classList.remove("hidden");
      el.classList.add("isHidden");
      requestAnimationFrame(() => {
        el.classList.remove("isHidden");
      });
    } else {
      if (el.classList.contains("hidden")) return;

      el.classList.add("isHidden");

      const onEnd = (evt) => {
        if (evt.propertyName !== "opacity") return;
        el.classList.add("hidden");
        el.removeEventListener("transitionend", onEnd);
      };

      el.addEventListener("transitionend", onEnd);
    }
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

/* init */
initTheme();
attachNumericFilters();
attachEndCaret();
setTab("today");
renderToday();
