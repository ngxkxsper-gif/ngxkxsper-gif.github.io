/* Quote form delivery and validation.
   Destination: window.NDW_CONFIG.FORM_ENDPOINT in js/site-config.js.
   Local test only (localhost): /quote/?formtest=1&endpoint=/__form-test
   posts to the documented mock in test/quote-form.mjs. The override is
   ignored on any other host, so a query string cannot redirect a lead. */
(function () {
  var PLACEHOLDER = /PASTE_|YOUR_FORM|YOUR_EMAIL|CHANGEME/i;
  var PACKAGES = {
    "launch-pad": "Launch Pad",
    "business-website": "Business Website",
    "growth-website": "Growth Website",
    "care-watch": "the Watch care plan",
    "care-maintain": "the Maintain care plan",
    "care-protect": "the Protect care plan"
  };

  function configuredEndpoint() {
    var value = String((window.NDW_CONFIG && window.NDW_CONFIG.FORM_ENDPOINT) || "").trim();
    if (!value || PLACEHOLDER.test(value)) return "";
    try {
      var url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      return value;
    } catch (err) {
      return "";
    }
  }

  function testEndpoint() {
    var host = location.hostname;
    var local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    if (!local) return "";
    var params = new URLSearchParams(location.search);
    if (params.get("formtest") !== "1") return "";
    return params.get("endpoint") === "/__form-test" ? "/__form-test" : "";
  }

  function resolveEndpoint() {
    return testEndpoint() || configuredEndpoint();
  }

  function setFieldError(field, message) {
    var error = document.getElementById(field.id + "-error");
    if (!error) return;
    if (message) {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", error.id);
      error.textContent = message;
    } else {
      field.removeAttribute("aria-invalid");
      if (field.getAttribute("aria-describedby") === error.id) {
        field.removeAttribute("aria-describedby");
      }
      error.textContent = "";
    }
  }

  function emailError(value) {
    if (!value) return "Enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter an email address like name@studio.com.";
    return "";
  }

  function phoneError(value) {
    if (!value) return "";
    if (!/^[0-9+().\-\s]+$/.test(value)) return "Use digits and phone symbols only, or leave phone blank.";
    var digits = value.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return "Enter a phone number with 7 to 15 digits, or leave it blank.";
    return "";
  }

  function websiteError(value) {
    if (!value) return "";
    if (/\s/.test(value)) return "Remove spaces from the website, or leave it blank.";
    if (value.length > 200) return "That website address is too long.";
    return "";
  }

  function validate(form) {
    var first = null;
    function check(field, message) {
      setFieldError(field, message);
      if (message && !first) first = field;
    }

    var name = form.querySelector("#name");
    var business = form.querySelector("#business");
    var email = form.querySelector("#email");
    var phone = form.querySelector("#phone");
    var trade = form.querySelector("#trade");
    var website = form.querySelector("#website");
    var need = form.querySelector("#need");
    var budget = form.querySelector('input[name="budget"]:checked');
    var budgetField = form.querySelector("#budget-under-500");

    name.value = name.value.trim();
    business.value = business.value.trim();
    email.value = email.value.trim();
    phone.value = phone.value.trim();
    website.value = website.value.trim();
    need.value = need.value.trim();

    check(name, name.value ? "" : "Enter your name.");
    check(business, business.value ? "" : "Enter the business name.");
    check(email, emailError(email.value));
    check(phone, phoneError(phone.value));
    check(trade, trade.value ? "" : "Choose a trade.");
    check(website, websiteError(website.value));
    check(need, need.value ? "" : "Tell us what you need.");

    var budgetError = document.getElementById("budget-error");
    if (!budget) {
      budgetError.textContent = "Choose a budget range.";
      budgetField.setAttribute("aria-invalid", "true");
      budgetField.setAttribute("aria-describedby", "budget-error");
      if (!first) first = budgetField;
    } else {
      budgetError.textContent = "";
      budgetField.removeAttribute("aria-invalid");
      budgetField.removeAttribute("aria-describedby");
    }

    return first;
  }

  function status(form, state, message) {
    var node = form.querySelector("#form-status");
    node.dataset.state = state;
    node.textContent = message;
  }

  function thanksCopy(emailOn, smsOn) {
    if (emailOn && smsOn) return "Thanks. We have your request. You asked us to reply by email and by text.";
    if (emailOn) return "Thanks. We have your request. You asked us to reply by email.";
    if (smsOn) return "Thanks. We have your request. You asked us to reply by text.";
    return "Thanks. We have your request. You left both reply options unchecked, so we will not email or text you unless you contact us.";
  }

  function showThanks(form, message) {
    form.hidden = true;
    var panel = document.getElementById("thanks");
    var copy = document.getElementById("thanks-copy");
    panel.hidden = false;
    copy.textContent = message;
    copy.focus();
  }

  function honeypotFilled(form) {
    var traps = form.querySelectorAll(".hp input");
    for (var i = 0; i < traps.length; i++) {
      if (traps[i].value) return true;
    }
    return false;
  }

  function applyPackage() {
    var params = new URLSearchParams(location.search);
    var key = params.get("package") || "";
    var note = document.getElementById("package-note");
    var field = document.getElementById("package-field");
    var nameField = document.getElementById("package-name-field");
    if (!Object.prototype.hasOwnProperty.call(PACKAGES, key)) {
      field.value = "";
      nameField.value = "";
      note.hidden = true;
      return;
    }
    field.value = key;
    nameField.value = PACKAGES[key];
    note.hidden = false;
    note.textContent = "You’re asking about " + PACKAGES[key] + ".";
  }

  function bind() {
    var form = document.getElementById("quote-form");
    if (!form) return;
    applyPackage();
    form.dataset.configured = configuredEndpoint() ? "true" : "false";
    form.dataset.endpoint = resolveEndpoint();

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (form.dataset.sending === "true") return;

      if (honeypotFilled(form)) {
        status(form, "success", "");
        showThanks(form, "Thanks. We have your request.");
        return;
      }

      var invalid = validate(form);
      if (invalid) {
        status(form, "invalid", "Check the highlighted fields and try again.");
        invalid.focus();
        return;
      }

      var endpoint = resolveEndpoint();
      var emailOn = form.querySelector("#email-opt-in").checked;
      var smsOn = form.querySelector("#sms-opt-in").checked;
      if (!endpoint) {
        status(form, "unconfigured", "This form is not connected to an inbox yet. Email winning@wealthyward.site with the same details and we will reply.");
        return;
      }

      var data = new FormData(form);
      data.set("email_reply_opt_in", emailOn ? "yes" : "no");
      data.set("sms_opt_in", smsOn ? "yes" : "no");
      data.set("_subject", "Quote request: " + form.querySelector("#business").value);
      data.set("_replyto", form.querySelector("#email").value);

      var button = form.querySelector("[type=submit]");
      form.dataset.sending = "true";
      button.disabled = true;
      var previousLabel = button.textContent;
      button.textContent = "Sending…";
      status(form, "sending", "Sending your request…");

      fetch(endpoint, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" }
      }).then(function (response) {
        if (!response.ok) throw new Error("status " + response.status);
        status(form, "success", "");
        showThanks(form, thanksCopy(emailOn, smsOn));
        try { gtag("event", "generate_lead", { form: "quote" }); } catch (err) { /* analytics optional */ }
      }).catch(function () {
        form.dataset.sending = "false";
        button.disabled = false;
        button.textContent = previousLabel;
        status(form, "error", "We couldn’t send that. Email winning@wealthyward.site and we will take it from there.");
      });
    });
  }

  window.NDW_RESOLVE_FORM_ENDPOINT = resolveEndpoint;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
