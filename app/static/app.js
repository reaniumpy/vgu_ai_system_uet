"use strict";

const $ = (id) => document.getElementById(id);

const els = {
  help: $("help-btn"),
  helpPanel: $("help-panel"),
  text: $("doc-text"),
  fileBtn: $("file-btn"),
  fileChip: $("file-chip"),
  fileChipName: $("file-chip-name"),
  fileChipRemove: $("file-chip-remove"),
  request: $("request"),
  team: $("team"),
  checkBtn: $("check-btn"),
  status: $("status"),
  result: $("result"),
  browser: $("browser"),
  browserClose: $("browser-close"),
  browserCancel: $("browser-cancel"),
  fileList: $("file-list"),
};

const KIND_ICON = { "PDF document": "📕", "Word document": "📘", "Text document": "📄" };

let selectedSample = null;   // filename chosen in the fake browser, or null
let samplesLoaded = false;

// ── Setup ────────────────────────────────────────────────────────────────
async function init() {
  try {
    const cfg = await (await fetch("/api/config")).json();
    els.team.innerHTML = "";
    for (const t of cfg.teams) {
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t;
      els.team.appendChild(opt);
    }
  } catch (_) { /* non-fatal: form still works */ }

  els.help.addEventListener("click", toggleHelp);
  els.fileBtn.addEventListener("click", openBrowser);
  els.browserClose.addEventListener("click", closeBrowser);
  els.browserCancel.addEventListener("click", closeBrowser);
  els.browser.addEventListener("click", (e) => { if (e.target === els.browser) closeBrowser(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeBrowser(); });
  els.fileChipRemove.addEventListener("click", clearFile);
  els.checkBtn.addEventListener("click", runCheck);
}

function toggleHelp() {
  const open = els.helpPanel.hidden;
  els.helpPanel.hidden = !open;
  els.help.setAttribute("aria-expanded", String(open));
}

// ── Fake file browser (curated samples only) ───────────────────────────────
async function openBrowser() {
  if (!samplesLoaded) {
    try {
      const data = await (await fetch("/api/samples")).json();
      els.fileList.innerHTML = "";
      for (const s of data.samples) {
        const li = document.createElement("li");
        li.className = "file-item";
        li.setAttribute("role", "button");
        li.tabIndex = 0;
        li.innerHTML =
          `<span class="fi-icon" aria-hidden="true"></span>` +
          `<span class="fi-name"></span>` +
          `<span class="fi-meta"></span>`;
        li.querySelector(".fi-icon").textContent = KIND_ICON[s.kind] || "📄";
        li.querySelector(".fi-name").textContent = s.name;
        li.querySelector(".fi-meta").textContent = `${s.kind} · ${s.size_kb} KB`;
        const pick = () => selectSample(s.name);
        li.addEventListener("click", pick);
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        els.fileList.appendChild(li);
      }
      samplesLoaded = true;
    } catch (_) {
      els.fileList.innerHTML = '<li class="file-empty">Couldn\'t load the document list.</li>';
    }
  }
  els.browser.hidden = false;
}

function closeBrowser() { els.browser.hidden = true; }

function selectSample(name) {
  selectedSample = name;
  els.fileChipName.textContent = name;
  els.fileChip.hidden = false;
  els.text.disabled = true;
  els.text.placeholder = "Using the selected document. Remove it to paste text instead.";
  closeBrowser();
}

function clearFile() {
  selectedSample = null;
  els.fileChip.hidden = true;
  els.text.disabled = false;
  els.text.placeholder = "Paste a résumé, contract, invoice, or message here…";
}

// ── Run a check ──────────────────────────────────────────────────────────
async function runCheck() {
  const text = els.text.value.trim();
  if (!selectedSample && !text) {
    showInlineError("Add a document first — paste some text or choose a file to check.");
    return;
  }

  els.result.hidden = true;
  els.result.innerHTML = "";
  els.status.hidden = false;
  els.checkBtn.disabled = true;

  const fd = new FormData();
  fd.append("request", els.request.value);
  fd.append("team", els.team.value || "");
  if (selectedSample) fd.append("sample", selectedSample);
  else fd.append("text", text);

  try {
    const res = await fetch("/api/check", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) { showInlineError(data.error || "Something went wrong. Please try again."); return; }
    renderResult(data);
  } catch (_) {
    showInlineError("We couldn't reach the safety checker. Please check your connection and try again.");
  } finally {
    els.status.hidden = true;
    els.checkBtn.disabled = false;
  }
}

// ── Render ───────────────────────────────────────────────────────────────
function renderResult(data) {
  const safe = data.verdict === "safe";
  const root = document.createElement("div");
  root.className = "verdict " + (safe ? "safe" : "blocked");

  const head = document.createElement("div");
  head.className = "verdict-head";
  head.innerHTML =
    `<div class="verdict-icon">${safe ? "✓" : "✕"}</div>` +
    `<h2 class="verdict-title"></h2>`;
  head.querySelector(".verdict-title").textContent = data.headline;
  root.appendChild(head);

  const body = document.createElement("div");
  body.className = "verdict-body";
  body.textContent = data.explanation;
  root.appendChild(body);

  const src = document.createElement("div");
  src.className = "source-line";
  src.textContent = "Checked: " + data.source + (data.team && data.team !== "Unspecified" ? " · " + data.team : "");
  root.appendChild(src);

  if (!safe && data.next_step) {
    const ns = document.createElement("div");
    ns.className = "next-step";
    ns.innerHTML = "<strong>What to do next</strong>";
    ns.appendChild(document.createTextNode(data.next_step));
    root.appendChild(ns);
  }

  root.appendChild(buildTechDetails(data));
  els.result.appendChild(root);

  if (safe && data.assistant) els.result.appendChild(buildAssistant(data.assistant));

  const retry = document.createElement("button");
  retry.className = "retry-btn";
  retry.type = "button";
  retry.textContent = "Check another document";
  retry.addEventListener("click", resetForm);
  els.result.appendChild(retry);

  els.result.hidden = false;
  els.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildAssistant(assistant) {
  const wrap = document.createElement("div");
  wrap.className = "assistant";
  const head = document.createElement("div");
  head.className = "assistant-head";
  head.innerHTML = `<span>🤖 AI assistant</span><span class="badge">✓ Checked &amp; safe</span>`;
  const body = document.createElement("div");
  body.className = "assistant-body" + (assistant.status === "ok" ? "" : " muted");
  body.textContent = assistant.text;
  wrap.appendChild(head);
  wrap.appendChild(body);
  return wrap;
}

function buildTechDetails(data) {
  const details = document.createElement("details");
  details.className = "tech";
  const summary = document.createElement("summary");
  summary.textContent = "Technical details";
  details.appendChild(summary);

  const grid = document.createElement("dl");
  grid.className = "tech-grid";
  const pct = Math.round((data.confidence || 0) * 100);
  const rows = [
    ["Decision", data.verdict === "safe" ? "Allowed through" : "Blocked"],
    ["Finding", data.category_label],
    ["Injection likelihood", pct + "%"],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    grid.appendChild(dt); grid.appendChild(dd);
  }
  if (data.matched_excerpt) {
    const ex = document.createElement("div");
    ex.className = "tech-excerpt";
    ex.textContent = "Most suspicious passage:\n" + data.matched_excerpt;
    grid.appendChild(ex);
  }
  details.appendChild(grid);
  return details;
}

function showInlineError(msg) {
  els.result.innerHTML = "";
  const div = document.createElement("div");
  div.className = "inline-error";
  div.textContent = msg;
  els.result.appendChild(div);
  els.result.hidden = false;
}

function resetForm() {
  clearFile();
  els.text.value = "";
  els.result.hidden = true;
  els.result.innerHTML = "";
  els.text.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

init();
