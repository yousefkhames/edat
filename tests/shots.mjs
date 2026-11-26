/* Take README screenshots of the local app with clean sample data. */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const FIX = join(ROOT, "tests", "fixtures");
const OUT = join(ROOT, "docs");
const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".woff2": "font/woff2"
};
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1", "--hide-scrollbars"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 860 });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await sleep(400);
await page.screenshot({ path: join(OUT, "home-en.png") });

/* compress results view */
const icInput = await page.$('#panel-img-compress input[type="file"]');
await icInput.uploadFile(join(FIX, "sample.png"), join(FIX, "photo.jpg"));
await sleep(300);
await page.click('#panel-img-compress [data-act="process"]');
await page.waitForFunction(() =>
  document.querySelectorAll('#panel-img-compress .row .btn.ghost').length >= 2, { timeout: 30000 });
await sleep(300);
await page.evaluate(() => document.getElementById("panel-img-compress").scrollIntoView());
await sleep(300);
await page.screenshot({ path: join(OUT, "compress-en.png") });

/* merge view with files loaded */
await page.click('[data-panel="pdf-merge"]');
const mgInput = await page.$('#panel-pdf-merge input[type="file"]');
await mgInput.uploadFile(join(FIX, "a.pdf"), join(FIX, "b.pdf"), join(FIX, "big.pdf"));
await sleep(400);
await page.evaluate(() => document.getElementById("panel-pdf-merge").scrollIntoView());
await sleep(300);
await page.screenshot({ path: join(OUT, "merge-en.png") });

/* arabic home */
await page.evaluate(() => window.scrollTo(0, 0));
await page.click("#langToggle");
await sleep(400);
await page.screenshot({ path: join(OUT, "home-ar.png") });

await browser.close();
server.close();
console.log("screenshots saved");
