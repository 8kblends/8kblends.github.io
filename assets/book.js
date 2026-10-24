// Booking: pick services, a day and an open time (straight from Ty's
// calendar), say who you are and where to come, check the overview, send.
// The Sheet script holds the time, prices it and alerts Ty, who confirms in
// Instagram DMs (or by text for people without Instagram). Prices only show
// on the overview, and only while the Settings tab's "Paid mode" is on.
(function () {
  "use strict";

  var card = window.card;
  var rules = window.BookingRules;
  var form = document.querySelector("[data-book-form]");
  var steps = {};
  form.querySelectorAll("[data-step]").forEach(function (s) { steps[s.getAttribute("data-step")] = s; });
  var FLOW = ["service", "you", "where", "review"];
  var back = document.querySelector("[data-back]");
  var backLabel = document.querySelector("[data-back-label]");
  var note = form.querySelector("[data-service-note]");
  var dayGrid = form.querySelector("[data-day-grid]");
  var times = form.querySelector("[data-times]");
  var timeRow = form.querySelector("[data-time-row]");
  var loading = form.querySelector("[data-loading]");
  var nextFromService = steps.service.querySelector("[data-next]");
  var state = { ids: [], day: null, time: null, cfg: null, phone: false, first: null, firstFor: "", firstAsk: null };

  // ---------- steps ----------
  function go(name, push) {
    Object.keys(steps).forEach(function (k) { steps[k].hidden = k !== name; });
    document.body.setAttribute("data-at", name);
    var i = FLOW.indexOf(name);
    backLabel.textContent = i > 0 ? "Back" : "Card";
    back.setAttribute("href", i > 0 ? "#" : "/");
    if (push && history.pushState) history.pushState({ step: name }, "", "#" + name);
    window.scrollTo(0, 0);
  }
  back.addEventListener("click", function (event) {
    if (FLOW.indexOf(document.body.getAttribute("data-at")) > 0) {
      event.preventDefault();
      history.back();
    }
  });
  window.addEventListener("popstate", function (event) {
    go(event.state && event.state.step ? event.state.step : "service");
  });

  // ---------- step 1: services ----------
  var chips = form.querySelectorAll('input[name="service"]');
  function showServices() {
    var blocked = rules.blocked(state.ids);
    chips.forEach(function (input) {
      input.checked = state.ids.indexOf(input.value) >= 0;
      input.disabled = !!blocked[input.value];
      var why = input.parentNode.querySelector("[data-why]");
      if (why) why.textContent = blocked[input.value] || "";
    });
    nextFromService.disabled = !(state.ids.length && state.time);
  }
  chips.forEach(function (input) {
    input.addEventListener("change", function () {
      var t = rules.toggle(state.ids, input.value);
      state.ids = t.ids;
      note.textContent = t.note;
      showServices();
    });
  });

  // ---------- step 1: day and time ----------
  function showDays() {
    dayGrid.innerHTML = "";
    var firstOpen = null;
    state.cfg.days.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "day" + (d.status === "open" ? "" : " day-" + d.status);
      b.disabled = d.status !== "open";
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", d.label + (d.status === "full" ? ", full" : d.status === "off" ? ", closed" : ""));
      b.innerHTML = "<span>" + d.dow + "</span><b>" + d.date + "</b>" + (d.status === "full" ? "<small>full</small>" : "");
      b.addEventListener("click", function () { pickDay(d); });
      dayGrid.appendChild(b);
      if (d.status === "open" && !firstOpen) firstOpen = d;
    });
    loading.hidden = !!firstOpen;
    if (!firstOpen) {
      loading.textContent = state.cfg.paused ? "Booking is paused for now. DM me and I'll find you a time."
                                             : "No open times in the next " + state.cfg.days.length + " days. DM me and I'll find you one.";
    }
    var keep = firstOpen && state.cfg.days.filter(function (d) { return d.key === state.day && d.status === "open"; })[0];
    if (keep || firstOpen) pickDay(keep || firstOpen);
  }
  function pickDay(d) {
    state.day = d.key;
    state.time = null;
    dayGrid.querySelectorAll(".day").forEach(function (b, i) {
      b.setAttribute("aria-pressed", String(state.cfg.days[i].key === d.key));
    });
    form.querySelector("[data-times-label]").textContent = "Open times · " + d.label + " (PT)";
    timeRow.innerHTML = "";
    d.slots.forEach(function (z) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "time";
      b.textContent = z.label;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        state.time = z.t;
        state.timeLabel = z.label;
        state.dayLabel = d.label;
        timeRow.querySelectorAll(".time").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        showServices();
      });
      timeRow.appendChild(b);
    });
    times.hidden = false;
    timeRow.scrollLeft = 0;
    showArrows();
    showServices();
  }
  function showArrows() {
    var more = timeRow.scrollWidth > timeRow.clientWidth + 2;
    times.querySelectorAll("[data-scroll]").forEach(function (a) {
      var left = a.getAttribute("data-scroll") === "-1";
      a.hidden = !more || (left ? timeRow.scrollLeft < 4 : timeRow.scrollLeft + timeRow.clientWidth >= timeRow.scrollWidth - 4);
    });
  }
  timeRow.addEventListener("scroll", showArrows);
  times.querySelectorAll("[data-scroll]").forEach(function (a) {
    a.addEventListener("click", function () {
      timeRow.scrollBy({ left: Number(a.getAttribute("data-scroll")) * timeRow.clientWidth * 0.7, behavior: "smooth" });
    });
  });

  function loadTimes() {
    return card.loadConfig(true).then(function (cfg) {
      state.cfg = cfg;
      setupCities(cfg.cities || []);
      showDays();
    }, function () {
      go("down");
    });
  }

  nextFromService.addEventListener("click", function () {
    form.querySelector("[data-summary]").textContent =
      state.dayLabel + " · " + state.timeLabel + " · " + names(state.ids);
    go("you", true);
  });

  // ---------- step 2: you ----------
  var swap = form.querySelector("[data-swap]");
  function usePhone(on) {
    state.phone = on;
    form.querySelector("[data-handle-field]").hidden = on;
    form.querySelector("[data-phone-field]").hidden = !on;
    swap.textContent = on ? "Have Instagram? I'll DM you instead" : "No Instagram? I can text you instead";
  }
  swap.addEventListener("click", function () {
    usePhone(!state.phone);
    (state.phone ? form.elements.phone : form.elements.handle).focus();
  });
  steps.you.querySelector("[data-next]").addEventListener("click", function () {
    var first = card.cleanName(form.elements.first.value);
    var handle = rules.cleanHandle(form.elements.handle.value);
    var phone = rules.cleanPhone(form.elements.phone.value);
    var problem = !first ? "Add your first name." :
      state.phone ? (phone ? "" : "Add a 10-digit phone number.") : (handle ? "" : "That @handle doesn't look right.");
    error("you", problem);
    if (problem) return;
    var key = state.phone ? phone : handle;
    if (key !== state.firstFor) {
      state.firstFor = key;
      state.first = null;
      state.firstAsk = card.ask(state.phone ? { a: "first", phone: phone } : { a: "first", handle: handle })
        .then(function (r) { state.first = !!(r && r.ok && r.first); }, function () { state.first = false; });
    }
    go("where", true);
  });

  // ---------- step 3: where ----------
  var citySelect = form.querySelector("[data-city-select]");
  var cityText = form.querySelector("[data-city-text]");
  function setupCities(cities) {
    if (!cities.length || citySelect.options.length) return;
    citySelect.innerHTML = '<option value="">Pick your city</option>' + cities.map(function (c) {
      return "<option>" + c.replace(/[<&"]/g, "") + "</option>";
    }).join("");
    citySelect.hidden = false;
    cityText.hidden = true;
    form.querySelector("[data-area-note]").hidden = false;
  }
  function city() {
    return (citySelect.hidden ? cityText.value : citySelect.value).trim();
  }
  steps.where.querySelector("[data-next]").addEventListener("click", function () {
    var problem = !form.elements.address.value.trim() ? "Add the street address." : !city() ? "Add your city." : "";
    error("where", problem);
    if (problem) return;
    var wait = state.firstAsk ? Promise.race([state.firstAsk, new Promise(function (r) { setTimeout(r, 4000); })]) : Promise.resolve();
    wait.then(function () {
      showOverview();
      go("review", true);
    });
  });

  // ---------- step 4: the overview, read like a receipt ----------
  function money(n) { return "$" + n; }
  function showOverview() {
    var cfg = state.cfg;
    var q = rules.quote(state.ids, cfg.services, { travel: cfg.travel, firstOff: cfg.firstOff, first: !!state.first, paid: cfg.paid });
    var setup = form.querySelector('input[name="setup"]:checked');
    var spot = setup && !rules.unsure(setup.value) ? " · " + setup.value : "";
    var name = card.cleanName(form.elements.first.value);
    form.querySelector("[data-review-title]").textContent = name ? "Almost done, " + name : "Almost done";
    form.querySelector("[data-when]").innerHTML =
      "<b>" + esc(state.dayLabel + " · " + state.timeLabel) + "</b><span>" +
      esc([form.elements.address.value.trim(), city()].join(", ") + spot) + "</span>";
    var lines = q.items.map(function (it) {
      return line(it.name, it.includes, cfg.paid ? money(it.price) : "");
    });
    // Paid: the drive fee (Settings → Travel) is its own line. Not paid: just say Ty comes to them.
    if (cfg.services.length && cfg.travel) lines.push(cfg.paid ? line("Drive to you", "", money(cfg.travel)) : line("I come to you", "", ""));
    if (cfg.paid && q.special) {
      lines.push('<li class="receipt-special"><span class="receipt-top"><b>First visit special</b><i aria-hidden="true"></i>' +
        "<em>−" + money(-q.special.amount) + "</em></span>" +
        (q.special.kind === "lineup" ? "<small>Your lineup's on me</small>" : "") + "</li>");
    }
    form.querySelector("[data-items]").innerHTML = lines.join("");
    form.querySelector("[data-total-line]").hidden = !cfg.paid;
    form.querySelector("[data-total]").textContent = money(q.total);
    form.querySelector("[data-send-dm]").hidden = state.phone;
    state.quote = q;
  }
  function line(name, includes, price) {
    return '<li><span class="receipt-top"><span class="tick" aria-hidden="true">✓</span><b>' + esc(name) + "</b>" +
           (price ? '<i aria-hidden="true"></i><em>' + price + "</em>" : "") + "</span>" +
           (includes ? "<small>" + esc(includes) + "</small>" : "") + "</li>";
  }

  function fields(via) {
    var setup = form.querySelector('input[name="setup"]:checked');
    return {
      start: String(state.time),
      services: state.ids.join(","),
      first: card.cleanName(form.elements.first.value),
      handle: state.phone ? "" : rules.cleanHandle(form.elements.handle.value),
      phone: state.phone ? rules.cleanPhone(form.elements.phone.value) : "",
      address: form.elements.address.value.trim().slice(0, 120),
      city: city().slice(0, 40),
      setup: setup ? setup.value : "",
      notes: form.elements.notes.value.trim().slice(0, 200),
      ref: card.cleanName(form.elements.ref.value),
      via: via,
      website: form.elements.website.value
    };
  }

  var sending = false;
  function submit(via) {
    if (sending) return;
    sending = true;
    var f = fields(via);
    var button = form.querySelector("[data-send]");
    button.textContent = "Sending…";
    error("review", "");
    card.send("booking", f).then(function (r) {
      sending = false;
      button.textContent = "Send request";
      if (r && r.ok) return done(f, via);
      if (r && r.reason === "taken") {
        go("service");
        note.textContent = "That time just got taken. Pick another one.";
        state.time = null;
        loadTimes();
        return;
      }
      if (r && r.reason === "paused") return go("down");
      if (r && r.reason === "area") {
        return error("review", "That one's outside my usual area. DM me and we'll figure it out." +
                               (state.cfg.paid ? " Farther drives may add a small travel fee." : ""));
      }
      error("review", "That didn't go through. Check the details and try again.");
    }, function () {
      sending = false;
      button.textContent = "Send request";
      error("review", "No connection. Try again in a moment.");
    });
  }
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (form.elements.website.value) return;  // hidden field only bots fill in
    submit("form");
  });
  form.querySelector("[data-send-dm]").addEventListener("click", function () { submit("dm"); });

  // ---------- step 5: sent ----------
  function done(f, via) {
    remember(f);
    card.count(via === "dm" ? "book-sent-dm" : "book-sent");
    var when = state.dayLabel + " at " + state.timeLabel;
    form.querySelector("[data-sent-text]").textContent = when + " is held for you. " +
      (state.phone ? "I'll text to confirm" : "I'll confirm in your DMs") + ", usually within a couple of hours.";
    form.querySelector("[data-follow-sub]").textContent = state.phone ? "See my work" : "so my message reaches your inbox";
    form.querySelector("[data-ics]").href = ics(f);
    go("sent");
    if (history.replaceState) history.replaceState(null, "", location.pathname);
    if (via === "dm") {
      var message = "Hey " + card.config.nickname + "! It's " + f.first + ". I just booked " + when + " for " +
                    names(state.ids).toLowerCase() + " 💈";
      card.copyText(message);
      card.toast("Message copied. Paste it in my DMs");
      setTimeout(function () { location.href = card.config.dm; }, 900);
    }
  }

  function ics(f) {
    var stamp = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); };
    var cut = 90 * 60000;
    var text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//8kblends//booking//EN", "BEGIN:VEVENT",
      "UID:" + f.start + "-" + (f.handle || f.phone) + "@8kblends",
      "DTSTAMP:" + stamp(Date.now()), "DTSTART:" + stamp(Number(f.start)), "DTEND:" + stamp(Number(f.start) + cut),
      "SUMMARY:" + names(state.ids) + " with " + card.config.nickname + " (8kblends)",
      "LOCATION:" + [f.address, f.city].filter(Boolean).join("\\, "),
      "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Fresh cut in 2 hours", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(text);
  }

  // ---------- helpers ----------
  function names(ids) {
    return state.cfg.services.filter(function (s) { return rules.normalize(ids).indexOf(s.id) >= 0; })
      .map(function (s) { return s.name; }).join(" + ");
  }
  function error(step, text) {
    var el = form.querySelector('[data-error="' + step + '"]');
    if (el) el.textContent = text;
  }
  function esc(text) {
    return String(text).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function remember(f) {
    try {
      localStorage.setItem("booker", JSON.stringify({ first: f.first, handle: f.handle, phone: f.phone,
        address: f.address, city: f.city, setup: f.setup, viaPhone: state.phone }));
      if (f.handle) localStorage.setItem("bookedHandle", f.handle);
      localStorage.setItem("myName", f.first);
    } catch (e) { /* private mode */ }
  }
  function restore() {
    var b = null;
    try { b = JSON.parse(localStorage.getItem("booker") || "null"); } catch (e) { b = null; }
    if (card.referredBy()) form.elements.ref.value = card.referredBy();
    if (!b) return;
    form.elements.first.value = b.first || "";
    form.elements.handle.value = b.handle ? "@" + b.handle : "";
    form.elements.phone.value = b.phone ? rules.showPhone(b.phone) : "";
    form.elements.address.value = b.address || "";
    cityText.value = b.city || "";
    citySelect.setAttribute("data-want", b.city || "");
    var setup = form.querySelector('input[name="setup"][value="' + (b.setup || "") + '"]');
    if (setup) setup.checked = true;
    usePhone(!!b.viaPhone);
  }
  // A remembered city is picked once the city list arrives.
  new MutationObserver(function () {
    var want = citySelect.getAttribute("data-want");
    if (want) citySelect.value = want;
  }).observe(citySelect, { childList: true });

  restore();
  go("service");
  loadTimes();
})();
