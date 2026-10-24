// Ty's page (/ty/?b=…&k=…), opened from the dashboard and the alerts. It confirms,
// declines or closes out a booking, shows the message that goes with it ready to
// copy, and logs "sent" when Ty taps the button, so nobody is left without a
// confirmation or a reminder. It also says who the client is, offers other times
// with a decline, moves a booking, has quick cut-day messages, offers the next cut
// after Done, and once a message is out, opens the next Overdue task.
// #kit shows the house-call checklist; /ty/ on its own is the dashboard (dash.js).
(function () {
  "use strict";

  var card = window.card;
  var rules = window.BookingRules;
  var q = new URLSearchParams(location.search);
  var views = {};
  document.querySelectorAll("[data-view]").forEach(function (v) { views[v.getAttribute("data-view")] = v; });
  var $ = function (sel) { return document.querySelector(sel); };
  var message = $("[data-message]");
  var sendLink = $("[data-send-msg]");
  var target = null;  // { handle } or { phone }
  var logAs = "";
  var current = null; // the script's last answer for this booking

  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
    if (name === "message") fit();
    // Back to the dashboard (a Home Screen app has no browser back button).
    var back = window.TyDash && window.TyDash.backLink();
    document.querySelectorAll("[data-dash-back]").forEach(function (a) {
      a.hidden = !back;
      if (back) a.href = back;
    });
  }

  // This booking's page with an action: link("move"), link("again", t).
  function link(d, t) {
    return "?b=" + encodeURIComponent(q.get("b")) + "&k=" + encodeURIComponent(q.get("k")) +
           (d ? "&do=" + d : "") + (t ? "&t=" + t : "");
  }

  var KICKER = { confirm: "Message ready", remind: "Reminder ready", nudge: "Nudge ready", cant: "Message ready",
                 done: "Thank-you ready", moved: "Message ready", rebook: "Rebook" };
  var LOG = { confirm: "confirm", moved: "moved", remind: "remind", nudge: "nudge" };   // what a send tap logs

  function showBooking(r) {
    current = r;
    var b = r.booking;
    var view = r.view;
    var m = r.messages;
    var text = { confirm: m.confirm, remind: m.remind, nudge: m.nudge, cant: m.decline, done: m.thanks, moved: m.moved }[view] || "";
    var waiting = b.status === "Requested" || (view === "nudge" && !b.coming);
    $("[data-kicker]").textContent = KICKER[view] || "Booking";
    $("[data-status]").textContent = statusLine(b, view);
    $("[data-status]").className = "ty-status " + (waiting ? "wait" : b.status === "Confirmed" || b.status === "Done" ? "good" : "off");
    target = b.handle ? { handle: b.handle } : b.phone ? { phone: b.phone } : null;
    $("[data-to]").textContent = b.first + " · " + (b.handle ? "@" + b.handle + " on Instagram" : b.phone ? "text " + rules.showPhone(b.phone) : "no contact");
    var where = [b.address, b.city].filter(Boolean).join(", ");
    $("[data-details]").innerHTML = [
      ["When", b.day + " · " + b.time],
      ["What", b.services + (b.total !== "" ? " · $" + b.total : "") + (b.firstVisit ? " · first visit" : "")],
      ["Where", where ? '<a href="https://maps.google.com/?q=' + encodeURIComponent(where) + '">' + esc(where) + "</a>" +
        (rules.unsure(b.setup) ? ' · <span class="ty-ask">ask where to set up</span>' : " · " + esc(b.setup)) +
        (b.drive !== "" && b.drive !== undefined ? " · " + (Number(b.drive) > (b.maxDrive || 30) ? "⚠ " : "") + esc(b.drive) + " min away" : "") : ""],
      ["Notes", esc(b.notes)]
    ].filter(function (x) { return x[1]; }).map(function (x) {
      return "<div><dt>" + x[0] + "</dt><dd>" + (x[0] === "Where" || x[0] === "Notes" ? x[1] : esc(x[1])) + "</dd></div>";
    }).join("");
    client(r.client, b);
    logAs = LOG[view] || "";
    setMessage(text);
    var sent = !!view && remember(view);   // the cut-day quick messages (no view) don't count
    $("[data-track]").hidden = !logAs;
    $("[data-track]").classList.toggle("done", sent);
    quick(r, view);
    actions(b, view, r);
    nextUp(r, view === "noshow" ? "✓ Marked" : sent ? "✓ Sent" : "");
    show("message");
  }

  // Sending opens Instagram or Messages; coming back (or reloading) still shows it went out.
  function remember(view, set) {
    var k = "sent:" + q.get("b") + ":" + view;
    try {
      if (set) sessionStorage.setItem(k, "1");
      return sessionStorage.getItem(k) === "1";
    } catch (e) { return !!set; }
  }

  // The day and time sit in the When row just below, so the status line skips them.
  function statusLine(b, view) {
    if (b.status === "Declined") return "Declined · the time is open again";
    if (b.status === "Cancelled") return "Cancelled by " + b.first;
    if (b.status === "Done") return "✓ Done · visit counted";
    if (b.status === "No-show") return "No-show";
    if (b.status === "Requested") return "New request";
    if (b.coming) return "✓ Confirmed · " + b.first + " tapped 👍";
    if (view === "moved") return "✓ Moved · confirmed";
    if (view === "nudge") return "Reminder sent · no 👍 yet";
    return view === "remind" ? "✓ Confirmed · tomorrow" : "✓ Confirmed";
  }

  // New or a regular: visits, the last cut, what they usually get, who sent them, and Ty's own note.
  function client(c, b) {
    var box = $("[data-client]");
    box.hidden = !c;
    if (!c) return;
    $("[data-client-line]").textContent = (c.visits
      ? c.visits + (c.visits === 1 ? " cut" : " cuts") + " so far" + (c.last ? " · last " + c.last : "") + (c.usual ? " · usually " + c.usual : "")
      : "New client") + (b.ref ? " · sent by " + b.ref : "");
    note(c.notes);
  }
  function note(text) {
    var p = $("[data-note-text]");
    p.textContent = text ? "Note: " + text : "";
    p.hidden = !text;
    $("[data-note-edit]").textContent = text ? "Edit note" : "Add a note";
    $("[data-note-edit]").hidden = false;
    $("[data-note-form]").hidden = true;
  }
  $("[data-note-edit]").addEventListener("click", function () {
    var form = $("[data-note-form]");
    form.elements.note.value = (current && current.client && current.client.notes) || "";
    form.hidden = false;
    this.hidden = true;
    $("[data-note-text]").hidden = true;
    form.elements.note.focus();
  });
  $("[data-note-form]").addEventListener("submit", function (event) {
    event.preventDefault();
    card.send("ty-note", { b: q.get("b"), k: q.get("k"), note: this.elements.note.value.trim() }).then(function (r) {
      if (!r || !r.ok) throw new Error("not saved");
      current.client.notes = r.notes;
      note(r.notes);
      card.toast("Note saved");
    }).catch(function () { card.toast("That didn't save. Try again"); });
  });

  // Chips above the message: other times to offer with a decline, quick
  // messages on the day of the cut, and the next cut with a thank-you.
  function quick(r, view) {
    var box = $("[data-quick]");
    box.querySelectorAll(".chip").forEach(function (c) { c.remove(); });
    var m = r.messages;
    var b = r.booking;
    var label = "";
    var items = [];
    var build = null;
    if (view === "cant" && r.offers && r.offers.length) {
      label = "Offer instead";
      items = r.offers.map(function (o, i) { return { type: "checkbox", text: o.day.split(",")[0] + " " + o.time, value: String(o.t), on: i < 2 }; });
      build = function (on) {
        var picked = r.offers.filter(function (o) { return on.indexOf(String(o.t)) >= 0; });
        return picked.length ? m.declineIntro + " I can do " + rules.listTimes(picked.map(function (o) { return o.label; })) + ". Want one?" : m.decline;
      };
    } else if (r.today && !view) {
      label = "Quick message";
      items = [
        { type: "radio", text: b.drive !== "" && b.drive !== undefined ? "On my way · ~" + b.drive + " min" : "On my way", value: "onMyWay" },
        { type: "radio", text: "Running 10 min late", value: "late" },
        { type: "radio", text: "I'm outside", value: "outside" }
      ];
      build = function (on) { return on.length ? m[on[0]] : ""; };
    } else if (view === "done" && r.rebook) {
      label = "Next cut";
      items = [{ type: "checkbox", text: "Offer " + r.rebook.day + " · " + r.rebook.time, value: "rebook", on: true }];
      build = function (on) { return on.length ? m.rebook : m.thanks; };
    }
    box.hidden = !items.length;
    if (!items.length) return;
    $("[data-quick-label]").textContent = label;
    items.forEach(function (it) {
      var chip = document.createElement("label");
      chip.className = "chip";
      chip.innerHTML = '<input type="' + it.type + '" name="quick" value="' + esc(it.value) + '"' + (it.on ? " checked" : "") +
                       "><span>" + esc(it.text) + "</span>";
      box.appendChild(chip);
    });
    var update = function () {
      var on = Array.prototype.map.call(box.querySelectorAll("input:checked"), function (i) { return i.value; });
      setMessage(build(on));
      fit();
      if (view === "cant") actions(b, view, r);   // "Book it" follows the first time ticked
    };
    box.querySelectorAll("input").forEach(function (i) { i.addEventListener("change", update); });
    update();
  }

  // Buttons for whatever comes next with this booking.
  function actions(b, view, r) {
    var next = [];
    if (b.status === "Requested") next = [["Confirm", link("confirm")], ["Can't do it", link("cant")], ["Change time", link("move")]];
    else if (b.status === "Confirmed" && (r.today || r.started)) {
      // The day of the cut: the quick messages above, then Done or No-show, and the QR for the review (or pay).
      next = [["Done", link("done")], ["No-show", link("noshow")], ["Show QR", b.total !== "" ? "/qr/#pay" : "/qr/#review"]];
    } else if (b.status === "Confirmed") {
      if (!b.confirmSent && view !== "confirm" && view !== "moved") next.push(["Confirmation", link("confirm")]);
      if (view !== "remind" && view !== "nudge") next.push(["Reminder", link("remind")]);
      next.push(["Done", link("done")], ["No-show", link("noshow")], ["Change time", link("move")]);
    } else if (b.status === "Declined") {
      var picked = $("[data-quick] input:checked");
      next.push([picked ? b.first + " picked one? Book it ›" : "Book another time ›", link("move", picked ? picked.value : ""), "wide"]);
    } else if (b.status === "Done") {
      next.push([r.rebook ? b.first + " said yes? Book it ›" : "Book " + b.first + " again ›", link("again", r.rebook ? r.rebook.t : ""), "wide"]);
    }
    $("[data-actions]").innerHTML = next.map(function (x) {
      return '<a class="btn btn-soft' + (x[2] ? " " + x[2] : "") + '" href="' + x[1] + '">' + esc(x[0]) + "</a>";
    }).join("");
  }

  // Once the message is out (or there's nothing to send): the next Overdue task, one tap away.
  // The routine buttons step aside; "Book it" stays.
  function nextUp(r, done) {
    var box = $("[data-next]");
    box.hidden = !done || !r;
    if (!done || !r) return;
    $("[data-track]").hidden = true;
    document.querySelectorAll("[data-actions] .btn:not(.wide)").forEach(function (a) { a.hidden = true; });
    $("[data-next-left]").textContent = done + " · " + (r.left ? r.left + " more overdue" : "nothing else overdue");
    var a = $("[data-next-link]");
    a.hidden = !r.next;
    if (r.next) {
      $("[data-next-title]").textContent = "Next: " + r.next.title + " ›";
      $("[data-next-sub]").textContent = r.next.sub;
      a.href = window.TyDash ? window.TyDash.local(r.next.url) : r.next.url;
    }
  }

  function setMessage(text) {
    message.value = text;
    message.hidden = !text;
    sendLink.hidden = !text || !target;
    if (!target) return;
    $("[data-send-label]").textContent = target.handle ? "Copy & open DM" : "Text " + firstName();
    $("[data-send-sub]").textContent = target.handle ? "Opens your chat with @" + target.handle : "Message already filled in";
    updateLink();
  }
  function firstName() {
    return ($("[data-to]").textContent.split(" · ")[0] || "them");
  }
  function updateLink() {
    // "?&body=" works on both iPhone and Android Messages.
    sendLink.href = target.handle ? "https://ig.me/m/" + target.handle
                                  : "sms:+1" + target.phone + "?&body=" + encodeURIComponent(message.value);
  }
  // Show the whole message (short phones cap the box lower; a long one scrolls inside).
  function fit() {
    if (message.hidden) return;
    message.style.height = "auto";
    message.style.height = Math.min(message.scrollHeight + 4, window.matchMedia("(max-height: 660px)").matches ? 92 : 220) + "px";
  }
  message.addEventListener("input", function () { fit(); if (target) updateLink(); });

  sendLink.addEventListener("click", function (event) {
    var log = logAs && q.get("b") ? card.ask({ a: "sent", b: q.get("b"), k: q.get("k"), m: logAs }).catch(function () {}) : Promise.resolve();
    $("[data-track]").classList.add("done");
    if (current && current.view) {   // not after a quick cut-day message: Done and No-show stay put
      remember(current.view, true);
      nextUp(current, "✓ Sent");
    }
    if (target && target.phone) return;  // the text opens in Messages; the log goes out alongside
    event.preventDefault();
    card.copyText(message.value);
    card.toast("Copied. Paste it in the chat");
    var go = function () { location.href = sendLink.href; };
    Promise.race([log, new Promise(function (r) { setTimeout(r, 1200); })]).then(go, go);
  });

  // Pick an open time: move this booking there, or book the next cut after this one.
  function showPick(r) {
    current = r;
    var b = r.booking;
    var again = r.view === "again";
    var book = again || b.status === "Declined";
    $("[data-pick-kicker]").textContent = again ? "Book " + b.first + " again" : book ? "Book " + b.first : "Change time";
    $("[data-pick-status]").textContent = again ? "Last cut: " + b.day + " · " + b.services : (book ? "Was " : "Now: ") + b.day + " · " + b.time;
    $("[data-pick-back]").href = link(again ? "done" : b.status === "Declined" ? "cant" : "");
    var days = (r.days || []).filter(function (d) { return d.slots.length; });
    var grid = $("[data-pick-days]");
    var row = $("[data-pick-times]");
    var go = $("[data-pick-go]");
    var chosen = 0;
    grid.innerHTML = "";
    row.innerHTML = "";
    go.disabled = true;
    go.textContent = "Pick a time";
    $("[data-pick-note]").textContent = days.length ? "" : "No open times " + (again ? "in the next 4 weeks" : "coming up") + ". Add Open blocks to the calendar.";
    function pickTime(d, z, button) {
      chosen = z.t;
      row.querySelectorAll(".time").forEach(function (x) { x.setAttribute("aria-pressed", String(x === button)); });
      go.textContent = (book ? "Book " : "Move to ") + d.label + " · " + z.label;
      go.disabled = false;
    }
    function pickDay(d, t) {
      grid.querySelectorAll(".day").forEach(function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-key") === d.key)); });
      $("[data-pick-times-label]").textContent = "Open times · " + d.label;
      row.innerHTML = "";
      chosen = 0;
      go.disabled = true;
      go.textContent = "Pick a time";
      d.slots.forEach(function (z) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "time";
        button.textContent = z.label;
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", function () { pickTime(d, z, button); });
        row.appendChild(button);
        if (z.t === t) pickTime(d, z, button);
      });
    }
    days.forEach(function (d) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "day";
      button.setAttribute("data-key", d.key);
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", d.label);
      button.innerHTML = "<span>" + esc(d.dow) + "</span><b>" + esc(d.date) + "</b>";
      button.addEventListener("click", function () { pickDay(d, 0); });
      grid.appendChild(button);
    });
    var first = days.filter(function (d) { return d.slots.some(function (z) { return z.t === r.pick; }); })[0] || days[0];
    if (first) {
      pickDay(first, r.pick);
      var on = grid.querySelector('[aria-pressed="true"]');
      if (on) grid.scrollLeft = Math.max(0, on.offsetLeft - grid.offsetLeft - 60);
    }
    go.onclick = function () {
      if (!chosen) return;
      go.disabled = true;
      go.textContent = book ? "Booking…" : "Moving…";
      card.ask({ a: "ty", b: q.get("b"), k: q.get("k"), "do": again ? "againat" : "moveto", t: String(chosen) }).then(function (res) {
        if (res && res.ok && res.redirect) { location.replace(window.TyDash ? window.TyDash.local(res.redirect) : res.redirect); return; }
        if (res && res.ok) { history.replaceState(null, "", link("moved")); showBooking(res); return; }
        card.toast(res && res.reason === "taken" ? "That time just got taken. Pick another" : "That didn't work. Try again");
        load(r.view);
      }, function () {
        card.toast("Couldn't reach the Sheet. Try again");
        go.disabled = false;
        go.textContent = "Try again";
      });
    };
    show("pick");
  }

  function esc(text) {
    return String(text || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  // From the 6 PM list and rebook alerts: a message built by the Sheet script, no booking page needed.
  function showManual() {
    var name = card.cleanName(q.get("n")) || "there";
    var handle = rules.cleanHandle(q.get("h"));
    var phone = rules.cleanPhone(q.get("p"));
    var rebook = q.get("do") === "rebook";
    target = handle ? { handle: handle } : phone ? { phone: phone } : null;
    $("[data-kicker]").textContent = rebook ? "Rebook" : "Reminder ready";
    $("[data-status]").textContent = rebook ? name + " asked for a reminder" : "Tomorrow · " + name;
    $("[data-status]").className = "ty-status wait";
    $("[data-to]").textContent = name + " · " + (handle ? "@" + handle + " on Instagram" : phone ? "text " + rules.showPhone(phone) : "no contact");
    $("[data-details]").innerHTML = "";
    $("[data-actions]").innerHTML = "";
    $("[data-client]").hidden = true;
    $("[data-quick]").hidden = true;
    logAs = "";
    setMessage(rebook ? "Hey " + name + "! It's been about 3 weeks. Ready for a fresh one? 💈 Grab a time: " +
                        card.config.site.replace("https://", "") + "/book/"
                      : (q.get("t") || "").slice(0, 400));
    show("message");
  }

  function load(d, t) {
    return card.ask({ a: "ty", b: q.get("b"), k: q.get("k"), "do": d || "", t: t || "" }).then(function (r) {
      if (!r || !r.ok) { show("error"); return; }
      if (r.view === "move" || r.view === "again") showPick(r); else showBooking(r);
    }, function () { show("error"); });
  }

  if (location.hash === "#kit") {
    show("kit");
  } else if (q.get("b") && q.get("k")) {
    load(q.get("do"), q.get("t"));
  } else if (q.get("do") === "remind" || q.get("do") === "rebook") {
    showManual();
  } else {
    window.TyDash.open();   // /ty/ on its own: the dashboard
  }
})();
