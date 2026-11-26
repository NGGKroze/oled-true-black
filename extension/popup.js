const $ = (id) => document.getElementById(id);
const SECTIONS = [
  ["secDetection", ["det"], true],
  ["secLook", ["look"]],
  ["secMedia", ["media"]],
  ["secExperimental", ["exp"]],
  ["secCare", ["idle", "schedule"]],
];

(async () => {
  const cfg = await chrome.storage.sync.get(OLED.DEFAULTS);
  await i18n.init(cfg.lang);
  i18n.apply();

  let host = "", tabId = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab.id;
    const u = new URL(tab.url);
    if (u.protocol === "http:" || u.protocol === "https:") host = u.hostname;
  } catch (e) {}

  const version = chrome.runtime.getManifest().version;
  $("ver").textContent = "v" + version;
  let scope = host && cfg.sites[host] ? "site" : "all";
  let lastStats = null;

  // ---------- values: global, or this site's own copy for per-site settings ----------
  const perSite = (k) => scope === "site" && OLED.PER_SITE.includes(k);
  const get = (k) => (perSite(k) && cfg.sites[host] && k in cfg.sites[host] ? cfg.sites[host][k] : cfg[k]);
  const set = (a, b) => {
    const patch = typeof a === "string" ? { [a]: b } : a;
    const out = {};
    for (const k in patch) {
      if (perSite(k)) { cfg.sites[host] = { ...cfg.sites[host], [k]: patch[k] }; out.sites = cfg.sites; }
      else { cfg[k] = patch[k]; out[k] = patch[k]; }
    }
    chrome.storage.sync.set(out);
    refresh();
  };

  // ---------- accordion sections built from the shared controls ----------
  const ui = createControls({ get, set, hints: "tap", isGlobal: (k) => scope === "site" && !OLED.PER_SITE.includes(k) && k !== "presets" });
  SECTIONS.forEach(([title, groups, open]) => {
    const sec = document.createElement("div");
    sec.className = "sec" + (open ? " open" : "");
    const head = document.createElement("button");
    head.className = "head";
    head.textContent = t(title);
    const fold = document.createElement("div");
    fold.className = "fold" + (open ? " open" : "");
    const inner = document.createElement("div");
    const body = document.createElement("div");
    body.className = "body";
    groups.forEach((g) => body.append(ui.group(GROUPS[g])));
    inner.append(body);
    fold.append(inner);
    head.onclick = () => { sec.classList.toggle("open"); fold.classList.toggle("open"); };
    sec.append(head, fold);
    $("sections").append(sec);
  });

  // ---------- master switch ----------
  $("enabled").onchange = (e) => { cfg.enabled = e.target.checked; chrome.storage.sync.set({ enabled: cfg.enabled }); };

  // ---------- this site: mode ----------
  const modeSeg = createSegmented(
    [["auto", t("modeAuto"), t("modeAutoDesc")], ["deepen", t("modeDeepen"), t("modeDeepenDesc")], ["off", t("modeOff"), t("modeOffDesc")]],
    (m) => {
      if (!host) return;
      let off = OLED.without(cfg.disabledSites, host), deepen = OLED.without(cfg.deepenSites, host), allow = cfg.allowSites;
      if (m === "off") {
        if (cfg.scope === "listed") allow = OLED.without(allow, host);
        else off = [...off, host];
      } else {
        if (cfg.scope === "listed" && !OLED.hostIn(allow, host)) allow = [...allow, host];
        if (m === "deepen") deepen = [...deepen, host];
      }
      Object.assign(cfg, { disabledSites: off, deepenSites: deepen, allowSites: allow });
      chrome.storage.sync.set({ disabledSites: off, deepenSites: deepen, allowSites: allow });
      refresh();
    }
  );
  $("modeSeg").append(modeSeg.el);

  // ---------- scope: all sites / only this site ----------
  const scopeSeg = createSegmented([["all", t("scopeAll")], ["site", t("scopeSite")]], (s) => {
    if (!host || s === scope) return;
    if (s === "site") {
      const base = { ...cfg, ...(OLED.fixFor(host) || {}) };
      cfg.sites[host] = Object.fromEntries(OLED.PER_SITE.map((k) => [k, base[k]]));
    } else {
      delete cfg.sites[host];
    }
    scope = s;
    chrome.storage.sync.set({ sites: cfg.sites });
    refresh();
  });
  $("scopeSeg").append(scopeSeg.el);

  function refresh() {
    $("enabled").checked = cfg.enabled;
    const mode = host ? OLED.siteMode(cfg, host) : "auto";
    modeSeg.set(mode);
    $("modeSeg").classList.toggle("off", !host);
    $("modeDesc").textContent = host ? t(mode === "auto" ? "modeAutoDesc" : mode === "deepen" ? "modeDeepenDesc" : cfg.scope === "listed" && !OLED.hostIn(cfg.allowSites, host) ? "modeNotListed" : "modeOffDesc") : "";
    scopeSeg.set(scope);
    $("scopeSeg").classList.toggle("off", !host);
    $("scopeHint").textContent = scope === "site" ? t("scopeSiteHint", host) : "";
    $("scopeHint").style.display = scope === "site" ? "block" : "none";
    ui.refresh();
  }

  if (host) $("host").textContent = host;
  else { $("host").textContent = t("notAvailable"); $("host").style.color = "#888"; }

  // ---------- live numbers from the page ----------
  const stats = () => {
    if (tabId == null || !host) return;
    chrome.tabs.sendMessage(tabId, { type: "oled-stats" }, { frameId: 0 }, (r) => {
      if (chrome.runtime.lastError || !r) { lastStats = null; $("stats").textContent = t("statsReload"); return; }
      lastStats = r;
      $("stats").textContent = r.active
        ? t("statsLine", r.black, r.ms, r.checked) + (r.pseudo ? " · " + t("statsPseudo", r.pseudo) : "") + (r.glow ? " · " + t("statsGlow", r.glow) : "") + (r.shadowRoots ? " · " + t("statsShadow", r.shadowRoots) : "")
        : t("statsOff");
    });
  };
  stats();
  setInterval(stats, 1500);

  // ---------- report a problem: opens a pre-filled GitHub issue; nothing is sent before the user submits it ----------
  $("report").onclick = () => {
    if (!host) return;
    const ua = (/(Edg|Firefox|Chrome)\/[\d.]+/.exec(navigator.userAgent) || [navigator.userAgent])[0];
    const e = { ...cfg, ...(OLED.fixFor(host) || {}), ...(cfg.sites[host] || {}) };
    const used = Object.fromEntries(OLED.PER_SITE.map((k) => [k, e[k]]));
    const body = [
      `**Site:** ${host}`,
      `**Extension:** ${version} · **Browser:** ${ua} · **Mode:** ${OLED.siteMode(cfg, host)}`,
      lastStats ? `**On the page:** ${lastStats.black} areas black, ${lastStats.checked} checked, ${lastStats.ms} ms` : "",
      "", "**What still looks wrong?** (which part stays gray, or what broke)", "", "", "",
      "<details><summary>Settings used on this site</summary>", "", "```json", JSON.stringify(used), "```", "</details>",
    ].join("\n");
    const url = `https://github.com/NGGKroze/oled-true-black/issues/new?labels=broken-site&title=${encodeURIComponent("Broken site: " + host)}&body=${encodeURIComponent(body)}`;
    chrome.tabs.create({ url });
  };

  // ---------- update banner ----------
  const { latest } = await chrome.storage.local.get({ latest: null });
  const num = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
  if (latest) {
    const a = num(latest.version), c = num(version);
    let newer = false;
    for (let i = 0; i < Math.max(a.length, c.length); i++) if ((a[i] || 0) !== (c[i] || 0)) { newer = (a[i] || 0) > (c[i] || 0); break; }
    if (newer) {
      $("update").textContent = t("updateAvail", latest.version, version);
      $("update").hidden = false;
      $("update").onclick = (ev) => { ev.preventDefault(); chrome.tabs.create({ url: latest.download }); };
    }
  }

  $("more").onclick = (ev) => { ev.preventDefault(); chrome.runtime.openOptionsPage(); };
  refresh();
})();
