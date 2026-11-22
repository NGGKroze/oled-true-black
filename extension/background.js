const setBadge = (enabled) => {
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#555" });
};
const refresh = () => chrome.storage.sync.get({ enabled: true }, (c) => setBadge(c.enabled));

chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(refresh);
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "sync" && ch.enabled) setBadge(ch.enabled.newValue);
});
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd !== "toggle") return;
  chrome.storage.sync.get({ enabled: true }, (c) => chrome.storage.sync.set({ enabled: !c.enabled }));
});
