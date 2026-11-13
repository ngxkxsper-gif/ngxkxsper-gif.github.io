/* Points each [data-checkout] control at CHECKOUT_LINKS in js/site-config.js.
   A missing or non-http(s) value falls back to the quote form. */
(function () {
  function isHttpUrl(value) {
    if (typeof value !== "string") return false;
    var trimmed = value.trim();
    if (!trimmed) return false;
    var url;
    try {
      url = new URL(trimmed);
    } catch (err) {
      return false;
    }
    return url.protocol === "https:" || url.protocol === "http:";
  }

  function applyCheckoutLinks() {
    var links = (window.NDW_CONFIG && window.NDW_CONFIG.CHECKOUT_LINKS) || {};
    var nodes = document.querySelectorAll("[data-checkout]");
    Array.prototype.forEach.call(nodes, function (anchor) {
      var key = anchor.getAttribute("data-checkout") || "";
      var label = anchor.getAttribute("data-checkout-label") || "this package";
      var raw = Object.prototype.hasOwnProperty.call(links, key) ? links[key] : "";
      var payUrl = isHttpUrl(raw) ? String(raw).trim() : "";
      if (payUrl) {
        anchor.href = payUrl;
        anchor.textContent = "Pay";
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.setAttribute("aria-label", "Pay for " + label + " (opens in a new tab)");
      } else {
        anchor.href = "/quote/?package=" + encodeURIComponent(key);
        anchor.textContent = "Get started";
        anchor.removeAttribute("target");
        anchor.removeAttribute("rel");
        anchor.setAttribute("aria-label", "Get started with " + label);
      }
    });
  }

  window.NDW_APPLY_CHECKOUT = applyCheckoutLinks;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyCheckoutLinks);
  } else {
    applyCheckoutLinks();
  }
})();
