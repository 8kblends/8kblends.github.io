// "Rate your cut": stars, first + last name, an optional comment, OK to post,
// and "Want a reminder in 2-3 weeks?" (which asks for an @handle unless they
// booked on this phone). Goes to the shared Google Sheet, which alerts Ty.
// Then: post your cut and tag.
(function () {
  "use strict";

  var card = window.card;
  var booked = "";
  try { booked = localStorage.getItem("bookedHandle") || ""; } catch (e) { booked = ""; }

  document.querySelectorAll("[data-review-form]").forEach(function (form) {
    var remind = form.querySelector("[data-remind]");
    var handleField = form.querySelector("[data-remind-handle]");
    if (remind && handleField) {
      remind.addEventListener("change", function () {
        handleField.hidden = !remind.checked || !!booked;
        document.body.classList.toggle("remind-open", !handleField.hidden);
        if (!handleField.hidden) form.elements.handle.focus();
      });
    }

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
        remind: remind && remind.checked ? "yes" : "no",
        handle: remind && remind.checked ? booked || form.elements.handle.value.trim() : "",  // the Sheet script cleans it
        ref: card.referredBy()
      };
      try { localStorage.setItem("myName", fields.first); } catch (e) { /* private mode */ }

      card.send("review", fields).catch(function () {});
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
        if (handleField) handleField.hidden = true;
        document.body.classList.remove("remind-open");
        card.openSheet(document.getElementById("review-thanks"));
      }
    });
  });

  // "Copy @8kblends & open IG": copy the tag first, then the link opens Instagram.
  document.querySelectorAll("[data-copy-tag]").forEach(function (link) {
    link.addEventListener("click", function () { card.copyText(link.getAttribute("data-copy-tag")); });
  });
})();
