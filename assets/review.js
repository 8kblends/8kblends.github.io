// "Rate your cut": stars, first + last name, an optional comment and OK to
// post. Goes to the shared Google Sheet, which alerts Ty. With no Sheet set up
// yet, the review goes to Ty as a text instead. Then: post your cut and tag.
(function () {
  "use strict";

  var card = window.card;

  document.querySelectorAll("[data-review-form]").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (form.elements.website.value) return;  // hidden field only bots fill in
      var picked = form.querySelector('input[name="stars"]:checked');
      if (!picked) return;
      var fields = {
        stars: picked.value,
        first: card.cleanName(form.elements.first.value),
        last: card.cleanName(form.elements.last.value),
        comment: form.elements.comment.value.trim().slice(0, 300),
        ok_to_post: form.elements.ok_to_post.checked ? "yes" : "no",
        ref: card.referredBy()
      };
      try { localStorage.setItem("myName", fields.first); } catch (e) { /* private mode */ }

      if (card.config.endpoint) {
        card.send("review", fields);
      } else {
        var stars = Number(fields.stars);
        var text = "Review from " + fields.first + " " + fields.last + ": " +
                   "★★★★★".slice(0, stars) + "☆☆☆☆☆".slice(0, 5 - stars) +
                   (fields.comment ? " " + fields.comment : "");
        location.href = "sms:" + card.config.phone + "?&body=" + encodeURIComponent(text);
      }
      card.count("review-sent");
      document.dispatchEvent(new CustomEvent("review-sent"));

      // In a pop-up (tip page) the pop-up flips to "post your cut";
      // on /review/ the thank-you pop-up opens.
      var sheet = form.closest("dialog");
      if (sheet) {
        sheet.setAttribute("data-step", "post");
        sheet.addEventListener("close", function reset() {
          sheet.setAttribute("data-step", "rate");
          form.reset();
          sheet.removeEventListener("close", reset);
        });
      } else {
        form.reset();
        card.openSheet(document.getElementById("review-thanks"));
      }
    });
  });

  // "Copy @8kblends & open IG": copy the tag first, then the link opens Instagram.
  document.querySelectorAll("[data-copy-tag]").forEach(function (link) {
    link.addEventListener("click", function () { card.copyText(link.getAttribute("data-copy-tag")); });
  });
})();
