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
  // Page settings from card.json (wording, Ty's number, the Sheet endpoint).
  var configEl = document.getElementById("site-config");
  var config = configEl ? JSON.parse(configEl.textContent) : {};

  var banner = document.querySelector("[data-ref-banner]");
  if (banner && referredBy && config.banner) {
    banner.textContent = config.banner.split("{name}").join(referredBy);
    banner.hidden = false;
  }

  // Send a review or booking request to the shared Google Sheet (an Apps
  // Script web app). The reply can't be read across sites, so a request that
  // goes out counts as sent. Resolves false when no Sheet is set up yet.
  function send(type, fields) {
    if (!config.endpoint) return Promise.resolve(false);
    var body = new URLSearchParams(fields);
    body.set("type", type);
    body.set("page", location.pathname);
    return fetch(config.endpoint, { method: "POST", mode: "no-cors", body: body })
      .then(function () { return true; }, function () { return false; });
  }

  window.card = {
    openSheet: openSheet, afterReturn: afterReturn, toast: toast,
    copyText: copyText, count: count, cleanName: cleanName, send: send, config: config,
    referredBy: function () { return referredBy; }
  };

  // ---------- QR screen: Contact | Review (or Tip / Pay in the drafts) ----------
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
    setMode(modes.indexOf(wanted) > 0 ? wanted : "contact");
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
