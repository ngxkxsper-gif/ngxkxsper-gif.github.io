/* NDW INC — site configuration
   This is the only file that chooses where quote requests are delivered
   and where each package's Pay button goes.

   How to fill it in
   -----------------
   1. FORM_ENDPOINT
      Replace PASTE_FORM_ENDPOINT_HERE with the full URL of a form inbox.
      Recommended: Formspree (https://formspree.io).
        - Create a form and set its notification email in the Formspree
          dashboard. Do not put that email in this file.
        - Copy the endpoint. It looks like https://formspree.io/f/xxxxxxxx
        - The Web Doctor and Marketing forms already post to
          https://formspree.io/f/xgaakjqj
          Paste that same URL here if quote requests should use that inbox.
      Alternative: FormSubmit.
        - Use https://formsubmit.co/ajax/YOUR_REAL_EMAIL
        - Submit one test and confirm the message FormSubmit sends you.
        - That address will be visible in this public file. Formspree keeps
          the address in your dashboard instead.
      Leave the placeholder in place until you have a real endpoint.
      The quote form will not post anywhere, and it will say so.

   2. CHECKOUT_LINKS
      One https URL per package (Stripe Payment Link, Square, or similar).
      Leave a value as "" and that button stays "Get started" and opens
      the quote form. A non-URL is treated the same way, so a dead link
      is never left on the page.

   3. Republish the site after saving.
      GitHub Pages serves this repository. If IONOS also hosts a copy of
      the files, upload this file there too. Steps: OWNER-SETUP.md
*/
window.NDW_CONFIG = {
  FORM_ENDPOINT: "PASTE_FORM_ENDPOINT_HERE",

  CHECKOUT_LINKS: {
    "launch-pad": "",
    "business-website": "",
    "growth-website": "",
    "care-watch": "",
    "care-maintain": "",
    "care-protect": ""
  }
};
