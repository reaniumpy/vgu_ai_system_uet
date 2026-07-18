"use strict";

const { t, applyStaticI18n } = window.I18N;
const TEAM_ICON = { hr: "👥", legal: "⚖️", finance: "💳", security: "🛡️" };

async function init() {
  applyStaticI18n();
  const list = document.getElementById("account-list");
  let accounts = [];
  try {
    accounts = (await (await fetch("/api/accounts")).json()).accounts;
  } catch (_) {
    list.innerHTML = `<li class="account-loading">${t("login.loading")}</li>`;
    return;
  }
  // Which account (if any) is already signed in — that one is shown as current.
  let current = null;
  try {
    const meRes = await fetch("/api/me");
    if (meRes.ok) current = await meRes.json();
  } catch (_) { /* not signed in */ }

  list.innerHTML = "";
  list.removeAttribute("aria-busy");

  // Already signed in? Offer a clear way back to that account's workspace.
  const wsUrl = current ? (current.team === "security" ? "/monitoring" : "/" + current.team) : null;
  if (current) {
    const banner = document.createElement("div");
    banner.className = "login-signedin";
    const txt = document.createElement("div"); txt.className = "login-signedin-text";
    txt.appendChild(document.createTextNode(t("login.signedIn") + " "));
    const strong = document.createElement("strong");
    strong.textContent = `${current.name} · ${t("team." + current.team + ".label")}`;
    txt.appendChild(strong);
    const go = document.createElement("button");
    go.className = "primary-btn"; go.type = "button";
    go.textContent = t("login.goWorkspace") + " →";
    go.addEventListener("click", () => { window.location.href = wsUrl; });
    banner.appendChild(txt); banner.appendChild(go);
    list.parentNode.insertBefore(banner, list);
  }

  for (const a of accounts) {
    const isCurrent = current && current.id === a.id;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "account-card";
    btn.type = "button";
    btn.innerHTML =
      `<span class="ac-avatar" aria-hidden="true"></span>` +
      `<span class="ac-body"><span class="ac-name"></span><span class="ac-title"></span></span>` +
      `<span class="ac-team"></span>`;
    btn.querySelector(".ac-avatar").textContent = TEAM_ICON[a.team] || "👤";
    btn.querySelector(".ac-name").textContent = a.name;
    btn.querySelector(".ac-title").textContent = a.title;
    btn.querySelector(".ac-team").textContent = t(`team.${a.team}.label`);
    if (isCurrent) {
      // Already signed in as this account — mark it, and make it a way back to
      // the workspace (not a fresh sign-in) so you're never stranded here.
      const badge = document.createElement("span");
      badge.className = "ac-current"; badge.textContent = t("login.current");
      btn.insertBefore(badge, btn.querySelector(".ac-team"));
      btn.setAttribute("aria-label", `${a.name} — ${t("login.goWorkspace")}`);
      btn.addEventListener("click", () => { window.location.href = wsUrl; });
    } else {
      btn.addEventListener("click", () => signIn(a.id, btn));
    }
    li.appendChild(btn);
    list.appendChild(li);
  }
}

async function signIn(accountId, btn) {
  btn.disabled = true;
  const fd = new FormData();
  fd.append("account", accountId);
  try {
    const res = await fetch("/api/login", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok && data.redirect) { window.location.href = data.redirect; return; }
  } catch (_) { /* fall through */ }
  btn.disabled = false;
  alert(t("login.failed"));
}

init();
