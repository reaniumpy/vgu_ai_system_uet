"use strict";

const $ = (id) => document.getElementById(id);
const KIND_ICON = { "PDF document": "📕", "Word document": "📘", "Text document": "📄" };

let me = null;                 // {team, team_meta}
let current = null;            // context of the doc open in the modal

const RESULT_LABEL = { hr: "Candidate fit", legal: "Contract review", finance: "Invoice details" };
const ACTION_NOTE = {
  hr: "cortis will check this résumé for hidden instructions, then assess how well the candidate fits this role.",
  legal: "cortis will check this agreement for hidden instructions, then summarise the key terms and anything worth a closer look.",
  finance: "cortis will check this invoice for hidden instructions, then pull out the details for payment.",
};

// ── Setup ────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch("/api/me");
    if (res.status === 401) { window.location.href = "/login"; return; }
    me = await res.json();
  } catch (_) { window.location.href = "/login"; return; }

  const tm = me.team_meta;
  $("identity").textContent = `${me.name} · ${tm.label}`;
  $("ws-title").textContent = tm.title;
  $("ws-blurb").textContent = tm.blurb;

  $("signout").addEventListener("click", signOut);
  $("modal-close").addEventListener("click", closeDoc);
  $("doc-modal").addEventListener("click", (e) => { if (e.target === $("doc-modal")) closeDoc(); });
  $("paste-btn").addEventListener("click", openPaste);
  $("paste-close").addEventListener("click", closePaste);
  $("paste-cancel").addEventListener("click", closePaste);
  $("paste-modal").addEventListener("click", (e) => { if (e.target === $("paste-modal")) closePaste(); });
  $("paste-run").addEventListener("click", runPaste);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDoc(); closePaste(); } });

  loadWorkspace();
}

async function signOut() {
  try { await fetch("/api/logout", { method: "POST" }); } catch (_) {}
  window.location.href = "/login";
}

// ── Render the team's documents ─────────────────────────────────────────────
async function loadWorkspace() {
  const docs = $("docs");
  let data;
  try {
    data = await (await fetch("/api/workspace")).json();
  } catch (_) {
    docs.innerHTML = '<p class="loading-line">Couldn\'t load your documents. Refresh to retry.</p>';
    return;
  }
  docs.innerHTML = "";

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
  head.querySelector(".position-dept").textContent = g.department + " · " + g.docs.length +
    " applicant" + (g.docs.length === 1 ? "" : "s");
  sec.appendChild(head);

  const req = document.createElement("ul");
  req.className = "position-req";
  for (const r of g.requirements) {
    const li = document.createElement("li"); li.textContent = r; req.appendChild(li);
  }
  sec.appendChild(req);

  const grid = document.createElement("div");
  grid.className = "doc-grid";
  for (const d of g.docs) {
    grid.appendChild(renderCard(d, { position: g }));
  }
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

// ── Document modal ──────────────────────────────────────────────────────────
function openDoc(d, extra) {
  current = { id: d.id, label: d.label };
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
    ctx.appendChild(line("Candidate", d.label));
    ctx.appendChild(line("Applying for", `${p.title} · ${p.department}`));
    const jd = document.createElement("div"); jd.className = "ctx-jd";
    const jk = document.createElement("div"); jk.className = "ctx-k"; jk.textContent = "Role requirements";
    const jl = document.createElement("ul");
    for (const r of p.requirements) { const li = document.createElement("li"); li.textContent = r; jl.appendChild(li); }
    jd.appendChild(jk); jd.appendChild(jl); ctx.appendChild(jd);
  } else {
    if (extra.sub) ctx.appendChild(line(me.team === "legal" ? "Agreement" : "Invoice", d.label + " · " + extra.sub));
    ctx.appendChild(line("File", `${d.filename} · ${d.kind} · ${d.size_kb} KB`));
  }
  body.appendChild(ctx);

  const note = document.createElement("p");
  note.className = "ctx-note";
  note.textContent = ACTION_NOTE[me.team] || "";
  body.appendChild(note);

  const foot = document.createElement("div");
  foot.className = "modal-foot";
  const cancel = document.createElement("button");
  cancel.className = "secondary-btn"; cancel.type = "button"; cancel.textContent = "Cancel";
  cancel.addEventListener("click", closeDoc);
  const action = document.createElement("button");
  action.className = "primary-btn"; action.type = "button";
  action.textContent = me.team_meta.action;
  action.addEventListener("click", () => doCheck({ item: d.id }, action));
  foot.appendChild(cancel); foot.appendChild(action);
  body.appendChild(foot);

  $("doc-modal").hidden = false;
}

function closeDoc() { $("doc-modal").hidden = true; current = null; }

// ── Run a check and render the result inside the modal ──────────────────────
async function doCheck(payload, triggerBtn) {
  const body = $("modal-body");
  if (triggerBtn) triggerBtn.disabled = true;
  body.innerHTML = '<div class="status"><div class="spinner"></div><span>Checking this document…</span></div>';

  const fd = new FormData();
  if (payload.item) fd.append("item", payload.item);
  if (payload.text) fd.append("text", payload.text);

  let data;
  try {
    const res = await fetch("/api/check", { method: "POST", body: fd });
    data = await res.json();
    if (!res.ok) { renderModalError(data.error || "Something went wrong."); return; }
  } catch (_) {
    renderModalError("We couldn't reach the safety checker. Please try again.");
    return;
  }
  renderResult(data);
}

function renderResult(data) {
  const safe = data.verdict === "safe";
  const body = $("modal-body");
  body.innerHTML = "";

  const v = document.createElement("div");
  v.className = "verdict " + (safe ? "safe" : "blocked");
  const head = document.createElement("div");
  head.className = "verdict-head";
  head.innerHTML = `<div class="verdict-icon">${safe ? "✓" : "✕"}</div><h2 class="verdict-title"></h2>`;
  head.querySelector(".verdict-title").textContent = data.headline;
  v.appendChild(head);

  const expl = document.createElement("div");
  expl.className = "verdict-body"; expl.textContent = data.explanation;
  v.appendChild(expl);

  const src = document.createElement("div");
  src.className = "source-line"; src.textContent = "Checked: " + data.source;
  v.appendChild(src);

  if (!safe && data.next_step) {
    const ns = document.createElement("div");
    ns.className = "next-step";
    ns.innerHTML = "<strong>What to do next</strong>";
    ns.appendChild(document.createTextNode(data.next_step));
    v.appendChild(ns);
  }
  v.appendChild(buildTech(data));
  body.appendChild(v);

  if (safe && data.assistant) body.appendChild(buildAssistant(data.assistant));

  const foot = document.createElement("div");
  foot.className = "modal-foot";
  const done = document.createElement("button");
  done.className = "primary-btn"; done.type = "button"; done.textContent = "Done";
  done.addEventListener("click", closeDoc);
  foot.appendChild(done);
  body.appendChild(foot);
}

function buildAssistant(a) {
  const wrap = document.createElement("div");
  wrap.className = "assistant";
  const head = document.createElement("div");
  head.className = "assistant-head";
  head.innerHTML = `<span>🤖 </span><span class="badge">✓ Checked &amp; safe</span>`;
  head.firstChild.textContent = "🤖 " + (RESULT_LABEL[me.team] || "AI assistant");
  const body = document.createElement("div");
  body.className = "assistant-body" + (a.status === "ok" ? "" : " muted");
  body.textContent = a.text;
  wrap.appendChild(head); wrap.appendChild(body);
  return wrap;
}

function buildTech(data) {
  const details = document.createElement("details");
  details.className = "tech";
  const summary = document.createElement("summary"); summary.textContent = "Technical details";
  details.appendChild(summary);
  const grid = document.createElement("dl"); grid.className = "tech-grid";
  const rows = [
    ["Decision", data.verdict === "safe" ? "Allowed through" : "Blocked"],
    ["Finding", data.category_label],
    ["Injection likelihood", Math.round((data.confidence || 0) * 100) + "%"],
  ];
  for (const [k, val] of rows) {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = val;
    grid.appendChild(dt); grid.appendChild(dd);
  }
  if (data.matched_excerpt) {
    const ex = document.createElement("div"); ex.className = "tech-excerpt";
    ex.textContent = "Most suspicious passage:\n" + data.matched_excerpt;
    grid.appendChild(ex);
  }
  details.appendChild(grid);
  return details;
}

function renderModalError(msg) {
  $("modal-body").innerHTML = "";
  const div = document.createElement("div");
  div.className = "inline-error"; div.textContent = msg;
  $("modal-body").appendChild(div);
  const foot = document.createElement("div"); foot.className = "modal-foot";
  const b = document.createElement("button"); b.className = "secondary-btn"; b.textContent = "Close";
  b.addEventListener("click", closeDoc); foot.appendChild(b);
  $("modal-body").appendChild(foot);
}

// ── Paste text ──────────────────────────────────────────────────────────────
function openPaste() { $("paste-text").value = ""; $("paste-modal").hidden = false; $("paste-text").focus(); }
function closePaste() { $("paste-modal").hidden = true; }

async function runPaste() {
  const text = $("paste-text").value.trim();
  if (!text) { $("paste-text").focus(); return; }
  closePaste();
  current = { label: "Pasted text" };
  $("modal-title").textContent = "Pasted text";
  $("doc-modal").hidden = false;
  doCheck({ text });
}

init();
