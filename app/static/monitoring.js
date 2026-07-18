"use strict";

const $ = (id) => document.getElementById(id);
const { t, applyStaticI18n } = window.I18N;

async function load() {
  let data;
  try {
    data = await (await fetch("/api/stats")).json();
  } catch (_) {
    $("tiles").innerHTML = `<div class="inline-error">${t("mon.loadFail")}</div>`;
    return;
  }

  $("sample-note").hidden = !data.has_sample;
  renderTiles(data);
  renderBars($("by-team"), data.by_team);
  renderBars($("by-category"), data.by_category);
  renderReports(data.reports);
  renderLog(data.recent);
}

function renderReports(reports) {
  const box = $("reports-list");
  box.innerHTML = "";
  if (!reports || reports.length === 0) {
    box.innerHTML = `<div class="empty">${t("mon.reports.none")}</div>`;
    return;
  }
  for (const r of reports) {
    const item = document.createElement("div");
    item.className = "report-item";
    const head = document.createElement("div"); head.className = "report-item-head";
    const badge = document.createElement("span");
    badge.className = "report-badge report-badge-" + (r.report_type || "");
    badge.textContent = t(`mon.report.${r.report_type}`);
    const src = document.createElement("span"); src.className = "report-src"; src.textContent = r.source || "—";
    const when = document.createElement("span"); when.className = "report-when nowrap"; when.textContent = formatWhen(r.ts);
    head.appendChild(badge); head.appendChild(src); head.appendChild(when);
    const meta = document.createElement("div"); meta.className = "report-meta";
    meta.textContent = `${r.team || "—"} · ${r.user || "—"}`;
    item.appendChild(head); item.appendChild(meta);
    if (r.reason) {
      const reason = document.createElement("div");
      reason.className = "report-reason-text"; reason.textContent = r.reason;
      item.appendChild(reason);
    }
    box.appendChild(item);
  }
}

function renderTiles(d) {
  const tiles = [
    { label: t("mon.total"), value: d.total, tone: "neutral" },
    { label: t("mon.safe"), value: d.safe, tone: "safe" },
    { label: t("mon.blocked"), value: d.blocked, tone: "block" },
  ];
  $("tiles").innerHTML = "";
  for (const tile of tiles) {
    const el = document.createElement("div");
    el.className = "tile tile-" + tile.tone;
    el.innerHTML = `<div class="tile-value"></div><div class="tile-label"></div>`;
    el.querySelector(".tile-value").textContent = tile.value;
    el.querySelector(".tile-label").textContent = tile.label;
    $("tiles").appendChild(el);
  }
}

function renderBars(container, pairs) {
  container.innerHTML = "";
  if (!pairs || pairs.length === 0) {
    container.innerHTML = `<div class="empty">${t("mon.noBlocks")}</div>`;
    return;
  }
  const max = Math.max(...pairs.map((p) => p[1]));
  for (const [label, count] of pairs) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const name = document.createElement("div");
    name.className = "bar-name";
    name.textContent = label;
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill bar-block";
    fill.style.width = Math.max(6, (count / max) * 100) + "%";
    fill.textContent = count;
    track.appendChild(fill);
    row.appendChild(name);
    row.appendChild(track);
    container.appendChild(row);
  }
}

function renderLog(events) {
  const body = $("log-body");
  body.innerHTML = "";
  if (!events || events.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="empty">${t("mon.noActivity")}</td></tr>`;
    return;
  }
  for (const e of events) {
    const tr = document.createElement("tr");

    const when = document.createElement("td");
    when.textContent = formatWhen(e.ts); when.className = "nowrap";

    const doc = document.createElement("td"); doc.textContent = e.source || "—";
    const team = document.createElement("td"); team.textContent = e.team || "—";
    const by = document.createElement("td"); by.textContent = e.user || "—"; by.className = "nowrap";

    const result = document.createElement("td");
    const pill = document.createElement("span");
    const blocked = e.verdict === "blocked";
    pill.className = "pill " + (blocked ? "pill-block" : "pill-safe");
    pill.textContent = blocked ? t("mon.pill.blocked") : t("mon.pill.safe");
    result.appendChild(pill);

    const details = document.createElement("td");
    if (blocked) {
      const pct = Math.round((e.confidence || 0) * 100);
      const cat = e.category && e.category !== "none" ? e.category : "generic";
      const label = document.createElement("div");
      label.className = "detail-label";
      label.textContent = `${t(`finding.${cat}.label`)} · ${pct}% ${t("mon.likelihood")}`;
      details.appendChild(label);
      if (e.excerpt) {
        const ex = document.createElement("div");
        ex.className = "detail-excerpt";
        ex.textContent = e.excerpt;
        details.appendChild(ex);
      }
    } else {
      const span = document.createElement("span");
      span.className = "detail-muted"; span.textContent = t("mon.noThreat");
      details.appendChild(span);
    }

    tr.appendChild(when); tr.appendChild(doc); tr.appendChild(team);
    tr.appendChild(by); tr.appendChild(result); tr.appendChild(details);
    body.appendChild(tr);
  }
}

function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const hrs = Math.round((Date.now() - d.getTime()) / 3.6e6);
  if (hrs < 1) return t("time.now");
  if (hrs < 24) return hrs + t("time.h");
  return Math.round(hrs / 24) + t("time.d");
}

async function signOut() {
  try { await fetch("/api/logout", { method: "POST" }); } catch (_) {}
  window.location.href = "/login";
}

async function init() {
  applyStaticI18n();
  try {
    const res = await fetch("/api/me");
    if (res.status === 401) { window.location.href = "/login"; return; }
    const me = await res.json();
    if (me.team !== "security") { window.location.href = "/"; return; }
    $("identity").textContent = `${me.name} · ${t("team.security.label")}`;
  } catch (_) { window.location.href = "/login"; return; }
  $("refresh-btn").addEventListener("click", load);
  $("signout").addEventListener("click", signOut);
  load();
}

init();
