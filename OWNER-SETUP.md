# Quote form and package payments

The quote form lives at `/quote/`. Package buttons live in the pricing section on the home page. Both read `js/site-config.js`. That file is the only place to set the inbox and the checkout links.

## Values to fill in

In `js/site-config.js`:

| Config value | What to paste | If you leave it |
| --- | --- | --- |
| `FORM_ENDPOINT` | Full form URL. Replace `PASTE_FORM_ENDPOINT_HERE`. | The quote form does not send. It tells the visitor to email winning@wealthyward.site. |
| `CHECKOUT_LINKS["launch-pad"]` | https checkout URL for Launch Pad ($449) | Button says Get started and opens `/quote/?package=launch-pad` |
| `CHECKOUT_LINKS["business-website"]` | https checkout URL for Business Website ($750) | Opens `/quote/?package=business-website` |
| `CHECKOUT_LINKS["growth-website"]` | https checkout URL for Growth Website ($1,495) | Opens `/quote/?package=growth-website` |
| `CHECKOUT_LINKS["care-watch"]` | https checkout URL for Watch ($75/mo) | Opens `/quote/?package=care-watch` |
| `CHECKOUT_LINKS["care-maintain"]` | https checkout URL for Maintain ($100/mo) | Opens `/quote/?package=care-maintain` |
| `CHECKOUT_LINKS["care-protect"]` | https checkout URL for Protect ($125/mo) | Opens `/quote/?package=care-protect` |

Do not invent an address in the file. The notification inbox is chosen in the form service’s dashboard (Formspree) or, if you choose FormSubmit, inside the URL you paste.

A checkout value is used only when it is an `http:` or `https:` URL. Anything else, including a leftover placeholder, keeps the quote-form fallback. There is no dead Pay link.

## Connect the inbox (Formspree)

Formspree fits this site: the pages are static, and the visitor’s browser posts the form. No PHP and no server on GitHub Pages or IONOS.

1. Create a form at [formspree.io](https://formspree.io/).
2. Set the notification email in the Formspree dashboard to the inbox you actually read.
3. Copy the endpoint. It looks like `https://formspree.io/f/xxxxxxxx`.
4. Paste it as `FORM_ENDPOINT`, replacing `PASTE_FORM_ENDPOINT_HERE`.
5. In Formspree, allow the host that serves the site (`wealthyward.site`). Add any other host you serve the same files from.
6. Republish `js/site-config.js` (see hosting below).

The Web Doctor and Marketing forms already post to `https://formspree.io/f/xgaakjqj`. Paste that same URL into `FORM_ENDPOINT` if quote requests should land in that inbox.

Formspree’s spam filter also reads the empty `_gotcha` field. The form includes that honeypot, plus a second empty `_honey` field for FormSubmit, and it refuses to send if either one is filled in.

### FormSubmit instead

Set `FORM_ENDPOINT` to `https://formsubmit.co/ajax/YOUR_REAL_EMAIL`, submit one request, and confirm the message FormSubmit sends. The address in that URL is public, because this file is public. Formspree keeps the address off the site.

## Connect Pay buttons

Create one checkout link per package in Stripe Payment Links, Square, or whatever processor you use. Paste each URL into the matching `CHECKOUT_LINKS` key. Republish.

When a link is present the button label becomes Pay and opens in a new tab. When it is blank the label stays Get started and opens the quote form with that package noted.

Prices on the page are unchanged. The buttons do not add a new price.

## Hosting

### GitHub Pages (this is what is live)

`wealthyward.site` answers from GitHub Pages today (`CNAME` is `wealthyward.site`; the live response is served by GitHub). This repository is the site. Publishing the default branch updates the files. The form does not need a GitHub Action, a serverless function, or a build step.

After you edit `js/site-config.js`, commit it and publish. GitHub Pages can take a minute to show the new file. A hard refresh avoids a cached copy of the old script.

### IONOS

Nothing in this repository deploys to IONOS. There is no IONOS project file.

- If IONOS is only DNS for `wealthyward.site` and the records point at GitHub Pages, you do not upload a second copy. Fill in `js/site-config.js` here and publish to GitHub Pages.
- If IONOS Web Hosting, Deploy Now, or FTP also has a copy of the HTML, upload the same tree, including `quote/`, `privacy/`, `js/site-config.js`, `js/quote-form.js`, and `js/checkout.js`. A placeholder left on the IONOS copy will not deliver, even if GitHub Pages is configured.
- Do not switch this form to an IONOS PHP mailer. It posts from the browser to Formspree or FormSubmit so both hosts behave the same way.
- Serve the site over HTTPS. Checkout URLs should be `https`.
- If IONOS caches static files, clear that cache after replacing `js/site-config.js`.

The form service must allow the host people actually use. If both GitHub Pages and an IONOS hostname can show the site, allow both in Formspree.

## Test without emailing anyone

From the repository root:

```bash
node test/quote-form.mjs
```

That starts a local static server and a Formspree-style mock at `/__form-test`. It checks validation, the honeypot, both consent checkboxes (unchecked by default, and included as yes/no), the unconfigured placeholder, checkout fallback, and that every local page returns 200.

Browser check against the same mock, from the test server it prints:

`/quote/?formtest=1&endpoint=/__form-test`

That query is honored only on localhost. On `wealthyward.site` it is ignored, so it cannot forward a real lead somewhere else.

To test the real inbox after you paste an endpoint, submit one request with your own email and confirm it arrives. The first Formspree or FormSubmit form often needs a confirmation click before it delivers.
