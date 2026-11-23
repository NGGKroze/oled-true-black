const DEFAULTS = { enabled: true, threshold: 72, tolerance: 24, borders: false, disabledSites: [], sites: {}, expEdge: false };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, async (cfg) => {
  let host = "";
  let tabId = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab.id;
    const u = new URL(tab.url);
    if (u.protocol === "http:" || u.protocol === "https:") host = u.hostname;
  } catch (e) {}

  const custom = () => !!(host && cfg.sites[host]);
  const eff = () => ({ ...cfg, ...(cfg.sites[host] || {}) });

  const render = () => {
    const e = eff();
    $("enabled").checked = cfg.enabled;
    $("borders").checked = e.borders;
    $("expEdge").checked = e.expEdge;
    $("threshold").value = toPct(e.threshold);
    $("tolerance").value = toPct(e.tolerance);
    $("thVal").textContent = toPct(e.threshold) + "%";
    $("thSwatch").style.background = hexGray(e.threshold);
    $("tolVal").textContent = toPct(e.tolerance) + "%";
    $("siteCustom").checked = custom();
    $("siteOn").checked = !cfg.disabledSites.includes(host);
  };

  // write to this site's overrides when "own settings" is on, otherwise to the global config
  const save = (patch) => {
    if (custom()) {
      cfg.sites[host] = { ...cfg.sites[host], ...patch };
      chrome.storage.sync.set({ sites: cfg.sites });
    } else {
      Object.assign(cfg, patch);
      chrome.storage.sync.set(patch);
    }
    render();
  };

  if (host) $("siteLabel").textContent = "Active on " + host;
  else {
    $("siteLabel").textContent = "Not available on this page";
    $("siteOn").disabled = true;
    $("siteCustom").disabled = true;
  }

  $("enabled").onchange = (e) => { cfg.enabled = e.target.checked; chrome.storage.sync.set({ enabled: cfg.enabled }); };
  $("borders").onchange = (e) => save({ borders: e.target.checked });
  $("expEdge").onchange = (e) => save({ expEdge: e.target.checked });
  $("threshold").oninput = (e) => save({ threshold: toRaw(+e.target.value) });
  $("tolerance").oninput = (e) => save({ tolerance: toRaw(+e.target.value) });
  document.querySelectorAll(".presets button").forEach((b) => {
    b.onclick = () => save({ threshold: toRaw(+b.dataset.b), tolerance: toRaw(+b.dataset.t) });
  });

  $("siteOn").onchange = (e) => {
    const set = new Set(cfg.disabledSites);
    e.target.checked ? set.delete(host) : set.add(host);
    cfg.disabledSites = [...set];
    chrome.storage.sync.set({ disabledSites: cfg.disabledSites });
  };

  $("siteCustom").onchange = (e) => {
    if (e.target.checked) { const g = eff(); cfg.sites[host] = { threshold: g.threshold, tolerance: g.tolerance, borders: g.borders, expEdge: g.expEdge }; }
    else delete cfg.sites[host];
    chrome.storage.sync.set({ sites: cfg.sites });
    render();
  };

  const stats = () => {
    if (tabId == null || !host) return;
    chrome.tabs.sendMessage(tabId, { type: "oled-stats" }, { frameId: 0 }, (r) => {
      if (chrome.runtime.lastError || !r) { $("stats").textContent = "Reload the page to activate on it."; return; }
      $("stats").textContent = r.active
        ? `On this page: ${r.black} areas turned black` + (r.pseudo ? `, ${r.pseudo} pseudo-layers` : "") + (r.glow ? `, ${r.glow} glow hidden` : "") + (r.shadowRoots ? ` (incl. ${r.shadowRoots} web components)` : "") + "."
        : "Not active on this page.";
    });
  };
  stats();
  setInterval(stats, 1500);

  $("more").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
  render();
});
