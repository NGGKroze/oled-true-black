document.getElementById("f").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = document.getElementById("q").value.trim();
  if (!text) return;
  if (/^https?:\/\//i.test(text)) location.href = text;
  else chrome.search.query({ text, disposition: "CURRENT_TAB" });
});
