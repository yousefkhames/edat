/* Edat core tests - run: node --test tests/ */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../assets/js/core.js");
const I18n = require("../assets/js/i18n.js");

test("formatBytes: units and rounding", () => {
  assert.equal(Core.formatBytes(0), "0 B");
  assert.equal(Core.formatBytes(512), "512 B");
  assert.equal(Core.formatBytes(1024), "1 KB");
  assert.equal(Core.formatBytes(1536), "1.5 KB");
  assert.equal(Core.formatBytes(5 * 1024 * 1024), "5 MB");
  assert.equal(Core.formatBytes(2.25 * 1024 * 1024), "2.3 MB");
  assert.equal(Core.formatBytes(-5), "0 B");
  assert.equal(Core.formatBytes(NaN), "0 B");
});

test("savingsPercent", () => {
  assert.equal(Core.savingsPercent(1000, 500), 50);
  assert.equal(Core.savingsPercent(1000, 1250), -25);
  assert.equal(Core.savingsPercent(0, 500), 0);
});

test("parsePageRanges: basics", () => {
  assert.deepEqual(Core.parsePageRanges("1-3", 10), [{ from: 1, to: 3 }]);
  assert.deepEqual(Core.parsePageRanges("1-3, 5, 8-10", 10),
    [{ from: 1, to: 3 }, { from: 5, to: 5 }, { from: 8, to: 10 }]);
  assert.deepEqual(Core.parsePageRanges("7", 10), [{ from: 7, to: 7 }]);
  // reversed bounds normalize
  assert.deepEqual(Core.parsePageRanges("4-2", 10), [{ from: 2, to: 4 }]);
  // Arabic comma separator
  assert.deepEqual(Core.parsePageRanges("1،3", 10), [{ from: 1, to: 1 }, { from: 3, to: 3 }]);
});

test("parsePageRanges: errors carry codes", () => {
  assert.throws(() => Core.parsePageRanges("", 10), /empty range/);
  assert.throws(() => Core.parsePageRanges("abc", 10), /syntax/);
  assert.throws(() => Core.parsePageRanges("1-99", 10), /bounds/);
  assert.throws(() => Core.parsePageRanges("0-3", 10), /bounds/);
  try { Core.parsePageRanges("x", 5); assert.fail("should throw"); }
  catch (e) { assert.equal(e.code, "syntax"); }
});

test("rangesToIndices: 0-based, sorted, deduped", () => {
  assert.deepEqual(
    Core.rangesToIndices([{ from: 2, to: 3 }, { from: 1, to: 2 }], 5), [0, 1, 2]);
  assert.deepEqual(Core.rangesToIndices([{ from: 5, to: 5 }], 3), []);
});

test("fitDimensions", () => {
  assert.deepEqual(Core.fitDimensions(4000, 3000, 2000), { width: 2000, height: 1500 });
  assert.deepEqual(Core.fitDimensions(1000, 500, 2000), { width: 1000, height: 500 });
  assert.deepEqual(Core.fitDimensions(100, 100, 0), { width: 100, height: 100 });
  assert.deepEqual(Core.fitDimensions(3000, 4000, 2000), { width: 1500, height: 2000 });
});

test("imageOutputName and extOf", () => {
  assert.equal(Core.imageOutputName("photo.png", "jpeg"), "photo.jpg");
  assert.equal(Core.imageOutputName("photo.jpeg", "webp"), "photo.webp");
  assert.equal(Core.imageOutputName("مخطط.png", "png"), "مخطط.png");
  assert.equal(Core.extOf("a.B.PDF"), "pdf");
  assert.equal(Core.stripExt("archive.tar.gz"), "archive.tar");
});

test("isSupportedImage / isPdf by type and extension", () => {
  assert.ok(Core.isSupportedImage({ type: "image/png", name: "x" }));
  assert.ok(Core.isSupportedImage({ type: "", name: "x.JPG" }));
  assert.ok(!Core.isSupportedImage({ type: "application/pdf", name: "x.pdf" }));
  assert.ok(Core.isPdf({ type: "application/pdf", name: "x" }));
  assert.ok(Core.isPdf({ type: "", name: "doc.PDF" }));
  assert.ok(!Core.isPdf({ type: "image/png", name: "x.png" }));
});

test("safeName strips path-unsafe characters", () => {
  assert.equal(Core.safeName('a/b\\c:d*e?"f<g>h|i'), "a_b_c_d_e__f_g_h_i");
});

test("i18n: every key exists in both languages", () => {
  const en = Object.keys(I18n.STR.en);
  const ar = Object.keys(I18n.STR.ar);
  assert.deepEqual([...en].sort(), [...ar].sort(),
    "en/ar dictionaries must have identical keys");
  en.forEach((k) => {
    assert.ok(I18n.STR.en[k].trim().length > 0, `empty en string: ${k}`);
    assert.ok(I18n.STR.ar[k].trim().length > 0, `empty ar string: ${k}`);
  });
});

test("i18n: makeT falls back and interpolates", () => {
  const t = I18n.makeT("ar");
  assert.equal(t("tool.pdfMerge"), I18n.STR.ar["tool.pdfMerge"]);
  const tEn = I18n.makeT("en");
  assert.equal(tEn("msg.merged", { n: 3 }), "Merged 3 PDFs into one.");
  assert.equal(t("no.such.key"), "no.such.key");
});

test("clamp", () => {
  assert.equal(Core.clamp(5, 10, 100), 10);
  assert.equal(Core.clamp(500, 10, 100), 100);
  assert.equal(Core.clamp(50, 10, 100), 50);
});
