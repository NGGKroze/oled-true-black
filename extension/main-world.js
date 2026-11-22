// Runs in the page's own JS world: forces closed shadow roots open so the
// extension can reach them, and tells the extension when a shadow root appears.
(() => {
  const orig = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = orig.call(this, init && init.mode === "closed" ? { ...init, mode: "open" } : init);
    try {
      this.dispatchEvent(new CustomEvent("oled-shadow-attached", { bubbles: true, composed: true }));
    } catch (e) {}
    return root;
  };
})();
