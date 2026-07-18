"use strict";

const $ = (id) => document.getElementById(id);
const { t, currentLang, applyStaticI18n } = window.I18N;
const KIND_ICON = { "PDF document": "📕", "Word document": "📘", "Text document": "📄" };

let me = null;

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
  $("paste-btn").addEventListener("click", openPaste);
  $("paste-close").addEventListener("click", () => hideModal("paste-modal"));
  $("paste-cancel").addEventListener("click", () => hideModal("paste-modal"));
  $("paste-modal").addEventListener("click", (e) => { if (e.target === $("paste-modal")) hideModal("paste-modal"); });
  $("paste-run").addEventListener("click", runPaste);
  $("onboard-dismiss").addEventListener("click", dismissOnboard);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAnyModal(); });

  if (!localStorage.getItem("cortis_onboarded")) $("onboard").hidden = false;
  if (!sessionStorage.getItem("cortis_welcomed")) {
    sessionStorage.setItem("cortis_welcomed", "1");
    toast(`${t("toast.welcome")} ${me.name}`);
  }
  loadWorkspace();
}

async function signOut() {
  try { await fetch("/api/logout", { method: "POST" }); } catch (_) {}
  window.location.href = "/login";
}

function dismissOnboard() { localStorage.setItem("cortis_onboarded", "1"); $("onboard").hidden = true; }

// ── Documents ────────────────────────────────────────────────────────────
async function loadWorkspace() {
  const docs = $("docs");
  let data;
  try {
    data = await (await fetch("/api/workspace")).json();
  } catch (_) {
    docs.innerHTML = `<p class="loading-line">${t("ws.loadFail")}</p>`;
    return;
  }
  docs.innerHTML = "";
  const empty = (data.mode === "grouped" && !data.groups.length) ||
                (data.mode === "list" && !data.docs.length);
  if (empty) { docs.innerHTML = `<p class="empty-state">${t("ws.empty")}</p>`; return; }

  if (data.mode === "grouped") {
    for (const g of data.groups) docs.appendChild(renderGroup(g));
  } else {
    const grid = document.createElement("div");
    grid.className = "doc-grid";
    for (const d of data.docs) grid.appendChild(renderCard(d, { sub: d.sub }));
    docs.appendChild(grid);
  }
}

function renderGroup(g) {
  const sec = document.createElement("section");
  sec.className = "position";
  const head = document.createElement("div");
  head.className = "position-head";
  head.innerHTML = `<div class="position-title"></div><div class="position-dept"></div>`;
  head.querySelector(".position-title").textContent = g.title;
  const word = g.docs.length === 1 ? t("ws.applicant") : t("ws.applicants");
  head.querySelector(".position-dept").textContent = `${g.department} · ${g.docs.length} ${word}`;
  sec.appendChild(head);

  const req = document.createElement("ul");
  req.className = "position-req";
  for (const r of g.requirements) { const li = document.createElement("li"); li.textContent = r; req.appendChild(li); }
  sec.appendChild(req);

  const grid = document.createElement("div");
  grid.className = "doc-grid";
  for (const d of g.docs) grid.appendChild(renderCard(d, { position: g }));
  sec.appendChild(grid);
  return sec;
}

function renderCard(d, extra) {
  const card = document.createElement("button");
  card.className = "doc-card";
  card.type = "button";
  card.innerHTML =
    `<span class="dc-icon" aria-hidden="true"></span>` +
    `<span class="dc-body"><span class="dc-label"></span><span class="dc-sub"></span></span>`;
  card.querySelector(".dc-icon").textContent = KIND_ICON[d.kind] || "📄";
  card.querySelector(".dc-label").textContent = d.label;
  const sub = extra.sub ? extra.sub + " · " : "";
  card.querySelector(".dc-sub").textContent = `${sub}${d.filename} · ${d.size_kb} KB`;
  card.addEventListener("click", () => openDoc(d, extra));
  return card;
}

// ── Document modal ─────────────────────────────────────────────────────────
function openDoc(d, extra) {
  $("modal-title").textContent = d.label;
  const body = $("modal-body");
  body.innerHTML = "";

  const ctx = document.createElement("div");
  ctx.className = "ctx";
  const line = (k, v) => {
    const row = document.createElement("div"); row.className = "ctx-line";
    const kk = document.createElement("span"); kk.className = "ctx-k"; kk.textContent = k;
    const vv = document.createElement("span"); vv.textContent = v;
    row.appendChild(kk); row.appendChild(vv); return row;
  };

  if (me.team === "hr" && extra.position) {
    const p = extra.position;
    ctx.appendChild(line(t("modal.candidate"), d.label));
    ctx.appendChild(line(t("modal.applyingFor"), `${p.title} · ${p.department}`));
    const jd = document.createElement("div"); jd.className = "ctx-jd";
    const jk = document.createElement("div"); jk.className = "ctx-k"; jk.textContent = t("modal.roleReq");
    const jl = document.createElement("ul");
    for (const r of p.requirements) { const li = document.createElement("li"); li.textContent = r; jl.appendChild(li); }
    jd.appendChild(jk); jd.appendChild(jl); ctx.appendChild(jd);
  } else {
    if (extra.sub) ctx.appendChild(line(me.team === "legal" ? t("modal.agreement") : t("modal.invoice"), d.label + " · " + extra.sub));
    ctx.appendChild(line(t("modal.file"), `${d.filename} · ${d.kind} · ${d.size_kb} KB`));
  }
  body.appendChild(ctx);

  const note = document.createElement("p");
  note.className = "ctx-note";
  note.textContent = t(`note.${me.team}`);
  body.appendChild(note);

  const foot = document.createElement("div");
  foot.className = "modal-foot";
  const cancel = mkBtn("secondary-btn", t("btn.cancel"), () => hideModal("doc-modal"));
  const action = mkBtn("primary-btn", t(`team.${me.team}.action`), () => doCheck({ item: d.id }, action));
  foot.appendChild(cancel); foot.appendChild(action);
  body.appendChild(foot);

  showModal("doc-modal");
}

// ── Run a check + render result ─────────────────────────────────────────────
async function doCheck(payload, triggerBtn) {
  const body = $("modal-body");
  if (triggerBtn) triggerBtn.disabled = true;
  body.innerHTML = `<div class="status"><div class="spinner"></div><span>${t("check.status")}</span></div>`;

  const fd = new FormData();
  if (payload.item) fd.append("item", payload.item);
  if (payload.text) fd.append("text", payload.text);
  fd.append("lang", currentLang());

  let data;
  try {
    const res = await fetch("/api/check", { method: "POST", body: fd });
    data = await res.json();
    if (!res.ok) { renderModalError(data.error || t("err.generic")); return; }
  } catch (_) {
    renderModalError(t("err.network"));
    toast(t("err.network"), "error");
    return;
  }
  renderResult(data);
}

function renderResult(data) {
  const safe = data.verdict === "safe";
  const cat = data.category && data.category !== "none" ? data.category : "generic";
  const body = $("modal-body");
  body.innerHTML = "";

  const v = document.createElement("div");
  v.className = "verdict " + (safe ? "safe" : "blocked");
  const head = document.createElement("div");
  head.className = "verdict-head";
  head.innerHTML = `<div class="verdict-icon">${safe ? "✓" : "✕"}</div><h2 class="verdict-title"></h2>`;
  head.querySelector(".verdict-title").textContent = t(`verdict.${data.verdict}.headline`);
  v.appendChild(head);

  const expl = document.createElement("div");
  expl.className = "verdict-body";
  expl.textContent = safe ? t("verdict.safe.explanation") : t(`finding.${cat}.explanation`);
  v.appendChild(expl);

  const src = document.createElement("div");
  src.className = "source-line";
  src.textContent = `${t("source.checked")} ${data.source}`;
  v.appendChild(src);

  // Inline "why blocked" — show the flagged passage in plain view (H9).
  if (!safe && data.matched_excerpt) {
    const flag = document.createElement("div");
    flag.className = "flagged";
    const ft = document.createElement("div"); ft.className = "flagged-title"; ft.textContent = t("flagged.title");
    const fx = document.createElement("blockquote"); fx.className = "flagged-text"; fx.textContent = data.matched_excerpt;
    flag.appendChild(ft); flag.appendChild(fx); v.appendChild(flag);
  }

  if (!safe) {
    const ns = document.createElement("div");
    ns.className = "next-step";
    const strong = document.createElement("strong"); strong.textContent = t("nextstep.title");
    ns.appendChild(strong); ns.appendChild(document.createTextNode(t("nextstep.blocked")));
    v.appendChild(ns);
  }
  v.appendChild(buildTech(data, cat));
  body.appendChild(v);

  if (safe && data.assistant) body.appendChild(buildAssistant(data.assistant));

  const foot = document.createElement("div");
  foot.className = "modal-foot";
  foot.appendChild(mkBtn("primary-btn", t("btn.done"), () => hideModal("doc-modal")));
  body.appendChild(foot);
  refocusModal("doc-modal");
}

function buildAssistant(a) {
  const wrap = document.createElement("div");
  wrap.className = "assistant";
  const head = document.createElement("div");
  head.className = "assistant-head";
  const label = document.createElement("span"); label.textContent = "🤖 " + t(`result.${me.team}`);
  const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = "✓ " + t("badge.checkedSafe");
  head.appendChild(label); head.appendChild(badge);
  const body = document.createElement("div");
  body.className = "assistant-body" + (a.status === "ok" ? "" : " muted");
  body.textContent = a.text;
  wrap.appendChild(head); wrap.appendChild(body);
  return wrap;
}

function buildTech(data, cat) {
  const details = document.createElement("details");
  details.className = "tech";
  const summary = document.createElement("summary"); summary.textContent = t("tech.summary");
  details.appendChild(summary);
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
    ex.textContent = t("tech.passage") + "\n" + data.matched_excerpt;
    grid.appendChild(ex);
  }
  details.appendChild(grid);
  return details;
}

function renderModalError(msg) {
  const body = $("modal-body");
  body.innerHTML = "";
  const div = document.createElement("div");
  div.className = "inline-error"; div.textContent = msg;
  body.appendChild(div);
  const foot = document.createElement("div"); foot.className = "modal-foot";
  foot.appendChild(mkBtn("secondary-btn", t("btn.close"), () => hideModal("doc-modal")));
  body.appendChild(foot);
  refocusModal("doc-modal");
}

// ── Paste text ──────────────────────────────────────────────────────────────
function openPaste() { $("paste-text").value = ""; showModal("paste-modal"); }
async function runPaste() {
  const text = $("paste-text").value.trim();
  if (!text) { $("paste-text").focus(); return; }
  hideModal("paste-modal");
  $("modal-title").textContent = t("paste.title");
  showModal("doc-modal");
  doCheck({ text });
}

// ── Help ─────────────────────────────────────────────────────────────────────
function openHelp() {
  $("help-general").textContent = t("help.general");
  $("help-team").textContent = t(`help.${me.team}`);
  showModal("help-modal");
}

// ── Toasts ───────────────────────────────────────────────────────────────────
function toast(msg, type) {
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " toast-error" : "");
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3500);
}

// ── Modal helpers (focus trap for accessibility) ─────────────────────────────
let lastFocused = null;
function focusables(modal) {
  return [...modal.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
    .filter((x) => !x.disabled && x.offsetParent !== null);
}
function trapKeydown(e) {
  if (e.key !== "Tab") return;
  const list = focusables(e.currentTarget);
  if (!list.length) return;
  const first = list[0], last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function showModal(overlayId) {
  lastFocused = document.activeElement;
  const overlay = $(overlayId); overlay.hidden = false;
  const modal = overlay.querySelector(".modal");
  modal.addEventListener("keydown", trapKeydown);
  const f = focusables(modal); if (f.length) f[0].focus();
}
function refocusModal(overlayId) {
  const f = focusables($(overlayId).querySelector(".modal")); if (f.length) f[0].focus();
}
function hideModal(overlayId) {
  const overlay = $(overlayId); overlay.hidden = true;
  overlay.querySelector(".modal").removeEventListener("keydown", trapKeydown);
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}
function closeAnyModal() {
  for (const id of ["doc-modal", "paste-modal", "help-modal"]) if (!$(id).hidden) hideModal(id);
}

function mkBtn(cls, label, onClick) {
  const b = document.createElement("button");
  b.className = cls; b.type = "button"; b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

init();
