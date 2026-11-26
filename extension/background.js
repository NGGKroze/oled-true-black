const REPO = "NGGKroze/oled-true-black";
const IS_FIREFOX = /\bFirefox\//.test(navigator.userAgent);
// Firefox add-ons installed from addons.mozilla.org update themselves, so the GitHub check is off there by default.
const UPDATE_DEFAULT = !IS_FIREFOX;
const DAY_MIN = 24 * 60;

// ---------- badge: OFF wins over NEW ----------
async function refreshBadge() {
  const { enabled } = await chrome.storage.sync.get({ enabled: true });
  const { latest } = await chrome.storage.local.get({ latest: null });
  const hasUpdate = !!(latest && isNewer(latest.version, chrome.runtime.getManifest().version));
  if (!enabled) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#555" });
  } else if (hasUpdate) {
    chrome.action.setBadgeText({ text: "NEW" });
    chrome.action.setBadgeBackgroundColor({ color: "#1f6feb" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// ---------- update check against the latest GitHub release ----------
function parseVersion(v) {
  return String(v || "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
}
function isNewer(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

async function checkForUpdate(force = false) {
  const { updateCheck } = await chrome.storage.sync.get({ updateCheck: UPDATE_DEFAULT });
  if (!updateCheck && !force) return { skipped: true };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!r.ok) throw new Error("GitHub answered " + r.status);
    const rel = await r.json();
    const wanted = IS_FIREFOX ? "-firefox.zip" : "-chromium.zip";
    const asset = (rel.assets || []).find((a) => a.name.endsWith(wanted));
    const latest = {
      version: String(rel.tag_name || "").replace(/^v/i, ""),
      page: rel.html_url,
      download: asset ? asset.browser_download_url : rel.html_url,
      checked: Date.now(),
    };
    await chrome.storage.local.set({ latest, lastCheckError: null });
    await refreshBadge();
    return { latest, current: chrome.runtime.getManifest().version, newer: isNewer(latest.version, chrome.runtime.getManifest().version) };
  } catch (e) {
    await chrome.storage.local.set({ lastCheckError: String(e.message || e) });
    return { error: String(e.message || e) };
  }
}

function scheduleChecks() {
  chrome.alarms.create("update-check", { delayInMinutes: 1, periodInMinutes: DAY_MIN });
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === "update-check") checkForUpdate(); });

chrome.runtime.onInstalled.addListener(() => { scheduleChecks(); refreshBadge(); });
chrome.runtime.onStartup.addListener(() => { scheduleChecks(); refreshBadge(); });

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "sync" && ch.enabled) refreshBadge();
  if (area === "sync" && ch.updateCheck && ch.updateCheck.newValue) checkForUpdate();
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === "oled-check-update") {
    checkForUpdate(true).then(reply);
    return true; // async reply
  }
});

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd !== "toggle") return;
  chrome.storage.sync.get({ enabled: true }, (c) => chrome.storage.sync.set({ enabled: !c.enabled }));
});
