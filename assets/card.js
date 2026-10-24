// 8kblends digital card: pop-up sheets, referral banner, visit
// counter, sending to the shared Sheet, QR Contact/Review toggle, offline
// cache, keep-screen-awake.
(function () {
  "use strict";

  var toastEl;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return Promise.resolve(fallback());

    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  // ---------- Bottom sheets ----------
  function openSheet(sheet) {
    if (!sheet || sheet.open) return;
    if (typeof sheet.showModal === "function") sheet.showModal();
    else sheet.setAttribute("open", "");
  }

  document.querySelectorAll("dialog.sheet").forEach(function (sheet) {
    // Tapping the dimmed area outside the sheet closes it.
    sheet.addEventListener("click", function (event) {
      if (event.target !== sheet) return;
      var r = sheet.getBoundingClientRect();
      var inside = event.clientX >= r.left && event.clientX <= r.right &&
                   event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) sheet.close();
    });
  });

  // Show a sheet when the customer comes back from another app (Contacts,
  // Cash App, Messages). If the page never goes to the background (a
  // desktop download, say), show it after a short pause instead.
  var pending = null;
  var fallback;
  function showPending() {
    if (!pending) return;
    var job = pending;
    pending = null;
    clearTimeout(fallback);
    var sheet = document.getElementById(job.id);
    if (!sheet) return;
    if (job.prepare) job.prepare(sheet);
    openSheet(sheet);
  }
  function afterReturn(id, prepare) {
    pending = { id: id, prepare: prepare, left: false };
    clearTimeout(fallback);
    fallback = setTimeout(function () {
      if (pending && !pending.left) showPending();
    }, 2500);
  }
  document.addEventListener("visibilitychange", function () {
    if (!pending) return;
    if (document.visibilityState === "hidden") pending.left = true;
    else if (pending.left) setTimeout(showPending, 400);
  });
  window.addEventListener("pageshow", function (event) {
    if (event.persisted && pending) setTimeout(showPending, 400);
  });
  document.querySelectorAll("[data-after]").forEach(function (link) {
    link.addEventListener("click", function () { afterReturn(link.getAttribute("data-after")); });
  });
  document.querySelectorAll("[data-open-sheet]").forEach(function (button) {
    button.addEventListener("click", function () {
      var from = button.closest("dialog");  // swap sheets instead of stacking them
      if (from && from.open) from.close();
      openSheet(document.getElementById(button.getAttribute("data-open-sheet")));
    });
  });

  // ---------- Visit counter (GoatCounter, only if card.json sets one) ----------
  function count(name) {
    var gc = window.goatcounter;
    if (gc && typeof gc.count === "function") {
      gc.count({ path: name, title: name, event: true });
    }
  }
  document.querySelectorAll("[data-count]").forEach(function (el) {
    el.addEventListener("click", function () { count(el.getAttribute("data-count")); });
  });

  // ---------- Referral: a friend's link looks like /?ref=Marcus ----------
  function cleanName(raw) {
    return String(raw || "").replace(/[^\p{L}\p{M}' .-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24);
  }
  var referredBy = "";
  try {
    var fromLink = cleanName(new URLSearchParams(location.search).get("ref"));
    if (fromLink) {
      localStorage.setItem("referredBy", fromLink);
      count("ref-" + fromLink.toLowerCase());
    }
    referredBy = fromLink || cleanName(localStorage.getItem("referredBy"));
  } catch (e) { referredBy = ""; }
  // Page settings from card.json (wording, the DM link, the Sheet endpoint).
  var configEl = document.getElementById("site-config");
  var config = configEl ? JSON.parse(configEl.textContent) : {};

  var banner = document.querySelector("[data-ref-banner]");
  if (banner && referredBy && config.banner) {
    banner.textContent = config.banner.split("{name}").join(referredBy);
    banner.hidden = false;
  }

  // The shared Google Sheet (an Apps Script web app) answers in JSON: send()
  // posts a review or booking request, ask() reads (open times, Ty's page).
  function send(type, fields) {
    if (!config.endpoint) return Promise.reject(new Error("no Sheet yet"));
    var body = new URLSearchParams(fields);
    body.set("type", type);
    body.set("page", location.pathname);
    return fetch(config.endpoint, { method: "POST", body: body }).then(function (r) { return r.json(); });
  }
  function ask(params) {
    if (!config.endpoint) return Promise.reject(new Error("no Sheet yet"));
    var timer;
    var slow = new Promise(function (resolve, reject) {
      timer = setTimeout(function () { reject(new Error("timed out")); }, 15000);
    });
    return Promise.race([fetch(config.endpoint + "?" + new URLSearchParams(params)).then(function (r) { return r.json(); }), slow])
      .then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }

  // Paid mode is the Settings tab's switch: prices (and the QR's Pay tab) only
  // show while it's on. The last answer is kept so pages don't flicker.
  function setPaid(on) {
    document.documentElement.classList.toggle("paid", !!on);
    try { localStorage.setItem("paid", on ? "1" : "0"); } catch (e) { /* private mode */ }
    var contact = document.querySelector('[data-mode-tab="contact"]');
    var pay = document.querySelector('[data-mode-tab="pay"]');
    if (!on && contact && document.body.getAttribute("data-mode") === "pay") contact.click();
    if (on && pay && location.hash === "#pay" && document.body.getAttribute("data-mode") !== "pay") pay.click();
  }
  try { if (localStorage.getItem("paid") === "1") document.documentElement.classList.add("paid"); } catch (e) { /* private mode */ }
  function loadConfig(withTimes) {
    return ask(withTimes ? { a: "config", slots: "1" } : { a: "config" }).then(function (c) {
      if (!c || !(c.v >= 2)) throw new Error("the Sheet script needs the v2 update");
      setPaid(c.paid);
      return c;
    });
  }
  if (document.querySelector("[data-paid]")) loadConfig(false).catch(function () { setPaid(false); });

  window.card = {
    openSheet: openSheet, afterReturn: afterReturn, toast: toast,
    copyText: copyText, count: count, cleanName: cleanName, send: send, ask: ask, loadConfig: loadConfig,
    config: config, referredBy: function () { return referredBy; }
  };

  // ---------- QR screen: Contact | Review | Pay (Pay only in paid mode) ----------
  var tabs = document.querySelectorAll("[data-mode-tab]");
  function setMode(mode) {
    document.body.setAttribute("data-mode", mode);
    tabs.forEach(function (tab) {
      tab.setAttribute("aria-selected", String(tab.getAttribute("data-mode-tab") === mode));
    });
    if (history.replaceState) history.replaceState(null, "", mode === "contact" ? location.pathname : "#" + mode);
  }
  if (tabs.length) {
    var modes = [];
    tabs.forEach(function (tab) {
      modes.push(tab.getAttribute("data-mode-tab"));
      tab.addEventListener("click", function () { setMode(tab.getAttribute("data-mode-tab")); });
    });
    var wanted = location.hash.slice(1);
    if (wanted === "pay" && !document.documentElement.classList.contains("paid")) wanted = "contact";
    setMode(modes.indexOf(wanted) > 0 ? wanted : "contact");
  }

  // "Share a link": Ty's card, through the phone's own share menu (Messages,
  // Instagram, AirDrop). It always opens the card, never this QR screen.
  var shareCard = document.querySelector("[data-share-card]");
  if (shareCard) {
    shareCard.addEventListener("click", function () {
      var url = config.site + "/";
      if (navigator.share) {
        navigator.share({ title: config.company, text: "Here's my card 💈", url: url }).catch(function () {});
        return;
      }
      copyText(url).then(function (ok) { toast(ok ? "Link copied" : url); });
    });
  }

  // Size the QR so every square covers a whole number of screen pixels:
  // crisp edges scan more reliably than squares smeared across two pixels.
  var qrBoxes = document.querySelectorAll(".qr-box");
  function snapQr() {
    var root = document.documentElement;
    root.style.removeProperty("--qr-size");
    var box = Array.prototype.find.call(qrBoxes, function (b) { return b.offsetWidth > 0; });
    var svg = box && box.querySelector("svg");
    if (!svg) return;
    var dpr = window.devicePixelRatio || 1;
    var modules = svg.viewBox.baseVal.width;
    var perModule = Math.floor(box.getBoundingClientRect().width * dpr / modules);
    if (perModule > 0) root.style.setProperty("--qr-size", (perModule * modules / dpr) + "px");
  }
  if (qrBoxes.length) {
    snapQr();
    window.addEventListener("resize", snapQr);
    tabs.forEach(function (tab) { tab.addEventListener("click", snapQr); });
  }

  // The QR screen asks the phone not to dim while a customer scans it.
  if (document.body.hasAttribute("data-keep-awake") && "wakeLock" in navigator) {
    var keepAwake = function () {
      navigator.wakeLock.request("screen").catch(function () {});
    };
    keepAwake();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") keepAwake();
    });
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  }
})();
