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
