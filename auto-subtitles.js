/* ──────────────────────────────────────────────────────────────────
   Auto Subtitles — app logic (REAL Floyo backend integration)
   Backend: Flask demo  (POST /api/subtitle, GET /api/jobs/<id>,
            GET /api/jobs/<id>/files/<file_id>)
   States: empty → loading → ready → processing → result | error
   ────────────────────────────────────────────────────────────────── */
   (function () {
    "use strict";
  
    /* ════════════════════════════════════════════════════════════════
       CONFIG — where the Flask backend is running.
       The Flask demo listens on :5000 by default.
       ════════════════════════════════════════════════════════════════ */
    var API_BASE = "https://api.aisubtitlesgenerator.org";
    var POLL_MS = 2500; // matches the backend's POLL_INTERVAL_SECONDS
    // Floyo's CDN sits behind Cloudflare, which caps upload bodies at 100 MB.
    // Larger files fail with a Cloudflare 413 *after* uploading, so reject them
    // up front instead. This is a Floyo-side ceiling, not our app's.
    var MAX_UPLOAD_MB = 100;
    var MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
    // Long videos exhaust the workflow's memory (it loads every frame at once) and
    // fail with "Comfy disconnected", even on a big GPU. Reject them up front.
    var MAX_DURATION_MIN = 5;
    var MAX_DURATION_SEC = MAX_DURATION_MIN * 60;
    // "Try a sample" loads this clip. Deploy a short English sample.mp4 next to
    // index.html (relative path = same origin, so no CORS needed).
    var SAMPLE_URL = "sample.mp4";
  
    // ── Inline the Floyo wordmark (light paths, tinted via currentColor) ──
    fetch("assets/floyo-logo-light.svg")
      .then(function (r) { return r.text(); })
      .then(function (svg) { var s = document.getElementById("logoSlot"); if (s) s.innerHTML = svg; })
      .catch(function () { var s = document.getElementById("logoSlot"); if (s) s.textContent = "Floyo!"; });
  
    var LS_KEY = "floyo.autosubs.v1";
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  
    // ── Languages ──
    // Only languages the bundled caption fonts can actually render:
    // Roboto covers Latin / Cyrillic / Greek / Vietnamese; YRDZST covers Chinese.
    // Hindi, Arabic, Hebrew, Thai, Korean and Japanese are omitted because no
    // bundled font can draw their scripts (they'd burn in as □ boxes).
    var LANGS = [
      { c: "en", n: "English", f: "🇬🇧" },
      { c: "es", n: "Spanish", f: "🇪🇸" },
      { c: "fr", n: "French", f: "🇫🇷" },
      { c: "de", n: "German", f: "🇩🇪" },
      { c: "pt", n: "Portuguese", f: "🇵🇹" },
      { c: "it", n: "Italian", f: "🇮🇹" },
      { c: "nl", n: "Dutch", f: "🇳🇱" },
      { c: "tr", n: "Turkish", f: "🇹🇷" },
      { c: "pl", n: "Polish", f: "🇵🇱" },
      { c: "sv", n: "Swedish", f: "🇸🇪" },
      { c: "id", n: "Indonesian", f: "🇮🇩" },
      { c: "vi", n: "Vietnamese", f: "🇻🇳" },
      { c: "fil", n: "Filipino", f: "🇵🇭" },
      { c: "ru", n: "Russian", f: "🇷🇺" },
      { c: "uk", n: "Ukrainian", f: "🇺🇦" },
      { c: "el", n: "Greek", f: "🇬🇷" },
      { c: "zh", n: "Mandarin Chinese", f: "🇨🇳" }
    ];
  
    // ── Script support, given the fonts bundled with the Floyo workflow node ──
    // The node only ships Roboto (Latin/Cyrillic/Greek/Vietnamese), YRDZST
    // (Chinese) and Chanakya (legacy, fails for Unicode Hindi). So scripts
    // outside Roboto/YRDZST render as □ boxes — Whisper still transcribes them,
    // the FONT just can't draw the glyphs.
    var SCRIPT = {
      auto: { tier: "auto" },
      en: { tier: "latin", script: "Latin" }, es: { tier: "latin", script: "Latin" },
      fr: { tier: "latin", script: "Latin" }, de: { tier: "latin", script: "Latin" },
      pt: { tier: "latin", script: "Latin" }, it: { tier: "latin", script: "Latin" },
      nl: { tier: "latin", script: "Latin" }, tr: { tier: "latin", script: "Latin" },
      pl: { tier: "latin", script: "Latin" }, sv: { tier: "latin", script: "Latin" },
      id: { tier: "latin", script: "Latin" }, fil: { tier: "latin", script: "Latin" },
      vi: { tier: "latin", script: "Latin (Vietnamese)" },
      ru: { tier: "latin", script: "Cyrillic" }, uk: { tier: "latin", script: "Cyrillic" },
      el: { tier: "latin", script: "Greek" },
      zh: { tier: "cjk", script: "Chinese" },
      hi: { tier: "unsupported", script: "Devanagari" },
      ar: { tier: "unsupported", script: "Arabic" },
      he: { tier: "unsupported", script: "Hebrew" },
      th: { tier: "unsupported", script: "Thai" },
      ko: { tier: "unsupported", script: "Korean (Hangul)" },
      ja: { tier: "unsupported", script: "Japanese (Kana)" }
    };
    function scriptOf(code) { return SCRIPT[code] || { tier: "latin", script: "Latin" }; }
    // The font that can actually render a given language's script.
    function recommendedFontFor(code) {
      var s = scriptOf(code);
      if (s.tier === "cjk") return "YRDZST Semibold.ttf";
      return "Roboto-Bold.ttf"; // Latin/Cyrillic/Greek/Vietnamese (and the fallback)
    }
    // The "Apply Whisper" node's language input accepts Title-Case Whisper
    // language NAMES (e.g. "English", "Chinese") — confirmed against a working
    // UI workflow export. Lowercase names ("english") and ISO codes ("en", "zh")
    // both fail prompt validation with "value_not_in_list". "auto" is lowercase.
    var WHISPER_LANG = {
      auto: "auto", en: "English", es: "Spanish", fr: "French", de: "German",
      pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese", ko: "Korean",
      zh: "Chinese", hi: "Hindi", ar: "Arabic", ru: "Russian", tr: "Turkish",
      pl: "Polish", sv: "Swedish", id: "Indonesian", vi: "Vietnamese", th: "Thai",
      uk: "Ukrainian", el: "Greek", he: "Hebrew", fil: "Tagalog"
    };
    function whisperLangValue(code) { return WHISPER_LANG[code] || "auto"; }
  
    var TEXT_COLORS = [
      { name: "White", v: "#FFFFFF" },
      { name: "Lemon", v: "#FFEB28" },
      { name: "Mint", v: "#56FFB1" },
      { name: "Blueberry", v: "#9BD1FF" },
      { name: "Ube", v: "#D5B8FF" },
      { name: "Black", v: "#0B0710" }
    ];
    var OUTLINE_COLORS = [
      { name: "Black", v: "#0B0710" },
      { name: "Deep ube", v: "#1A0C34" },
      { name: "Cobalt", v: "#101844" },
      { name: "Raspberry", v: "#8A0241" },
      { name: "White", v: "#FFFFFF" },
      { name: "None", v: "transparent" }
    ];
  
    var SAMPLE_CAPTION = "So here’s how the whole thing works.";
    // The Whisper workflow burns captions one word at a time, so the live preview
    // cycles single words (karaoke-style) instead of showing a full sentence.
    var SAMPLE_WORDS = SAMPLE_CAPTION.replace(/[.]/g, "").split(/\s+/);
    var capWordIdx = 0;
  
    // ── Default state ──
    var defaults = {
      state: "empty",
      file: { name: "product-demo-final.mp4", dur: "2:34", size: "48.2 MB", ext: "MP4" },
      settings: {
        lang: "", font: "Roboto-Bold.ttf", size: "m",
        text: "#FFFFFF", outline: "#0B0710", pos: "bottom", cpl: 42, upper: false
      }
    };
    var app = load();
    app._file = null;   // the REAL File object selected by the user (never persisted)
    app._jobId = null;  // current backend job id
    // The spoken language must be re-chosen every session — never restore a saved
    // one on refresh, so the "select a language" prompt always shows on a fresh load.
    app.settings.lang = "";
  
    // ── Fonts actually available on the Floyo "Add Subtitles To Frames" node ──
    var FONTS = [
      { v: "Roboto-Bold.ttf", n: "Roboto Bold" },
      { v: "Roboto-Regular.ttf", n: "Roboto" },
      { v: "Chanakya Regular.ttf", n: "Chanakya" },
      { v: "YRDZST Semibold.ttf", n: "YRDZST Semibold" }
    ];
    // Rough CSS mapping just for the on-page preview (server fonts aren't loaded here).
    function fontPreviewCSS(file) {
      if (/Roboto-Bold/i.test(file)) return { ff: "var(--ff-sans)", w: "700" };
      if (/Roboto-Regular/i.test(file)) return { ff: "var(--ff-sans)", w: "400" };
      if (/YRDZST/i.test(file)) return { ff: "var(--ff-sans)", w: "600" };
      return { ff: "var(--ff-sans)", w: "400" }; // Chanakya etc. → sans fallback
    }
    // Migrate any older CSS-var font value to a real filename.
    if (!FONTS.some(function (f) { return f.v === app.settings.font; })) {
      app.settings.font = "Roboto-Bold.ttf";
    }
  
    // ── Recent jobs store (real + persisted across refreshes) ──
    // Runs are kept in memory only — no persisted history. A page refresh
    // starts with an empty Recent list, showing just the current session's runs.
    app.jobs = [];
    app._curLocal = null;       // local id of the job currently being processed
  
    function saveJobs() {}       // no-op: history is intentionally not persisted
    function uid() { return "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function addJob(j) {
      j.id = uid();
      j.ts = Date.now();
      app.jobs.unshift(j);
      if (app.jobs.length > 12) app.jobs = app.jobs.slice(0, 12);
      renderRecent();
      return j.id;
    }
    function getJob(localId) {
      for (var i = 0; i < app.jobs.length; i++) if (app.jobs[i].id === localId) return app.jobs[i];
      return null;
    }
    function updateJob(localId, patch) {
      var j = getJob(localId);
      if (!j) return null;
      for (var k in patch) j[k] = patch[k];
      saveJobs();
      renderRecent();
      return j;
    }
  
    // Trim the styling panel to what the workflow node can actually render:
    // keep language, font, size, text color, position — drop outline/background,
    // max-characters-per-line, and uppercase (the node has no inputs for them).
    function trimUnsupportedControls() {
      var sel = document.getElementById("fontSel");
      if (sel) {
        sel.innerHTML = "";
        FONTS.forEach(function (f) {
          var o = document.createElement("option");
          o.value = f.v; o.textContent = f.n;
          sel.appendChild(o);
        });
        sel.value = app.settings.font;
      }
      // The static markup advertises "up to 500 MB" / "≤ 30 min"; correct both.
      $$(".fmt").forEach(function (el) {
        if (/\d+\s*MB/i.test(el.textContent)) el.textContent = "up to " + MAX_UPLOAD_MB + " MB";
        else if (/\d+\s*min/i.test(el.textContent)) el.textContent = "≤ " + MAX_DURATION_MIN + " min";
      });
      ["outlineSw", "cplRange", "upToggle"].forEach(function (id) {
        var el = document.getElementById(id);
        var field = el && el.closest ? el.closest(".field") : null;
        if (field && field.parentNode) field.parentNode.removeChild(field);
      });
    }
  
    function load() {
      try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return clone(defaults);
        var p = JSON.parse(raw);
        return {
          state: p.state || "empty",
          file: p.file || clone(defaults.file),
          settings: Object.assign(clone(defaults.settings), p.settings || {})
        };
      } catch (e) { return clone(defaults); }
    }
    function save() {
      try {
        var st = (app.state === "processing" || app.state === "loading") ? "ready" : app.state;
        localStorage.setItem(LS_KEY, JSON.stringify({ state: st, file: app.file, settings: app.settings }));
      } catch (e) {}
    }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
  
    // Start a brand-new video: drop the file AND reset all settings to defaults
    // (Auto-detect language, Roboto font, medium size, white text, bottom).
    function startFresh() {
      abortActiveRun();
      clearApiKey();
      app._autoRunSample = false;
      app._file = null;
      app._videoH = 0; app._videoW = 0;
      if (app._fileURL) { try { URL.revokeObjectURL(app._fileURL); } catch (e) {} app._fileURL = null; }
      clearPreviewVideo();
      app.settings = clone(defaults.settings);
      var fs = $("#fontSel"); if (fs) fs.value = app.settings.font;
      syncControls();
      save();
      setState("empty");
    }
  
    // ── State machine ──
    function pauseVideosOutside(state) {
      // Stop audio from a screen we're leaving (e.g. the result video still
      // playing in the background after "New video").
      if (state !== "result") {
        var rv = $('section[data-state="result"] .player video');
        if (rv) { try { rv.pause(); } catch (e) {} }
      }
      if (state !== "ready") {
        var pv = document.getElementById("previewVideo");
        if (pv) { try { pv.pause(); } catch (e) {} }
      }
    }
    function setState(s) {
      pauseVideosOutside(s);
      app.state = s;
      $$("[data-state]").forEach(function (el) {
        el.classList.toggle("on", el.getAttribute("data-state") === s);
      });
      if ($("#main")) $("#main").scrollTop = 0;
      save();
    }
  
    // ── Build language combo ──
    var langCombo = $("#langCombo");
    var langList = $("#langList");
    var langSearch = $("#langSearch");
    var langEmpty = $("#langEmpty");
  
    function renderLangs(filter) {
      filter = (filter || "").toLowerCase().trim();
      langList.innerHTML = "";
      var matches = LANGS.filter(function (l) { return l.n.toLowerCase().indexOf(filter) > -1; });
      langEmpty.style.display = matches.length ? "none" : "block";
      matches.forEach(function (l) {
        var o = document.createElement("div");
        o.className = "opt" + (l.c === app.settings.lang ? " sel" : "");
        o.innerHTML = '<span class="flag">' + l.f + '</span><span>' + l.n + '</span>' +
          '<span class="check"><i class="ic" style="--ic:url(assets/icons/check-circle.svg)"></i></span>';
        o.addEventListener("click", function () {
          app.settings.lang = l.c;
          var val = $("#langVal");
          val.textContent = l.n; val.style.opacity = "";
          $("#langFlag").textContent = l.f;
          // Auto-select the font that can actually render this language's script
          // (e.g. Chinese → YRDZST, Latin/Cyrillic/Greek → Roboto).
          app.settings.font = recommendedFontFor(l.c);
          var fs = $("#fontSel"); if (fs) fs.value = app.settings.font;
          renderCaption();
          closeCombo();
          renderLangs("");
          updateScriptWarning();
          save();
        });
        langList.appendChild(o);
      });
    }
    function openCombo() { langCombo.classList.add("open"); langSearch.value = ""; renderLangs(""); setTimeout(function () { langSearch.focus(); }, 30); }
    function closeCombo() { langCombo.classList.remove("open"); }
  
    $(".control", langCombo).addEventListener("click", function () {
      langCombo.classList.contains("open") ? closeCombo() : openCombo();
    });
    langSearch.addEventListener("input", function () { renderLangs(this.value); });
    langSearch.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCombo(); });
    document.addEventListener("click", function (e) { if (!langCombo.contains(e.target)) closeCombo(); });
  
    // ── Swatches ──
    function buildSwatches(host, colors, key) {
      host.innerHTML = "";
      colors.forEach(function (c) {
        var s = document.createElement("div");
        s.className = "sw" + (app.settings[key] === c.v ? " on" : "");
        s.title = c.name;
        if (c.v === "transparent") {
          s.style.background = "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50% / 12px 12px";
        } else {
          s.style.background = c.v;
        }
        s.addEventListener("click", function () {
          app.settings[key] = c.v;
          $$(".sw", host).forEach(function (x) { x.classList.remove("on"); });
          s.classList.add("on");
          renderCaption();
          save();
        });
        host.appendChild(s);
      });
    }
  
    // ── Caption rendering (live preview) ──
    var SIZE_PX = { s: 3.4, m: 4.6, l: 6.2 };
  
    function captionStyle(s) {
      var px = SIZE_PX[s.size] || SIZE_PX.m;
      var fs = "clamp(13px, " + px + "cqw, 30px)";
      var fp = fontPreviewCSS(s.font);
      var style = {
        fontFamily: fp.ff,
        fontSize: fs,
        color: s.text,
        fontWeight: fp.w,
        textTransform: "none",
        letterSpacing: "0",
        padding: "0.12em 0.5em",
        borderRadius: "4px",
        // The workflow node draws plain text (no filled box). A soft outline-ish
        // shadow keeps the preview legible and mirrors the real output.
        background: "transparent",
        textShadow: "0 2px 6px rgba(0,0,0,.55), -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000"
      };
      return style;
    }
    function hexA(hex, a) {
      if (hex === "#FFFFFF") return "rgba(255,255,255," + a + ")";
      var h = hex.replace("#", "");
      var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
      return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    }
  
    function applyCap(layer, textEl) {
      var s = app.settings;
      layer.className = "cap-layer pos-" + s.pos;
      var cs = captionStyle(s);
      for (var k in cs) textEl.style[k] = cs[k];
      if (s.text === "#FFFFFF" && s.outline === "#FFFFFF") textEl.style.color = "#1A0C34";
    }
    function displayCaption() {
      return SAMPLE_WORDS[capWordIdx % SAMPLE_WORDS.length] || "";
    }
    function setCapText(el, text) {
      el.textContent = "";
      text.split("\n").forEach(function (line, i) {
        if (i) el.appendChild(document.createElement("br"));
        el.appendChild(document.createTextNode(line));
      });
    }
    function renderCaption() {
      var layer = $("#capLayer"), txt = $("#capText");
      if (layer && txt) { applyCap(layer, txt); setCapText(txt, displayCaption()); }
    }
    // Advance the preview one word at a time so it matches the word-by-word output.
    setInterval(function () {
      capWordIdx = (capWordIdx + 1) % SAMPLE_WORDS.length;
      var txt = $("#capText");
      if (txt) setCapText(txt, displayCaption());
    }, 650);
  
    // ── Language helper / prompt banner under the language field ──
    function updateScriptWarning(prompt) {
      var combo = document.getElementById("langCombo");
      if (!combo) return;
      var field = combo.closest ? combo.closest(".field") : combo.parentNode;
      var banner = document.getElementById("scriptWarn");
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "scriptWarn";
        banner.style.cssText = "margin-top:10px;border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.5;display:none;";
        if (field && field.parentNode) field.parentNode.insertBefore(banner, field.nextSibling);
        else combo.parentNode.appendChild(banner);
      }
      var s = scriptOf(app.settings.lang);
      if (!app.settings.lang) {
        // Nothing picked yet — always show the instruction; turn it into a clear
        // warning if the user tried to generate without choosing (prompt = true).
        banner.style.display = "block";
        if (prompt) {
          banner.style.background = "#FFF4E5"; banner.style.color = "#7A4A00"; banner.style.border = "1px solid #FFD8A8";
          banner.innerHTML = "<strong>⚠ Please select a language first.</strong> Choose the language actually spoken in the video — it tells Whisper what to transcribe.";
        } else {
          banner.style.background = "var(--ube-1,#f3eefc)"; banner.style.color = "var(--ube-8,#3a1f6e)"; banner.style.border = "1px solid var(--border,#ece8f3)";
          banner.innerHTML = "<strong>Select the language spoken in the video.</strong> Pick the one actually used in the audio so the captions transcribe correctly.";
        }
      } else if (s.tier === "unsupported") {
        var langName = (LANGS.filter(function (x) { return x.c === app.settings.lang; })[0] || {}).n || "This language";
        banner.style.display = "block";
        banner.style.background = "#FFF4E5"; banner.style.color = "#7A4A00"; banner.style.border = "1px solid #FFD8A8";
        banner.innerHTML = "<strong>⚠ " + langName + " captions can’t be burned in.</strong> The workflow’s fonts don’t include the " +
          (s.script || "") + " script, so the text renders as □ boxes.";
      } else {
        banner.style.display = "none";
      }
    }
  
    // Rough upfront estimate from clip length. Render time scales with frames
    // (full-res, no downscale), plus upload/transcribe/warm-up overhead. Shown as
    // a range because the first run of a session is slower than a warm one.
    function estRange(sec) {
      // Calibrated to real render speed (~1-min clip ≈ 5 min): warm-up + ~3.5x.
      var total = 45 + 3.5 * sec;
      var lo = Math.max(1, Math.round(total * 0.7 / 60));
      var hi = Math.max(lo + 1, Math.round(total * 1.3 / 60));
      return "~" + lo + "–" + hi + " min";
    }
    function estimateText(sec) {
      if (!sec || !isFinite(sec)) return "Estimated time depends on your clip · uses render credits";
      return "Estimated " + estRange(sec) + " · uses render credits";
    }
  
    // ── Sync controls from state ──
    function syncControls() {
      var l = LANGS.filter(function (x) { return x.c === app.settings.lang; })[0];
      var val = $("#langVal"), flag = $("#langFlag");
      if (l) {
        val.textContent = l.n; flag.textContent = l.f; val.style.opacity = "";
      } else {
        val.textContent = "Select language…"; flag.textContent = "🌐"; val.style.opacity = "0.6";
      }
      $("#fontSel").value = app.settings.font;
      $$("#sizeSeg button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === app.settings.size); });
      $$("#posSeg button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === app.settings.pos); });
      buildSwatches($("#textSw"), TEXT_COLORS, "text");
      $("#fName").textContent = app.file.name;
      $("#fSub").textContent = app.file.dur + " · " + app.file.size + " · " + app.file.ext;
      $("#playerDur").textContent = app.file.dur;
      var est = document.getElementById("ctaEst");
      if (est) est.textContent = estimateText(app._videoDur);
      renderCaption();
      updateScriptWarning();
    }
  
    // ── Control wiring ──
    $("#fontSel").addEventListener("change", function () { app.settings.font = this.value; renderCaption(); save(); });
    $$("#sizeSeg button").forEach(function (b) {
      b.addEventListener("click", function () {
        app.settings.size = b.getAttribute("data-v");
        $$("#sizeSeg button").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on"); renderCaption(); save();
      });
    });
    $$("#posSeg button").forEach(function (b) {
      b.addEventListener("click", function () {
        app.settings.pos = b.getAttribute("data-v");
        $$("#posSeg button").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on"); renderCaption(); save();
      });
    });
    var cplEl = $("#cplRange");
    if (cplEl) cplEl.addEventListener("input", function () {
      app.settings.cpl = parseInt(this.value, 10);
      $("#cplNum").textContent = this.value + " chars";
      renderCaption(); save();
    });
    var upEl = $("#upToggle");
    if (upEl) upEl.addEventListener("click", function () {
      app.settings.upper = !app.settings.upper;
      this.classList.toggle("on", app.settings.upper);
      this.setAttribute("aria-pressed", String(app.settings.upper));
      renderCaption(); save();
    });
  
    // ── File handling ──
    var fileInput = $("#fileInput");
    var dropzone = $("#dropzone");
  
    function humanSize(bytes) {
      if (!bytes) return "—";
      var mb = bytes / (1024 * 1024);
      return mb >= 1 ? mb.toFixed(1) + " MB" : (bytes / 1024).toFixed(0) + " KB";
    }
    function extOf(name) {
      var m = /\.([a-z0-9]+)$/i.exec(name || "");
      return m ? m[1].toUpperCase() : "MP4";
    }
    function fmtDur(secs) {
      if (!secs || !isFinite(secs)) return "—";
      var m = Math.floor(secs / 60), s = Math.round(secs % 60);
      return m + ":" + (s < 10 ? "0" : "") + s;
    }
    function acceptFile(file) {
      var okType = /mp4|quicktime|mov|webm|matroska|avi/i.test(file.type) || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name);
      if (!okType) { showError("Unsupported file type", "Auto Subtitles works with MP4, MOV, WEBM, MKV, AVI and M4V video. That file looked like “" + (file.type || extOf(file.name)) + "”.", "validation · rejected before upload"); return; }
      if (file.size === 0) { showError("That file is empty", "The selected file is 0 bytes — it may be corrupted or still copying. Pick the video again.", "validation · 0-byte file"); return; }
      if (file.size > MAX_UPLOAD_BYTES) { showError("Video is too large", "Floyo accepts uploads up to " + MAX_UPLOAD_MB + " MB. This file is " + humanSize(file.size) + " — trim it or compress it (lower the resolution/bitrate) and try again.", "validation · " + humanSize(file.size) + " > " + MAX_UPLOAD_MB + " MB"); return; }
  
      // Abort any run/poll still in flight for a previous file, and fully reset
      // per-file state so nothing from the last video can leak into this one.
      clearApiKey();   // every new video re-asks for the key (never remembered)
      abortActiveRun();
      app._file = file;
      app._jobId = null;
      app._curLocal = null;
      app._videoH = 0;   // reset immediately — never reuse the previous clip's size
      app._videoW = 0;
      app.file = { name: file.name, dur: "—", size: humanSize(file.size), ext: extOf(file.name) };
  
      // Token guards against a slow metadata read from a *previous* file landing
      // after this one was selected (a classic stale-state race).
      var gen = (app._fileGen = (app._fileGen || 0) + 1);
  
      // Keep a persistent object URL for this file so we can show a real preview
      // (and read its metadata from the same element). Revoke the previous one.
      if (app._fileURL) { try { URL.revokeObjectURL(app._fileURL); } catch (e) {} }
      app._fileURL = URL.createObjectURL(file);
  
      addVideo();
      mountPreviewVideo(app._fileURL, gen);
    }
    function addVideo() {
      setState("loading");
      save();
      // If the file was rejected meanwhile (e.g. too long), app._file is null —
      // don't flip to the ready screen over the error.
      setTimeout(function () { if (app._file) { syncControls(); setState("ready"); } }, 700);
    }
  
    fileInput.addEventListener("change", function () {
      if (this.files && this.files[0]) acceptFile(this.files[0]);
      this.value = "";
    });
    $("#pickBtn").addEventListener("click", function () { fileInput.click(); });
    dropzone.addEventListener("click", function (e) {
      if (e.target.closest("#sampleBtn")) return;
      if (e.target.closest("#pickBtn")) return;
      fileInput.click();
    });
    $("#sampleBtn").addEventListener("click", function (e) {
      e.stopPropagation();
      loadSample();
    });
  
    // "Try a sample": fetch the bundled sample clip, reset to default settings,
    // and run it through the normal upload path so the user is one click from
    // generating. Place a short English sample.mp4 next to index.html.
    function loadSample() {
      app.settings = clone(defaults.settings);   // reset everything
      app.settings.lang = "en";                   // the bundled sample is English
      app.settings.font = recommendedFontFor("en");
      var fs = $("#fontSel"); if (fs) fs.value = app.settings.font;
      app._autoRunSample = true;                  // run end-to-end once it loads
      setState("loading");
      fetch(SAMPLE_URL, { cache: "force-cache" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
        .then(function (blob) {
          var file = new File([blob], "sample.mp4", { type: blob.type || "video/mp4" });
          if (!file.size) throw new Error("empty sample");
          acceptFile(file);   // runs the same validation + preview + ready flow
        })
        .catch(function (err) {
          showError("Sample unavailable",
            "Couldn’t load the sample clip. Make sure a short sample.mp4 is deployed alongside the app (at " + SAMPLE_URL + ").",
            "sample · " + (err && err.message ? err.message : "fetch failed"));
        });
    }
  
    ["dragenter", "dragover"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); if (ev === "dragleave" && dropzone.contains(e.relatedTarget)) return; dropzone.classList.remove("drag"); });
    });
    dropzone.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]);
    });
  
    $("#replaceBtn").addEventListener("click", function () { fileInput.click(); });
    $("#removeBtn").addEventListener("click", function () { abortActiveRun(); app._file = null; if (app._fileURL) { try { URL.revokeObjectURL(app._fileURL); } catch (e) {} app._fileURL = null; } clearPreviewVideo(); setState("empty"); });
    var nb = $("#newBtn"); if (nb) nb.addEventListener("click", function () { startFresh(); closeNav(); });
  
    /* ════════════════════════════════════════════════════════════════
       SETTINGS MAPPING — frontend knobs → Flask /api/subtitle form fields
       (matches the field table in the backend README)
       ════════════════════════════════════════════════════════════════ */
    function appendFormFields(fd) {
      var s = app.settings;
      var sizeMap = { s: 28, m: 40, l: 60 };
  
      // The "Add Subtitles To Frames" node places text at an ABSOLUTE pixel
      // y_position from the top when center_y is false. So we anchor it to the
      // real video height; otherwise text can land off-screen (e.g. y=900 on a
      // 480px-tall clip → invisible). Fall back to 400 (the workflow default)
      // when we couldn't read the height.
      var h = app._videoH || 0;
      var center_y = false, y_position;
      if (s.pos === "middle") {
        center_y = true;            // node centers vertically; y_position ignored
        y_position = h ? Math.round(h / 2) : 400;
      } else if (s.pos === "top") {
        center_y = false;
        y_position = h ? Math.round(h * 0.08) : 60;
      } else { // bottom (default)
        center_y = false;
        y_position = h ? Math.round(h * 0.82) : 400;
      }
  
      // Match the working UI: send a plain colour name when we have one,
      // otherwise pass the hex through (the node accepts both).
      var COLOR_NAMES = {
        "#FFFFFF": "white", "#0B0710": "black", "#FFEB28": "yellow",
        "#56FFB1": "lightgreen", "#9BD1FF": "lightblue", "#D5B8FF": "violet"
      };
      var font_color = COLOR_NAMES[(s.text || "").toUpperCase()] || s.text || "white";
  
      fd.append("model", "large");
      fd.append("api_key", (document.getElementById("apiKey") && document.getElementById("apiKey").value.trim()) || "");
      fd.append("language", whisperLangValue(s.lang));
      fd.append("font_color", font_color);
      fd.append("font_family", s.font || "Roboto-Bold.ttf");
      fd.append("font_size", String(sizeMap[s.size] || 40));
      fd.append("center_x", "true");
      fd.append("center_y", center_y ? "true" : "false");
      fd.append("x_position", "100");
      fd.append("y_position", String(y_position));
    }
  
    /* ════════════════════════════════════════════════════════════════
       PROCESSING FLOW — real upload + poll against the Flask backend
       Backend statuses: queued → uploading → building_workflow → running → done | failed
       ════════════════════════════════════════════════════════════════ */
    var pollTimer = null;
    var creepTimer = null;
    var cancelled = false;
    var runToken = 0;            // bumped each run; stale async callbacks are ignored
    var activeAC = null;         // AbortController for in-flight requests
    var runStartedAt = 0;
    var pollFailures = 0;
    var MAX_POLL_FAILURES = 6;             // tolerate brief hiccups, then surface
    var JOB_WALL_TIMEOUT_MS = 20 * 60 * 1000; // overall client-side ceiling (20 min)
  
    function sig() { return activeAC ? activeAC.signal : undefined; }
    function alive(token) { return token === runToken && !cancelled; }
  
    // Invalidate any in-flight run/poll so it can't write into a newer run.
    function abortActiveRun() {
      runToken++;
      cancelled = true;
      clearProcessingTimers();
      if (activeAC) { try { activeAC.abort(); } catch (e) {} activeAC = null; }
    }
  
    // Robust fetch → JSON: no-store, parses body once, surfaces server error
    // text, and flags empty/malformed responses.
    function fetchJSON(url, opts) {
      opts = opts || {};
      opts.cache = "no-store";
      return fetch(url, opts).then(function (r) {
        return r.text().then(function (text) {
          var data = null;
          if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
          if (!r.ok) {
            var serverMsg = data && (data.error || data.message);
            var e = new Error(serverMsg || ("Request failed (HTTP " + r.status + ")"));
            e.httpStatus = r.status;
            e.serverData = data;
            throw e;
          }
          return data;
        });
      });
    }
  
    function failRun(title, msg, detail) { abortActiveRun(); showError(title, msg, detail); }
  
    function stepEl(i) { return $('.step[data-step="' + i + '"]'); }
    function markStep(i, cls) {
      var el = stepEl(i); if (!el) return;
      el.className = "step " + cls;
      var marker = el.querySelector(".marker");
      if (cls === "active") marker.innerHTML = '<i class="ic" style="--ic:url(assets/icons/loader.svg)"></i>';
      else if (cls === "done") marker.innerHTML = '<i class="ic" style="--ic:url(assets/icons/check-circle.svg)"></i>';
      else marker.innerHTML = '<span class="dot"></span>';
    }
    function setStepsUpTo(activeIndex) {
      for (var i = 0; i < 4; i++) {
        if (i < activeIndex) markStep(i, "done");
        else if (i === activeIndex) markStep(i, "active");
        else markStep(i, "pending");
      }
    }
    function setProgress(pct) {
      pct = Math.max(0, Math.min(100, Math.round(pct)));
      $("#procFill").style.width = pct + "%";
      $("#procPct").textContent = pct + "%";
    }
    function clearProcessingTimers() {
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (creepTimer) { clearInterval(creepTimer); creepTimer = null; }
    }
  
    // Indeterminate "creep": the backend doesn't report a %, so we ease
    // toward a ceiling while a phase runs, then snap forward on real events.
    var creepVal = 0;
    function startCreep(from, to, overMs) {
      creepVal = from;
      var startedAt = Date.now();
      if (creepTimer) clearInterval(creepTimer);
      creepTimer = setInterval(function () {
        var t = Math.min((Date.now() - startedAt) / overMs, 1);
        var v = from + (to - from) * t;
        if (v > creepVal) { creepVal = v; setProgress(creepVal); }
      }, 120);
    }
  
    function resetProcessingUI() {
      cancelled = false;
      app._renderCreeping = false;
      clearProcessingTimers();
      var pe = document.getElementById("procEst");
      if (pe) pe.textContent = app._videoDur ? ("Estimated total " + estRange(app._videoDur)) : "";
      $$(".step", $("#steps")).forEach(function (st) {
        st.className = "step pending";
        st.querySelector(".marker").innerHTML = '<span class="dot"></span>';
        var t = st.querySelector("[data-time]"); if (t) t.textContent = "—";
      });
      setProgress(0);
      $("#procStatus").textContent = "Starting up…";
      var s0 = stepEl(0);
      if (s0) { var sd = s0.querySelector(".sd"); if (sd) sd.textContent = "Sending " + app.file.name + " to Floyo"; }
    }
  
    function runProcessing() {
      if (!app._file) {
        showError("No video selected", "Choose a video first — then hit Generate subtitles and it’ll run through the Floyo workflow.", "no file in memory");
        return;
      }
      var apiKeyEl = document.getElementById("apiKey");
      if (!apiKeyEl || !apiKeyEl.value.trim()) {
        // No key — can't run on the user's account. Prompt and flash the field.
        toast("Add your Floyo API key to run this.");
        if (apiKeyEl) {
          apiKeyEl.classList.add("invalid");
          apiKeyEl.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(function () { apiKeyEl.classList.remove("invalid"); }, 1600);
          try { apiKeyEl.focus(); } catch (e) {}
        }
        return;
      }
      if (!app.settings.lang) {
        // No language chosen — keep them on the ready screen, prompt clearly,
        // flash the language field, and don't spend a run.
        updateScriptWarning(true);
        toast("Select the language spoken in the video first.");
        var combo = document.getElementById("langCombo");
        if (combo) {
          combo.scrollIntoView({ behavior: "smooth", block: "center" });
          combo.style.transition = "box-shadow .2s"; combo.style.boxShadow = "0 0 0 3px rgba(214,69,69,.35)";
          setTimeout(function () { combo.style.boxShadow = ""; }, 1400);
        }
        return;
      }
      // Fresh run: invalidate anything previous and reset all per-run state.
      abortActiveRun();
      app._jobId = null;
      app._curLocal = null;
      cancelled = false;
      pollFailures = 0;
      runStartedAt = Date.now();
      var myToken = ++runToken;
      activeAC = (typeof AbortController !== "undefined") ? new AbortController() : null;
  
      resetProcessingUI();
      setState("processing");
      setStepsUpTo(0);
      $("#procStatus").textContent = "Uploading " + app.file.name + "…";
      startCreep(0, 18, 9000);
  
      var fd = new FormData();
      fd.append("video", app._file, app._file.name);
      appendFormFields(fd);
  
      fetchJSON(API_BASE + "/api/subtitle", { method: "POST", body: fd, signal: sig() })
        .then(function (data) {
          if (!alive(myToken)) return;
          if (!data || !data.job_id) throw new Error("The server response was empty or malformed.");
          app._jobId = data.job_id;
          app._curLocal = addJob({
            backendId: data.job_id,
            name: app.file.name,
            status: "processing",
            langCode: app.settings.lang
          });
          setProgress(20);
          $("#procStatus").textContent = "Queued on Floyo…";
          startCreep(20, 88, 120000);
          schedulePoll(myToken);
        })
        .catch(function (err) {
          if (!alive(myToken)) return;
          submitError(err);
        });
    }
  
    function submitError(err) {
      if (err && err.name === "AbortError") return;
      var detail = (err && err.message) || "submit failed";
      if (err && err.httpStatus) {
        failRun("Upload rejected", (err.message) || "The server rejected the upload. Check the file and try again.", "HTTP " + err.httpStatus + " · " + detail);
      } else {
        failRun("Couldn’t reach the server", "We couldn’t reach the backend at " + (API_BASE || "this origin") + ". Make sure it’s running (python app.py) and reachable, then try again.", detail);
      }
    }
  
    function schedulePoll(token) {
      if (!alive(token)) return;
      pollTimer = setTimeout(function () { pollOnce(token); }, POLL_MS);
    }
  
    function pollOnce(token) {
      if (!alive(token) || !app._jobId) return;
      if (Date.now() - runStartedAt > JOB_WALL_TIMEOUT_MS) {
        if (app._curLocal) updateJob(app._curLocal, { status: "failed", error: "client timeout" });
        failRun("This is taking unusually long", "The run hasn’t finished after 20 minutes, so we stopped waiting here. It may still complete on Floyo — check My runs later, or try a shorter clip.", "client wall-clock timeout");
        return;
      }
      // Cache-buster + no-store so a stale status can never be replayed.
      var url = API_BASE + "/api/jobs/" + encodeURIComponent(app._jobId) + "?t=" + Date.now();
      fetchJSON(url, { signal: sig() })
        .then(function (job) {
          if (!alive(token)) return;
          pollFailures = 0;
          if (!job || !job.status) throw new Error("Empty status response from the server.");
          applyJobStatus(job, token);
        })
        .catch(function (err) {
          if (!alive(token)) return;
          if (err && err.name === "AbortError") return;
          if (err && err.httpStatus === 404) {
            if (app._curLocal) updateJob(app._curLocal, { status: "failed", error: "job lost (server restart?)" });
            failRun("The run was lost", "The server couldn’t find this job — it may have been restarted. Please run the video again.", "HTTP 404 · job not found");
            return;
          }
          pollFailures++;
          if (pollFailures >= MAX_POLL_FAILURES) {
            if (app._curLocal) updateJob(app._curLocal, { status: "failed", error: "lost connection" });
            failRun("Lost connection to the server", "We couldn’t reach the backend for a while. Check that it’s still running on " + (API_BASE || "this origin") + " and try again.", (err && err.message) || "repeated poll failures");
            return;
          }
          schedulePoll(token); // transient hiccup — retry
        });
    }
  
    function applyJobStatus(job, token) {
      var st = job.status;
      var msg = job.message || "";
      if (st === "queued") {
        setStepsUpTo(0);
        $("#procStatus").textContent = msg || "Queued…";
        schedulePoll(token);
      } else if (st === "uploading") {
        setStepsUpTo(0);
        $("#procStatus").textContent = msg || "Uploading to Floyo CDN…";
        schedulePoll(token);
      } else if (st === "building_workflow") {
        markStep(0, "done");
        setStepsUpTo(1);
        $("#procStatus").textContent = msg || "Preparing the workflow…";
        schedulePoll(token);
      } else if (st === "running") {
        markStep(0, "done"); markStep(1, "done");
        setStepsUpTo(2);
        $("#procStatus").textContent = msg || "Rendering captions into your video… this can take a few minutes.";
        // Keep easing forward through the long render instead of parking at 88%.
        if (!app._renderCreeping) { app._renderCreeping = true; startCreep(Math.max(creepVal, 60), 97, 240000); }
        schedulePoll(token);
      } else if (st === "done") {
        finishProcessing(job);
      } else if (st === "failed") {
        var detail = job.error ? (typeof job.error === "string" ? job.error : JSON.stringify(job.error)) : (msg || "the Floyo run did not complete");
        if (app._curLocal) updateJob(app._curLocal, { status: "failed", error: detail });
        failRun("Processing failed", msg || "Floyo couldn’t finish this run. Your file and settings are still here — adjust and try again.", "whisper-auto-subtitles · " + detail);
      } else {
        schedulePoll(token); // unknown interim status — keep waiting
      }
    }
  
    function finishProcessing(job) {
      clearProcessingTimers();
      markStep(0, "done"); markStep(1, "done"); markStep(2, "done"); markStep(3, "done");
      setProgress(100);
      $("#procStatus").textContent = "Done!";
  
      var out = (job.outputs && job.outputs[0]) ? job.outputs[0] : null;
      // download_url is a path on the Flask server, e.g. /api/jobs/<id>/files/<file_id>
      var dl = out && out.download_url ? (API_BASE + out.download_url) : null;
      if (!dl && out && out.presigned_url) dl = out.presigned_url; // fallback to CDN link
      var fileName = (out && out.file_name) ? out.file_name : ("subtitled-" + (app._jobId || "video") + ".mp4");
  
      // Record the finished job in Recent.
      if (app._curLocal) {
        updateJob(app._curLocal, {
          status: "done",
          output: { downloadUrl: dl, fileName: fileName, flotimeMs: job.flotime_ms }
        });
      }
  
      showResult(dl, fileName, app.settings.lang, job.flotime_ms);
      setTimeout(function () { setState("result"); }, 400);
    }
  
    // Render the result card for a given output (used by a fresh finish AND by
    // reopening a past job from the Recent list).
    function showResult(downloadUrl, fileName, langCode, flotimeMs) {
      var l = LANGS.filter(function (x) { return x.c === langCode; })[0] || LANGS[0];
      var langName = l.c === "auto" ? "Auto-detected" : l.n;
      var secs = flotimeMs ? " · " + Math.round(flotimeMs / 1000) + "s render" : "";
      $("#resSpec").textContent = langName + " · subtitles burned in" + secs;
  
      removeFakeControls();
  
      if (downloadUrl) {
        mountResultVideo(downloadUrl);
        var dlBtn = $("#downloadBtn");
        var fresh = dlBtn.cloneNode(true); // drop any old listeners
        dlBtn.parentNode.replaceChild(fresh, dlBtn);
        fresh.addEventListener("click", function () {
          var a = document.createElement("a");
          a.href = downloadUrl;
          a.download = fileName || "subtitled-video.mp4";
          document.body.appendChild(a); a.click(); a.remove();
        });
      }
    }
  
    // The result card has a decorative control bar (.controls) that doesn't
    // actually control anything — strip it out, keep the video + buttons.
    function removeFakeControls() {
      var sec = $('section[data-state="result"]');
      if (!sec) return;
      var bar = $(".controls", sec);
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    }
  
    function mountResultVideo(src) {
      var player = $('section[data-state="result"] .player');
      if (!player) return;
      player.innerHTML = "";
      var v = document.createElement("video");
      v.src = src;
      v.controls = true;
      v.playsInline = true;
      v.style.width = "100%";
      v.style.height = "100%";
      v.style.display = "block";
      v.style.objectFit = "contain";
      v.style.background = "#0B0710";
      v.style.borderRadius = "inherit";
      player.appendChild(v);
    }
  
    // Show the actual uploaded clip in the READY preview box, behind the caption
    // overlay (so it doubles as a live preview of where captions will sit). Also
    // reads duration/dimensions and enforces the max-duration guard.
    function mountPreviewVideo(url, gen) {
      var player = $('section[data-state="ready"] .player');
      if (!player) return;
      var prev = player.querySelector("#previewVideo");
      if (prev) { try { prev.pause(); } catch (e) {} prev.remove(); }
  
      var v = document.createElement("video");
      v.id = "previewVideo";
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.preload = "metadata";
      v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;background:#0B0710;";
      player.insertBefore(v, player.firstChild); // behind tag / play / caption / dur
  
      var playBtn = player.querySelector(".play");
      var capLayer = player.querySelector(".cap-layer") || document.getElementById("capLayer");
  
      v.onloadedmetadata = function () {
        if (gen !== app._fileGen) return; // superseded by a newer file
        app.file.dur = fmtDur(v.duration);
        app._videoDur = v.duration || 0;
        app._videoH = v.videoHeight || 0;
        app._videoW = v.videoWidth || 0;
        if (v.duration > MAX_DURATION_SEC) { rejectLongVideo(v.duration); return; }
        try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch (e) {} // render a poster frame
        if (app.state === "ready") syncControls();
        // "Try a sample" runs the whole thing automatically once metadata is in.
        if (app._autoRunSample) { app._autoRunSample = false; runProcessing(); }
      };
  
      function toggle() { if (v.paused) { v.muted = false; v.play(); } else { v.pause(); } }
      // Click anywhere on the preview to play/pause (standard video behaviour),
      // so there's a way to pause once the play button hides during playback.
      player.style.cursor = "pointer";
      player.onclick = function () { toggle(); };
      if (playBtn) {
        playBtn.style.cursor = "pointer";
        playBtn.onclick = function (e) { e.stopPropagation(); toggle(); };
      }
      v.onplay = function () { if (playBtn) playBtn.style.display = "none"; if (capLayer) capLayer.style.display = "none"; };
      var restore = function () { if (playBtn) playBtn.style.display = ""; if (capLayer) capLayer.style.display = ""; };
      v.onpause = restore; v.onended = restore;
      return v;
    }
  
    function clearPreviewVideo() {
      var player = $('section[data-state="ready"] .player');
      if (!player) return;
      var v = player.querySelector("#previewVideo");
      if (v) { try { v.pause(); } catch (e) {} v.remove(); }
      player.onclick = null; player.style.cursor = "";
      var playBtn = player.querySelector(".play");
      if (playBtn) playBtn.style.display = "";
      var capLayer = player.querySelector(".cap-layer") || document.getElementById("capLayer");
      if (capLayer) capLayer.style.display = "";
    }
  
    function rejectLongVideo(durationSec) {
      app._autoRunSample = false;
      clearPreviewVideo();
      if (app._fileURL) { try { URL.revokeObjectURL(app._fileURL); } catch (e) {} app._fileURL = null; }
      app._file = null;
      showError("Video is too long",
        "This clip is " + fmtDur(durationSec) + ". Videos over " + MAX_DURATION_MIN +
        " minutes usually fail — the subtitle workflow loads every frame into memory at once and runs out, even on a large GPU. Trim it to a shorter section (a minute or two is ideal) and try again.",
        "validation · " + fmtDur(durationSec) + " > " + MAX_DURATION_MIN + " min");
    }
  
    $("#genBtn").addEventListener("click", function () { runProcessing(); });
    $("#cancelBtn").addEventListener("click", function () {
      // Stop polling locally (the Flask demo has no cancel endpoint) and mark
      // the in-flight job as cancelled in history.
      if (app._curLocal) updateJob(app._curLocal, { status: "failed", error: "cancelled by user" });
      abortActiveRun();
      setState("ready");
    });
    $("#retryBtn").addEventListener("click", function () { runProcessing(); });
    $("#startOverBtn").addEventListener("click", function () { startFresh(); });
    $("#errStartOver").addEventListener("click", function () { startFresh(); });
  
    // ── Error helper ──
    function showError(title, msg, detail) {
      clearProcessingTimers();
      cancelled = true;
      $("#errTitle").textContent = title || "Something went wrong";
      $("#errMsg").textContent = msg || "An unexpected error occurred. Please try again.";
      $("#errDetail").textContent = detail || "auto-subtitles · unknown error";
      setState("error");
    }
  
    // ── Recent list (real, live) ──
    function relTime(ts) {
      var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
      if (s < 45) return "just now";
      var m = Math.round(s / 60);
      if (m < 60) return m + "m ago";
      var h = Math.round(m / 60);
      if (h < 24) return h + "h ago";
      return Math.round(h / 24) + "d ago";
    }
    function thumbVariant(id) {
      var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
      return ["", "b", "c"][h % 3];
    }
    function statusBits(st) {
      if (st === "done") return { dot: "ok", word: "Done" };
      if (st === "failed") return { dot: "err", word: "Failed" };
      return { dot: "run", word: "Processing" };
    }
    function renderRecent() {
      var sec = $(".side-body .sec");
      if (!sec) return;
      sec.innerHTML = '<div class="lbl">Recent</div>'; // keep label, rebuild rows
  
      if (!app.jobs.length) {
        var empty = document.createElement("div");
        empty.textContent = "Your runs will appear here.";
        empty.style.cssText = "color:var(--ube-5,#9b8fb5);font-size:12.5px;line-height:1.5;padding:6px 2px;";
        sec.appendChild(empty);
        return;
      }
  
      app.jobs.forEach(function (j) {
        var b = statusBits(j.status);
        var when = j.status === "processing" ? "now" : relTime(j.ts);
        var tv = thumbVariant(j.id);
        var row = document.createElement("div");
        row.className = "job";
        row.innerHTML =
          '<div class="thumb' + (tv ? " " + tv : "") + '"></div>' +
          '<div class="info"><div class="nm"></div>' +
          '<div class="meta"><span class="stat-dot ' + b.dot + '"></span>' + b.word + " · " + when + "</div></div>";
        row.querySelector(".nm").textContent = j.name || "video.mp4";
        row.addEventListener("click", function () { openJob(j.id); });
        sec.appendChild(row);
      });
    }
    function openJob(localId) {
      var j = getJob(localId);
      if (!j) return;
      closeNav();
      if (j.status === "done" && j.output && j.output.downloadUrl) {
        showResult(j.output.downloadUrl, j.output.fileName, j.langCode, j.output.flotimeMs);
        setState("result");
      } else if (j.status === "failed") {
        showError("Processing failed", "This run didn’t finish. Start a new video to try again.", "whisper-auto-subtitles · " + (j.error || "failed"));
      } else if (j.status === "processing") {
        if (app._curLocal === localId) setState("processing");
      }
    }
    // Refresh relative timestamps every minute.
    setInterval(function () { if (app.jobs.length) renderRecent(); }, 60000);
  
    /* ════════════════════════════════════════════════════════════════
       Lightweight toast (small, non-blocking messages)
       ════════════════════════════════════════════════════════════════ */
    var toastHost = null;
    function toast(msg) {
      if (!toastHost) {
        toastHost = document.createElement("div");
        toastHost.id = "floyo-toasts";
        toastHost.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:120;display:flex;flex-direction:column;gap:8px;align-items:flex-end;";
        document.body.appendChild(toastHost);
      }
      var t = document.createElement("div");
      t.textContent = msg;
      t.style.cssText = "background:var(--ube-9,#241141);color:#fff;font-size:13px;line-height:1.4;padding:10px 14px;border-radius:10px;box-shadow:var(--shadow-lg,0 12px 30px rgba(0,0,0,.3));max-width:300px;opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;";
      toastHost.appendChild(t);
      requestAnimationFrame(function () { t.style.opacity = "1"; t.style.transform = "none"; });
      setTimeout(function () {
        t.style.opacity = "0"; t.style.transform = "translateY(8px)";
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
      }, 3200);
    }
  
    /* ════════════════════════════════════════════════════════════════
       "My runs" overlay — full history with actions
       ════════════════════════════════════════════════════════════════ */
    var runsEl = null;
    function buildRunsOverlay() {
      var css = [
        ".runs-ov{ position:fixed; inset:0; z-index:100; display:none; }",
        ".runs-ov.open{ display:block; }",
        ".runs-ov .scrim2{ position:absolute; inset:0; background:rgba(26,12,52,.55); }",
        ".runs-ov .modal{ position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);",
        "  width:min(560px,calc(100vw - 32px)); max-height:min(70vh,640px); background:#fff;",
        "  border-radius:16px; box-shadow:var(--shadow-lg,0 24px 60px rgba(0,0,0,.35)); display:flex; flex-direction:column; overflow:hidden; }",
        ".runs-ov .h{ display:flex; align-items:center; gap:10px; padding:16px 18px; border-bottom:1px solid var(--border,#ece8f3); }",
        ".runs-ov .h .t{ font-weight:700; color:var(--ube-9,#241141); font-size:15px; flex:1; }",
        ".runs-ov .h button{ border:none; background:none; cursor:pointer; font-size:13px; color:var(--ube-6,#7a5bd0); padding:6px 8px; border-radius:8px; }",
        ".runs-ov .h button:hover{ background:var(--ube-1,#f3eefc); }",
        ".runs-ov .list{ overflow:auto; padding:8px; }",
        ".runs-ov .r{ display:flex; align-items:center; gap:12px; padding:10px; border-radius:10px; }",
        ".runs-ov .r:hover{ background:var(--ube-1,#f6f2fd); }",
        ".runs-ov .r .th{ width:46px; height:30px; border-radius:6px; background:linear-gradient(140deg,var(--ube-4),var(--ube-6)); flex:none; }",
        ".runs-ov .r .th.b{ background:linear-gradient(140deg,#5b8cff,#3b5bdb); } .runs-ov .r .th.c{ background:linear-gradient(140deg,#ff7a9c,#e64980); }",
        ".runs-ov .r .nm{ font-size:13.5px; color:var(--ube-9,#241141); font-weight:600; }",
        ".runs-ov .r .mt{ font-size:11.5px; color:var(--ube-5,#9b8fb5); margin-top:2px; }",
        ".runs-ov .r .acts{ margin-left:auto; display:flex; gap:6px; }",
        ".runs-ov .r .acts button{ border:1px solid var(--border,#ece8f3); background:#fff; cursor:pointer; font-size:12px; padding:5px 10px; border-radius:8px; color:var(--ube-7,#5b3bb0); }",
        ".runs-ov .r .acts button:hover{ background:var(--ube-1,#f3eefc); }",
        ".runs-ov .r .acts button.rm{ color:#c0395b; }",
        ".runs-ov .empty{ padding:32px; text-align:center; color:var(--ube-5,#9b8fb5); font-size:13px; }"
      ].join("\n");
      var style = document.createElement("style");
      style.id = "floyo-runs";
      style.textContent = css;
      document.head.appendChild(style);
  
      runsEl = document.createElement("div");
      runsEl.className = "runs-ov";
      runsEl.innerHTML =
        '<div class="scrim2"></div>' +
        '<div class="modal" role="dialog" aria-label="My runs">' +
        '  <div class="h"><span class="t">My runs</span>' +
        '    <button class="clear">Clear all</button><button class="x">Close</button></div>' +
        '  <div class="list"></div>' +
        "</div>";
      document.body.appendChild(runsEl);
      runsEl.querySelector(".scrim2").addEventListener("click", closeRuns);
      runsEl.querySelector(".x").addEventListener("click", closeRuns);
      runsEl.querySelector(".clear").addEventListener("click", function () {
        app.jobs = []; saveJobs(); renderRecent(); renderRunsList();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && runsEl.classList.contains("open")) closeRuns();
      });
    }
    function renderRunsList() {
      var list = runsEl.querySelector(".list");
      list.innerHTML = "";
      if (!app.jobs.length) {
        var e = document.createElement("div");
        e.className = "empty";
        e.textContent = "No runs yet. Generate subtitles on a video and they’ll show up here.";
        list.appendChild(e);
        return;
      }
      app.jobs.forEach(function (j) {
        var b = statusBits(j.status);
        var when = j.status === "processing" ? "now" : relTime(j.ts);
        var tv = thumbVariant(j.id);
        var r = document.createElement("div");
        r.className = "r";
        r.innerHTML =
          '<div class="th' + (tv ? " " + tv : "") + '"></div>' +
          '<div><div class="nm"></div><div class="mt"><span class="stat-dot ' + b.dot + '"></span> ' + b.word + " · " + when + "</div></div>" +
          '<div class="acts"></div>';
        r.querySelector(".nm").textContent = j.name || "video.mp4";
        var acts = r.querySelector(".acts");
        if (j.status === "done" && j.output && j.output.downloadUrl) {
          var open = document.createElement("button"); open.textContent = "Open";
          open.addEventListener("click", function () { closeRuns(); openJob(j.id); });
          var dl = document.createElement("button"); dl.textContent = "Download";
          dl.addEventListener("click", function () {
            var a = document.createElement("a"); a.href = j.output.downloadUrl;
            a.download = j.output.fileName || "subtitled-video.mp4";
            document.body.appendChild(a); a.click(); a.remove();
          });
          acts.appendChild(open); acts.appendChild(dl);
        }
        var rm = document.createElement("button"); rm.className = "rm"; rm.textContent = "Remove";
        rm.addEventListener("click", function () {
          app.jobs = app.jobs.filter(function (x) { return x.id !== j.id; });
          saveJobs(); renderRecent(); renderRunsList();
        });
        acts.appendChild(rm);
        list.appendChild(r);
      });
    }
    function openRuns() { if (!runsEl) buildRunsOverlay(); renderRunsList(); runsEl.classList.add("open"); closeNav(); }
    function closeRuns() { if (runsEl) runsEl.classList.remove("open"); }
  
    /* ════════════════════════════════════════════════════════════════
       Brand rail wiring
       ════════════════════════════════════════════════════════════════ */
    function setupRail() {
      var rail = $(".rail");
      if (!rail) return;
      var byTitle = {};
      $$(".ico", rail).forEach(function (ic) { byTitle[(ic.getAttribute("title") || "").toLowerCase()] = ic; });
  
      function setActive(ic) {
        $$(".ico", rail).forEach(function (x) { x.classList.remove("active"); });
        if (ic) ic.classList.add("active");
      }
      function on(title, fn) {
        var ic = byTitle[title];
        if (ic) ic.addEventListener("click", fn);
        return ic;
      }
  
      on("home", function () { window.open("https://www.floyo.ai", "_blank", "noopener"); });
      on("discover", function () { toast("Discover lives in the full Floyo app."); });
      on("apps", function () { setActive(byTitle["apps"]); closeRuns(); });
      on("models", function () { toast("The model library lives in the full Floyo app. This app runs Whisper “large”."); });
      on("my runs", function () { openRuns(); });
      on("docs", function () {
        window.open("https://www.floyo.ai/workflows/auto-subtitles-with-whisper-video-to-no0tr4u1adp8", "_blank", "noopener");
      });
      var avatar = $(".avatar", rail);
      if (avatar) avatar.addEventListener("click", function () { toast("Demo build · backend at " + API_BASE); });
    }
  
    // ── Mobile nav ──
    function openNav() { document.body.classList.add("nav-open"); }
    function closeNav() { document.body.classList.remove("nav-open"); }
    var mb = $("#menuBtn"); if (mb) mb.addEventListener("click", openNav);
    var sc = $("#scrim"); if (sc) sc.addEventListener("click", closeNav);
    // Esc closes the mobile drawer.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("nav-open")) closeNav();
    });
    // Tapping a rail icon on mobile closes the drawer too.
    $$(".rail .ico").forEach(function (ic) { ic.addEventListener("click", closeNav); });
  
    /* ════════════════════════════════════════════════════════════════
       Responsive sidebar: tablet sizing + a desktop collapse toggle.
       All styling is injected here so it stays in this one file.
       ════════════════════════════════════════════════════════════════ */
    function setupResponsiveSidebar() {
      var SB_KEY = "floyo.autosubs.sbCollapsed";
      var css = [
        // Tablet: give the main area more room with a slimmer sidebar.
        "@media (min-width:861px) and (max-width:1100px){",
        "  .layout{ grid-template-columns:64px 216px 1fr; }",
        "  .sb-toggle{ left:calc(64px + 216px - 15px); }",
        "}",
        // Desktop collapse behaviour.
        "@media (min-width:861px){",
        "  .side{ transition:opacity var(--dur) var(--ease-out); }",
        "  .sb-toggle{ position:fixed; top:84px; left:calc(64px + 264px - 15px); z-index:45;",
        "    width:30px; height:30px; padding:0; border-radius:50%; display:grid; place-items:center;",
        "    background:linear-gradient(140deg, var(--ube-4), var(--ube-6)); color:#fff;",
        "    border:2px solid #fff; cursor:pointer; box-shadow:0 4px 14px rgba(91,59,176,.38);",
        "    transition:left var(--dur-slow) var(--ease-out), transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out); }",
        "  .sb-toggle::before{ content:''; position:absolute; inset:-4px; border-radius:50%;",
        "    background:radial-gradient(circle, rgba(131,88,212,.25), transparent 70%); opacity:0; transition:opacity var(--dur) var(--ease-out); }",
        "  .sb-toggle:hover{ transform:scale(1.12); box-shadow:0 7px 20px rgba(91,59,176,.5); }",
        "  .sb-toggle:hover::before{ opacity:1; }",
        "  .sb-toggle:active{ transform:scale(.95); }",
        "  .sb-toggle .ic{ width:15px; height:15px; transform:rotate(90deg); transition:transform var(--dur-slow) var(--ease-out); }",
        "  body.sb-collapsed .layout{ grid-template-columns:64px 0px 1fr; }",
        "  body.sb-collapsed .side{ opacity:0; pointer-events:none; }",
        "  body.sb-collapsed .sb-toggle{ left:calc(64px - 15px); }",
        "  body.sb-collapsed .sb-toggle .ic{ transform:rotate(-90deg); }",
        "}",
        // Hide the desktop toggle on mobile (the hamburger takes over there).
        "@media (max-width:860px){ .sb-toggle{ display:none !important; } }"
      ].join("\n");
      var style = document.createElement("style");
      style.id = "floyo-responsive";
      style.textContent = css;
      document.head.appendChild(style);
  
      var btn = document.createElement("button");
      btn.className = "sb-toggle";
      btn.type = "button";
      btn.setAttribute("aria-label", "Toggle sidebar");
      // Down-chevron glyph, rotated to point left (open) / right (collapsed).
      btn.innerHTML = '<i class="ic" style="--ic:url(assets/icons/chevron-down.svg)"></i>';
      document.body.appendChild(btn);
  
      function paint() {
        var collapsed = document.body.classList.contains("sb-collapsed");
        btn.title = collapsed ? "Show sidebar" : "Hide sidebar";
      }
      try { if (localStorage.getItem(SB_KEY) === "1") document.body.classList.add("sb-collapsed"); } catch (e) {}
      paint();
  
      btn.addEventListener("click", function () {
        var collapsed = document.body.classList.toggle("sb-collapsed");
        try { localStorage.setItem(SB_KEY, collapsed ? "1" : "0"); } catch (e) {}
        paint();
      });
    }
  
    // ── Boot ──
    function setupApiKey() {
      var input = document.getElementById("apiKey");
      var toggle = document.getElementById("apiKeyToggle");
      if (!input) return;
      input.value = "";                       // never pre-filled or remembered
      input.addEventListener("input", function () { input.classList.remove("invalid"); });
      if (toggle) toggle.addEventListener("click", function () {
        var reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        toggle.classList.toggle("on", reveal);
      });
    }
    // Clear the API key whenever the flow resets to a new video, so it's always
    // re-entered for each upload / sample / fresh page.
    function clearApiKey() {
      var input = document.getElementById("apiKey");
      if (input) { input.value = ""; input.type = "password"; input.classList.remove("invalid"); }
      var toggle = document.getElementById("apiKeyToggle");
      if (toggle) toggle.classList.remove("on");
    }
    trimUnsupportedControls();
    setupApiKey();
    setupRail();
    renderRecent();
    syncControls();
    // No runtime state (the chosen file, an in-flight job, a finished result, or
    // an error) survives a page refresh, so always open on the home/upload screen.
    setState("empty");
  })();