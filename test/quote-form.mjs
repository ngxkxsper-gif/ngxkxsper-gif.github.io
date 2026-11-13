/**
 * Local end-to-end test for the quote form and package buttons.
 *
 * Serves the site plus a Formspree-style mock at POST /__form-test.
 * Nothing is emailed. The quote page only uses that mock when opened on
 * localhost as /quote/?formtest=1&endpoint=/__form-test.
 *
 *   node test/quote-form.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = "/tmp/ndw-shots";
const chromePort = 9333;
const failures = [];
const submissions = [];

function fail(message) {
  failures.push(message);
  console.error("FAIL", message);
}

function assert(condition, message) {
  if (!condition) fail(message);
  else console.log("ok", message);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".json": "application/json"
};

function parseFields(buffer, contentType) {
  const text = buffer.toString("utf8");
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || "");
  if (!boundaryMatch) return Object.fromEntries(new URLSearchParams(text));
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const fields = {};
  for (const part of text.split("--" + boundary).slice(1)) {
    if (part.startsWith("--")) continue;
    const nameMatch = /name="([^"]+)"/.exec(part);
    if (!nameMatch) continue;
    const splitAt = part.indexOf("\r\n\r\n");
    if (splitAt < 0) continue;
    fields[nameMatch[1]] = part.slice(splitAt + 4).replace(/\r\n$/, "");
  }
  return fields;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/__form-test") {
      if (req.method === "POST") {
        const fields = parseFields(await readBody(req), req.headers["content-type"]);
        submissions.push(fields);
        res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "DELETE") {
        submissions.length = 0;
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ submissions }));
      return;
    }

    let pathname = decodeURIComponent(url.pathname);
    let filePath = path.normalize(path.join(root, pathname));
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      if (!pathname.endsWith("/")) {
        res.writeHead(301, { Location: pathname + "/" + url.search });
        res.end();
        return;
      }
      filePath = path.join(filePath, "index.html");
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function crawl(origin) {
  const queue = ["/", "/preview-v5/", "/robots.txt", "/sitemap.xml", "/og-image.png"];
  const seen = new Set();
  while (queue.length) {
    const pagePath = queue.shift();
    if (seen.has(pagePath)) continue;
    seen.add(pagePath);
    const response = await fetch(origin + pagePath);
    assert(response.status === 200, pagePath + " returns " + response.status);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("html")) {
      await response.arrayBuffer();
      continue;
    }
    const html = await response.text();
    const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    for (const ref of refs) {
      if (ref.startsWith("mailto:") || ref.startsWith("tel:") || ref.startsWith("sms:") || ref.startsWith("data:")) continue;
      if (/^https?:\/\//i.test(ref)) continue;
      const resolved = new URL(ref, origin + pagePath);
      if (resolved.origin !== origin) continue;
      const hash = decodeURIComponent(resolved.hash.replace(/^#/, ""));
      const target = resolved.pathname || "/";
      if (!seen.has(target)) queue.push(target);
      if (!hash) continue;
      const page = await fetch(origin + target);
      const body = await page.text();
      const idPattern = new RegExp("\\sid=\"" + hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\"");
      assert(page.status === 200 && idPattern.test(body), pagePath + " link " + ref + " finds #" + hash);
    }
  }
  console.log("crawled", seen.size, "local URLs");
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 0;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

async function chromeTarget(url) {
  const endpoint = "http://127.0.0.1:" + chromePort + "/json/new?" + encodeURIComponent(url);
  let response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok) response = await fetch(endpoint);
  if (!response.ok) throw new Error("unable to open tab " + response.status);
  return response.json();
}

async function connect(url) {
  const target = await chromeTarget(url);
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const expected = url.split("#")[0];
  const started = Date.now();
  while (Date.now() - started < 8000) {
    const ready = await cdp.send("Runtime.evaluate", {
      expression: "({state: document.readyState, href: location.href})",
      returnByValue: true
    });
    const value = ready.result && ready.result.value;
    if (value && value.state === "complete" && value.href.startsWith(expected)) break;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  cdp.targetId = target.id;
  return cdp;
}

async function closeTarget(cdp) {
  cdp.close();
  await fetch("http://127.0.0.1:" + chromePort + "/json/close/" + cdp.targetId);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "evaluate failed");
  return result.result.value;
}

async function waitFor(cdp, expression) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (await evaluate(cdp, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("timed out: " + expression);
}

async function screenshot(cdp, name, metrics) {
  if (metrics) await cdp.send("Emulation.setDeviceMetricsOverride", metrics);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(path.join(shots, name), Buffer.from(shot.data, "base64"));
}

const desktop = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };
const phone = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };

function fillExpression(options) {
  return `(() => {
    const set = (id, value) => { const el = document.getElementById(id); el.value = value; };
    set("name", ${JSON.stringify(options.name ?? "Ada Owner")});
    set("business", ${JSON.stringify(options.business ?? "North Test Plumbing")});
    set("email", ${JSON.stringify(options.email ?? "ada@example.com")});
    set("phone", ${JSON.stringify(options.phone ?? "")});
    document.getElementById("trade").value = ${JSON.stringify(options.trade ?? "Plumbing")};
    set("website", ${JSON.stringify(options.website ?? "")});
    set("need", ${JSON.stringify(options.need ?? "A one-page site with a click-to-call button.")});
    const budget = document.querySelector('input[name="budget"][value="Not sure yet"]');
    budget.checked = true;
    document.getElementById("email-opt-in").checked = ${options.emailOpt ? "true" : "false"};
    document.getElementById("sms-opt-in").checked = ${options.smsOpt ? "true" : "false"};
    document.getElementById("company-fax").value = ${JSON.stringify(options.fax ?? "")};
    return true;
  })()`;
}

async function main() {
  fs.mkdirSync(shots, { recursive: true });
  const config = fs.readFileSync(path.join(root, "js/site-config.js"), "utf8");
  assert(config.includes('FORM_ENDPOINT: "PASTE_FORM_ENDPOINT_HERE"'), "FORM_ENDPOINT placeholder is still the only destination");
  assert(config.includes('"launch-pad": ""'), "launch-pad checkout starts empty");
  const quoteHtml = fs.readFileSync(path.join(root, "quote/index.html"), "utf8");
  for (const phrase of [
    "Message frequency varies.",
    "Message and data rates may apply.",
    "Reply STOP to opt out.",
    "Consent is not a condition of purchase.",
    'href="/privacy/#sms"'
  ]) {
    assert(quoteHtml.includes(phrase), "quote form contains: " + phrase);
  }
  assert(!/id="email-opt-in"[^>]*checked/.test(quoteHtml), "email opt-in is unchecked");
  assert(!/id="sms-opt-in"[^>]*checked/.test(quoteHtml), "text opt-in is unchecked");
  const privacy = fs.readFileSync(path.join(root, "privacy/index.html"), "utf8");
  assert(privacy.includes('id="sms"') && privacy.includes("Consent is not a condition of purchase."), "privacy note has the text terms");

  const server = await startServer();
  const origin = "http://127.0.0.1:" + server.address().port;
  console.log("serving", origin);
  let chrome;
  try {
  await crawl(origin);

  const userData = fs.mkdtempSync("/tmp/ndw-chrome-");
  chrome = spawn("/usr/bin/google-chrome", [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--remote-allow-origins=*",
    "--remote-debugging-port=" + chromePort,
    "--user-data-dir=" + userData,
    "about:blank"
  ], { stdio: "ignore" });
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const version = await fetch("http://127.0.0.1:" + chromePort + "/json/version");
      if (version.ok) break;
    } catch { /* chrome still booting */ }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  const quote = await connect(origin + "/quote/");
  await quote.send("Emulation.setDeviceMetricsOverride", desktop);
  await screenshot(quote, "quote-desktop.png");
  assert(await evaluate(quote, "document.getElementById('email-opt-in').checked === false && document.getElementById('sms-opt-in').checked === false"), "both opt-ins render unchecked");
  await evaluate(quote, "document.querySelector('#quote-form [type=submit]').click()");
  assert(await evaluate(quote, "document.getElementById('form-status').dataset.state") === "invalid", "empty submit is invalid");
  assert((await (await fetch(origin + "/__form-test")).json()).submissions.length === 0, "invalid submit does not post");
  await screenshot(quote, "quote-validation-desktop.png");

  await evaluate(quote, fillExpression({ phone: "12" }));
  await evaluate(quote, "document.querySelector('#quote-form [type=submit]').click()");
  assert((await evaluate(quote, "document.getElementById('phone-error').textContent")).includes("7 to 15"), "short phone is rejected");

  await evaluate(quote, fillExpression({ website: "my site" }));
  await evaluate(quote, "document.querySelector('#quote-form [type=submit]').click()");
  assert((await evaluate(quote, "document.getElementById('website-error').textContent")).includes("spaces"), "website spaces are rejected");

  await evaluate(quote, fillExpression({}));
  await evaluate(quote, "document.querySelector('#quote-form [type=submit]').click()");
  await waitFor(quote, "document.getElementById('form-status').dataset.state === 'unconfigured'");
  const unconfigured = await evaluate(quote, "document.getElementById('form-status').textContent");
  assert(unconfigured.includes("not connected to an inbox"), "placeholder endpoint does not pretend to send");
  assert((await (await fetch(origin + "/__form-test")).json()).submissions.length === 0, "placeholder endpoint does not post");
  await closeTarget(quote);

  const phonePage = await connect(origin + "/quote/?package=launch-pad");
  await phonePage.send("Emulation.setDeviceMetricsOverride", phone);
  await evaluate(phonePage, "document.getElementById('sms-opt-in').scrollIntoView({block:'center'})");
  await screenshot(phonePage, "quote-mobile-consent.png");
  assert(await evaluate(phonePage, "document.getElementById('package-note').textContent.includes('Launch Pad')"), "package query is shown");
  await closeTarget(phonePage);

  const live = await connect(origin + "/quote/?formtest=1&endpoint=/__form-test&package=business-website");
  assert(await evaluate(live, "document.getElementById('quote-form').dataset.endpoint") === "/__form-test", "localhost test endpoint is armed");
  await evaluate(live, fillExpression({ fax: "bot" }));
  await evaluate(live, "document.querySelector('#quote-form [type=submit]').click()");
  await waitFor(live, "document.getElementById('thanks').hidden === false");
  assert((await (await fetch(origin + "/__form-test")).json()).submissions.length === 0, "honeypot submit is not delivered");
  await closeTarget(live);

  const sent = await connect(origin + "/quote/?formtest=1&endpoint=/__form-test&package=business-website");
  await sent.send("Emulation.setDeviceMetricsOverride", desktop);
  await evaluate(sent, fillExpression({ phone: "(615) 555-0100", website: "example.com" }));
  const unchecked = await evaluate(sent, "({email: document.getElementById('email-opt-in').checked, sms: document.getElementById('sms-opt-in').checked})");
  assert(unchecked.email === false && unchecked.sms === false, "opt-ins stay unchecked while filling");
  await evaluate(sent, "document.querySelector('#quote-form [type=submit]').click()");
  await waitFor(sent, "document.getElementById('thanks').hidden === false");
  let body = (await (await fetch(origin + "/__form-test")).json()).submissions.at(-1);
  assert(body && body.name === "Ada Owner" && body.business === "North Test Plumbing", "mock received the business fields");
  assert(body.email === "ada@example.com" && body.phone === "(615) 555-0100", "mock received email and phone");
  assert(body.trade === "Plumbing" && body.website === "example.com", "mock received trade and website");
  assert(body.message.includes("click-to-call") && body.budget === "Not sure yet", "mock received the request and budget");
  assert(body.email_reply_opt_in === "no" && body.sms_opt_in === "no", "unchecked consents are delivered as no");
  assert(body.package === "business-website" && body.package_name.includes("Business Website"), "package context is delivered");
  assert(body._gotcha === "" && body._honey === "", "honeypot fields are empty on a real submit");
  const thanks = await evaluate(sent, "document.getElementById('thanks-copy').textContent");
  assert(thanks.includes("left both reply options unchecked"), "success copy matches declined consents");
  await screenshot(sent, "quote-success-desktop.png");
  await closeTarget(sent);

  await fetch(origin + "/__form-test", { method: "DELETE" });
  const opted = await connect(origin + "/quote/?formtest=1&endpoint=/__form-test");
  await evaluate(opted, fillExpression({ emailOpt: true, smsOpt: true }));
  await evaluate(opted, "document.querySelector('#quote-form [type=submit]').click()");
  await waitFor(opted, "document.getElementById('thanks').hidden === false");
  body = (await (await fetch(origin + "/__form-test")).json()).submissions.at(-1);
  assert(body.email_reply_opt_in === "yes" && body.sms_opt_in === "yes", "checked consents are delivered as yes");
  assert((await evaluate(opted, "document.getElementById('thanks-copy').textContent")).includes("email and by text"), "success copy matches both consents");
  await closeTarget(opted);

  const home = await connect(origin + "/#pricing");
  await home.send("Emulation.setDeviceMetricsOverride", desktop);
  await screenshot(home, "pricing-desktop.png");
  const buttons = await evaluate(home, `Array.from(document.querySelectorAll("[data-checkout]")).map(a => ({key: a.getAttribute("data-checkout"), href: a.href, text: a.textContent.trim(), target: a.target}))`);
  const keys = ["launch-pad", "business-website", "growth-website", "care-watch", "care-maintain", "care-protect"];
  assert(buttons.length === keys.length, "each package has one button");
  for (const key of keys) {
    const button = buttons.find((item) => item.key === key);
    assert(button && button.text === "Get started" && button.href.includes("/quote/?package=" + key) && button.target === "", key + " falls back to the quote form");
  }
  await evaluate(home, `window.NDW_CONFIG.CHECKOUT_LINKS["launch-pad"] = "https://example.com/pay/launch";
    window.NDW_CONFIG.CHECKOUT_LINKS["business-website"] = "javascript:alert(1)";
    window.NDW_CONFIG.CHECKOUT_LINKS["growth-website"] = "PASTE_CHECKOUT_LINK_HERE";
    window.NDW_CONFIG.CHECKOUT_LINKS["care-watch"] = "  https://example.com/pay/watch  ";
    window.NDW_APPLY_CHECKOUT();`);
  const after = await evaluate(home, `Object.fromEntries(Array.from(document.querySelectorAll("[data-checkout]")).map(a => [a.getAttribute("data-checkout"), {href: a.href, text: a.textContent.trim(), target: a.target, rel: a.rel}]))`);
  assert(after["launch-pad"].text === "Pay" && after["launch-pad"].href === "https://example.com/pay/launch" && after["launch-pad"].target === "_blank", "filled checkout link becomes Pay");
  assert(after["launch-pad"].rel.includes("noopener"), "Pay link uses noopener");
  assert(after["business-website"].text === "Get started" && after["business-website"].href.includes("/quote/?package=business-website"), "javascript checkout URLs fall back");
  assert(after["growth-website"].text === "Get started", "placeholder checkout text falls back");
  assert(after["care-watch"].text === "Pay" && after["care-watch"].href === "https://example.com/pay/watch", "trimmed https checkout links are used");
  await home.send("Emulation.setDeviceMetricsOverride", phone);
  await evaluate(home, "document.getElementById('pricing').scrollIntoView()");
  await screenshot(home, "pricing-mobile.png");
  const mobileNav = await evaluate(home, "getComputedStyle(document.querySelector('nav a.quote-link')).display !== 'none'");
  assert(mobileNav, "Get a quote stays in the mobile header");
  await closeTarget(home);

  } finally {
    if (chrome) chrome.kill();
    server.close();
  }
  if (failures.length) {
    console.error(failures.length + " failed");
    process.exit(1);
  }
  console.log("all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
