// Booking request: name, service, when, who sent you. Saved to the shared
// Google Sheet (Ty gets an alert), then the customer finishes in Instagram
// DMs with a ready-made message, so every request lands in one inbox.
(function () {
  "use strict";

  var card = window.card;
  var form = document.querySelector("[data-book-form]");
  var sheet = document.getElementById("book-dm");
  var preview = sheet.querySelector("[data-dm-preview]");
  var ref = form.elements.ref;
  var message = "";

  if (card.referredBy()) ref.value = card.referredBy();

  function picked(name) {
    var input = form.querySelector('input[name="' + name + '"]:checked');
    return input ? input.value : "";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (form.elements.website.value) return;  // hidden field only bots fill in
    var fields = {
      first: card.cleanName(form.elements.first.value),
      last: card.cleanName(form.elements.last.value),
      service: picked("service"),
      day: picked("day"),
      time: picked("time"),
      ref: card.cleanName(ref.value)
    };
    var when = [fields.day, fields.time].filter(Boolean).join(", ").toLowerCase();
    var want = fields.service === "Not sure" ? "a cut (not sure which yet)" : "a " + fields.service.toLowerCase();
    message = "Hey " + card.config.nickname + "! " + fields.first + " " + fields.last + " here. " +
              "I'd like to book " + want + (when ? ", " + when : "") + "." +
              (fields.ref ? " " + fields.ref + " sent me." : "") + " 💈";

    card.send("booking", fields);
    card.count("book-request");
    card.copyText(message);
    preview.textContent = message;
    card.openSheet(sheet);
  });

  // Copy again on the way out, in case the first copy was blocked.
  sheet.querySelector("[data-dm-open]").addEventListener("click", function () {
    if (message) card.copyText(message);
  });
})();
