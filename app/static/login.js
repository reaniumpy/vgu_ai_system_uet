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
  list.innerHTML = "";
  list.removeAttribute("aria-busy");
  for (const a of accounts) {
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
    btn.addEventListener("click", () => signIn(a.id, btn));
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
