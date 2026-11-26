// Shared settings controls for the popup and the settings page (needs core.js and i18n.js).
// Labels come from the translation keys "l_<key>" and hints from "h_<key>".
const CTL = {
  enabled: { t: "switch" },
  threshold: { t: "range", scale: "pct", min: 5, max: 60, swatch: 1 },
  tolerance: { t: "range", scale: "pct", min: 0, max: 20 },
  borders: { t: "switch" },
  pseudo: { t: "switch" },
  hideGlow: { t: "switch" },
  antiFlash: { t: "switch" },
  perfMode: { t: "switch" },
  expDim: { t: "switch", exp: 1, sub: ["dimLevel"] },
  dimLevel: { t: "range", min: 50, max: 100 },
  expVideo: { t: "switch", exp: 1, sub: ["crushLevel"] },
  crushLevel: { t: "range", min: 1, max: 15 },
  expText: { t: "switch", exp: 1, sub: ["textCap"] },
  textCap: { t: "range", min: 60, max: 100 },
  expEdge: { t: "switch", exp: 1, sub: ["edgeLevel", "edgeDelta"] },
  edgeLevel: { t: "range", scale: "pct", min: 6, max: 40, swatch: 1 },
  edgeDelta: { t: "range", scale: "pct", min: 1, max: 12 },
  expHover: { t: "switch", exp: 1 },
  expAlpha: { t: "switch", exp: 1 },
  expOverlay: { t: "switch", exp: 1, sub: ["overlayStrength"] },
  overlayStrength: { t: "range", min: 0, max: 100 },
  expInspector: { t: "switch", exp: 1 },
  expDebug: { t: "switch", exp: 1 },
  idleCare: { t: "switch", sub: ["idleDimMin", "idleBlackMin", "idleDimLevel", "cursorHideSec"] },
  idleDimMin: { t: "range", min: 0, max: 15, unit: "unitMin", off: 1 },
  idleBlackMin: { t: "range", min: 0, max: 30, unit: "unitMin", off: 1 },
  idleDimLevel: { t: "range", min: 20, max: 90 },
  cursorHideSec: { t: "range", min: 0, max: 30, unit: "unitSec", off: 1 },
  schedule: { t: "switch", sub: ["schedFrom", "schedTo"] },
  schedFrom: { t: "time" },
  schedTo: { t: "time" },
};

const GROUPS = {
  general: ["enabled"],
  det: ["presets", "threshold", "tolerance"],
  look: ["borders", "pseudo", "hideGlow", "antiFlash", "perfMode"],
  media: ["expDim", "expVideo", "expText"],
  exp: ["expEdge", "expHover", "expAlpha", "expOverlay", "expInspector", "expDebug"],
  idle: ["idleCare"],
  schedule: ["schedule"],
};

const PRESETS = [["presetSoft", 20, 6], ["presetNormal", 28, 9], ["presetAggressive", 43, 13]];

// ctx: { get(key), set(key, value) or set({..}), isGlobal(key) -> bool (shows an "all sites" tag), hints: "inline" | "tap" }
function createControls(ctx) {
  const rows = [];

  function foldHint(key) {
    if (!i18n.has("h_" + key)) return null; // short, self-explanatory controls have no hint text
    const wrap = document.createElement("div");
    wrap.className = ctx.hints === "tap" ? "fold" : "";
    const inner = document.createElement("div");
    const h = document.createElement("div");
    h.className = "hint";
    h.textContent = t("h_" + key);
    inner.append(h);
    wrap.append(inner);
    return wrap;
  }

  function labelBlock(key, def, hintWrap) {
    const lab = document.createElement("span");
    lab.className = "lab";
    const name = document.createElement("span");
    name.textContent = t("l_" + key);
    lab.append(name);
    if (def.exp) {
      const tag = document.createElement("span");
      tag.className = "tag exp";
      tag.textContent = t("tagExperimental");
      lab.append(tag);
    }
    const g = document.createElement("span");
    g.className = "tag glob";
    g.hidden = true;
    g.textContent = t("tagAllSites");
    g.title = t("tagAllSitesTip");
    lab.append(g);
    if (ctx.hints === "tap" && hintWrap) {
      const q = document.createElement("button");
      q.className = "q";
      q.textContent = "?";
      q.title = t("h_" + key);
      q.onclick = () => hintWrap.classList.toggle("open");
      lab.append(q);
    }
    return lab;
  }

  function row(key) {
    const def = CTL[key];
    const el = document.createElement("div");
    el.className = "ctl";
    el.dataset.key = key;
    const hint = foldHint(key);
    const line = document.createElement("div");
    line.className = "line";
    el.append(line);
    let update;

    if (def.t === "switch") {
      const sw = document.createElement("label");
      sw.className = "sw";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      const knob = document.createElement("i");
      sw.append(cb, knob);
      line.append(labelBlock(key, def, hint), sw);
      if (hint) el.append(hint);
      cb.onchange = () => ctx.set(key, cb.checked);
      let sub = null;
      if (def.sub) {
        sub = document.createElement("div");
        sub.className = "fold sub";
        const inner = document.createElement("div");
        def.sub.forEach((k) => inner.append(row(k)));
        sub.append(inner);
        el.append(sub);
      }
      update = () => {
        cb.checked = !!ctx.get(key);
        if (sub) sub.classList.toggle("open", cb.checked);
      };
    } else if (def.t === "range") {
      const val = document.createElement("span");
      val.className = "val";
      const valText = document.createElement("span");
      val.append(valText);
      let swatch = null;
      if (def.swatch) { swatch = document.createElement("i"); swatch.className = "swatch"; val.append(swatch); }
      line.append(labelBlock(key, def, hint), val);
      const input = document.createElement("input");
      input.type = "range";
      input.min = def.min;
      input.max = def.max;
      el.append(input);
      if (hint) el.append(hint);
      input.oninput = () => ctx.set(key, def.scale === "pct" ? toRaw(+input.value) : +input.value);
      update = () => {
        const v = ctx.get(key);
        const shown = def.scale === "pct" ? toPct(v) : v;
        input.value = shown;
        valText.textContent = def.off && +shown === 0 ? t("off") : shown + (def.unit ? " " + t(def.unit) : "%");
        if (swatch) swatch.style.background = hexGray(v);
      };
    } else if (def.t === "time") {
      const input = document.createElement("input");
      input.type = "time";
      line.append(labelBlock(key, def, hint), input);
      input.onchange = () => input.value && ctx.set(key, input.value);
      update = () => { input.value = ctx.get(key); };
    }

    rows.push({ key, el, update: () => { update(); el.querySelector(".glob").hidden = !(ctx.isGlobal && ctx.isGlobal(key)); } });
    return el;
  }

  function presets() {
    const wrap = document.createElement("div");
    const bar = document.createElement("div");
    bar.className = "presets";
    const btns = PRESETS.map(([k, b, tol]) => {
      const btn = document.createElement("button");
      btn.textContent = t(k);
      btn.onclick = () => ctx.set({ threshold: toRaw(b), tolerance: toRaw(tol) });
      bar.append(btn);
      return [btn, b, tol];
    });
    const hint = foldHint("presets");
    wrap.append(bar, hint);
    if (ctx.hints === "tap") {
      const q = document.createElement("button");
      q.className = "q";
      q.textContent = "?";
      q.title = t("h_presets");
      q.onclick = () => hint.classList.toggle("open");
      bar.append(q);
    }
    rows.push({
      key: "presets", el: wrap,
      update: () => btns.forEach(([btn, b, tol]) => btn.classList.toggle("on", toPct(ctx.get("threshold")) === b && toPct(ctx.get("tolerance")) === tol)),
    });
    return wrap;
  }

  return {
    group(keys) {
      const frag = document.createDocumentFragment();
      keys.forEach((k) => frag.append(k === "presets" ? presets() : row(k)));
      return frag;
    },
    refresh() { rows.forEach((r) => r.update()); },
  };
}

// sliding segmented control: items = [[value, label, tooltip]]
function createSegmented(items, onPick) {
  const seg = document.createElement("div");
  seg.className = "seg";
  seg.style.setProperty("--n", items.length);
  const btns = items.map(([value, label, tip]) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (tip) b.title = tip;
    b.onclick = () => onPick(value);
    seg.append(b);
    return [value, b];
  });
  return {
    el: seg,
    set(value) {
      btns.forEach(([v, b]) => b.classList.toggle("on", v === value));
      seg.style.setProperty("--i", Math.max(0, items.findIndex((x) => x[0] === value)));
    },
  };
}
