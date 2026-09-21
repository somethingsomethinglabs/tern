# Use Electron WebContentsView for the first desktop browser

The approved prototype is a React shell, but its sample pages cannot browse real sites. Trailrest needs independent Chromium pages that remain alive while their owning task is put aside. A full Chromium fork would require a separate browser build and maintenance effort; Tauri on Linux would change the engine to WebKitGTK.

Use Electron 44.4.3 with one retained WebContentsView per live page. The main process owns task persistence and page lifetimes. A trusted shell communicates through a small validated preload bridge; websites get no Node access, exposed shell bridge, or shell protocol handler. A minimal sandboxed, isolated-world preload observes scroll positions and reports only up/down to the host for toolbar visibility; it exposes no API or page content to the shell. The host accepts these events only from the selected website's main frame. The selected page's native bounds follow a measured rectangle in the shell.

This keeps the existing visual direction and makes actual page retention testable. It also commits us to Electron security updates and explicit navigation, permission, popup, download, and unload policies. Metadata restoration reopens URLs and does not restore a live JavaScript heap. See [host research](../browser-host-research.md) for the sources and constraints.
