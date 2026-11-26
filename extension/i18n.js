// Own tiny translation loader for the extension pages: lets the user pick a language that differs
// from the browser's (chrome.i18n always follows the browser). English is the fallback for any missing text.
const LANGS = [
  ["en", "English"], ["bg", "Български"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"],
  ["pt_BR", "Português (Brasil)"], ["ru", "Русский"], ["zh_CN", "简体中文"], ["zh_TW", "繁體中文"], ["ja", "日本語"], ["ko", "한국어"],
];

const i18n = (() => {
  let msgs = {}, base = {}, current = "en";

  const fromBrowser = () => {
    const ui = (chrome.i18n.getUILanguage() || "en").replace("-", "_");
    const codes = LANGS.map((l) => l[0]);
    if (codes.includes(ui)) return ui;
    const lo = ui.toLowerCase();
    if (lo.startsWith("zh")) return /tw|hk|mo|hant/.test(lo) ? "zh_TW" : "zh_CN";
    if (lo.startsWith("pt")) return "pt_BR";
    return codes.includes(lo.split("_")[0]) ? lo.split("_")[0] : "en";
  };

  const load = async (code) => {
    try {
      const r = await fetch(chrome.runtime.getURL(`_locales/${code}/messages.json`));
      return await r.json();
    } catch (e) { return {}; }
  };

  async function init(setting) {
    current = !setting || setting === "auto" ? fromBrowser() : setting;
    base = await load("en");
    msgs = current === "en" ? base : await load(current);
    document.documentElement.lang = current.replace("_", "-");
  }

  function t(key, ...subs) {
    const m = msgs[key] || base[key];
    let s = m ? m.message : key;
    subs.forEach((v, i) => { s = s.split("{" + i + "}").join(v); });
    return s;
  }

  // fills data-i18n (text), data-i18n-title (tooltip), data-i18n-ph (placeholder) inside root
  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  }

  const has = (key) => !!(msgs[key] || base[key]);

  return { init, t, apply, has, get lang() { return current; } };
})();
const t = i18n.t;
