const { ipcRenderer } = require("electron");
installLinkPreloading(ipcRenderer);
// Isolated-world scroll observer. Exposes no API to websites or page text to the host.
const positions = new WeakMap();
let pending;
let scheduled = false;
window.addEventListener(
  "scroll",
  (event) => {
    const element =
      event.target === document ? document.scrollingElement : event.target;
    if (!element || typeof element.scrollTop !== "number") return;
    const current = element.scrollTop;
    const previous = positions.get(element) || 0;
    if (current > 80 && current - previous > 24) pending = "down";
    else if (current <= 8 || previous - current > 12) pending = "up";
    else return;
    positions.set(element, current);
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        ipcRenderer.send("guest:scroll", pending);
      });
    }
  },
  { passive: true, capture: true },
);

// Browser popup decisions use trusted input only, never a website-supplied flag.
for (const name of ["pointerdown", "keydown"]) window.addEventListener(name, event => {
  if (event.isTrusted) ipcRenderer.send("guest:gesture");
}, { capture: true, passive: true });
