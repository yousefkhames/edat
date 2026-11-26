/* Edat E2E click-through: real Chrome against a local static server.
   Run: node tests/e2e.mjs  (requires puppeteer-core + google-chrome) */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const FIX = join(ROOT, "tests", "fixtures");
const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png",
  ".jpg": "image/jpeg", ".pdf": "application/pdf"
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("nf");
  }
});

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`ok   - ${name}`); }
  else { failed++; console.log(`FAIL - ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitRows(page, panelId, min, timeout = 30000) {
  await page.waitForFunction(
    (pid, n) => document.querySelectorAll(`#panel-${pid} [data-role="results"] .row`).length >= n,
    { timeout }, panelId, min
  );
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"]
});

try {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
  check("page loads with Edat title", (await page.title()).includes("Edat"));

  /* language toggle */
  await page.click("#langToggle");
  await sleep(200);
  check("AR switch sets rtl", await page.evaluate(() => document.documentElement.dir === "rtl"));
  check("AR brand name", await page.evaluate(() =>
    document.querySelector(".brand-name").textContent.trim() === "عِدّة"));
  await page.screenshot({ path: join(ROOT, "tests", "out-ar-home.png") });
  await page.click("#langToggle");
  await sleep(200);
  check("back to EN/ltr", await page.evaluate(() => document.documentElement.dir === "ltr"));

  /* ---- image compress ---- */
  const icInput = await page.$('#panel-img-compress input[type="file"]');
  await icInput.uploadFile(join(FIX, "sample.png"), join(FIX, "photo.jpg"));
  await waitRows(page, "img-compress", 2);
  await page.click('#panel-img-compress [data-act="process"]');
  await page.waitForFunction(() =>
    document.querySelectorAll('#panel-img-compress [data-role="results"] .row .btn.ghost').length >= 2,
    { timeout: 30000 });
  const ic = await page.evaluate(() =>
    [...document.querySelectorAll('#panel-img-compress .row .sub')].map((e) => e.textContent));
  check("compress: 2 results with downloads", ic.length >= 2, JSON.stringify(ic));
  check("compress: PNG got smaller", ic.some((s) => /→/.test(s) && /−/.test(s)), JSON.stringify(ic));
  check("compress: ZIP-all bar visible", await page.evaluate(() =>
    !document.querySelector('#panel-img-compress [data-role="bulkbar"]').hidden));
  await page.screenshot({ path: join(ROOT, "tests", "out-en-compress.png") });

  /* ---- image convert ---- */
  await page.click('[data-panel="img-convert"]');
  const cvInput = await page.$('#panel-img-convert input[type="file"]');
  await cvInput.uploadFile(join(FIX, "sample.png"));
  await page.click('#panel-img-convert [data-act="process"]');
  await page.waitForFunction(() =>
    document.querySelectorAll('#panel-img-convert .row .btn.ghost').length >= 1, { timeout: 20000 });
  const cvName = await page.evaluate(() =>
    document.querySelector('#panel-img-convert .row .name').textContent);
  check("convert: output name shown", /sample/.test(cvName), cvName);

  /* convert png->png keeps the already-smaller original */
  await page.select('#panel-img-convert [data-opt="format"]', "png");
  await page.click('#panel-img-convert [data-act="process"]');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#panel-img-convert .row .kept-note')].length >= 1,
    { timeout: 20000 });
  check("convert: same-format keeps original with note", true);

  /* ---- pdf merge ---- */
  await page.click('[data-panel="pdf-merge"]');
  const mgInput = await page.$('#panel-pdf-merge input[type="file"]');
  await mgInput.uploadFile(join(FIX, "a.pdf"), join(FIX, "b.pdf"));
  await waitRows(page, "pdf-merge", 2);
  /* reorder: move second file up */
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#panel-pdf-merge .row')];
    rows[1].querySelectorAll(".row-actions .btn")[0].click();
  });
  const firstName = await page.evaluate(() =>
    document.querySelector('#panel-pdf-merge .row .name').textContent);
  check("merge: reorder works", firstName === "b.pdf", firstName);
  await page.click('#panel-pdf-merge [data-act="merge"]');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#panel-pdf-merge .row .name')]
      .some((e) => e.textContent === "edat-merged.pdf"), { timeout: 20000 });
  check("merge: merged.pdf produced", true);
  check("merge: notice shown", await page.evaluate(() =>
    !document.querySelector('#panel-pdf-merge [data-role="notice"]').hidden));

  /* ---- pdf split ---- */
  await page.click('[data-panel="pdf-split"]');
  const spInput = await page.$('#panel-pdf-split input[type="file"]');
  await spInput.uploadFile(join(FIX, "big.pdf"));
  await waitRows(page, "pdf-split", 1);
  await page.type('#panel-pdf-split [data-opt="ranges"]', "1-2, 5");
  await page.click('#panel-pdf-split [data-act="split"]');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#panel-pdf-split .row .name')]
      .some((e) => /big-pages\.pdf/.test(e.textContent)), { timeout: 20000 });
  check("split: pages pdf produced", true);

  /* split: bad range shows an error */
  await page.click('#panel-pdf-split [data-opt="ranges"]', { clickCount: 3 });
  await page.type('#panel-pdf-split [data-opt="ranges"]', "99-100");
  await page.click('#panel-pdf-split [data-act="split"]');
  await sleep(600);
  check("split: out-of-bounds range rejected", await page.evaluate(() => {
    const n = document.querySelector('#panel-pdf-split [data-role="notice"]');
    return !n.hidden && n.classList.contains("err");
  }));
  await page.evaluate(() => {
    const el = document.querySelector('#panel-pdf-split [data-opt="ranges"]');
    el.value = "";
  });

  /* split: ZIP of every page */
  await page.select('#panel-pdf-split [data-opt="mode"]', "each");
  await page.click('#panel-pdf-split [data-act="split"]');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#panel-pdf-split .row .name')]
      .some((e) => /big-split\.zip/.test(e.textContent)), { timeout: 30000 });
  check("split: per-page ZIP produced", true);

  /* ---- pdf compress ---- */
  await page.click('[data-panel="pdf-compress"]');
  const pcInput = await page.$('#panel-pdf-compress input[type="file"]');
  await pcInput.uploadFile(join(FIX, "big.pdf"));
  await waitRows(page, "pdf-compress", 1);
  await page.click('#panel-pdf-compress [data-act="compress"]');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#panel-pdf-compress .row .name')]
      .some((e) => /big-small\.pdf/.test(e.textContent)), { timeout: 60000 });
  check("pdf compress: small.pdf produced", true);

  /* stats persisted */
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem("edat.stats")));
  check("stats counted files", stats && stats.files >= 5, JSON.stringify(stats));
  await page.reload({ waitUntil: "networkidle0" });
  check("stats bar survives reload", await page.evaluate(() =>
    !document.getElementById("statsBar").hidden));

  check("no page/console errors", errors.length === 0, errors.join(" | "));
  if (errors.length) console.log("errors:", errors);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
