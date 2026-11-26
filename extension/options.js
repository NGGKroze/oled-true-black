const $ = (id) => document.getElementById(id);
const IS_FIREFOX = /\bFirefox\//.test(navigator.userAgent);
const IS_EDGE = /\bEdg\//.test(navigator.userAgent);
const version = chrome.runtime.getManifest().version;

// tab id -> [title key, groups, builder for extra content]
const TABS = [
  ["general", ["general"]], ["det", ["det"]], ["look", ["look"]], ["media", ["media"]],
  ["exp", ["exp"]], ["care", ["idle", "schedule"]], ["sites", []], ["backup", []], ["browser", []],
];
const TAB_TITLE = { general: "tabGeneral", det: "tabDetection", look: "tabLook", media: "tabMedia", exp: "tabExperimental", care: "tabCare", sites: "tabSites", backup: "tabBackup", browser: "tabBrowser" };

(async () => {
  const cfg = await chrome.storage.sync.get(OLED.DEFAULTS);
  await i18n.init(cfg.lang);
  i18n.apply();
  $("ver").textContent = "v" + version;

  const set = (a, b) => {
    const patch = typeof a === "string" ? { [a]: b } : a;
    Object.assign(cfg, patch);
    chrome.storage.sync.set(patch);
    refresh();
  };
  const ui = createControls({ get: (k) => cfg[k], set, hints: "inline" });
  const refresh = () => { ui.refresh(); lists.forEach((f) => f()); scopeSel.value = cfg.scope; preview.render(cfg); };

  // ---------- small helpers ----------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const button = (key, fn) => { const b = el("button", "", t(key)); b.onclick = fn; return b; };
  const hint = (text) => el("div", "hint", text);
  function switchRow(label, hintText, get, put) {
    const row = el("div", "ctl");
    const line = el("div", "line");
    const sw = el("label", "sw");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = get();
    cb.onchange = () => put(cb.checked);
    sw.append(cb, el("i"));
    line.append(el("span", "", label), sw);
    row.append(line, hint(hintText));
    return row;
  }

  // ---------- tabs ----------
  const tabs = $("tabs"), main = $("main");
  const panels = {};
  TABS.forEach(([id, groups]) => {
    const b = el("button", "tabbtn", t(TAB_TITLE[id]));
    b.onclick = () => show(id);
    tabs.append(b);
    const p = el("section", "tab");
    p.append(el("h1", "", t(TAB_TITLE[id])), el("p", "lead", t("lead_" + id)));
    groups.forEach((g, i) => {
      if (groups.length > 1) p.append(el("h3", "", t(g === "idle" ? "secIdle" : "secSchedule")));
      p.append(ui.group(GROUPS[g]));
    });
    main.append(p);
    panels[id] = [b, p];
  });
  function show(id) {
    for (const k in panels) { panels[k][0].classList.toggle("on", k === id); panels[k][1].classList.toggle("on", k === id); }
    try { sessionStorage.setItem("tab", id); } catch (e) {}
  }

  // ---------- general: language, reset ----------
  const g = panels.general[1];
  const langRow = el("div", "row2");
  langRow.append(el("span", "", t("l_lang")));
  const sel = el("select");
  sel.append(new Option(t("langAuto"), "auto"));
  LANGS.forEach(([c, n]) => sel.append(new Option(n, c)));
  sel.value = cfg.lang;
  sel.onchange = async () => { await chrome.storage.sync.set({ lang: sel.value }); location.reload(); };
  langRow.append(sel);
  g.append(langRow, hint(t("h_lang")));
  g.append(hint(t("shortcutHint")));
  const reset = button("resetAll", () => {
    const patch = {};
    for (const k in OLED.DEFAULTS) if (!["disabledSites", "allowSites", "deepenSites", "sites", "lang", "scope"].includes(k)) patch[k] = OLED.DEFAULTS[k];
    set(patch);
  });
  reset.classList.add("reset");
  g.append(reset);

  // ---------- look: forget remembered sites ----------
  panels.look[1].append(button("forgetSites", function () { chrome.storage.local.remove("darkHosts"); this.textContent = t("forgotten"); }));

  // ---------- sites ----------
  const lists = [];
  const scopeSel = el("select");
  scopeSel.append(new Option(t("scopeEverywhere"), "all"), new Option(t("scopeListed"), "listed"));
  scopeSel.onchange = () => set("scope", scopeSel.value);
  const sp = panels.sites[1];
  const scopeRow = el("div", "row2");
  scopeRow.append(el("span", "", t("runOn")), scopeSel);
  sp.append(scopeRow);

  const normalizeHost = (v) => {
    v = v.trim().toLowerCase();
    if (!v) return "";
    try { v = new URL(/^[a-z]+:\/\//.test(v) ? v : "https://" + v).hostname; } catch (e) { return ""; }
    return v.replace(/^www\./, "");
  };
  function listEditor(key, titleKey, hintKey, isMap) {
    const box = el("div");
    box.append(el("h3", "", t(titleKey)), hint(t(hintKey)));
    const chips = el("div", "chips");
    box.append(chips);
    if (!isMap) {
      const add = el("div", "addrow");
      const inp = el("input"); inp.type = "text"; inp.placeholder = "example.com";
      const go = () => {
        const h = normalizeHost(inp.value);
        if (!h || cfg[key].includes(h)) { inp.value = ""; return; }
        inp.value = "";
        set(key, [...cfg[key], h]);
      };
      inp.onkeydown = (e) => e.key === "Enter" && go();
      add.append(inp, button("add", go));
      box.append(add);
    }
    lists.push(() => {
      chips.textContent = "";
      const items = isMap ? Object.keys(cfg[key]) : cfg[key];
      if (!items.length) { chips.append(el("small", "", t("none"))); return; }
      items.forEach((h) => {
        const c = el("span", "chip", h);
        const x = el("button", "", "×");
        x.title = t("remove");
        x.onclick = () => {
          if (isMap) { const m = { ...cfg[key] }; delete m[h]; set(key, m); }
          else set(key, cfg[key].filter((e) => e !== h));
        };
        c.append(x);
        chips.append(c);
      });
    });
    sp.append(box);
  }
  listEditor("disabledSites", "listOff", "listOffHint");
  listEditor("allowSites", "listAllow", "listAllowHint");
  listEditor("deepenSites", "listDeepen", "listDeepenHint");
  listEditor("sites", "listOwn", "listOwnHint", true);

  // ---------- backup & updates ----------
  const bp = panels.backup[1];
  // Store builds have no update checker (no "alarms" permission): the store updates the add-on itself
  if ((chrome.runtime.getManifest().permissions || []).includes("alarms")) {
    const upd = await chrome.storage.sync.get({ updateCheck: true });
    bp.append(el("h3", "", t("secUpdates")));
    bp.append(switchRow(t("l_updateCheck"), t("h_updateCheck"), () => upd.updateCheck, (v) => { upd.updateCheck = v; chrome.storage.sync.set({ updateCheck: v }); }));
    const updStatus = el("div", "status");
    const checkBtn = button("checkNow", () => { updStatus.textContent = t("checking"); chrome.runtime.sendMessage({ type: "oled-check-update" }, showLatest); });
    bp.append(checkBtn, updStatus);
    async function showLatest() {
      const { latest, lastCheckError } = await chrome.storage.local.get({ latest: null, lastCheckError: null });
      if (lastCheckError) { updStatus.textContent = t("updFailed", lastCheckError); return; }
      if (!latest) { updStatus.textContent = t("updNever", version); return; }
      const when = new Date(latest.checked).toLocaleString();
      const num = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
      const a = num(latest.version), c = num(version);
      let newer = false;
      for (let i = 0; i < Math.max(a.length, c.length); i++) if ((a[i] || 0) !== (c[i] || 0)) { newer = (a[i] || 0) > (c[i] || 0); break; }
      updStatus.textContent = newer ? t("updNew", latest.version, version, when) : t("updOk", version, when);
    }
    showLatest();
  }

  bp.append(el("h3", "", t("secBackup")), hint(t("backupHint")));
  const bstat = el("div", "status");
  const file = el("input"); file.type = "file"; file.accept = ".json,application/json"; file.style.display = "none";
  bp.append(button("exportBtn", () => {
    chrome.storage.sync.get(null, (all) => {
      const data = { app: "oled-true-black", version, exported: new Date().toISOString(), settings: all };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = el("a"); a.href = url; a.download = `oled-true-black-settings-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      bstat.textContent = t("exported");
    });
  }), document.createTextNode(" "), button("importBtn", () => file.click()), file, bstat);
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.app !== "oled-true-black" || typeof data.settings !== "object") throw new Error(t("notSettingsFile"));
      await chrome.storage.sync.set(data.settings);
      bstat.textContent = t("imported");
      setTimeout(() => location.reload(), 600);
    } catch (err) { bstat.textContent = t("importFailed", err.message); }
    file.value = "";
  };

  // ---------- browser pages ----------
  const scheme = IS_EDGE ? "edge" : "chrome";
  const FF = { "settings/appearance": "about:preferences", "extensions/": "about:addons", "extensions/shortcuts": "about:addons" };
  const pageUrl = (p) => (IS_FIREFOX ? FF[p] : `${scheme}://${p}`);
  const pages = [["settings/appearance", "pageAppearance"], ["extensions/", IS_FIREFOX ? "pageAddons" : "pageExtensions"], ["extensions/shortcuts", IS_FIREFOX ? "pageShortcutsFx" : "pageShortcuts"]];
  if (!IS_FIREFOX) pages.push(["flags/#enable-force-dark", "pageFlag"]);
  const bw = panels.browser[1];
  const grid = el("div", "grid");
  const msg = el("div", "status");
  pages.forEach(([p, key]) => grid.append(button(key, async () => {
    const url = pageUrl(p);
    try { await navigator.clipboard.writeText(url); } catch (e) {}
    try { await chrome.tabs.create({ url }); msg.textContent = ""; } catch (e) { msg.textContent = t("copied", url); }
  })));
  bw.append(grid, msg, hint(t("limits")));

  let first = "general";
  try { first = sessionStorage.getItem("tab") || first; } catch (e) {}
  show(panels[first] ? first : "general");
  refresh();
})();
