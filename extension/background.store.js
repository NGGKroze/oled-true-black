// Store builds (Firefox, Chrome Web Store, Edge Add-ons): badge and keyboard shortcut only. No network access, no update checks (the store updates the add-on).
async function refreshBadge() {
  const { enabled } = await chrome.storage.sync.get({ enabled: true });
  if (!enabled) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#555" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.storage.onChanged.addListener((ch, area) => { if (area === "sync" && ch.enabled) refreshBadge(); });

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd !== "toggle") return;
  chrome.storage.sync.get({ enabled: true }, (c) => chrome.storage.sync.set({ enabled: !c.enabled }));
});
