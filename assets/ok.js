// The customer's page (/ok/#id-key), linked from the day-before reminder:
// check the address, then Confirm or Can't make it. Confirm tells Ty they're
// coming; Can't make it frees the time on the booking page and alerts Ty.
// A spot left as "Not sure yet" gets asked here, one tap to answer.
(function () {
  "use strict";

  var card = window.card;
  var $ = function (sel) { return document.querySelector(sel); };
  var parts = location.hash.slice(1).split("-");
  var ids = { b: parts[0] || "", c: parts[1] || "" };
  var views = {};
  document.querySelectorAll("[data-view]").forEach(function (v) { views[v.getAttribute("data-view")] = v; });
  var form = $("[data-edit-form]");
  var citySelect = $("[data-city-select]");
  var cityText = $("[data-city-text]");
  var current = null;

  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
  }

  function render(b) {
    current = b;
    var live = b.status === "Requested" || b.status === "Confirmed";
    $("[data-title]").textContent = b.status === "Done" ? "Appreciate you, " + b.first + "!"
      : !live ? "Cancelled, " + b.first
      : (b.tomorrow ? "See you tomorrow, " : "See you " + b.day.split(",")[0] + ", ") + b.first;
    $("[data-when]").innerHTML = "<b>" + esc(b.day + " · " + b.time) + "</b><span>" +
      esc(b.services + (b.total !== "" ? " · $" + b.total : "")) + "</span>";
    var ask = window.BookingRules.unsure(b.setup);
    $("[data-where]").textContent = [b.address, b.city].filter(Boolean).join(", ") + (ask ? "" : " · " + b.setup);
    $("[data-where-row]").hidden = !live;
    $("[data-spot]").hidden = !(live && ask);
    var note = $("[data-note]");
    var text = b.status === "Confirmed" && b.coming ? "You're all set ✓ See you then."
      : b.status === "Requested" ? "Your request is in. I'll confirm shortly."
      : b.status === "Done" ? "Thanks for having me over 💈"
      : !live ? "No problem. Want another time? " : "";
    note.innerHTML = esc(text) + (!live && b.status !== "Done" ? '<a href="/book/">Pick one here</a>' : "");
    note.hidden = !text;
    $("[data-coming]").hidden = !(b.status === "Confirmed" && !b.coming);
    $("[data-cancel]").hidden = !live;
    var ics = $("[data-ics]");
    ics.hidden = !live;
    ics.href = calendarFile(b);
    show("booking");
  }

  function load(extra) {
    return card.ask(Object.assign({ a: "ok", b: ids.b, c: ids.c }, extra || {})).then(function (r) {
      if (r && r.ok) render(r.booking); else show("error");
    }, function () { show("error"); });
  }

  $("[data-coming]").addEventListener("click", function () {
    this.textContent = "Confirming…";
    load({ "do": "coming" }).then(function () { $("[data-coming]").textContent = "Confirm 👍"; });
  });
  $("[data-cancel]").addEventListener("click", function () {
    if (!window.confirm("Cancel " + current.day + " at " + current.time + "?")) return;
    load({ "do": "cancel" });
  });

  // One tap on a spot saves it, keeping everything else as it was.
  document.querySelectorAll('input[name="spot"]').forEach(function (chip) {
    chip.addEventListener("change", function () {
      save({ address: current.address, city: current.city, setup: chip.value, notes: current.notes });
    });
  });
  function save(fields) {
    return card.send("ok-edit", Object.assign({ b: ids.b, c: ids.c }, fields)).then(function (r) {
      form.hidden = true;
      if (r && r.ok) { render(r.booking); card.toast("Saved"); } else show("error");
    }, function () { card.toast("No connection. Try again"); });
  }

  // Fix the address or setup spot.
  $("[data-edit]").addEventListener("click", function () {
    var b = current;
    form.elements.address.value = b.address || "";
    if (b.cities && b.cities.length && !citySelect.options.length) {
      citySelect.innerHTML = b.cities.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");
      citySelect.hidden = false;
      cityText.hidden = true;
    }
    citySelect.value = b.city || "";
    cityText.value = b.city || "";
    var setup = form.querySelector('input[name="setup"][value="' + (b.setup || "") + '"]');
    if (setup) setup.checked = true;
    form.elements.notes.value = b.notes || "";
    form.hidden = false;
    $("[data-where-row]").hidden = true;
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var setup = form.querySelector('input[name="setup"]:checked');
    save({
      address: form.elements.address.value.trim(),
      city: (citySelect.hidden ? cityText.value : citySelect.value).trim(),
      setup: setup ? setup.value : "",
      notes: form.elements.notes.value.trim()
    });
  });

  function calendarFile(b) {
    var stamp = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); };
    var text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//8kblends//booking//EN", "BEGIN:VEVENT",
      "UID:" + ids.b + "@8kblends", "DTSTAMP:" + stamp(Date.now()), "DTSTART:" + stamp(b.start), "DTEND:" + stamp(b.end),
      "SUMMARY:" + b.services + " with " + card.config.nickname + " (8kblends)",
      "LOCATION:" + [b.address, b.city].filter(Boolean).join("\\, "),
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(text);
  }

  function esc(text) {
    return String(text || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  if (ids.b && ids.c) load(); else show("error");
})();
