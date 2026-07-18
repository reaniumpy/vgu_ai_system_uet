"use strict";

const $ = (id) => document.getElementById(id);
const { t, currentLang, applyStaticI18n } = window.I18N;
const KIND_ICON = { "PDF document": "📕", "Word document": "📘", "Text document": "📄" };
const MAX_ITEMS = 10;

// Per-team batch config. HR adds a JD section and a fit rating; Legal/Finance
// offer sample documents to add. Values are i18n keys unless noted (csv* = literal).
const TEAM = {
  hr: {
    hasJD: true, showFit: true, samples: false,
    section: "hr.cv.section", upload: "hr.cv.upload", hint: "hr.cv.hint", none: "hr.cv.none",
    screen: "hr.screen", results: "hr.results", need: "hr.needBoth",
    pass: "hr.pass", fail: "hr.fail",
    unit: "hr.summary.screened", sPass: "hr.summary.passed", sBlock: "hr.summary.blocked",
    csvSafe: "Passed", csvBlock: "Not passed - cheating detected",
  },
  legal: {
    hasJD: false, showFit: false, samples: true,
    section: "legal.section", upload: "legal.upload", hint: "hr.cv.hint", none: "legal.none",
    screen: "legal.screen", results: "legal.results", need: "legal.need",
    pass: "batch.safe", fail: "batch.blocked",
    unit: "legal.unit", sPass: "batch.summary.safe", sBlock: "batch.summary.blocked",
    csvSafe: "Safe", csvBlock: "Blocked - injection detected",
  },
  finance: {
    hasJD: false, showFit: false, samples: true,
    section: "finance.section", upload: "finance.upload", hint: "hr.cv.hint", none: "finance.none",
    screen: "finance.screen", results: "finance.results", need: "finance.need",
    pass: "batch.safe", fail: "batch.blocked",
    unit: "finance.unit", sPass: "batch.summary.safe", sBlock: "batch.summary.blocked",
    csvSafe: "Safe", csvBlock: "Blocked - injection detected",
  },
};

let me = null;
let cfg = null;
let jd = null;            // {title, text, filename} for HR
let items = [];           // things to screen: {kind:'file', file, name} | {kind:'sample', id, name}
let samples = [];         // seeded sample docs (Legal/Finance): {id, label, filename, kind, ...}
let results = [];         // [{name, verdict, fit, category, excerpt}] in display order

// ── Setup ────────────────────────────────────────────────────────────────
async function init() {
  applyStaticI18n();
  try {
    const res = await fetch("/api/me");
    if (res.status === 401) { window.location.href = "/login"; return; }
    me = await res.json();
  } catch (_) { window.location.href = "/login"; return; }
  cfg = TEAM[me.team];

  $("identity").textContent = `${me.name} · ${t(`team.${me.team}.label`)}`;
  $("ws-title").textContent = t(`team.${me.team}.title`);
  $("ws-blurb").textContent = t(`team.${me.team}.blurb`);

  $("signout").addEventListener("click", signOut);
  $("help-btn").addEventListener("click", openHelp);
  $("help-close").addEventListener("click", () => hideModal("help-modal"));
  $("help-modal").addEventListener("click", (e) => { if (e.target === $("help-modal")) hideModal("help-modal"); });
  $("onboard-dismiss").addEventListener("click", dismissOnboard);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAnyModal(); });

  $("jd-input").addEventListener("change", onJdPicked);
  $("docs-input").addEventListener("change", onDocsPicked);

  if (!localStorage.getItem("cortis_onboarded")) $("onboard").hidden = false;
  if (!sessionStorage.getItem("cortis_welcomed")) {
    sessionStorage.setItem("cortis_welcomed", "1");
    toast(`${t("toast.welcome")} ${me.name}`);
  }

  if (cfg.samples) await loadSamples();
  renderWorkspace();
}

async function signOut() {
  try { await fetch("/api/logout", { method: "POST" }); } catch (_) {}
  window.location.href = "/login";
}
function dismissOnboard() { localStorage.setItem("cortis_onboarded", "1"); $("onboard").hidden = true; }

async function loadSamples() {
  try {
    const data = await (await fetch("/api/workspace")).json();
    samples = data.docs || [];
  } catch (_) { samples = []; }
}

// ══════════════════════════ Batch controls (all teams) ══════════════════════
function renderWorkspace() {
  $("docs").innerHTML = `<div id="ws-controls"></div><div id="ws-results"></div>`;
  renderControls();
}

function section(titleText) {
  const sec = document.createElement("section"); sec.className = "hr-section";
  const h = document.createElement("h2"); h.className = "hr-section-title"; h.textContent = titleText;
  sec.appendChild(h);
  return sec;
}

function buildJdSection() {
  const jdSec = section(t("hr.jd.section"));
  if (jd) {
    const card = document.createElement("div"); card.className = "jd-box";
    const title = document.createElement("div"); title.className = "jd-title"; title.textContent = jd.title;
    const meta = document.createElement("div"); meta.className = "jd-meta"; meta.textContent = jd.filename;
    const text = document.createElement("pre"); text.className = "jd-text"; text.textContent = jd.text;
    const replace = mkBtn("secondary-btn", t("hr.jd.replace"), () => $("jd-input").click());
    card.appendChild(title); card.appendChild(meta); card.appendChild(text); card.appendChild(replace);
    jdSec.appendChild(card);
  } else {
    const hint = document.createElement("p"); hint.className = "muted-line"; hint.textContent = t("hr.jd.none");
    jdSec.appendChild(hint);
    jdSec.appendChild(mkBtn("primary-btn", "📄 " + t("hr.jd.upload"), () => $("jd-input").click()));
  }
  return jdSec;
}

function renderControls() {
  const box = $("ws-controls"); box.innerHTML = "";
  if (cfg.hasJD) box.appendChild(buildJdSection());

  const docSec = section(t(cfg.section));
  const row = document.createElement("div"); row.className = "upload-row";
  row.appendChild(mkBtn("primary-btn", "📎 " + t(cfg.upload), () => $("docs-input").click()));
  const hint = document.createElement("span"); hint.className = "file-hint"; hint.textContent = t(cfg.hint);
  row.appendChild(hint);
  docSec.appendChild(row);

  // Sample documents to add to the batch (Legal / Finance)
  if (cfg.samples && samples.length) {
    const sw = document.createElement("div"); sw.className = "samples-add";
    const lbl = document.createElement("span"); lbl.className = "samples-add-label"; lbl.textContent = t("samples.add");
    sw.appendChild(lbl);
    for (const s of samples) {
      const added = items.some((it) => it.kind === "sample" && it.id === s.id);
      const b = mkBtn("chip-add", (KIND_ICON[s.kind] || "📄") + " " + s.label, () => addSample(s));
      b.disabled = added;
      sw.appendChild(b);
    }
    docSec.appendChild(sw);
  }

  if (items.length) {
    const list = document.createElement("ul"); list.className = "cv-list";
    items.forEach((it, i) => {
      const li = document.createElement("li"); li.className = "cv-chip";
      const nm = document.createElement("span");
      nm.textContent = it.name + (it.kind === "sample" ? " · " + t("samples.tag") : "");
      const x = document.createElement("button"); x.className = "chip-x"; x.type = "button";
      x.setAttribute("aria-label", "Remove"); x.textContent = "✕";
      x.addEventListener("click", () => { items.splice(i, 1); renderControls(); });
      li.appendChild(nm); li.appendChild(x); list.appendChild(li);
    });
    docSec.appendChild(list);
  } else {
    const none = document.createElement("p"); none.className = "muted-line"; none.textContent = t(cfg.none);
    docSec.appendChild(none);
  }
  box.appendChild(docSec);

  const actions = document.createElement("div"); actions.className = "hr-actions";
  const screen = mkBtn("primary-btn", t(cfg.screen), screenAll);
  screen.disabled = !canScreen();
  actions.appendChild(screen);
  box.appendChild(actions);
}

function canScreen() {
  if (!items.length) return false;
  if (cfg.hasJD && !jd) return false;
  return true;
}

async function onJdPicked(e) {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast(t("err.tooLarge"), "error"); return; }
  const fd = new FormData(); fd.append("file", f);
  try {
    const res = await fetch("/api/hr/jd", { method: "POST", body: fd });
    const d = await res.json();
    if (!res.ok) { toast(d.error || t("err.generic"), "error"); return; }
    jd = { title: d.title, text: d.text, filename: d.filename };
    renderControls();
  } catch (_) { toast(t("err.network"), "error"); }
}

function onDocsPicked(e) {
  const picked = [...e.target.files]; e.target.value = "";
  for (const f of picked) {
    if (items.length >= MAX_ITEMS) { toast(t("hr.cv.max"), "error"); break; }
    if (f.size > 5 * 1024 * 1024) { toast(t("err.tooLarge"), "error"); continue; }
    items.push({ kind: "file", file: f, name: f.name });
  }
  renderControls();
}

function addSample(s) {
  if (items.length >= MAX_ITEMS) { toast(t("hr.cv.max"), "error"); return; }
  if (items.some((it) => it.kind === "sample" && it.id === s.id)) return;
  items.push({ kind: "sample", id: s.id, name: s.label });
  renderControls();
}

// ══════════════════════════ Screen the batch → results table ════════════════
async function screenAll() {
  if (!canScreen()) { toast(t(cfg.need), "error"); return; }
  results = [];
  const out = $("ws-results"); out.innerHTML = "";
  const head = document.createElement("div"); head.className = "results-head";
  const h = document.createElement("h2"); h.className = "hr-section-title"; h.textContent = t(cfg.results);
  const actions = document.createElement("div"); actions.className = "results-actions";
  const summary = document.createElement("span"); summary.className = "results-summary"; summary.id = "results-summary";
  const exportBtn = mkBtn("secondary-btn", "⤓ " + t("hr.export"), exportCsv);
  exportBtn.id = "export-btn"; exportBtn.disabled = true;
  actions.appendChild(summary); actions.appendChild(exportBtn);
  head.appendChild(h); head.appendChild(actions);
  out.appendChild(head);

  const list = document.createElement("div"); list.className = "cv-results"; out.appendChild(list);
  out.scrollIntoView({ behavior: "smooth", block: "start" });

  let done = 0;
  const rows = items.map((it) => ({ item: it, el: null, result: null }));
  const jobs = rows.map((row) => {
    const rowEl = document.createElement("details"); rowEl.className = "cv-result screening";
    rowEl.innerHTML = `<summary class="cv-result-head"><span class="crh-icon">⏳</span>` +
      `<span class="crh-name"></span><span class="crh-status">${t("hr.screeningOne")}</span></summary>` +
      `<div class="cv-result-body"></div>`;
    rowEl.querySelector(".crh-name").textContent = row.item.name;
    list.appendChild(rowEl);
    row.el = rowEl;
    return screenOne(row.item)
      .then((d) => { fillRow(rowEl, d); row.result = toResult(row.item, d); })
      .catch(() => { fillRow(rowEl, null); row.result = toResult(row.item, null); })
      .finally(() => { done++; $("results-summary").textContent = `${done}/${rows.length} ${t(cfg.unit)}…`; });
  });
  await Promise.all(jobs);
  finalizeResults(list, rows);
}

async function screenOne(item) {
  const fd = new FormData();
  if (item.kind === "file") fd.append("file", item.file);
  else fd.append("item", item.id);
  if (cfg.hasJD && jd) fd.append("jd", jd.text);
  fd.append("lang", currentLang());
  const res = await fetch("/api/check", { method: "POST", body: fd });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "err");
  return d;
}

function toResult(item, d) {
  if (!d) return { name: item.name, verdict: "error", fit: "", category: "", excerpt: "" };
  return {
    name: item.name,
    verdict: d.verdict,
    fit: d.verdict === "safe" ? (d.fit_level || "") : "",
    category: d.verdict !== "safe" ? (d.category || "") : "",
    excerpt: d.matched_excerpt || "",
  };
}

// After every document is screened: show the tally, and rank the rows so the ones
// that need attention (blocked/errors) sit on top, then (HR) the strongest fits.
function finalizeResults(list, rows) {
  const done = rows.filter((r) => r.result);
  const safe = done.filter((r) => r.result.verdict === "safe").length;
  const blocked = done.length - safe;
  $("results-summary").textContent =
    `${done.length} ${t(cfg.unit)} · ${safe} ${t(cfg.sPass)} · ${blocked} ${t(cfg.sBlock)}`;

  const fitRank = { strong: 0, partial: 1, weak: 2 };
  const rank = (r) => {
    if (r.result.verdict !== "safe") return -1;                 // flagged first
    if (!cfg.showFit) return 10;
    const f = r.result.fit.toLowerCase();
    return 10 + (f in fitRank ? fitRank[f] : 3);                 // then Strong→Partial→Weak→unassessed
  };
  const sorted = done.sort((a, b) => rank(a) - rank(b) || a.result.name.localeCompare(b.result.name));
  for (const r of sorted) list.appendChild(r.el);               // re-append in ranked order
  results = sorted.map((r) => r.result);
  const btn = $("export-btn"); if (btn) btn.disabled = results.length === 0;
}

function fillRow(rowEl, d) {
  rowEl.classList.remove("screening");
  const icon = rowEl.querySelector(".crh-icon");
  const status = rowEl.querySelector(".crh-status");
  const body = rowEl.querySelector(".cv-result-body");
  body.innerHTML = "";

  if (!d) {
    rowEl.classList.add("row-blocked"); icon.textContent = "⚠️";
    status.textContent = t("err.generic"); return;
  }
  const cat = d.category && d.category !== "none" ? d.category : "generic";
  if (d.verdict === "safe") {
    rowEl.classList.add("row-safe"); icon.textContent = "✅";
    status.innerHTML = `<span class="pill pill-safe">${t(cfg.pass)}</span>`;
    if (cfg.showFit) {
      const lvl = (d.fit_level || "").toLowerCase();
      const badge = document.createElement("span");
      badge.className = "fit-badge fit-" + (lvl || "unknown");
      badge.textContent = lvl ? t(`fit.${lvl}`) : t("fit.unknown");
      status.appendChild(badge);
    }
    if (d.assistant) body.appendChild(buildAssistant(d.assistant));
  } else {
    rowEl.classList.add("row-blocked"); icon.textContent = "⛔";
    status.innerHTML = `<span class="pill pill-block">${t(cfg.fail)}</span>`;
    const expl = document.createElement("div"); expl.className = "verdict-body";
    expl.textContent = t(`finding.${cat}.explanation`);
    body.appendChild(expl);
    if (d.matched_excerpt) {
      const flag = document.createElement("div"); flag.className = "flagged";
      const ft = document.createElement("div"); ft.className = "flagged-title"; ft.textContent = t("flagged.title");
      const fx = document.createElement("blockquote"); fx.className = "flagged-text"; fx.textContent = d.matched_excerpt;
      flag.appendChild(ft); flag.appendChild(fx); body.appendChild(flag);
    }
  }
  body.appendChild(buildTech(d, cat));
  const name = rowEl.querySelector(".crh-name").textContent;
  body.appendChild(reportControl({
    source: name, verdict: d.verdict, category: d.category,
    confidence: d.confidence, excerpt: d.matched_excerpt,
  }));
}

function buildAssistant(a) {
  const wrap = document.createElement("div"); wrap.className = "assistant";
  const head = document.createElement("div"); head.className = "assistant-head";
  const label = document.createElement("span"); label.textContent = "🤖 " + t(`result.${me.team}`);
  const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = "✓ " + t("badge.checkedSafe");
  head.appendChild(label); head.appendChild(badge);
  const body = document.createElement("div");
  body.className = "assistant-body" + (a.status === "ok" ? "" : " muted"); body.textContent = a.text;
  wrap.appendChild(head); wrap.appendChild(body); return wrap;
}

function buildTech(data, cat) {
  const details = document.createElement("details"); details.className = "tech";
  const summary = document.createElement("summary"); summary.textContent = t("tech.summary"); details.appendChild(summary);
  const grid = document.createElement("dl"); grid.className = "tech-grid";
  const safe = data.verdict === "safe";
  const rows = [
    [t("tech.decision"), safe ? t("tech.allowed") : t("tech.blocked")],
    [t("tech.finding"), safe ? t("mon.noThreat") : t(`finding.${cat}.label`)],
    [t("tech.likelihood"), Math.round((data.confidence || 0) * 100) + "%"],
  ];
  for (const [k, val] of rows) {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = val;
    grid.appendChild(dt); grid.appendChild(dd);
  }
  details.appendChild(grid); return details;
}

// Download the ranked results as CSV (canonical English; BOM so Excel reads UTF-8).
function exportCsv() {
  if (!results.length) return;
  const esc = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  const header = ["Document", "Result"]
    .concat(cfg.showFit ? ["Fit"] : [])
    .concat(["Issue", "Flagged passage"])
    .concat(cfg.hasJD ? ["Job description"] : []);
  const lines = [header.join(",")];
  for (const r of results) {
    const result = r.verdict === "safe" ? cfg.csvSafe : (r.verdict === "error" ? "Error" : cfg.csvBlock);
    const cols = [r.name, result];
    if (cfg.showFit) cols.push(r.verdict === "safe" ? (r.fit ? cap(r.fit) : "Not assessed") : "");
    cols.push(r.category, r.excerpt);
    if (cfg.hasJD) cols.push(jd ? jd.title : "");
    lines.push(cols.map(esc).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `cortis-${me.team}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("hr.export") + " ✓");
}

function openHelp() {
  $("help-general").textContent = t("help.general");
  $("help-team").textContent = t(`help.${me.team}`);
  showModal("help-modal");
}

// ── Report to Security (closes the loop with the monitoring team) ─────────────
// snapshot: {source, verdict, category, confidence, excerpt}. A blocked result can
// be flagged as a false positive or escalated as a real threat; a safe result can
// be reported as a possible miss. The report lands in the Security monitoring feed.
function reportControl(snapshot) {
  const wrap = document.createElement("div"); wrap.className = "report";
  const openBtn = () => mkBtn("link-btn report-open", "🚩 " + t("report.btn"), openForm);
  const reset = () => { wrap.innerHTML = ""; wrap.appendChild(openBtn()); };

  function openForm() {
    wrap.innerHTML = "";
    const form = document.createElement("div"); form.className = "report-form";
    const sel = document.createElement("select"); sel.className = "report-reason";
    sel.setAttribute("aria-label", t("report.title"));
    const types = snapshot.verdict === "safe" ? ["missed_threat"] : ["false_positive", "threat"];
    for (const ty of types) {
      const o = document.createElement("option"); o.value = ty; o.textContent = t(`report.reason.${ty}`); sel.appendChild(o);
    }
    const note = document.createElement("input"); note.type = "text"; note.className = "report-note";
    note.placeholder = t("report.note.ph"); note.maxLength = 500;
    const actions = document.createElement("div"); actions.className = "report-actions";
    actions.appendChild(mkBtn("primary-btn small", t("report.send"), () => submit(sel.value, note.value)));
    actions.appendChild(mkBtn("secondary-btn small", t("report.cancel"), reset));
    form.appendChild(sel); form.appendChild(note); form.appendChild(actions);
    wrap.appendChild(form); sel.focus();
  }

  async function submit(type, reason) {
    const fd = new FormData();
    fd.append("report_type", type);
    fd.append("reason", reason || "");
    fd.append("source", snapshot.source || "");
    fd.append("verdict", snapshot.verdict || "");
    fd.append("category", snapshot.category || "");
    fd.append("confidence", snapshot.confidence != null ? String(snapshot.confidence) : "");
    fd.append("excerpt", snapshot.excerpt || "");
    try {
      const res = await fetch("/api/report", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      wrap.innerHTML = ""; const done = document.createElement("span");
      done.className = "report-done"; done.textContent = t("report.sent"); wrap.appendChild(done);
      toast(t("report.sent"));
    } catch (_) { toast(t("report.error"), "error"); }
  }

  wrap.appendChild(openBtn());
  return wrap;
}

// ── Toasts ───────────────────────────────────────────────────────────────────
function toast(msg, type) {
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " toast-error" : ""); el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3800);
}

// ── Modal helpers (help modal; focus trap) ───────────────────────────────────
let lastFocused = null;
function focusables(modal) {
  return [...modal.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
    .filter((x) => !x.disabled && x.offsetParent !== null);
}
function trapKeydown(e) {
  if (e.key !== "Tab") return;
  const list = focusables(e.currentTarget); if (!list.length) return;
  const first = list[0], last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function showModal(id) {
  lastFocused = document.activeElement;
  const overlay = $(id); overlay.hidden = false;
  const modal = overlay.querySelector(".modal"); modal.addEventListener("keydown", trapKeydown);
  const f = focusables(modal); if (f.length) f[0].focus();
}
function hideModal(id) {
  const overlay = $(id); overlay.hidden = true;
  overlay.querySelector(".modal").removeEventListener("keydown", trapKeydown);
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}
function closeAnyModal() { if (!$("help-modal").hidden) hideModal("help-modal"); }

function mkBtn(cls, label, onClick) {
  const b = document.createElement("button"); b.className = cls; b.type = "button"; b.textContent = label;
  b.addEventListener("click", onClick); return b;
}

init();
