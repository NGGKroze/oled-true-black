// Updates + backup controls on the settings page
(() => {
  const $ = (id) => document.getElementById(id);
  const IS_FIREFOX = /\bFirefox\//.test(navigator.userAgent);
  const cur = chrome.runtime.getManifest().version;

  const showLatest = async () => {
    const { latest, lastCheckError } = await chrome.storage.local.get({ latest: null, lastCheckError: null });
    if (lastCheckError) { $("updateStatus").textContent = `Last check failed: ${lastCheckError}`; return; }
    if (!latest) { $("updateStatus").textContent = `You have ${cur}. Not checked yet.`; return; }
    const when = new Date(latest.checked).toLocaleString();
    const num = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
    const a = num(latest.version), c = num(cur);
    let newer = false;
    for (let i = 0; i < Math.max(a.length, c.length); i++) if ((a[i] || 0) !== (c[i] || 0)) { newer = (a[i] || 0) > (c[i] || 0); break; }
    $("updateStatus").textContent = !newer
      ? `You have ${cur} — up to date (checked ${when}).`
      : `Version ${latest.version} is available — you have ${cur} (checked ${when}).`;
  };

  chrome.storage.sync.get({ updateCheck: !IS_FIREFOX }, ({ updateCheck }) => {
    $("updateCheck").checked = updateCheck;
  });
  $("updateCheck").onchange = (e) => chrome.storage.sync.set({ updateCheck: e.target.checked });
  $("checkNow").onclick = () => {
    $("updateStatus").textContent = "Checking…";
    chrome.runtime.sendMessage({ type: "oled-check-update" }, () => showLatest());
  };
  showLatest();

  // ---------- backup ----------
  $("export").onclick = () => {
    chrome.storage.sync.get(null, (all) => {
      const data = { app: "oled-true-black", version: cur, exported: new Date().toISOString(), settings: all };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `oled-true-black-settings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      $("backupStatus").textContent = "Exported.";
    });
  };
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== "oled-true-black" || typeof data.settings !== "object") throw new Error("not an OLED True Black settings file");
      await chrome.storage.sync.set(data.settings);
      $("backupStatus").textContent = "Imported — reloading settings…";
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      $("backupStatus").textContent = "Import failed: " + err.message;
    }
    e.target.value = "";
  };
})();
