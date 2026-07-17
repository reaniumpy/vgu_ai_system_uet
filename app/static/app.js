"use strict";

const $ = (id) => document.getElementById(id);

const els = {
  help: $("help-btn"),
  helpPanel: $("help-panel"),
  text: $("doc-text"),
  fileInput: $("doc-file"),
  fileBtn: $("file-btn"),
  fileChip: $("file-chip"),
  fileChipName: $("file-chip-name"),
  fileChipRemove: $("file-chip-remove"),
  request: $("request"),
  team: $("team"),
  checkBtn: $("check-btn"),
  exampleBtn: $("example-btn"),
  exampleMenu: $("example-menu"),
  status: $("status"),
  result: $("result"),
};

let assistantEnabled = true;

// ── Setup ────────────────────────────────────────────────────────────────
async function init() {
  try {
    const cfg = await (await fetch("/api/config")).json();
    assistantEnabled = cfg.assistant_enabled;
    els.team.innerHTML = "";
    for (const t of cfg.teams) {
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t;
      els.team.appendChild(opt);
    }
  } catch (_) { /* non-fatal: form still works */ }

  els.help.addEventListener("click", toggleHelp);
  els.fileBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", onFilePicked);
  els.fileChipRemove.addEventListener("click", clearFile);
  els.checkBtn.addEventListener("click", runCheck);
  els.exampleBtn.addEventListener("click", toggleExamples);
  document.addEventListener("click", (e) => {
    if (!els.exampleMenu.contains(e.target) && e.target !== els.exampleBtn) hideExamples();
  });
}

function toggleHelp() {
  const open = els.helpPanel.hidden;
  els.helpPanel.hidden = !open;
  els.help.setAttribute("aria-expanded", String(open));
}

// ── File handling ────────────────────────────────────────────────────────
function onFilePicked() {
  const f = els.fileInput.files[0];
  if (!f) return;
  els.fileChipName.textContent = f.name;
  els.fileChip.hidden = false;
  els.text.disabled = true;
  els.text.placeholder = "Using the uploaded file. Remove it to paste text instead.";
}

function clearFile() {
  els.fileInput.value = "";
  els.fileChip.hidden = true;
  els.text.disabled = false;
  els.text.placeholder = "Paste a résumé, contract, invoice, or message here…";
}

// ── Examples ─────────────────────────────────────────────────────────────
async function toggleExamples() {
  if (!els.exampleMenu.hidden) { hideExamples(); return; }
  if (!els.exampleMenu.dataset.loaded) {
    try {
      const data = await (await fetch("/api/samples")).json();
      for (const s of data.samples) {
        const btn = document.createElement("button");
        btn.className = "example-item";
        btn.type = "button";
        btn.innerHTML = `<span class="ex-label"></span><span class="ex-desc"></span>`;
        btn.querySelector(".ex-label").textContent = s.label;
        btn.querySelector(".ex-desc").textContent = s.description;
        btn.addEventListener("click", () => {
          clearFile();
          els.text.value = s.text;
          hideExamples();
          els.text.focus();
        });
        els.exampleMenu.appendChild(btn);
      }
      els.exampleMenu.dataset.loaded = "1";
    } catch (_) { /* ignore */ }
  }
  els.exampleMenu.hidden = false;
  els.exampleBtn.setAttribute("aria-expanded", "true");
}
function hideExamples() {
  els.exampleMenu.hidden = true;
  els.exampleBtn.setAttribute("aria-expanded", "false");
}

// ── Run a check ──────────────────────────────────────────────────────────
async function runCheck() {
  const hasFile = !els.fileChip.hidden && els.fileInput.files[0];
  const text = els.text.value.trim();
  if (!hasFile && !text) {
    showInlineError("Add a document first — paste some text or choose a file to check.");
    return;
  }

  els.result.hidden = true;
  els.result.innerHTML = "";
  els.status.hidden = false;
  els.checkBtn.disabled = true;

  const fd = new FormData();
  fd.append("text", text);
  fd.append("request", els.request.value);
  fd.append("team", els.team.value || "");
  if (hasFile) fd.append("file", els.fileInput.files[0]);

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
