"use strict";

const $ = (id) => document.getElementById(id);

async function load() {
  let data;
  try {
    data = await (await fetch("/api/stats")).json();
  } catch (_) {
    $("tiles").innerHTML = '<div class="inline-error">Couldn\'t load activity. Try refreshing.</div>';
    return;
  }

  $("sample-note").hidden = !data.has_sample;
  renderTiles(data);
  renderBars($("by-team"), data.by_team, "block");
  renderBars($("by-category"), data.by_category, "block");
  renderLog(data.recent);
}

function renderTiles(d) {
  const tiles = [
    { label: "Documents checked", value: d.total, tone: "neutral" },
    { label: "Cleared as safe", value: d.safe, tone: "safe" },
    { label: "Threats blocked", value: d.blocked, tone: "block" },
  ];
  $("tiles").innerHTML = "";
  for (const t of tiles) {
    const el = document.createElement("div");
    el.className = "tile tile-" + t.tone;
    el.innerHTML = `<div class="tile-value"></div><div class="tile-label"></div>`;
    el.querySelector(".tile-value").textContent = t.value;
    el.querySelector(".tile-label").textContent = t.label;
    $("tiles").appendChild(el);
  }
}

function renderBars(container, pairs, tone) {
  container.innerHTML = "";
  if (!pairs || pairs.length === 0) {
    container.innerHTML = '<div class="empty">No blocks recorded yet.</div>';
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
    fill.className = "bar-fill bar-" + tone;
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
    body.innerHTML = '<tr><td colspan="5" class="empty">No activity yet.</td></tr>';
    return;
  }
  for (const e of events) {
    const tr = document.createElement("tr");

    const when = document.createElement("td");
    when.textContent = formatWhen(e.ts);
    when.className = "nowrap";

    const doc = document.createElement("td");
    doc.textContent = e.source || "—";

    const team = document.createElement("td");
    team.textContent = e.team || "—";

    const result = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "pill " + (e.verdict === "blocked" ? "pill-block" : "pill-safe");
    pill.textContent = e.verdict === "blocked" ? "Blocked" : "Safe";
    result.appendChild(pill);

    const details = document.createElement("td");
    if (e.verdict === "blocked") {
      const pct = Math.round((e.confidence || 0) * 100);
      const label = document.createElement("div");
      label.className = "detail-label";
      label.textContent = `${e.category_label} · ${pct}% likelihood`;
      details.appendChild(label);
      if (e.excerpt) {
        const ex = document.createElement("div");
        ex.className = "detail-excerpt";
        ex.textContent = e.excerpt;
        details.appendChild(ex);
      }
    } else {
      details.innerHTML = '<span class="detail-muted">No threat found</span>';
    }

    tr.appendChild(when); tr.appendChild(doc); tr.appendChild(team);
    tr.appendChild(result); tr.appendChild(details);
    body.appendChild(tr);
  }
}

function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const diffMs = Date.now() - d.getTime();
  const hrs = Math.round(diffMs / 3.6e6);
  if (hrs < 1) return "just now";
  if (hrs < 24) return hrs + "h ago";
  const days = Math.round(hrs / 24);
  return days + "d ago";
}

$("refresh-btn").addEventListener("click", load);
load();
