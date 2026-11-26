// Idle care: burn-in protection while the page sits untouched.
//  - stage 1: dim the page after `idleDimMin` minutes without input
//  - stage 2: fade it to black after `idleBlackMin` minutes
//  - hide the mouse cursor after `cursorHideSec` seconds without movement
// Nothing happens while a video is playing (in this page or in any embedded frame).
(() => {
  const DEFAULTS = OLED.DEFAULTS; // core.js
  const TOP = window === window.top;
  const MSG = "oled-true-black:idle";
  const CURSOR_ATTR = "data-oled-nocursor";

  let cfg = { ...DEFAULTS };
  const on = () => cfg.enabled && OLED.siteMode(cfg, location.hostname) !== "off" && OLED.inSchedule(cfg);

  // ---------- video detection (also inside open shadow roots) ----------
  function videoPlaying(root = document, depth = 0) {
    for (const v of root.querySelectorAll("video")) {
      if (!v.paused && !v.ended && v.readyState > 2) return true;
    }
    if (depth < 3) {
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot && videoPlaying(el.shadowRoot, depth + 1)) return true;
      }
    }
    return false;
  }
  // cheap check first; the shadow-DOM walk only runs when the plain query finds nothing
  const anyVideoPlaying = () => {
    for (const v of document.getElementsByTagName("video")) if (!v.paused && !v.ended && v.readyState > 2) return true;
    return videoPlaying();
  };

  // ---------- frames: report activity and playing video to the top page ----------
  if (!TOP) {
    let last = 0;
    const report = (kind) => {
      const now = Date.now();
      if (kind === "input" && now - last < 1000) return; // throttle
      last = now;
      try { window.top.postMessage({ [MSG]: kind }, "*"); } catch (e) {}
    };
    for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"]) {
      addEventListener(ev, () => report("input"), { capture: true, passive: true });
    }
    setInterval(() => { if (anyVideoPlaying()) report("video"); }, 5000);
    return; // the overlay lives only in the top page
  }

  // ---------- top page: idle state machine ----------
  let lastInput = Date.now();
  let lastVideo = 0;
  let lastMove = Date.now();
  let stage = 0; // 0 awake, 1 dimmed, 2 black
  let veil = null;
  let ticker = 0;

  function ensureVeil() {
    if (veil && veil.isConnected) return veil;
    veil = document.createElement("div");
    veil.setAttribute("data-oled-skip", "");
    veil.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:#000;opacity:0;pointer-events:none;" +
      "transition:opacity 1.2s ease;";
    // while visible, the first click only wakes the page (doesn't press a link underneath)
    veil.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); wake(); }, true);
    (document.body || document.documentElement).appendChild(veil);
    return veil;
  }

  function setStage(n) {
    if (n === stage) return;
    stage = n;
    if (n === 0) {
      if (veil) { veil.style.opacity = "0"; veil.style.pointerEvents = "none"; }
      return;
    }
    const v = ensureVeil();
    v.style.pointerEvents = "auto";
    v.style.transition = n === 2 ? "opacity 3s ease" : "opacity 1.2s ease";
    v.style.opacity = n === 2 ? "1" : String(1 - cfg.idleDimLevel / 100);
  }

  function wake() {
    lastInput = Date.now();
    setStage(0);
  }

  function onInput(e) {
    lastInput = Date.now();
    if (e.type === "pointermove") { lastMove = lastInput; showCursor(); }
    if (stage) setStage(0);
  }

  // ---------- cursor hiding ----------
  let cursorStyle = null;
  function hideCursor() {
    if (!cursorStyle) {
      cursorStyle = document.createElement("style");
      cursorStyle.textContent = `html[${CURSOR_ATTR}],html[${CURSOR_ATTR}] *{cursor:none !important;}`;
      (document.head || document.documentElement).appendChild(cursorStyle);
    }
    document.documentElement.setAttribute(CURSOR_ATTR, "");
  }
  function showCursor() {
    document.documentElement.removeAttribute(CURSOR_ATTR);
  }

  function tick() {
    if (!on() || !cfg.idleCare) { setStage(0); showCursor(); return; }
    const now = Date.now();
    if (anyVideoPlaying()) lastVideo = now;
    const watching = now - lastVideo < 8000;

    // cursor
    if (cfg.cursorHideSec > 0 && now - lastMove > cfg.cursorHideSec * 1000) hideCursor();

    // dim / black (never while a video plays, never in a background tab)
    if (watching || document.visibilityState !== "visible") { if (stage) setStage(0); return; }
    const idle = now - lastInput;
    const black = cfg.idleBlackMin > 0 && idle > cfg.idleBlackMin * 60000;
    const dim = cfg.idleDimMin > 0 && idle > cfg.idleDimMin * 60000;
    setStage(black ? 2 : dim ? 1 : 0);
  }

  function sync() {
    clearInterval(ticker);
    if (cfg.idleCare) {
      ticker = setInterval(tick, 1000); // tick() itself checks on(), so the schedule can switch it on later
    } else {
      setStage(0);
      showCursor();
    }
  }

  for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"]) {
    addEventListener(ev, onInput, { capture: true, passive: true });
  }
  addEventListener("message", (e) => {
    const k = e.data && e.data[MSG];
    if (k === "input") onInput({ type: "frame" });
    else if (k === "video") lastVideo = Date.now();
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wake(); });

  chrome.storage.sync.get(DEFAULTS, (c) => { cfg = { ...DEFAULTS, ...c }; sync(); });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync") return;
    for (const k in ch) cfg[k] = ch[k].newValue;
    sync();
  });
})();
