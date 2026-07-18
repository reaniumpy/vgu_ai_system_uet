"use strict";

const TEAM_ICON = { hr: "👥", legal: "⚖️", finance: "💳", security: "🛡️" };

async function init() {
  const list = document.getElementById("account-list");
  let accounts = [];
  try {
    accounts = (await (await fetch("/api/accounts")).json()).accounts;
  } catch (_) {
    list.innerHTML = '<li class="account-loading">Couldn\'t load accounts. Refresh to retry.</li>';
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
    btn.querySelector(".ac-team").textContent = a.team_label;
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
  alert("Sign-in failed. Please try again.");
}

init();
