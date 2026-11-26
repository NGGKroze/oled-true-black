(() => {
  const ATTR = "data-oled-black";
  const BATTR = "data-oled-border";
  const EATTR = "data-oled-edge";
  const OATTR = "data-oled-ov";
  const PATTR = "data-oled-pseudo";
  const RATTR = "data-oled-read";
  const GATTR = "data-oled-glow";
  const MEDIA = new Set(["CANVAS", "VIDEO", "IMG"]);
  const SKIPATTR = "data-oled-skip";
  const TATTR = "data-oled-txt";
  const MARKS = [ATTR, BATTR, EATTR, OATTR, PATTR, GATTR, TATTR];
  const DEFAULTS = OLED.DEFAULTS; // core.js
  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "HEAD", "TITLE", "IMG", "VIDEO", "CANVAS", "IFRAME", "NOSCRIPT", "SOURCE", "PATH"]);
  const OBS = { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["class", "style"] };
  const batchSize = () => (cfg.perfMode ? 80 : 250);
  const SIDES = ["Top", "Right", "Bottom", "Left"];
  const PSEUDOS = [["::before", 16], ["::after", 32]];

  let raw = { ...DEFAULTS };
  let cfg = { ...DEFAULTS }; // effective config = global + this site's overrides
  const recompute = () => { cfg = OLED.effective(raw, location.hostname); };

  let active = false;
  let observer = null;
  let queue = new Set();
  let scheduled = false;
  let deepTimer = 0;
  const styles = new Map(); // root (document or shadowRoot) -> <style>
  const orig = new WeakMap(); // element -> its original opaque background colour, or false if it had none

  const shouldRun = () => raw.enabled && OLED.siteMode(raw, location.hostname) !== "off" && OLED.inSchedule(raw);

  // time spent by this script on this page (shown in the popup)
  const perf = { ms: 0, checked: 0 };

  // Each selector gets :not(#oled-x):not(#oled-x) (= 2 IDs of specificity), so site rules such as
  // html[dark]{background:#0f0f0f !important} can no longer override our !important black.
  const B = ":not(#oled-x):not(#oled-x)";
  function cssText() {
    const bg = cfg.expDebug ? "#4a0030" : "#000";
    let css =
      `[${ATTR}]${B}{background-color:${bg} !important;background-image:none !important;scrollbar-color:#4a4a4a #000;}` +
      `[${BATTR}]${B}{border-color:#000 !important;}` +
      `[${PATTR}~="b"]${B}::before,[${PATTR}~="a"]${B}::after{background-color:${bg} !important;background-image:none !important;}` +
      `[${RATTR}]${B},[${RATTR}]${B}::before,[${RATTR}]${B}::after{transition:none !important;}` +
      `[${GATTR}]${B}{opacity:0 !important;}`;
    if (cfg.expEdge) {
      const k = cfg.edgeLevel;
      css += `[${EATTR}]${B}:not(:focus-visible){outline:1px solid rgb(${k},${k},${k}) !important;outline-offset:-1px !important;}`;
    }
    if (cfg.expHover) {
      css += `:is(a,button,summary,li,[role=button],[role=menuitem],[role=option],[role=link],[role=tab])[${ATTR}]${B}:hover{background-color:#161616 !important;}`;
    }
    if (cfg.expOverlay) {
      const k = cfg.overlayStrength / 100;
      for (let n = 1; n <= 50; n++) css += `[${OATTR}="${n}"]${B}{background-color:rgba(255,255,255,${((n / 100) * k).toFixed(3)}) !important;}`;
    }
    // filters stay off while an element is being re-read (RATTR), so a site's own filter (e.g. a blurred glow) stays visible to the detector
    const dim = cfg.expDim ? `brightness(${cfg.dimLevel / 100})` : "";
    if (dim) css += `:is(img,picture,svg image)${B}:not([${RATTR}]){filter:${dim} !important;}`;
    const vf = [cfg.expVideo ? OLED.crushFilter(cfg.crushLevel) : "", dim].filter(Boolean).join(" ");
    if (vf) css += `video${B}:not([${RATTR}]){filter:${vf} !important;}`;
    if (cfg.expText) {
      const k = Math.round(cfg.textCap * 2.55);
      css += `[${TATTR}]${B}{color:rgb(${k},${k},${k}) !important;}`;
    }
    return css;
  }

  // --- colour parsing (rgb fast path, canvas fallback for lab/oklch/color-mix/...) ----
  const RGB_RE = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/;
  const cache = new Map();
  let ctx = null;

  function viaCanvas(str) {
    try {
      if (!ctx) {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 1;
        ctx = cv.getContext("2d", { willReadFrequently: true });
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = str;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch (e) {
      return null;
    }
  }

  function parseColor(str) {
    if (!str || str === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    let c = cache.get(str);
    if (c !== undefined) return c;
    const m = RGB_RE.exec(str);
    if (m) {
      let a = 1;
      if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      c = { r: +m[1], g: +m[2], b: +m[3], a };
    } else {
      c = viaCanvas(str);
    }
    if (cache.size > 3000) cache.clear();
    cache.set(str, c);
    return c;
  }

  // Dark and near-neutral enough -> background candidate
  const isDarkGray = (c) => OLED.isDarkGray(c, cfg); // translucent overlays/scrims are left alone

  // Border candidate: judged by how it looks composited over black (so rgba(255,255,255,.1) counts)
  const isDarkOnBlack = (c) => OLED.isDarkOnBlack(c, cfg);

  function darkScheme(cs) {
    const s = cs || "";
    if (!s.includes("dark")) return false;
    if (!s.includes("light")) return true;
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // Gradient made only of opaque dark grays (no url(), no alpha scrims, no exotic colour spaces)
  function gradientDark(bi) {
    if (!bi || !bi.includes("gradient(") || bi.includes("url(")) return false;
    if (/(?:color|oklch|oklab|lab|lch|hwb)\(/.test(bi)) return false;
    const cols = bi.match(/rgba?\([^)]*\)/g);
    return !!cols && cols.every((s) => isDarkGray(parseColor(s)));
  }

  function bordersDark(cs) {
    let any = false;
    for (const s of SIDES) {
      if (cs["border" + s + "Style"] === "none" || !(parseFloat(cs["border" + s + "Width"]) > 0)) continue;
      if (!isDarkOnBlack(parseColor(cs["border" + s + "Color"]))) return false;
      any = true;
    }
    return any;
  }

  // Original background of the nearest ancestor that had an opaque one (null = page root / none)
  const parentOf = (el) => el.parentElement || (el.parentNode && el.parentNode.host) || null;
  function ancestorBg(el) {
    let p = parentOf(el);
    for (let n = 0; p && n < 14; n++, p = parentOf(p)) {
      const o = orig.get(p);
      if (o) return o;
      if (o === false) continue;
      if (p.hasAttribute(ATTR)) return { r: 0, g: 0, b: 0, a: 1 }; // marked but unseen: it is black now
      const c = parseColor(getComputedStyle(p).backgroundColor);
      if (c && c.a >= 0.9) return c;
    }
    return null;
  }

  // Blurred copies of a picture/video drawn behind content ("ambient mode", glow backdrops).
  // They are images, not background colours, so the colour rule never sees them.
  function isGlow(el, cs) {
    if (!cfg.hideGlow) return false;
    const f = cs.filter;
    if (!f || !f.includes("blur(")) return false;
    const px = parseFloat(f.slice(f.indexOf("blur(") + 5)) || 0;
    if (px < 8) return false; // small blurs are UI effects, not glows
    return MEDIA.has(el.tagName) || !!el.querySelector("canvas,video,img");
  }

  // A tiny canvas stretched over a large area is a soft colour wash (e.g. YouTube Shorts' ambient
  // backdrop), not real content: real canvases (charts, games, maps) are drawn at ~1x display size.
  const canvasRetry = new WeakMap();
  function isStretchedCanvas(el) {
    if (!cfg.hideGlow || el.tagName !== "CANVAS" || !el.width) return false;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) {
      const n = canvasRetry.get(el) || 0; // not laid out yet: look again a bit later
      if (n < 5) { canvasRetry.set(el, n + 1); setTimeout(() => enqueue(el, false), 1000); }
      return false;
    }
    return w >= 200 && h >= 150 && w / el.width >= 4 && h / el.height >= 4;
  }

  const TEXT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);
  function hasOwnText(el) {
    if (TEXT_TAGS.has(el.tagName)) return true;
    for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }

  // --- decision for a single element (read-only): bit 1 = background, 2 = border, 4 = edge outline ----
  function decide(el) {
    const cs = getComputedStyle(el);
    const c = parseColor(cs.backgroundColor);
    const bi = cs.backgroundImage;
    orig.set(el, c && c.a >= 0.9 ? c : false);
    let bits = 0;
    if (isGlow(el, cs)) return 64;

    if (el === document.documentElement && c && c.a < 0.1 && darkScheme(cs.colorScheme)) {
      bits |= 1; // transparent <html> + dark color-scheme paints a gray canvas
    } else if (isDarkGray(c)) {
      // keep real photos/thumbnails: only strip gradients, never url() images
      if (!(bi && bi !== "none" && bi.includes("url("))) bits |= 1;
    } else if (c && c.a < 0.1 && gradientDark(bi)) {
      bits |= 1;
    }

    if (cfg.borders && bordersDark(cs)) bits |= 2;

    // experimental: keep a thin outline where this gray panel differed from what was behind it
    if (cfg.expEdge && bits & 1 && c.a >= 0.6 && el !== document.documentElement && el !== document.body) {
      const anc = ancestorBg(el);
      const ownMax = Math.max(c.r, c.g, c.b);
      const ancMax = anc ? Math.max(anc.r, anc.g, anc.b) : 0;
      if (Math.abs(ownMax - ancMax) >= cfg.edgeDelta) bits |= 4;
    }
    // ::before / ::after layers that paint a dark-gray background (cards, dividers, sticky headers)
    if (cfg.pseudo) {
      for (const [pe, flag] of PSEUDOS) {
        const ps = getComputedStyle(el, pe);
        const ct = ps.content;
        if (ct === "none" || ct === "normal") continue;
        const pc = parseColor(ps.backgroundColor);
        if (isDarkGray(pc) && !ps.backgroundImage.includes("url(")) bits |= flag;
      }
    }

    // experimental: cap near-white text a little below pure white (less glare/halation)
    if (cfg.expText && hasOwnText(el)) {
      const tc = parseColor(cs.color);
      if (tc && tc.a >= 0.9) {
        const lo = Math.min(tc.r, tc.g, tc.b);
        if (lo > Math.round(cfg.textCap * 2.55) && Math.max(tc.r, tc.g, tc.b) - lo <= cfg.tolerance) bits |= 128;
      }
    }

    // experimental: soften light translucent overlays (e.g. rgba(255,255,255,.1) cards) to a weaker alpha
    if (cfg.expOverlay && c && c.a >= 0.02 && c.a <= 0.5 && Math.min(c.r, c.g, c.b) >= 200 && Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) <= cfg.tolerance) {
      bits |= 8 | (Math.min(50, Math.round(c.a * 100)) << 8);
    }
    return bits;
  }

  // --- queue / batching -----------------------------------------------------
  function enqueue(node, deep) {
    if (!active || node.nodeType !== 1) return;
    queue.add(node);
    if (deep) node.querySelectorAll("*").forEach((n) => queue.add(n));
    schedule();
  }

  function schedule() {
    if (scheduled || !active) return;
    scheduled = true;
    requestAnimationFrame(flush);
  }

  function flush() {
    scheduled = false;
    if (!active) return;
    const t0 = performance.now();

    // page frameworks sometimes wipe our <style>; put it back
    for (const [root, st] of styles) if (!st.isConnected) attachStyle(root, st);

    const batch = [];
    for (const el of queue) {
      queue.delete(el);
      if (el.isConnected && (!SKIP.has(el.tagName) || (cfg.hideGlow && MEDIA.has(el.tagName))) && !el.hasAttribute(SKIPATTR)) batch.push(el);
      if (batch.length >= batchSize()) break;
    }

    // 1) remove old marks so we read the page's real colours (one style recalc per batch).
    //    Elements we already recoloured get RATTR (transition:none) first: otherwise a site's
    //    background transition would report the in-between #000 and the element would fade back to gray.
    const reread = [];
    for (const el of batch) {
      let had = false;
      for (const a of MARKS) if (el.hasAttribute(a)) { el.removeAttribute(a); had = true; }
      if (had || (MEDIA.has(el.tagName) && (cfg.expDim || cfg.expVideo))) { el.setAttribute(RATTR, ""); reread.push(el); }
    }
    // 2) read
    const bits = batch.map((el) => (MEDIA.has(el.tagName) ? (isGlow(el, getComputedStyle(el)) || isStretchedCanvas(el) ? 64 : 0) : decide(el)));
    // 3) write
    const shadows = [];
    batch.forEach((el, i) => {
      const b = bits[i];
      if (b & 1) el.setAttribute(ATTR, "");
      if (b & 2) el.setAttribute(BATTR, "");
      if (b & 4) el.setAttribute(EATTR, "");
      if (b & 8) el.setAttribute(OATTR, String(b >> 8));
      if (b & 64) el.setAttribute(GATTR, "");
      if (b & 128) el.setAttribute(TATTR, "");
      if (b & 48) el.setAttribute(PATTR, (b & 16 ? "b " : "") + (b & 32 ? "a" : ""));
      if (el.shadowRoot) shadows.push(el.shadowRoot);
    });
    // apply the new marks while transitions are still off, then restore the site's transitions
    if (reread.length) {
      for (const el of reread) getComputedStyle(el).backgroundColor;
      for (const el of reread) el.removeAttribute(RATTR);
    }
    shadows.forEach(hookRoot);
    perf.ms += performance.now() - t0;
    perf.checked += batch.length;

    if (queue.size) schedule();
    else if (!firstPassDone && document.body) {
      firstPassDone = true;
      preBlack(false);
      rememberHost();
    }
  }

  // --- experimental: inspector (hold Alt and move the mouse) ----------------
  let tip = null;
  function onMove(e) {
    if (!cfg.expInspector || !e.altKey) {
      if (tip) tip.style.display = "none";
      return;
    }
    const el = e.composedPath()[0];
    if (!el || el.nodeType !== 1 || el === tip) return;

    // element + ancestors; strip our marks so we read the page's real colours, then restore
    const chain = [];
    for (let p = el, n = 0; p && n < 14; p = parentOf(p), n++) chain.push(p);
    const stripped = chain.map((p) =>
      MARKS.filter((a) => p.hasAttribute(a)).map((a) => { const v = p.getAttribute(a); p.removeAttribute(a); return [a, v]; })
    );
    const cols = chain.map((p) => parseColor(getComputedStyle(p).backgroundColor));
    const cs = getComputedStyle(el);
    const bc = parseColor(cs.borderTopColor);
    const bw = parseFloat(cs.borderTopWidth) || 0;
    chain.forEach((p, i) => stripped[i].forEach(([a, v]) => p.setAttribute(a, v)));

    const f = (x) => (x ? `rgb(${x.r | 0},${x.g | 0},${x.b | 0}${x.a < 1 ? " /" + (+x.a.toFixed(2)) : ""})` : "—");
    const statusOf = (x) => {
      if (!x || x.a === 0) return "transparent";
      const mx = Math.max(x.r, x.g, x.b), mn = Math.min(x.r, x.g, x.b);
      if (isDarkGray(x)) return "→ BLACK";
      if (mn >= 200 && x.a < 0.9) return cfg.expOverlay && x.a <= 0.5 ? "→ softened overlay" : "kept (light translucent overlay)";
      if (mx > cfg.threshold) return `kept (brightness ${Math.round(mx / 2.55)}% > threshold ${Math.round(cfg.threshold / 2.55)}%)`;
      if (mx - mn > cfg.tolerance) return `kept (colour ${Math.round((mx - mn) / 2.55)}% > tolerance ${Math.round(cfg.tolerance / 2.55)}%)`;
      return `kept (opacity ${Math.round(x.a * 100)}%)`;
    };
    const c = cols[0];
    const status = statusOf(c);

    // where does the visible background actually come from? (first non-transparent colour up the tree)
    const vi = cols.findIndex((x) => x && x.a > 0);
    const visible = vi < 0 ? "—" : vi === 0 ? "(this element)" : `<${chain[vi].tagName.toLowerCase()}> ${f(cols[vi])}  ${statusOf(cols[vi])}`;
    const nowC = vi < 0 ? null : parseColor(getComputedStyle(chain[vi]).backgroundColor);
    const overridden = vi >= 0 && chain[vi].hasAttribute(ATTR) && nowC && Math.max(nowC.r, nowC.g, nowC.b) > 0 && !cfg.expDebug;
    const now = vi < 0 ? "—" : f(nowC) + (overridden ? "  ⚠ site CSS overrides the black" : "");

    if (!tip) {
      tip = document.createElement("div");
      tip.setAttribute(SKIPATTR, "");
      tip.style.cssText =
        "position:fixed;z-index:2147483647;pointer-events:none;background:#222;color:#fff;font:12px/1.4 monospace;" +
        "padding:5px 8px;border:1px solid #888;border-radius:4px;white-space:pre;";
      document.documentElement.appendChild(tip);
    }
    tip.textContent =
      `<${el.tagName.toLowerCase()}>   (original site colours)\nbg:      ${f(c)}  ${status}\nvisible: ${visible}\non screen now: ${now}\nparent:  ${f(ancestorBg(el))}\nborder:  ${bw ? f(bc) + " " + bw + "px" : "—"}`;
    tip.style.display = "block";
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 460) + "px";
    tip.style.top = Math.min(e.clientY + 14, innerHeight - 100) + "px";
  }

  // --- roots (document + open shadow roots) ---------------------------------
  function attachStyle(root, st) {
    const parent = root === document ? document.head || document.documentElement : root;
    if (parent) parent.appendChild(st);
  }

  function hookRoot(root) {
    if (!active || styles.has(root)) return;
    const st = document.createElement("style");
    st.textContent = cssText();
    styles.set(root, st);
    attachStyle(root, st);
    observer.observe(root === document ? document.documentElement : root, OBS);
    root.querySelectorAll("*").forEach((n) => queue.add(n));
    schedule();
  }

  function onShadowAttached(e) {
    const host = e.composedPath()[0];
    if (host && host.shadowRoot) hookRoot(host.shadowRoot);
  }

  function rescanDocumentSoon(delay) {
    clearTimeout(deepTimer);
    deepTimer = setTimeout(() => {
      enqueue(document.documentElement, true);
      for (const root of styles.keys()) if (root !== document) root.querySelectorAll("*").forEach((n) => queue.add(n));
      schedule();
    }, delay ?? (cfg.perfMode ? 1500 : 400));
  }

  // mousemove listener exists only while the inspector is enabled (zero cost otherwise)
  let inspecting = false;
  function syncInspector() {
    if (cfg.expInspector && active && !inspecting) {
      document.addEventListener("mousemove", onMove, { capture: true, passive: true });
      inspecting = true;
    } else if ((!cfg.expInspector || !active) && inspecting) {
      document.removeEventListener("mousemove", onMove, true);
      inspecting = false;
      if (tip) tip.style.display = "none";
    }
  }

  // --- anti-flash: hosts whose page root turned black last time get a black canvas immediately ----
  const TOP = window === window.top;
  let pre = null;
  let firstPassDone = false;
  function preBlack(on) {
    if (on && !pre) {
      pre = document.createElement("style");
      pre.textContent = `:is(html,body)${B}{background-color:#000 !important;}`;
      (document.head || document.documentElement).appendChild(pre);
      setTimeout(() => preBlack(false), 3000); // safety net
    } else if (!on && pre) {
      pre.remove();
      pre = null;
    }
  }
  if (TOP) {
    chrome.storage.local.get({ darkHosts: {} }, ({ darkHosts }) => {
      if (!firstPassDone && darkHosts[location.hostname] && raw.antiFlash !== false) preBlack(true);
    });
  }
  function rememberHost() {
    if (!TOP || !cfg.antiFlash) return;
    const dark = document.documentElement.hasAttribute(ATTR) || (document.body && document.body.hasAttribute(ATTR));
    chrome.storage.local.get({ darkHosts: {} }, ({ darkHosts }) => {
      const h = location.hostname;
      if (!!darkHosts[h] === dark) return;
      if (dark) darkHosts[h] = Date.now();
      else delete darkHosts[h];
      const keys = Object.keys(darkHosts);
      if (keys.length > 500) keys.sort((a, b) => darkHosts[a] - darkHosts[b]).slice(0, keys.length - 500).forEach((k) => delete darkHosts[k]);
      chrome.storage.local.set({ darkHosts });
    });
  }

  // --- start / stop ---------------------------------------------------------
  function start() {
    if (active) return;
    active = true;
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => enqueue(n, true));
          continue;
        }
        const t = m.target;
        // ignore inline-style churn (animations, transforms...) that can't change a background
        if (m.attributeName === "style") {
          if (cfg.perfMode) continue;
          const old = m.oldValue || "";
          const now = t.getAttribute("style") || "";
          const rel = (s) => s.includes("background") || s.includes("--") || s.includes("border") || s.includes("filter");
          if (!rel(old) && !rel(now)) continue;
        }
        if (t === document.documentElement || t === document.body) rescanDocumentSoon();
        else enqueue(t, false);
      }
    });
    document.addEventListener("oled-shadow-attached", onShadowAttached, true);
    syncInspector();
    hookRoot(document);
    enqueue(document.documentElement, true);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => active && rescanDocumentSoon(), { once: true });
    }
  }

  function stop() {
    if (!active) return;
    active = false;
    clearTimeout(deepTimer);
    observer && observer.disconnect();
    observer = null;
    document.removeEventListener("oled-shadow-attached", onShadowAttached, true);
    syncInspector();
    queue.clear();
    if (tip) { tip.remove(); tip = null; }
    preBlack(false);
    for (const [root, st] of styles) {
      st.remove();
      root.querySelectorAll(MARKS.map((a) => `[${a}]`).join(",")).forEach((el) => MARKS.forEach((a) => el.removeAttribute(a)));
    }
    document.documentElement.removeAttribute(ATTR);
    styles.clear();
  }

  // the schedule is re-checked every minute (only while it is switched on)
  let schedTimer = 0;
  function syncSchedule() {
    if (raw.schedule && !schedTimer) schedTimer = setInterval(() => { if (shouldRun() !== active) apply(); }, 60000);
    else if (!raw.schedule && schedTimer) { clearInterval(schedTimer); schedTimer = 0; }
  }

  function apply() {
    syncSchedule();
    if (!shouldRun()) return stop();
    if (active) {
      for (const st of styles.values()) st.textContent = cssText(); // experimental flags change the CSS
      syncInspector();
      rescanDocumentSoon(30); // a settings change should show up at once, even in performance mode
    } else start();
  }

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    raw = { ...DEFAULTS, ...stored };
    recompute();
    apply();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || msg.type !== "oled-stats") return;
    let black = 0, pseudo = 0, glow = 0, roots = 0;
    for (const root of styles.keys()) {
      roots++;
      black += root.querySelectorAll(`[${ATTR}]`).length;
      pseudo += root.querySelectorAll(`[${PATTR}]`).length;
      glow += root.querySelectorAll(`[${GATTR}]`).length;
    }
    reply({ active, black, pseudo, glow, shadowRoots: Math.max(0, roots - 1), ms: Math.round(perf.ms), checked: perf.checked, mode: OLED.siteMode(raw, location.hostname) });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const k in changes) raw[k] = changes[k].newValue;
    recompute();
    apply();
  });
})();
