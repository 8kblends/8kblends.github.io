// Booking rules shared by the booking page and the Sheet script: which
// services go together, and what a visit costs. tools/apps-script/Code.gs
// carries the same rules (the script re-prices every request), and
// tools/test_rules.mjs checks the two copies agree.
var BookingRules = (function () {
  "use strict";

  var ORDER = ["haircut", "beard", "lineup", "full"];

  // Full package = haircut + beard trim + lineup; a haircut includes the lineup.
  function normalize(ids) {
    var on = {};
    (ids || []).forEach(function (id) { if (ORDER.indexOf(id) >= 0) on[id] = true; });
    if (on.full || (on.haircut && on.beard)) return ["full"];
    if (on.haircut) delete on.lineup;
    return ORDER.filter(function (id) { return on[id]; });
  }

  // Tapping a service: what's picked next, and a note when the pick changes shape.
  function toggle(ids, id) {
    var had = normalize(ids);
    var wanted = had.indexOf(id) >= 0
      ? had.filter(function (x) { return x !== id; })
      : (id === "full" ? ["full"] : had.filter(function (x) { return x !== "full"; }).concat(id));
    var next = normalize(wanted);
    var note = "";
    if (next[0] === "full" && id !== "full") note = "Haircut + beard trim = the Full package, lineup too";
    else if (id === "haircut" && had.indexOf("lineup") >= 0 && next.indexOf("lineup") < 0) note = "The lineup comes with every haircut";
    return { ids: next, note: note };
  }

  // Services that can't be added to the current pick, with the reason shown on the chip.
  function blocked(ids) {
    var now = normalize(ids);
    if (now[0] === "full") return { haircut: "included", beard: "included", lineup: "included" };
    if (now.indexOf("haircut") >= 0) return { lineup: "included" };
    return {};
  }

  // services: [{id, name, price, includes}]; opts: {travel, firstOff, first, paid}
  function quote(ids, services, opts) {
    var byId = {};
    services.forEach(function (s) { byId[s.id] = s; });
    var picked = normalize(ids);
    var items = picked.map(function (id) {
      var s = byId[id];
      return { id: id, name: s.name, includes: s.includes, price: s.price };
    });
    var special = null;
    if (opts.first && items.length) {
      var big = picked.indexOf("haircut") >= 0 || picked.indexOf("full") >= 0;
      if (big) {
        special = { kind: "off", label: "$" + opts.firstOff + " off", amount: -opts.firstOff };
      } else {
        var lineup = byId.lineup;
        if (picked.indexOf("lineup") < 0) {
          items.push({ id: "lineup", name: lineup.name, includes: lineup.includes, price: lineup.price, added: true });
        }
        special = { kind: "lineup", label: "Free lineup", amount: -lineup.price };
      }
    }
    var subtotal = items.reduce(function (sum, it) { return sum + it.price; }, 0);
    var total = items.length ? Math.max(0, subtotal + opts.travel + (special ? special.amount : 0)) : 0;
    return { ids: picked, items: items, travel: opts.travel, special: special, total: total,
             full: items.length ? subtotal + opts.travel : 0, paid: !!opts.paid };
  }

  // "full package", "haircut", "beard trim + lineup"
  function describe(ids, services) {
    var names = {};
    services.forEach(function (s) { names[s.id] = s.name; });
    return normalize(ids).map(function (id) { return names[id]; }).join(" + ").toLowerCase();
  }

  function cleanHandle(raw) {
    var h = String(raw || "").trim().toLowerCase()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/[/?#].*$/, "").replace(/^@+/, "");
    return /^[a-z0-9._]{1,30}$/.test(h) ? h : "";
  }

  // US numbers only: 10 digits (a leading 1 is dropped).
  function cleanPhone(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") d = d.slice(1);
    return d.length === 10 ? d : "";
  }

  function showPhone(digits) {
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  // "Not sure yet" (or no spot picked): Ty still needs to ask where to set up.
  function unsure(spot) {
    return !String(spot || "").trim() || /^not sure/i.test(String(spot).trim());
  }

  // ["Fri, Oct 23 at 12:30 PM", "Sat, Oct 24 at 11:00 AM"] -> "Fri, Oct 23 at 12:30 PM or Sat, Oct 24 at 11:00 AM"
  function listTimes(labels) {
    return labels.length < 2 ? labels.join("") : labels.slice(0, -1).join(", ") + " or " + labels[labels.length - 1];
  }

  return { ORDER: ORDER, normalize: normalize, toggle: toggle, blocked: blocked, quote: quote,
           describe: describe, cleanHandle: cleanHandle, cleanPhone: cleanPhone, showPhone: showPhone, unsure: unsure,
           listTimes: listTimes };
})();

if (typeof module !== "undefined") module.exports = BookingRules;
