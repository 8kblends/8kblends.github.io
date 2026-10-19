// "Send a friend": asks the sender's first name once, then shares the card
// link with ?ref=Name so the friend sees "Name sent you" (wording per mode in
// card.json "referral_copy").
(function () {
  "use strict";

  var card = window.card;
  var form = document.querySelector("[data-friend-form]");
  if (!form) return;
  var sheet = document.getElementById("friend-sheet");
  var nameInput = form.elements.name;

  try { nameInput.value = localStorage.getItem("myName") || ""; } catch (e) { /* private mode */ }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = card.cleanName(nameInput.value);
    if (!name) { nameInput.focus(); return; }
    try { localStorage.setItem("myName", name); } catch (e) { /* private mode */ }
    var url = card.config.site + "/?ref=" + encodeURIComponent(name);
    var text = card.config.share_text;
    var finish = function () {
      sheet.close();
      card.count("friend-sent");
      document.dispatchEvent(new CustomEvent("friend-sent"));
    };
    if (navigator.share) {
      navigator.share({ title: card.config.company, text: text, url: url }).then(finish, function () {});
      return;
    }
    card.copyText(text + " " + url).then(function (ok) {
      card.toast(ok ? "Link copied. Paste it to your friend" : url);
      finish();
    });
  });
})();
