// Live preview for the settings page: a mock web page shown twice (original / with the extension).
// It uses the same decision helpers as the content script (core.js), so what you see follows the real rules.
const MOCK = {
  bg: [18, 18, 18], k: [
    { box: [0, 0, 100, 14], bg: [28, 28, 28], bd: [46, 46, 46], k: [
      { box: [2, 18, 9, 64], bg: [96, 96, 96] },
      { box: [28, 18, 44, 64], bg: [44, 44, 44] },
      { txt: "Search", box: [31, 42], color: [235, 235, 235] },
    ] },
    { box: [0, 14, 22, 86], bg: [22, 22, 22], k: [
      { box: [8, 6, 84, 9], bg: [40, 40, 40], k: [{ txt: "Home", box: [10, 30], color: [255, 255, 255] }] },
      { box: [8, 24, 84, 26], bg: [243, 243, 243], k: [{ txt: "Light", box: [10, 38], color: [40, 40, 40] }] },
      { kind: "image", box: [8, 58, 84, 32] },
    ] },
    { box: [25, 18, 34, 42], bg: [34, 34, 34], bd: [54, 54, 54], k: [
      { txt: "Title", box: [8, 7], color: [255, 255, 255] },
      { box: [8, 30, 84, 62], bg: [44, 44, 44], bd: [64, 64, 64], k: [
        { box: [10, 25, 36, 50], bg: [60, 60, 60] },
      ] },
    ] },
    { box: [62, 18, 34, 20], bg: [27, 36, 48], k: [{ txt: "Tinted", box: [8, 38], color: [255, 255, 255] }] },
    { box: [62, 41, 34, 19], bg: [88, 88, 88], k: [{ txt: "Mid gray", box: [8, 38], color: [235, 235, 235] }] },
    { kind: "glow", box: [22, 60, 40, 40] },
    { kind: "video", box: [25, 64, 34, 34] },
    { box: [62, 64, 34, 14], bg: [38, 38, 38, 0.7] },
    { box: [62, 81, 34, 17], bg: [255, 255, 255, 0.12] },
  ],
};

const preview = (() => {
  const nodes = []; // {spec, parent, el, textEl}
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function build(host, ids) {
    host.textContent = "";
    const walk = (spec, parent, dom) => {
      const n = { spec, parent, el: null };
      if (spec.txt) {
        n.el = document.createElement("span");
        n.el.className = "t";
        n.el.textContent = spec.txt;
        n.el.style.left = spec.box[0] + "%";
        n.el.style.top = spec.box[1] + "%";
        n.el.style.fontSize = "9.5px";
      } else {
        n.el = document.createElement("div");
        n.el.className = "n" + (spec.kind ? " " + spec.kind : "");
        const [x, y, w, h] = spec.box;
        Object.assign(n.el.style, { left: x + "%", top: y + "%", width: w + "%", height: h + "%" });
      }
      dom.append(n.el);
      nodes.push(n);
      (spec.k || []).forEach((k) => walk(k, n, n.el));
    };
    nodes.length = 0;
    host.style.background = "";
    const root = { spec: MOCK, parent: null, el: host };
    nodes.push(root);
    MOCK.k.forEach((k) => walk(k, root, host));
    return nodes.slice();
  }

  let before = [], after = [], prev = new Map();

  function init() {
    before = build(document.getElementById("mockBefore"));
    after = build(document.getElementById("mockAfter"));
  }

  // the colour that was behind a node on the original site
  const behind = (n) => {
    for (let p = n.parent; p; p = p.parent) if (p.spec.bg && (p.spec.bg[3] ?? 1) >= 0.9) return p.spec.bg;
    return MOCK.bg;
  };

  function paint(list, applied, cfg, mockEl) {
    const capRaw = Math.round(cfg.textCap * 2.55);
    const crush = cfg.expVideo ? OLED.crushFilter(cfg.crushLevel) : "";
    const dim = cfg.expDim ? `brightness(${cfg.dimLevel / 100})` : "";
    let blackArea = 0;
    const info = [];
    const blackMap = new Map();

    list.forEach((n, idx) => {
      const s = n.spec, el = n.el;
      if (s.txt) {
        const c = s.color;
        const cap = applied && cfg.expText && Math.min(...c) > capRaw ? capRaw : null;
        let out = cap == null ? rgb(c) : rgb([cap, cap, cap]);
        if (applied && cfg.expLight && OLED.isDarkText({ r: c[0], g: c[1], b: c[2], a: 1 })) {
          let p = n.parent; while (p && !(p.spec.bg && (p.spec.bg[3] ?? 1) >= 0.9)) p = p.parent;
          if (!p || blackMap.get(p)) { const v = OLED.flipValue(OLED.flipBucket(Math.max(...c))); out = rgb([v, v, v]); }
        }
        el.style.color = out;
        return;
      }
      if (s.kind === "image") { el.style.filter = applied ? dim : ""; return; }
      if (s.kind === "video") { el.style.filter = applied ? [crush, dim].filter(Boolean).join(" ") : ""; return; }
      if (s.kind === "glow") { el.style.opacity = applied && cfg.hideGlow ? "0" : ".9"; return; }

      const bg = s.bg || MOCK.bg;
      const a = bg[3] ?? 1;
      const color = { r: bg[0], g: bg[1], b: bg[2], a };
      const black = applied && (OLED.isDarkGray(color, cfg) || (cfg.expLight && OLED.isLightNeutral(color, cfg)));
      blackMap.set(n, black);
      let shown = rgb(bg, a), note = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
      if (black) { shown = "#000"; note += " → #000000"; }
      else if (applied && cfg.expOverlay && a >= 0.02 && a <= 0.5 && Math.min(bg[0], bg[1], bg[2]) >= 200) {
        shown = rgb(bg, +(a * cfg.overlayStrength / 100).toFixed(3));
        note += " → " + Math.round(cfg.overlayStrength) + "%";
      }
      const isRoot = !n.parent;
      if (isRoot) mockEl.style.background = shown; else el.style.backgroundColor = shown;

      // border
      if (s.bd) {
        const bc = { r: s.bd[0], g: s.bd[1], b: s.bd[2], a: 1 };
        el.style.borderColor = applied && cfg.borders && OLED.isDarkOnBlack(bc, cfg) ? "#000" : rgb(s.bd);
      }
      // thin outline where a gray panel used to differ from what was behind it
      let edge = false;
      if (applied && black && cfg.expEdge && a >= 0.6 && !isRoot) {
        const up = behind(n);
        edge = Math.abs(Math.max(bg[0], bg[1], bg[2]) - Math.max(up[0], up[1], up[2])) >= cfg.edgeDelta;
      }
      el.style.outline = edge ? `1px solid rgb(${cfg.edgeLevel},${cfg.edgeLevel},${cfg.edgeLevel})` : "none";
      el.style.outlineOffset = "-1px";
      el.title = applied ? note : "";
      info.push([n, black || (!applied && Math.max(bg[0], bg[1], bg[2]) === 0), shown + el.style.borderColor + el.style.outline]);
    });

    // share of pixels that are black: each panel's own area (minus the panels drawn on top of it)
    const total = mockEl.getBoundingClientRect();
    const totalArea = total.width * total.height;
    info.forEach(([n, isBlack]) => {
      if (!isBlack) return;
      const r = n.el === mockEl ? total : n.el.getBoundingClientRect();
      let own = r.width * r.height;
      for (const k of n.spec.k || []) {
        if (k.txt) continue;
        const kid = list.find((x) => x.spec === k);
        if (kid && kid.el.getBoundingClientRect) { const kr = kid.el.getBoundingClientRect(); own -= kr.width * kr.height; }
      }
      blackArea += Math.max(0, own);
    });
    return { pct: Math.round((blackArea / totalArea) * 100), info };
  }

  function render(raw) {
    if (!before.length) init();
    const cfg = OLED.effective(raw, "preview.local");
    const b = paint(before, false, cfg, document.getElementById("mockBefore"));
    const a = paint(after, true, cfg, document.getElementById("mockAfter"));
    document.getElementById("pixels").textContent = t("pvPixels", b.pct, a.pct);
    // flash what just changed
    a.info.forEach(([n, , sig]) => {
      if (prev.has(n.el) && prev.get(n.el) !== sig) { n.el.classList.remove("flash"); void n.el.offsetWidth; n.el.classList.add("flash"); }
      prev.set(n.el, sig);
    });
  }

  return { render };
})();
