// Shared by the content scripts and the extension pages: defaults and pure helpers (no DOM access).
// Internal colour values are 0-255 channel levels; the UI shows percentages of full brightness.
(function (g) {
  const DEFAULTS = {
    enabled: true, threshold: 72, tolerance: 24, borders: false, pseudo: true, hideGlow: true, antiFlash: true, perfMode: false,
    // where it runs
    scope: "all", allowSites: [], disabledSites: [], deepenSites: [], sites: {},
    // experimental
    expEdge: false, edgeLevel: 44, edgeDelta: 6, expHover: false, expAlpha: false,
    expOverlay: false, overlayStrength: 50, expDim: false, dimLevel: 85,
    expVideo: false, crushLevel: 6, expText: false, textCap: 88,
    expInspector: false, expDebug: false,
    // burn-in care
    idleCare: false, idleDimMin: 2, idleBlackMin: 5, idleDimLevel: 60, cursorHideSec: 0,
    schedule: false, schedFrom: "20:00", schedTo: "07:00",
    lang: "auto",
  };

  // settings that may differ per website (everything else is global)
  const PER_SITE = [
    "threshold", "tolerance", "borders", "pseudo", "hideGlow", "perfMode",
    "expEdge", "edgeLevel", "edgeDelta", "expHover", "expAlpha", "expOverlay", "overlayStrength",
    "expDim", "dimLevel", "expVideo", "crushLevel", "expText", "textCap",
  ];

  const toPct = (raw) => Math.round(raw / 2.55);
  const toRaw = (pct) => Math.round(pct * 2.55);
  const hexGray = (raw) => {
    const h = Math.max(0, Math.min(255, Math.round(raw))).toString(16).padStart(2, "0");
    return "#" + h + h + h;
  };

  // "youtube.com" in a list also covers m.youtube.com, www.youtube.com ...
  const matches = (entry, host) => host === entry || host.endsWith("." + entry);
  const hostIn = (list, host) => (list || []).some((e) => matches(e, host));
  const without = (list, host) => (list || []).filter((e) => !matches(e, host));

  // "off" | "deepen" | "auto" for one host
  function siteMode(cfg, host) {
    if (hostIn(cfg.disabledSites, host)) return "off";
    if (cfg.scope === "listed" && !hostIn(cfg.allowSites, host)) return "off";
    if (hostIn(cfg.deepenSites, host)) return "deepen";
    return "auto";
  }

  const mins = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
    return m ? (+m[1] % 24) * 60 + Math.min(59, +m[2]) : 0;
  };
  function inSchedule(cfg, now = new Date()) {
    if (!cfg.schedule) return true;
    const a = mins(cfg.schedFrom), b = mins(cfg.schedTo), n = now.getHours() * 60 + now.getMinutes();
    if (a === b) return true;
    return a < b ? n >= a && n < b : n >= a || n < b;
  }

  // built-in per-site fixes shipped with the extension (sitefixes.js), most specific entry wins
  function fixFor(host) {
    const fixes = g.OLED_FIXES || {};
    let best = null;
    for (const k in fixes) if (matches(k, host) && (!best || k.length > best.length)) best = k;
    return best ? fixes[best] : null;
  }

  // settings that actually apply to one host: global < built-in fix < the user's own per-site settings
  function effective(raw, host) {
    const c = { ...raw, ...(fixFor(host) || {}), ...((raw.sites || {})[host] || {}) };
    if (siteMode(raw, host) === "deepen") {
      // only near-black pixels become pure black; no extras
      c.threshold = Math.min(c.threshold, 28);
      c.tolerance = Math.min(c.tolerance, 8);
      Object.assign(c, {
        borders: false, expEdge: false, expHover: false, expAlpha: false, expOverlay: false,
        hideGlow: false, expDim: false, expVideo: false, expText: false,
      });
    }
    if (c.perfMode) { c.pseudo = false; c.borders = false; }
    return c;
  }

  // dark and near-neutral enough to count as a background colour
  function isDarkGray(c, cfg) {
    if (!c || c.a < (cfg.expAlpha ? 0.6 : 0.9)) return false;
    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    return max > 0 && max <= cfg.threshold && max - min <= cfg.tolerance;
  }
  // border colour judged by how it looks composited over black (so rgba(255,255,255,.1) counts)
  function isDarkOnBlack(c, cfg) {
    if (!c || c.a === 0) return false;
    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    return max * c.a > 0 && max * c.a <= cfg.threshold && max - min <= cfg.tolerance;
  }

  // Video black crush: a tone curve that sends near-black to 0 and leaves everything above 2x the
  // level untouched (smooth in between), as a CSS filter built from an inline SVG data URL.
  function crushFilter(levelPct) {
    const c = Math.max(0.01, levelPct / 100), n = 129;
    const v = [];
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      let y;
      if (x <= c) y = 0;
      else if (x >= 2 * c) y = x;
      else { const t = (x - c) / c; y = x * t * t * (3 - 2 * t); }
      v.push(+y.toFixed(4));
    }
    const tv = v.join(" ");
    const f = ["R", "G", "B"].map((ch) => `<feFunc${ch} type='table' tableValues='${tv}'/>`).join("");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg'><filter id='c' color-interpolation-filters='sRGB'><feComponentTransfer>${f}</feComponentTransfer></filter></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}#c")`;
  }

  g.OLED = { DEFAULTS, PER_SITE, toPct, toRaw, hexGray, hostIn, without, siteMode, inSchedule, effective, fixFor, isDarkGray, isDarkOnBlack, crushFilter };
  g.toPct = toPct; g.toRaw = toRaw; g.hexGray = hexGray;
})(globalThis);
