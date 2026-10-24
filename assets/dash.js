// Ty's dashboard (/ty/?d=key): what needs doing, today, this week, next week
// and the latest alerts, read from the Sheet script. Saved to the Home Screen,
// it's the app Ty opens; "Turn on alerts" makes this phone buzz (web push).
// ty.js decides when to show it (no booking in the address, not #kit).
(function () {
  "use strict";

  var card = window.card;
  var $ = function (sel) { return document.querySelector(sel); };
  var STORE = "dashKey";
  var TY_CACHE = "8kb-ty";   // shared with sw.js: what the alerts need to fetch
  var tab = "needs";
  var data = null;
  var timer;

  function store(name, value) {
    try {
      if (value === undefined) return localStorage.getItem(name) || "";
      localStorage.setItem(name, value);
    } catch (e) { /* private mode */ }
    return "";
  }

  // The private key comes in the link (?d=…) once, then lives on this phone.
  // A Home Screen app keeps its own storage, so the key also stays in its address.
  function key() {
    var fromLink = new URLSearchParams(location.search).get("d");
    if (fromLink) store(STORE, fromLink);
    return fromLink || store(STORE);
  }

  function show(name) {
    document.querySelectorAll("[data-view]").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== name; });
    document.body.classList.toggle("dash-on", name === "dash");
  }

  // Links from the script are full addresses; keep them inside this app.
  function local(url) {
    var site = (card.config.site || "").replace(/\/$/, "");
    url = String(url || "/ty/");
    return site && url.indexOf(site + "/") === 0 ? url.slice(site.length) : url;
  }

  function esc(text) {
    return String(text == null ? "" : text).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---------- loading ----------
  function load() {
    var k = key();
    return card.ask({ a: "dash", k: k }).then(function (d) {
      if (!d || !d.ok) { show("link"); return; }
      data = d;
      render();
      alertsCard();
    }, function () {
      $("[data-dash-updated]").textContent = "Couldn't reach the Sheet. Pull down or wait a minute.";
    });
  }

  function render() {
    var c = data.counts;
    ["needs", "today", "week", "next"].forEach(function (n) { $('[data-n="' + n + '"]').textContent = c[n]; });
    $('[data-tab="needs"]').classList.toggle("hot", c.needs > 0);
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === tab));
    });
    bell();
    $("[data-dash-heading]").textContent = { needs: "Overdue", today: "Today", week: "This week",
                                              next: "Next week", alerts: "Notifications" }[tab];
    $("[data-dash-list]").innerHTML = tab === "needs" ? needsList()
      : tab === "alerts" ? alertsList()
      : tab === "today" ? dayRows(data.today, "No cuts today.")
      : grouped(data[tab], tab === "week" ? "Nothing booked this week yet." : "Nothing booked next week yet.");
    $("[data-dash-updated]").textContent = "Updated " + new Date(data.now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (navigator.setAppBadge) navigator.setAppBadge(c.needs).catch(function () {});
  }

  // New alerts since the bell was last opened: a number (or just a dot, with Settings → Bell number off).
  function bell() {
    var seen = Number(store("alertsSeen")) || 0;
    var fresh = (data.alerts || []).filter(function (a) { return a.t > seen; }).length;
    var dot = $("[data-dash-dot]");
    var number = data.bell !== false;
    dot.hidden = !fresh;
    dot.classList.toggle("num", number);
    dot.textContent = number && fresh ? (fresh > 9 ? "9+" : String(fresh)) : "";
    $('[data-tab="alerts"]').setAttribute("aria-label", fresh ? "Notifications, " + fresh + " new" : "Notifications");
  }

  var ICON = { confirm: "⏳", sendConfirm: "💬", sendReminder: "⏰", notComing: "👍", after: "✂️" };
  function needsList() {
    if (!data.needs.length) return '<p class="dash-empty">Nothing overdue ✓</p>';
    return data.needs.map(function (n) {
      return '<a class="dash-row task" href="' + esc(local(n.url)) + '"><span class="dash-ic" aria-hidden="true">' + (ICON[n.kind] || "•") +
             '</span><span class="dash-main"><b>' + esc(n.title) + "</b><small>" + esc(n.sub) + '</small></span><span class="dash-go" aria-hidden="true">›</span></a>';
    }).join("");
  }

  var STATUS = { Requested: ["wait", "Waiting on you"], Confirmed: ["ok", "Confirmed"], Done: ["done", "Done"], "No-show": ["off", "No-show"] };
  function row(r) {
    var st = r.manual ? ["hand", "Added by hand"] : r.coming && r.status === "Confirmed" ? ["ok", "Coming 👍"] : STATUS[r.status] || ["off", r.status];
    var bits = [r.city || r.where];
    if (r.drive !== "") bits.push((r.far ? "⚠ " : "") + r.drive + " min");
    if (r.ask) bits.push('<span class="dash-ask">ask where to set up</span>');
    else if (r.setup) bits.push(esc(r.setup));
    var inner = '<span class="dash-time">' + esc(r.time) + '</span><span class="dash-main"><b>' + esc(r.name) +
      (r.what ? " · " + esc(r.what) : "") + (r.total !== "" && r.total != null ? " · $" + esc(r.total) : "") + "</b><small>" +
      bits.filter(Boolean).map(function (b, i) { return i === 0 ? esc(b) : b; }).join(" · ") + '</small></span><span class="dash-pill ' +
      st[0] + '">' + esc(st[1]) + "</span>";
    return r.url ? '<a class="dash-row" href="' + esc(local(r.url)) + '">' + inner + "</a>" : '<div class="dash-row">' + inner + "</div>";
  }
  function dayRows(rows, empty) {
    return rows.length ? rows.map(row).join("") : '<p class="dash-empty">' + empty + "</p>";
  }
  function grouped(rows, empty) {
    if (!rows.length) return '<p class="dash-empty">' + empty + "</p>";
    var out = "", day = "";
    rows.forEach(function (r) {
      if (r.day !== day) {
        day = r.day;
        var n = rows.filter(function (x) { return x.day === day; }).length;
        out += '<p class="dash-day">' + esc(r.dayLabel) + " · " + n + (n === 1 ? " cut" : " cuts") + "</p>";
      }
      out += row(r);
    });
    return out;
  }
  function alertsList() {
    store("alertsSeen", String(Date.now()));
    bell();
    var list = data.alerts || [];
    if (!list.length) return '<p class="dash-empty">No alerts yet.</p>';
    return list.map(function (a) {
      var when = new Date(a.t).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
      return '<a class="dash-row note" href="' + esc(local(a.url)) + '"><span class="dash-main"><b>' + esc(a.title) +
             "</b><small>" + esc(a.message) + '</small></span><span class="dash-when">' + esc(when) + "</span></a>";
    }).join("");
  }

  document.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () {
      tab = b.getAttribute("data-tab") === tab && tab === "alerts" ? "needs" : b.getAttribute("data-tab");
      if (data) render();
    });
  });

  // ---------- alerts on this phone ----------
  function isIOS() {
    return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function installed() {
    return navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }
  function canPush() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function roles() {
    return Array.prototype.filter.call(document.querySelectorAll("[data-alerts-roles] input"), function (i) { return i.checked; })
      .map(function (i) { return i.value; });
  }

  function alertsCard() {
    var box = $("[data-alerts-card]");
    var text = $("[data-alerts-text]");
    var on = store("alertsRoles");
    if (!canPush()) {
      box.hidden = false;
      $("[data-alerts-roles]").hidden = true;
      $("[data-alerts-on]").hidden = true;
      text.textContent = isIOS() && !installed()
        ? "To get alerts on iPhone: tap Share, then Add to Home Screen, then open 8kblends from your Home Screen."
        : "This browser can't show alerts. Open this page in Chrome or Safari.";
      return;
    }
    if (on && Notification.permission === "granted") { box.hidden = true; return; }
    box.hidden = false;
    $("[data-alerts-roles]").hidden = false;
    $("[data-alerts-on]").hidden = false;
    text.textContent = Notification.permission === "denied"
      ? "Alerts are blocked for this page. Allow them in the phone's Settings, then tap below."
      : "Turn on alerts so this phone buzzes for new requests and reminders.";
  }

  function b64ToBytes(b64) {
    var s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function label() {
    return (isIOS() ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Browser") + " · " + roles().join(" + ");
  }

  $("[data-alerts-on]").addEventListener("click", function () {
    var btn = this;
    var picked = roles();
    if (!picked.length) { card.toast("Tick at least one box"); return; }
    btn.textContent = "Turning on…";
    Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error("blocked");
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (old) {
        return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.vapid) });
      });
    }).then(function (sub) {
      return card.send("device", { k: key(), endpoint: sub.endpoint, roles: picked.join(","), label: label() });
    }).then(function (r) {
      if (!r || !r.ok) throw new Error("not saved");
      store("alertsRoles", picked.join(","));
      return caches.open(TY_CACHE).then(function (c) {
        return c.put("/__ty/config", new Response(JSON.stringify({
          endpoint: card.config.endpoint, key: key(), roles: picked, last: Date.now()
        })));
      });
    }).then(function () {
      card.toast("Alerts are on ✓");
      alertsCard();
    }).catch(function (e) {
      card.toast(e.message === "blocked" ? "Alerts are blocked. Allow them in Settings" : "That didn't work. Try again");
      alertsCard();
    }).then(function () { btn.textContent = "Turn on alerts"; });
  });

  // A push that arrives while the dashboard is open refreshes it.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (e) { if (e.data === "refresh") load(); });
  }

  // ---------- the link screen (no key on this phone yet) ----------
  $("[data-link-form]").addEventListener("submit", function (e) {
    e.preventDefault();
    var m = String(e.target.elements.link.value).match(/[?&]d=([A-Za-z0-9]+)/);
    if (!m) { card.toast("That isn't the dashboard link"); return; }
    location.href = "/ty/?d=" + m[1];
  });

  window.TyDash = {
    // Ty's page: show the dashboard (or the link screen) and keep it fresh.
    open: function () {
      if (!key()) { show("link"); return; }
      show("dash");
      load();
      clearInterval(timer);
      timer = setInterval(function () { if (document.visibilityState === "visible") load(); }, 60000);
      document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") load(); });
    },
    // The appointment page's way back, when this phone has a dashboard.
    backLink: function () { return key() ? "/ty/?d=" + key() : ""; },
    local: local
  };
})();
