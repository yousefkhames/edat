/* Edat - app wiring. All processing happens locally in the browser. */
(function () {
  "use strict";
  window.__edatBuild = 11;
  var Core = window.EdatCore;
  var I18n = window.EdatI18n;

  /* ================= i18n ================= */
  var lang = localStorage.getItem("edat.lang") ||
    ((navigator.language || "").toLowerCase().indexOf("ar") === 0 ? "ar" : "en");
  var t = I18n.makeT(lang);

  function applyLang() {
    t = I18n.makeT(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = lang === "ar"
      ? "عِدّة - عدّة الملفات داخل المتصفح"
      : "Edat - in-browser file toolbox";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    localStorage.setItem("edat.lang", lang);
    renderStats();
  }

  document.getElementById("langToggle").addEventListener("click", function () {
    lang = lang === "ar" ? "en" : "ar";
    applyLang();
  });

  /* ================= stats ================= */
  function getStats() {
    try { return JSON.parse(localStorage.getItem("edat.stats")) || { files: 0, saved: 0 }; }
    catch (e) { return { files: 0, saved: 0 }; }
  }
  function addStats(files, saved) {
    var s = getStats();
    s.files += files; s.saved += Math.max(0, saved);
    try { localStorage.setItem("edat.stats", JSON.stringify(s)); } catch (e) {}
    renderStats();
  }
  function renderStats() {
    var s = getStats();
    var bar = document.getElementById("statsBar");
    if (!s.files) { bar.hidden = true; return; }
    bar.hidden = false;
    document.getElementById("statFiles").textContent = s.files;
    document.getElementById("statSaved").textContent = Core.formatBytes(s.saved, lang);
  }

  /* ================= toast ================= */
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  /* ================= tabs ================= */
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tool-tab"));
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (x) { x.classList.remove("active"); });
      tab.classList.add("active");
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      document.getElementById("panel-" + tab.dataset.panel).classList.add("active");
    });
  });

  /* ================= panel state ================= */
  /* state[panelId] = { files: [{file, url?, result?}], resultBlob, resultName } */
  var state = {};

  function panelEl(id) { return document.getElementById("panel-" + id); }
  function resultsEl(id) { return panelEl(id).querySelector('[data-role="results"]'); }
  function noticeEl(id) { return panelEl(id).querySelector('[data-role="notice"]'); }
  function bulkbarEl(id) { return panelEl(id).querySelector('[data-role="bulkbar"]'); }
  function optVal(id, name) {
    var el = panelEl(id).querySelector('[data-opt="' + name + '"]');
    return el ? el.value : null;
  }

  function setNotice(id, msg, isErr) {
    var n = noticeEl(id);
    if (!msg) { n.hidden = true; n.textContent = ""; return; }
    n.hidden = false;
    n.textContent = msg;
    n.classList.toggle("err", !!isErr);
  }

  /* live quality output */
  document.querySelectorAll('input[type="range"][data-opt="quality"]').forEach(function (r) {
    var out = r.closest(".opt").querySelector("output");
    r.addEventListener("input", function () { out.textContent = r.value; });
  });

  /* ================= dropzones ================= */
  var recentByPanel = {}; /* panelId -> {fileSig: timestamp}, reset on Clear */

  function setupDropzone(panelId, accept) {
    var dz = panelEl(panelId).querySelector(".dropzone");
    var input = dz.querySelector('input[type="file"]');
    var lastSig = null, lastTime = 0;
    function addFiles(list) {
      var files = Array.prototype.slice.call(list || []);
      if (!files.length) return;
      /* guard against double-dispatched change events re-adding the same batch */
      var sig = files.map(function (f) { return f.name + ":" + f.size; }).join("|");
      var now = Date.now();
      if (sig === lastSig && now - lastTime < 800) return;
      lastSig = sig; lastTime = now;
      var recentFiles = recentByPanel[panelId] || (recentByPanel[panelId] = {});
      var ok = [], skipped = 0;
      files.forEach(function (f) {
        if (f.size === 0) return; /* empty placeholder (staged upload) - real bytes follow */
        if (!accept(f)) { skipped++; return; }
        var fsig = f.name + ":" + f.size + ":" + f.lastModified;
        if (recentFiles[fsig] && now - recentFiles[fsig] < 4000) return; /* same file re-set a moment ago */
        recentFiles[fsig] = now;
        ok.push({ file: f });
      });
      if (!ok.length && !skipped) return;
      if (!state[panelId]) state[panelId] = { files: [] };
      if (panelId === "pdf-split" || panelId === "pdf-compress") {
        state[panelId].files = ok.slice(0, 1); // single-file tools
        if (ok.length > 1) skipped += ok.length - 1;
      } else {
        state[panelId].files = state[panelId].files.concat(ok);
      }
      state[panelId].resultBlob = null;
      state[panelId].resultName = null;
      if (skipped) setNotice(panelId, t("msg.badType"), true);
      else setNotice(panelId, null);
      renderPanel(panelId);
    }
    dz.addEventListener("click", function (e) {
      /* a click landing on the input itself must not re-trigger it (double file chooser) */
      if (e.target === input) return;
      input.click();
    });
    dz.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    input.addEventListener("change", function () { addFiles(input.files); input.value = ""; });
    ["dragenter", "dragover"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("drag"); });
    });
    dz.addEventListener("drop", function (e) { addFiles(e.dataTransfer.files); });
  }

  setupDropzone("img-compress", Core.isSupportedImage);
  setupDropzone("img-convert", Core.isSupportedImage);
  setupDropzone("pdf-merge", Core.isPdf);
  setupDropzone("img-pdf", Core.isSupportedImage);
  setupDropzone("pdf-split", Core.isPdf);
  setupDropzone("pdf-compress", Core.isPdf);

  /* ================= rendering ================= */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function downloadBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function renderPanel(id) {
    var st = state[id] || { files: [] };
    var list = resultsEl(id);
    list.innerHTML = "";
    var bulk = bulkbarEl(id);
    bulk.hidden = true;

    st.files.forEach(function (entry, idx) {
      var row = el("li", "row");
      if (entry.status === "failed") row.classList.add("status-failed");

      if (Core.isSupportedImage(entry.file)) {
        if (!entry.url) entry.url = URL.createObjectURL(entry.file);
        var img = el("img", "thumb");
        img.src = entry.url; img.alt = "";
        row.appendChild(img);
      } else {
        row.appendChild(el("span", "pdf-badge", "PDF"));
      }

      var meta = el("div", "meta");
      meta.appendChild(el("div", "name", entry.file.name));
      var sub = el("div", "sub");
      var sizeBit = Core.formatBytes(entry.file.size);
      if (entry.pages != null) sizeBit += " · " + entry.pages + " " + t("col.pages").toLowerCase();
      if (entry.result) {
        sizeBit += " → " + Core.formatBytes(entry.result.size);
        sub.appendChild(document.createTextNode(sizeBit));
        if (entry.result.kept) {
          sub.appendChild(el("span", "kept-note", t("msg.keptOriginal")));
        } else {
          var pct = Core.savingsPercent(entry.file.size, entry.result.size);
          var sp = el("span", pct >= 0 ? "saved-pos" : "saved-neg",
            (pct >= 0 ? "−" : "+") + Math.abs(pct) + "%");
          sub.appendChild(sp);
        }
      } else if (entry.status === "failed") {
        sub.appendChild(el("span", "saved-neg", entry.error || t("msg.failed")));
      } else {
        sub.appendChild(document.createTextNode(sizeBit));
        if (entry.status === "done") sub.appendChild(el("span", "saved-pos", t("msg.done")));
      }
      meta.appendChild(sub);
      row.appendChild(meta);

      var actions = el("div", "row-actions");
      if (id === "pdf-merge" || id === "img-pdf") {
        var up = el("button", "btn subtle small", "↑");
        up.title = t("btn.up");
        up.disabled = idx === 0;
        up.addEventListener("click", function () { moveFile(id, idx, -1); });
        var down = el("button", "btn subtle small", "↓");
        down.title = t("btn.down");
        down.disabled = idx === st.files.length - 1;
        down.addEventListener("click", function () { moveFile(id, idx, 1); });
        actions.appendChild(up); actions.appendChild(down);
      }
      if (entry.result) {
        var dl = el("button", "btn ghost small", t("btn.download"));
        dl.addEventListener("click", function () {
          downloadBlob(entry.result.blob, entry.result.name);
        });
        actions.appendChild(dl);
      }
      var rm = el("button", "btn subtle small", "✕");
      rm.title = t("btn.remove");
      rm.addEventListener("click", function () {
        if (entry.url) URL.revokeObjectURL(entry.url);
        st.files.splice(idx, 1);
        renderPanel(id);
      });
      actions.appendChild(rm);
      row.appendChild(actions);
      list.appendChild(row);
    });

    var doneCount = st.files.filter(function (f) { return f.result; }).length;
    if ((id === "img-compress" || id === "img-convert") && doneCount > 1) bulk.hidden = false;
    if ((id === "pdf-merge" || id === "img-pdf" || id === "pdf-split" || id === "pdf-compress") && st.resultBlob) {
      bulk.hidden = false;
      var summary = el("li", "row");
      summary.appendChild(el("span", "pdf-badge", "PDF"));
      var m = el("div", "meta");
      m.appendChild(el("div", "name", st.resultName));
      var s2 = el("div", "sub");
      s2.appendChild(document.createTextNode(Core.formatBytes(st.resultBlob.size)));
      if (st.resultOriginalSize) {
        var pct2 = Core.savingsPercent(st.resultOriginalSize, st.resultBlob.size);
        s2.appendChild(el("span", pct2 >= 0 ? "saved-pos" : "saved-neg",
          (pct2 >= 0 ? "−" : "+") + Math.abs(pct2) + "%"));
      }
      m.appendChild(s2);
      summary.appendChild(m);
      list.appendChild(summary);
    }
  }

  function moveFile(id, idx, dir) {
    var files = state[id].files;
    var j = idx + dir;
    if (j < 0 || j >= files.length) return;
    var tmp = files[idx]; files[idx] = files[j]; files[j] = tmp;
    renderPanel(id);
  }

  function setBusy(id, busy, btnAct) {
    var btn = panelEl(id).querySelector('[data-act="' + btnAct + '"]');
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? t("btn.processing") : t(btn.dataset.i18nKey || btn.getAttribute("data-act-label") || "btn.process");
  }

  /* remember original button labels */
  document.querySelectorAll("[data-act]").forEach(function (b) {
    var lbl = b.getAttribute("data-i18n");
    if (lbl) b.dataset.i18nKey = lbl;
  });

  /* ================= image pipeline ================= */
  var webpOK = (function () {
    try {
      var c = document.createElement("canvas");
      return c.toDataURL("image/webp").indexOf("data:image/webp") === 0;
    } catch (e) { return false; }
  })();

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }

  function processImage(entry, opts) {
    return loadImage(entry.file).then(function (r) {
      var img = r.img;
      var dims = Core.fitDimensions(img.naturalWidth, img.naturalHeight, opts.maxDim, 1);
      var canvas = document.createElement("canvas");
      canvas.width = dims.width; canvas.height = dims.height;
      var ctx = canvas.getContext("2d");
      if (opts.format === "jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, 0, 0, dims.width, dims.height);
      URL.revokeObjectURL(r.url);
      var mime = Core.IMAGE_MIME[opts.format] || entry.file.type || "image/png";
      if (mime === "image/webp" && !webpOK) {
        mime = "image/png";
        opts._webpFellBack = true;
      }
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) return reject(new Error("encode"));
          var format = mime === "image/jpeg" ? "jpeg" : mime === "image/webp" ? "webp" : "png";
          /* never deliver a bigger file in the same format: keep the original */
          var sameFormat = format === (function () {
            var ext = Core.extOf(entry.file.name);
            return ext === "jpg" ? "jpeg" : ext;
          })() && !opts.maxDim;
          if (sameFormat && blob.size >= entry.file.size) {
            return resolve({
              blob: entry.file,
              name: entry.file.name,
              size: entry.file.size,
              kept: true
            });
          }
          resolve({
            blob: blob,
            name: Core.imageOutputName(entry.file.name, format),
            size: blob.size
          });
        }, mime, Core.clamp(opts.quality, 10, 100) / 100);
      });
    });
  }

  function runImages(id) {
    var st = state[id];
    if (!st || !st.files.length) { setNotice(id, t("msg.noFiles"), true); return; }
    var format;
    if (id === "img-convert") format = optVal(id, "format");
    var quality = parseInt(optVal(id, "quality"), 10) || 75;
    var maxDim = id === "img-compress" ? (parseInt(optVal(id, "resize"), 10) || 0) : 0;
    var act = id === "img-compress" ? "compress" : "process";
    setBusy(id, true, act);
    setNotice(id, null);
    var fellBack = false;

    st.files.reduce(function (p, entry) {
      return p.then(function () {
        var fmt = format || (function () {
          var ext = Core.extOf(entry.file.name);
          return ext === "jpg" ? "jpeg" : (Core.IMAGE_MIME[ext] ? ext : "png");
        })();
        entry.status = "working";
        return processImage(entry, { format: fmt, quality: quality, maxDim: maxDim, _webpFellBack: false })
          .then(function (res) {
            entry.result = res;
            entry.status = "done";
            if (fmt === "webp" && !webpOK) fellBack = true;
          })
          .catch(function () {
            entry.status = "failed";
            entry.error = t("msg.corrupt");
          });
      });
    }, Promise.resolve()).then(function () {
      setBusy(id, false, act);
      var done = st.files.filter(function (f) { return f.result; });
      var saved = done.reduce(function (a, f) { return a + (f.file.size - f.result.size); }, 0);
      if (done.length) addStats(done.length, saved);
      if (fellBack) setNotice(id, t("msg.webpMissing"));
      else if (!done.length) setNotice(id, t("msg.corrupt"), true);
      renderPanel(id);
    });
  }

  function zipResults(id) {
    var st = state[id];
    var done = st.files.filter(function (f) { return f.result; });
    if (!done.length || !window.JSZip) return;
    var zip = new JSZip();
    done.forEach(function (f) { zip.file(f.result.name, f.result.blob); });
    zip.generateAsync({ type: "blob" }).then(function (blob) {
      downloadBlob(blob, "edat-" + id + ".zip");
    }).catch(function () { toast(t("msg.zipFail")); });
  }

  /* ================= pdf helpers ================= */
  function pdfErrorKey(err) {
    var msg = String((err && err.message) || err || "");
    if (/password|encrypted/i.test(msg)) return "msg.encrypted";
    return "msg.corrupt";
  }

  function readBytes(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(new Error("read")); };
      r.readAsArrayBuffer(file);
    });
  }

  function loadPdfLibDoc(file) {
    return readBytes(file).then(function (bytes) {
      return PDFLib.PDFDocument.load(bytes, { ignoreEncryption: false });
    });
  }

  /* ================= pdf merge ================= */
  function runMerge() {
    var id = "pdf-merge";
    var st = state[id];
    if (!st || st.files.length < 1) { setNotice(id, t("msg.noFiles"), true); return; }
    setBusy(id, true, "merge");
    setNotice(id, null);
    st.resultBlob = null;

    var out;
    PDFLib.PDFDocument.create().then(function (doc) {
      out = doc;
      return st.files.reduce(function (p, entry) {
        return p.then(function () {
          return loadPdfLibDoc(entry.file).then(function (src) {
            entry.pages = src.getPageCount();
            return out.copyPages(src, src.getPageIndices()).then(function (pages) {
              pages.forEach(function (pg) { out.addPage(pg); });
            });
          }).catch(function (err) {
            entry.status = "failed";
            entry.error = t(pdfErrorKey(err));
          });
        });
      }, Promise.resolve());
    }).then(function () {
      if (!out.getPageCount()) throw new Error("empty");
      return out.save();
    }).then(function (bytes) {
      setBusy(id, false, "merge");
      st.resultBlob = new Blob([bytes], { type: "application/pdf" });
      st.resultName = "edat-merged.pdf";
      st.resultOriginalSize = 0;
      var okCount = st.files.filter(function (f) { return f.status !== "failed"; }).length;
      addStats(okCount, 0);
      setNotice(id, t("msg.merged", { n: okCount }));
      renderPanel(id);
    }).catch(function () {
      setBusy(id, false, "merge");
      setNotice(id, t("msg.corrupt"), true);
      renderPanel(id);
    });
  }

  /* ================= images to pdf ================= */
  function runImgPdf() {
    var id = "img-pdf";
    var st = state[id];
    if (!st || st.files.length < 1) { setNotice(id, t("msg.noFiles"), true); return; }
    setBusy(id, true, "topdf");
    setNotice(id, null);
    st.resultBlob = null;
    var size = panelEl(id).querySelector('[data-opt="pagesize"]').value;
    var out, pages = 0;
    PDFLib.PDFDocument.create().then(function (doc) {
      out = doc;
      return st.files.reduce(function (p, entry) {
        return p.then(function () {
          return createImageBitmap(entry.file, { imageOrientation: "from-image" }).then(function (bmp) {
            var cv = document.createElement("canvas");
            cv.width = bmp.width; cv.height = bmp.height;
            var ctx = cv.getContext("2d");
            ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.drawImage(bmp, 0, 0);
            return new Promise(function (res) { cv.toBlob(res, "image/jpeg", 0.92); }).then(function (blob) {
              return blob.arrayBuffer();
            }).then(function (bytes) { return out.embedJpg(bytes); }).then(function (img) {
              var w = img.width, h = img.height, x = 0, y = 0, pw = w, ph = h;
              if (size === "fit" && Math.max(w, h) > 1200) { var k = 1200 / Math.max(w, h); pw = w * k; ph = h * k; w = pw; h = ph; }
              if (size === "a4") {
                pw = 595.28; ph = 841.89;
                if (w > h) { pw = 841.89; ph = 595.28; }
                var s = Math.min((pw - 36) / w, (ph - 36) / h);
                w = w * s; h = h * s; x = (pw - w) / 2; y = (ph - h) / 2;
              }
              out.addPage([pw, ph]).drawImage(img, { x: x, y: y, width: w, height: h });
              pages++;
              entry.status = "done";
            });
          }).catch(function () {
            entry.status = "failed";
            entry.error = t("msg.failed");
          });
        });
      }, Promise.resolve());
    }).then(function () {
      if (!pages) throw new Error("empty");
      return out.save();
    }).then(function (bytes) {
      setBusy(id, false, "topdf");
      st.resultBlob = new Blob([bytes], { type: "application/pdf" });
      st.resultName = "edat-images.pdf";
      st.resultOriginalSize = 0;
      addStats(pages, 0);
      setNotice(id, t("msg.imgPdfDone", { n: pages }));
      renderPanel(id);
    }).catch(function () {
      setBusy(id, false, "topdf");
      setNotice(id, t("msg.failed"), true);
      renderPanel(id);
    });
  }

  /* ================= pdf split ================= */
  function runSplit() {
    var id = "pdf-split";
    var st = state[id];
    if (!st || !st.files.length) { setNotice(id, t("msg.noFiles"), true); return; }
    var entry = st.files[0];
    var mode = optVal(id, "mode");
    var rangesText = optVal(id, "ranges");

    setBusy(id, true, "split");
    setNotice(id, null);
    st.resultBlob = null;

    loadPdfLibDoc(entry.file).then(function (src) {
      var pageCount = src.getPageCount();
      entry.pages = pageCount;
      var ranges;
      if (mode === "each") {
        ranges = [];
        for (var i = 1; i <= pageCount; i++) ranges.push({ from: i, to: i });
      } else {
        try { ranges = Core.parsePageRanges(rangesText, pageCount); }
        catch (err) {
          setBusy(id, false, "split");
          setNotice(id, t("msg.rangeErr." + (err.code || "syntax")), true);
          renderPanel(id);
          return null;
        }
      }

      var base = Core.safeName(Core.stripExt(entry.file.name));
      if (mode === "one") {
        return PDFLib.PDFDocument.create().then(function (out) {
          var idxs = Core.rangesToIndices(ranges, pageCount);
          return out.copyPages(src, idxs).then(function (pages) {
            pages.forEach(function (pg) { out.addPage(pg); });
            return out.save();
          });
        }).then(function (bytes) {
          st.resultBlob = new Blob([bytes], { type: "application/pdf" });
          st.resultName = base + "-pages.pdf";
          st.resultOriginalSize = 0;
        });
      }
      /* zip of one pdf per range */
      var zip = new JSZip();
      return ranges.reduce(function (p, r, ri) {
        return p.then(function () {
          return PDFLib.PDFDocument.create().then(function (out) {
            var idxs = Core.rangesToIndices([r], pageCount);
            return out.copyPages(src, idxs).then(function (pages) {
              pages.forEach(function (pg) { out.addPage(pg); });
              return out.save();
            });
          }).then(function (bytes) {
            var label = r.from === r.to ? "page-" + r.from : "pages-" + r.from + "-" + r.to;
            zip.file(base + "-" + label + ".pdf", bytes);
          });
        });
      }, Promise.resolve()).then(function () {
        return zip.generateAsync({ type: "blob" });
      }).then(function (blob) {
        st.resultBlob = blob;
        st.resultName = base + "-split.zip";
        st.resultOriginalSize = 0;
      });
    }).then(function (done) {
      setBusy(id, false, "split");
      if (done === null) return; /* range error already shown */
      if (st.resultBlob) {
        addStats(1, 0);
        setNotice(id, t("msg.done"));
      }
      renderPanel(id);
    }).catch(function (err) {
      setBusy(id, false, "split");
      setNotice(id, t(pdfErrorKey(err)), true);
      renderPanel(id);
    });
  }

  /* ================= pdf compress ================= */
  function runPdfCompress() {
    var id = "pdf-compress";
    var st = state[id];
    if (!st || !st.files.length) { setNotice(id, t("msg.noFiles"), true); return; }
    var entry = st.files[0];
    var quality = (parseInt(optVal(id, "quality"), 10) || 60) / 100;
    var scale = parseFloat(optVal(id, "scale")) || 1.5;

    setBusy(id, true, "compress");
    setNotice(id, null);
    st.resultBlob = null;

    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
    }

    readBytes(entry.file).then(function (bytes) {
      return pdfjsLib.getDocument({ data: bytes }).promise;
    }).then(function (pdf) {
      entry.pages = pdf.numPages;
      return PDFLib.PDFDocument.create().then(function (out) {
        var seq = Promise.resolve();
        var _loop = function (pageNum) {
          seq = seq.then(function () {
            return pdf.getPage(pageNum).then(function (page) {
              var viewport = page.getViewport({ scale: scale });
              var canvas = document.createElement("canvas");
              canvas.width = Math.ceil(viewport.width);
              canvas.height = Math.ceil(viewport.height);
              var ctx = canvas.getContext("2d");
              ctx.fillStyle = "#fff";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
                return new Promise(function (resolve, reject) {
                  canvas.toBlob(function (blob) {
                    if (!blob) return reject(new Error("encode"));
                    resolve(blob);
                  }, "image/jpeg", quality);
                });
              }).then(function (jpgBlob) {
                return new Promise(function (resolve, reject) {
                  var fr = new FileReader();
                  fr.onload = function () { resolve(new Uint8Array(fr.result)); };
                  fr.onerror = function () { reject(new Error("read")); };
                  fr.readAsArrayBuffer(jpgBlob);
                });
              }).then(function (jpgBytes) {
                return out.embedJpg(jpgBytes).then(function (img) {
                  var pg = out.addPage([viewport.width, viewport.height]);
                  pg.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
                });
              });
            });
          });
        };
        for (var p = 1; p <= pdf.numPages; p++) _loop(p);
        return seq.then(function () { return out.save(); });
      });
    }).then(function (bytes) {
      setBusy(id, false, "compress");
      st.resultBlob = new Blob([bytes], { type: "application/pdf" });
      st.resultName = Core.safeName(Core.stripExt(entry.file.name)) + "-small.pdf";
      st.resultOriginalSize = entry.file.size;
      addStats(1, entry.file.size - st.resultBlob.size);
      setNotice(id, t("msg.done"));
      renderPanel(id);
    }).catch(function (err) {
      setBusy(id, false, "compress");
      var msg = String((err && err.message) || err || "");
      setNotice(id, t(/password/i.test(msg) ? "msg.encrypted" : "msg.corrupt"), true);
      renderPanel(id);
    });
  }

  /* ================= action buttons ================= */
  document.querySelectorAll("[data-act]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var panel = btn.closest(".panel");
      var id = panel.id.replace("panel-", "");
      var act = btn.dataset.act;
      if (act === "process" || act === "compress" && id.indexOf("img") === 0) runImages(id);
      else if (act === "compress") runPdfCompress();
      else if (act === "merge") runMerge();
      else if (act === "topdf") runImgPdf();
      else if (act === "split") runSplit();
      else if (act === "zip") zipResults(id);
      else if (act === "downloadResult") {
        var st = state[id];
        if (st && st.resultBlob) downloadBlob(st.resultBlob, st.resultName);
      } else if (act === "clear") {
        (state[id] && state[id].files || []).forEach(function (f) {
          if (f.url) URL.revokeObjectURL(f.url);
        });
        state[id] = { files: [] };
        delete recentByPanel[id];
        setNotice(id, null);
        renderPanel(id);
      }
    });
  });

  applyLang();
})();
