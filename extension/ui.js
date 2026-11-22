// Shared helpers: internal values are 0-255 channel levels; the UI shows percentages of full brightness.
const toPct = (raw) => Math.round(raw / 2.55);
const toRaw = (pct) => Math.round(pct * 2.55);
const hexGray = (raw) => {
  const h = Math.max(0, Math.min(255, Math.round(raw))).toString(16).padStart(2, "0");
  return "#" + h + h + h;
};
