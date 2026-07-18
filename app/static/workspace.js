"use strict";

const $ = (id) => document.getElementById(id);
const { t, currentLang, applyStaticI18n } = window.I18N;
const KIND_ICON = { "PDF document": "📕", "Word document": "📘", "Text document": "📄" };
const MAX_CVS = 10;

let me = null;
let jd = null;            // {title, text, filename} for HR
let cvs = [];             // File[] for HR
let hrResults = [];       // [{name, verdict, fit, category, excerpt}] in display order

// ── Setup ────────────────────────────────────────────────────────────────
async function init() {
  applyStaticI18n();
  try {
    const res = await fetch("/api/me");
    if (res.status === 401) { window.location.href = "/login"; return; }
    me = await res.json();
  } catch (_) { window.location.href = "/login"; return; }

  $("identity").textContent = `${me.name} · ${t(`team.${me.team}.label`)}`;
  $("ws-title").textContent = t(`team.${me.team}.title`);
  $("ws-blurb").textContent = t(`team.${me.team}.blurb`);

  $("signout").addEventListener("click", signOut);
  $("help-btn").addEventListener("click", openHelp);
  $("help-close").addEventListener("click", () => hideModal("help-modal"));
  $("help-modal").addEventListener("click", (e) => { if (e.target === $("help-modal")) hideModal("help-modal"); });
  $("modal-close").addEventListener("click", () => hideModal("doc-modal"));
  $("doc-modal").addEventListener("click", (e) => { if (e.target === $("doc-modal")) hideModal("doc-modal"); });
  $("onboard-dismiss").addEventListener("click", dismissOnboard);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAnyModal(); });

  $("jd-input").addEventListener("change", onJdPicked);
  $("cv-input").addEventListener("change", onCvsPicked);
  $("upload-input").addEventListener("change", onUploadPicked);

  if (!localStorage.getItem("cortis_onboarded")) $("onboard").hidden = false;
  if (!sessionStorage.getItem("cortis_welcomed")) {
    sessionStorage.setItem("cortis_welcomed", "1");
    toast(`${t("toast.welcome")} ${me.name}`);
  }

  if (me.team === "hr") renderHR();
  else loadList();
}

async function signOut() {
  try { await fetch("/api/logout", { method: "POST" }); } catch (_) {}
  window.location.href = "/login";
}
function dismissOnboard() { localStorage.setItem("cortis_onboarded", "1"); $("onboard").hidden = true; }

// ══════════════════════════ HR: upload JD + CVs, batch screen ═══════════════
function renderHR() {
  const docs = $("docs");
  docs.innerHTML = `<div id="hr-controls"></div><div id="hr-results"></div>`;
  renderHRControls();
}

function renderHRControls() {
  const box = $("hr-controls");
  box.innerHTML = "";

  // JD section
  const jdSec = section(t("hr.jd.section"));
  if (jd) {
    const card = document.createElement("div");
    card.className = "jd-box";
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
  box.appendChild(jdSec);

  // CV section
  const cvSec = section(t("hr.cv.section"));
  const row = document.createElement("div"); row.className = "upload-row";
  row.appendChild(mkBtn("primary-btn", "📎 " + t("hr.cv.upload"), () => $("cv-input").click()));
  const hint = document.createElement("span"); hint.className = "file-hint"; hint.textContent = t("hr.cv.hint");
  row.appendChild(hint);
  cvSec.appendChild(row);

  if (cvs.length) {
    const list = document.createElement("ul"); list.className = "cv-list";
    cvs.forEach((f, i) => {
      const li = document.createElement("li"); li.className = "cv-chip";
      const nm = document.createElement("span"); nm.textContent = f.name;
      const x = document.createElement("button"); x.className = "chip-x"; x.type = "button";
      x.setAttribute("aria-label", "Remove"); x.textContent = "✕";
      x.addEventListener("click", () => { cvs.splice(i, 1); renderHRControls(); });
      li.appendChild(nm); li.appendChild(x); list.appendChild(li);
    });
    cvSec.appendChild(list);
  } else {
    const none = document.createElement("p"); none.className = "muted-line"; none.textContent = t("hr.cv.none");
    cvSec.appendChild(none);
  }
  box.appendChild(cvSec);

  // Screen button
  const actions = document.createElement("div"); actions.className = "hr-actions";
  const screen = mkBtn("primary-btn", t("hr.screen"), screenAll);
  screen.disabled = !(jd && cvs.length);
  actions.appendChild(screen);
  box.appendChild(actions);
}

function section(titleText) {
  const sec = document.createElement("section"); sec.className = "hr-section";
  const h = document.createElement("h2"); h.className = "hr-section-title"; h.textContent = titleText;
  sec.appendChild(h);
  return sec;
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
    renderHRControls();
  } catch (_) { toast(t("err.network"), "error"); }
}

function onCvsPicked(e) {
  const picked = [...e.target.files]; e.target.value = "";
  for (const f of picked) {
    if (cvs.length >= MAX_CVS) { toast(t("hr.cv.max"), "error"); break; }
    cvs.push(f);
  }
  renderHRControls();
}

async function screenAll() {
  if (!jd || !cvs.length) { toast(t("hr.needBoth"), "error"); return; }
  hrResults = [];
  const out = $("hr-results");
  out.innerHTML = "";
  const head = document.createElement("div"); head.className = "results-head";
  const h = document.createElement("h2"); h.className = "hr-section-title"; h.textContent = t("hr.results");
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
  const rows = cvs.map((cv) => ({ cv, el: null, result: null }));
  const jobs = rows.map((row) => {
    const rowEl = document.createElement("details"); rowEl.className = "cv-result screening";
    rowEl.innerHTML = `<summary class="cv-result-head"><span class="crh-icon">⏳</span>` +
      `<span class="crh-name"></span><span class="crh-status">${t("hr.screeningOne")}</span></summary>` +
      `<div class="cv-result-body"></div>`;
    rowEl.querySelector(".crh-name").textContent = row.cv.name;
    list.appendChild(rowEl);
    row.el = rowEl;
    return screenOne(row.cv)
      .then((d) => { fillRow(rowEl, d); row.result = toResult(row.cv, d); })
      .catch(() => { fillRow(rowEl, null); row.result = toResult(row.cv, null); })
      .finally(() => { done++; $("results-summary").textContent = `${done}/${rows.length} ${t("hr.summary.screened")}…`; });
  });
  await Promise.all(jobs);
  finalizeResults(list, rows);
}

function toResult(cv, d) {
  if (!d) return { name: cv.name, verdict: "error", fit: "", category: "", excerpt: "" };
  return {
    name: cv.name,
    verdict: d.verdict,
    fit: d.verdict === "safe" ? (d.fit_level || "") : "",
    category: d.verdict !== "safe" ? (d.category || "") : "",
    excerpt: d.matched_excerpt || "",
  };
}

// After every CV is screened: show the tally, and rank the rows so the ones that
// need attention (cheating/errors) sit on top, then the strongest fits first.
function finalizeResults(list, rows) {
  const done = rows.filter((r) => r.result);
  const passed = done.filter((r) => r.result.verdict === "safe").length;
  const blocked = done.length - passed;
  $("results-summary").textContent =
    `${done.length} ${t("hr.summary.screened")} · ${passed} ${t("hr.summary.passed")} · ${blocked} ${t("hr.summary.blocked")}`;

  const fitRank = { strong: 0, partial: 1, weak: 2 };
  const rank = (r) => {
    if (r.result.verdict !== "safe") return -1;                      // flagged first
    const f = r.result.fit.toLowerCase();
    return 10 + (f in fitRank ? fitRank[f] : 3);                     // then Strong→Partial→Weak→unassessed
  };
  const sorted = done.sort((a, b) => rank(a) - rank(b) || a.result.name.localeCompare(b.result.name));
  for (const r of sorted) list.appendChild(r.el);                    // re-append in ranked order
  hrResults = sorted.map((r) => r.result);
  const btn = $("export-btn"); if (btn) btn.disabled = hrResults.length === 0;
}

// Download the ranked shortlist as CSV (canonical English so it drops cleanly into
// a spreadsheet / ATS; BOM so Excel reads UTF-8 names correctly).
function exportCsv() {
  if (!hrResults.length) return;
  const esc = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  const header = ["Candidate", "Result", "Fit", "Issue", "Flagged passage", "Job description"];
  const lines = [header.join(",")];
  for (const r of hrResults) {
    const result = r.verdict === "safe" ? "Passed"
      : (r.verdict === "error" ? "Error" : "Not passed - cheating detected");
    const fit = r.verdict === "safe" ? (r.fit ? cap(r.fit) : "Not assessed") : "";
    lines.push([r.name, result, fit, r.category, r.excerpt, jd ? jd.title : ""].map(esc).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `cortis-screening-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("hr.export") + " ✓");
}

async function screenOne(cv) {
  const fd = new FormData();
  fd.append("file", cv);
  fd.append("jd", jd.text);
  fd.append("lang", currentLang());
  const res = await fetch("/api/check", { method: "POST", body: fd });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "err");
  return d;
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
  if (d.verdict === "safe") {
    rowEl.classList.add("row-safe"); icon.textContent = "✅";
    const lvl = (d.fit_level || "").toLowerCase();
    const fitText = lvl ? t(`fit.${lvl}`) : t("fit.unknown");
    status.innerHTML = `<span class="pill pill-safe">${t("hr.pass")}</span>` +
      `<span class="fit-badge fit-${lvl || "unknown"}"></span>`;
    status.querySelector(".fit-badge").textContent = fitText;
    const a = d.assistant || {};
    const p = document.createElement("div");
    p.className = "assistant-body" + (a.status === "ok" ? "" : " muted");
    p.textContent = a.text || "";
    body.appendChild(p);
  } else {
    rowEl.classList.add("row-blocked"); icon.textContent = "⛔";
    status.innerHTML = `<span class="pill pill-block">${t("hr.fail")}</span>`;
    const cat = d.category && d.category !== "none" ? d.category : "generic";
    const expl = document.createElement("div"); expl.className = "verdict-body"; expl.textContent = t(`finding.${cat}.explanation`);
    body.appendChild(expl);
    if (d.matched_excerpt) {
      const flag = document.createElement("div"); flag.className = "flagged";
      const ft = document.createElement("div"); ft.className = "flagged-title"; ft.textContent = t("flagged.title");
      const fx = document.createElement("blockquote"); fx.className = "flagged-text"; fx.textContent = d.matched_excerpt;
      flag.appendChild(ft); flag.appendChild(fx); body.appendChild(flag);
    }
  }
  const name = rowEl.querySelector(".crh-name").textContent;
  body.appendChild(reportControl({
    source: name, verdict: d.verdict, category: d.category,
    confidence: d.confidence, excerpt: d.matched_excerpt,
  }));
}

// ══════════════════════════ Legal / Finance: samples + upload ═══════════════
async function loadList() {
  const docs = $("docs");
  const upload = document.createElement("div"); upload.className = "upload-row upload-primary";
  upload.appendChild(mkBtn("primary-btn", "📎 " + t(`upload.${me.team}`), () => $("upload-input").click()));
  docs.innerHTML = "";
  docs.appendChild(upload);

  let data;
  try { data = await (await fetch("/api/workspace")).json(); }
  catch (_) { const p = document.createElement("p"); p.className = "loading-line"; p.textContent = t("ws.loadFail"); docs.appendChild(p); return; }

  if (data.docs && data.docs.length) {
    const h = document.createElement("h2"); h.className = "hr-section-title samples-title"; h.textContent = t("samples.title");
    docs.appendChild(h);
    const grid = document.createElement("div"); grid.className = "doc-grid";
    for (const d of data.docs) grid.appendChild(renderCard(d));
    docs.appendChild(grid);
  }
}

function renderCard(d) {
  const card = document.createElement("button");
  card.className = "doc-card"; card.type = "button";
  card.innerHTML = `<span class="dc-icon" aria-hidden="true"></span><span class="dc-body"><span class="dc-label"></span><span class="dc-sub"></span></span>`;
  card.querySelector(".dc-icon").textContent = KIND_ICON[d.kind] || "📄";
  card.querySelector(".dc-label").textContent = d.label;
  card.querySelector(".dc-sub").textContent = `${d.sub ? d.sub + " · " : ""}${d.filename} · ${d.size_kb} KB`;
  card.addEventListener("click", () => openDoc(d));
  return card;
}

function onUploadPicked(e) {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast(t("err.tooLarge"), "error"); return; }
  $("modal-title").textContent = f.name;
  showModal("doc-modal");
  doCheck({ file: f });
}

// Seeded sample: show context, then check
function openDoc(d) {
  $("modal-title").textContent = d.label;
  const body = $("modal-body"); body.innerHTML = "";
  const ctx = document.createElement("div"); ctx.className = "ctx";
  const line = (k, v) => {
    const r = document.createElement("div"); r.className = "ctx-line";
    const kk = document.createElement("span"); kk.className = "ctx-k"; kk.textContent = k;
    const vv = document.createElement("span"); vv.textContent = v;
    r.appendChild(kk); r.appendChild(vv); return r;
  };
  ctx.appendChild(line(me.team === "legal" ? t("modal.agreement") : t("modal.invoice"), d.label + (d.sub ? " · " + d.sub : "")));
  ctx.appendChild(line(t("modal.file"), `${d.filename} · ${d.kind} · ${d.size_kb} KB`));
  body.appendChild(ctx);
  const note = document.createElement("p"); note.className = "ctx-note"; note.textContent = t(`note.${me.team}`);
  body.appendChild(note);
  const foot = document.createElement("div"); foot.className = "modal-foot";
  foot.appendChild(mkBtn("secondary-btn", t("btn.cancel"), () => hideModal("doc-modal")));
  foot.appendChild(mkBtn("primary-btn", t(`team.${me.team}.action`), (e) => doCheck({ item: d.id }, e.target)));
  body.appendChild(foot);
  showModal("doc-modal");
}

async function doCheck(payload, triggerBtn) {
  const body = $("modal-body");
  if (triggerBtn) triggerBtn.disabled = true;
  body.innerHTML = `<div class="status"><div class="spinner"></div><span>${t("check.status")}</span></div>`;
  const fd = new FormData();
  if (payload.item) fd.append("item", payload.item);
  if (payload.file) fd.append("file", payload.file);
  fd.append("lang", currentLang());
  let d;
  try {
    const res = await fetch("/api/check", { method: "POST", body: fd });
    d = await res.json();
    if (!res.ok) { renderModalError(d.error || t("err.generic")); return; }
  } catch (_) { renderModalError(t("err.network")); return; }
  renderResult(d);
}

function renderResult(data) {
  const safe = data.verdict === "safe";
  const cat = data.category && data.category !== "none" ? data.category : "generic";
  const body = $("modal-body"); body.innerHTML = "";
  const v = document.createElement("div"); v.className = "verdict " + (safe ? "safe" : "blocked");
  const head = document.createElement("div"); head.className = "verdict-head";
  head.innerHTML = `<div class="verdict-icon">${safe ? "✓" : "✕"}</div><h2 class="verdict-title"></h2>`;
  head.querySelector(".verdict-title").textContent = t(`verdict.${data.verdict}.headline`);
  v.appendChild(head);
  const expl = document.createElement("div"); expl.className = "verdict-body";
  expl.textContent = safe ? t("verdict.safe.explanation") : t(`finding.${cat}.explanation`);
  v.appendChild(expl);
  const src = document.createElement("div"); src.className = "source-line";
  src.textContent = `${t("source.checked")} ${data.source}`; v.appendChild(src);
  if (!safe && data.matched_excerpt) {
    const flag = document.createElement("div"); flag.className = "flagged";
    const ft = document.createElement("div"); ft.className = "flagged-title"; ft.textContent = t("flagged.title");
    const fx = document.createElement("blockquote"); fx.className = "flagged-text"; fx.textContent = data.matched_excerpt;
    flag.appendChild(ft); flag.appendChild(fx); v.appendChild(flag);
  }
  if (!safe) {
    const ns = document.createElement("div"); ns.className = "next-step";
    const s = document.createElement("strong"); s.textContent = t("nextstep.title");
    ns.appendChild(s); ns.appendChild(document.createTextNode(t("nextstep.blocked"))); v.appendChild(ns);
  }
  v.appendChild(buildTech(data, cat));
  body.appendChild(v);
  if (safe && data.assistant) body.appendChild(buildAssistant(data.assistant));
  body.appendChild(reportControl({
    source: data.source, verdict: data.verdict, category: data.category,
    confidence: data.confidence, excerpt: data.matched_excerpt,
  }));
  const foot = document.createElement("div"); foot.className = "modal-foot";
  foot.appendChild(mkBtn("primary-btn", t("btn.done"), () => hideModal("doc-modal")));
  body.appendChild(foot);
  refocusModal("doc-modal");
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
  if (data.matched_excerpt) {
    const ex = document.createElement("div"); ex.className = "tech-excerpt";
    ex.textContent = t("tech.passage") + "\n" + data.matched_excerpt; grid.appendChild(ex);
  }
  details.appendChild(grid); return details;
}

function renderModalError(msg) {
  const body = $("modal-body"); body.innerHTML = "";
  const div = document.createElement("div"); div.className = "inline-error"; div.textContent = msg; body.appendChild(div);
  const foot = document.createElement("div"); foot.className = "modal-foot";
  foot.appendChild(mkBtn("secondary-btn", t("btn.close"), () => hideModal("doc-modal")));
  body.appendChild(foot); refocusModal("doc-modal");
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

// ── Modal helpers (focus trap) ───────────────────────────────────────────────
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
function refocusModal(id) { const f = focusables($(id).querySelector(".modal")); if (f.length) f[0].focus(); }
function hideModal(id) {
  const overlay = $(id); overlay.hidden = true;
  overlay.querySelector(".modal").removeEventListener("keydown", trapKeydown);
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}
function closeAnyModal() { for (const id of ["doc-modal", "help-modal"]) if (!$(id).hidden) hideModal(id); }

function mkBtn(cls, label, onClick) {
  const b = document.createElement("button"); b.className = cls; b.type = "button"; b.textContent = label;
  b.addEventListener("click", onClick); return b;
}

init();
