const DEFAULTS = {
  enabled: true, threshold: 72, tolerance: 24, borders: false, disabledSites: [], sites: {},
  expEdge: false, edgeLevel: 44, edgeDelta: 6, expHover: false, expAlpha: false, expDebug: false, expInspector: false,
  expOverlay: false, overlayStrength: 50, pseudo: true, antiFlash: true, expDim: false, dimLevel: 85, hideGlow: true,
};
const LISTS = ["disabledSites", "sites"];
const $ = (id) => document.getElementById(id);
let cfg;

// Edge uses edge://, Chrome and most Chromium browsers accept chrome:// (Brave redirects it)
const isEdge = /\bEdg\//.test(navigator.userAgent);
const scheme = isEdge ? "edge" : "chrome";
$("browserTitle").textContent = isEdge ? "Edge" : "Browser (Chrome / Chromium)";

const inputs = [...document.querySelectorAll("[data-key]")];
const isPct = (el) => el.dataset.scale === "pct";

const show = () => {
  inputs.forEach((el) => {
    const key = el.dataset.key;
    const v = cfg[key];
    if (el.type === "checkbox") { el.checked = !!v; return; }
    const shown = isPct(el) ? toPct(v) : v;
    el.value = shown;
    const lab = $(key + "Val");
    if (lab) lab.textContent = shown + "%";
    const sw = $(key + "Swatch");
    if (sw) sw.style.background = hexGray(v);
  });

  const fill = (id, items, onRemove) => {
    const ul = $(id);
    ul.innerHTML = "";
    if (!items.length) { ul.innerHTML = "<li><small>— none —</small></li>"; return; }
    items.forEach(([label, key]) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = label;
      const b = document.createElement("button");
      b.textContent = "Remove";
      b.onclick = () => onRemove(key);
      li.append(span, b);
      ul.append(li);
    });
  };
  fill("disabled", cfg.disabledSites.map((h) => [h, h]), (h) => {
    cfg.disabledSites = cfg.disabledSites.filter((x) => x !== h);
    chrome.storage.sync.set({ disabledSites: cfg.disabledSites }); show();
  });
  fill("custom", Object.entries(cfg.sites).map(([h, o]) =>
    [`${h} — threshold ${toPct(o.threshold)}%, tolerance ${toPct(o.tolerance)}%${o.borders ? ", borders" : ""}${o.expEdge ? ", outlines" : ""}`, h]), (h) => {
    delete cfg.sites[h];
    chrome.storage.sync.set({ sites: cfg.sites }); show();
  });
};

const save = (patch) => { Object.assign(cfg, patch); chrome.storage.sync.set(patch); show(); };

const clearMemory = () => chrome.storage.local.remove("darkHosts");

chrome.storage.sync.get(DEFAULTS, (c) => {
  cfg = c;
  inputs.forEach((el) => {
    const key = el.dataset.key;
    if (el.type === "checkbox") el.onchange = () => save({ [key]: el.checked });
    else el.oninput = () => save({ [key]: isPct(el) ? toRaw(+el.value) : +el.value });
  });
  document.querySelectorAll(".presets button").forEach((b) => {
    b.onclick = () => save({ threshold: toRaw(+b.dataset.b), tolerance: toRaw(+b.dataset.t) });
  });
  $("reset").onclick = () => {
    const patch = {};
    for (const k in DEFAULTS) if (!LISTS.includes(k)) patch[k] = DEFAULTS[k];
    save(patch);
  };
  $("forget").onclick = () => { clearMemory(); $("forget").textContent = "Forgotten ✓"; };
  document.querySelectorAll("[data-page]").forEach((b) => {
    b.onclick = async () => {
      const url = `${scheme}://${b.dataset.page}`;
      try { await navigator.clipboard.writeText(url); } catch (e) {}
      try { await chrome.tabs.create({ url }); $("msg").textContent = ""; }
      catch (e) { $("msg").textContent = `Copied: ${url} — paste it into the address bar.`; }
    };
  });
  show();
});
