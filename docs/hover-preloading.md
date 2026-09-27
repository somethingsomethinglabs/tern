# Hover preloading

Tern uses Chromium's Speculation Rules API to prefetch likely next documents, plus Electron's native `session.preconnect` API for external origins. It does not maintain a second HTTP cache or run an AI model for this decision.

## What decides to preload

The isolated page preload checks a link when the user moves the pointer over it. An eligible same-origin link gets a marker matched by a document speculation rule with `eagerness: moderate`. Chromium then applies its own pointer prediction: normally a 200 ms hover, or pointer-down sooner. It owns request priority, cookies, response reuse, cancellation and the two-entry limit for moderate speculation. See [Chrome's speculation rules documentation](https://developer.chrome.com/docs/web-platform/prerender-pages).

Tern's policy excludes credentials in URLs, query strings, fragments, the current URL, common action/account/cart/checkout paths, downloadable file extensions, download attributes, new-window targets, explicit inline click handlers, button roles, `nofollow` and `external` links. It honors `data-no-prefetch`, `data-no-prerender`, `.no-prefetch` and `.no-prerender` on the link or its ancestors at selection time. Changed attributes on marked links are checked again. Bookkeeping is bounded to 20 marked anchors; Chromium's smaller native cache limit still applies.

The policy is deliberately conservative but heuristic. A URL alone cannot prove that an arbitrary website's GET endpoint has no side effects. Unrecognized action routes and redirects are a remaining limitation. Prefetching can use extra bandwidth and server resources even if the page is never visited. There is no learned browsing history or remote classifier. The setting can be turned off in Settings → Page loading.

Only the selected visible page in the focused Tern window receives permission to add these hints. Hints are removed when hidden, unfocused, offline, in Data Saver, or when the connection API reports slow-2g, 2g or 3g. Connection classifications are estimates. Chromium applies its own additional resource eligibility checks; Tern does not override them.

An eligible external link gets a 200 ms dwell timer and one native connection, without an HTTP request for the destination page. Both the renderer and host limit this to two external origins per document. The host validates the selected main frame, window state, preference and origin before calling [Electron's preconnect API](https://www.electronjs.org/docs/latest/api/session#sespreconnectoptions). The DOM preconnect hint alone did not establish a connection in the tested Electron build; the session API did.

## Boundaries

Prefetch downloads the next HTML document. It does not render the destination or execute its JavaScript in advance. Full prerendering could do more work ahead of a click but is a larger behavioral change for arbitrary third-party sites, so Tern adds prefetch rules only.

Speculation rule injection remains subject to the site's Content Security Policy. Tern does not copy CSP nonces, relax headers, fetch through a privileged proxy, replace responses, bypass challenges, or override cache policy. The browser's navigation prefetch cache has different semantics from its regular HTTP cache and can hold documents that are not stored in the latter. Tern leaves these semantics to Chromium.

Same-origin link paths stay in the isolated renderer. Only an external origin is sent to the main process to prepare a connection. No page text, form values, URL paths or query strings are sent to the host by this feature. There is no API exposed to page scripts. Preload settings and visibility flow from the host to the isolated renderer.

The preference controls Tern's hints. A website's own preload or speculation rules remain its responsibility. This feature chiefly helps full document navigations. A site that intercepts a click and fetches its own API data may not use the prefetched HTML. Login state, redirects, security policies and server choices can also prevent reuse.

## Verification

The native-engine probe confirmed `PrefetchResponseUsed` in this pinned Electron build. The integrated controlled test measured 99 ms from click to the destination heading with prefetch and 724 ms without it, with the server delaying the HTML response by 600 ms. Timing varies; the regression assertion is that Chromium reports native reuse and the server sees exactly one request for the prefetched document. The target script makes no request until actual navigation.

Other checks cover brief hover, excluded paths and attributes, URL changes after marking, CSP refusal, external TCP connection without a document request, disabling the setting and persisting it across restart, and cancellation while hidden or offline. Existing website-isolation and task-retention tests remain applicable.

Validation passed: production build and typecheck, all 48 desktop UI tests, all three unit-test files and `git diff --check`. The final crash-cleanup guard was followed by rerunning the crash test and all five hover tests.

Live checks on 26 September 2026 used Electron 44.4.3 / Chromium 152.0.7977.130, fresh profiles and a 1.8-second hover before clicking:

| Site and destination | Native result | Click to DOM readiness |
| --- | --- | ---: |
| 4WD Supacentre, Family Tents category | Prefetched response used | 427 ms |
| Supercheap Auto, ToolPRO Air inflator product | Prefetched response used | 2,266 ms |
| MakerWorld, All Models | Prefetch rejected with non-2xx response; navigation showed human verification | No valid usable-page timing |

These are single-run compatibility observations, not a site-wide speed comparison. Only the controlled fixture has a matched prefetch-off comparison. MakerWorld's verification was not bypassed. [Raw live-site observations](performance/hover-sites.json) include the native status sequence. `PrefetchResponseUsed` confirms reuse; subsequent candidate eviction during navigation does not undo that result.

From the repository root:

```bash
npm run build:desktop
npm run test:unit
npm test --workspace=@tern/desktop -- e2e/link-preloading.spec.ts
npm run measure:hover --workspace=@tern/desktop
```

The live probe uses temporary profiles and opens one eligible catalogue link per site. It records native prefetch status, whether the click was a full-document or same-document navigation, and time until DOM readiness. That timing does not claim all page controls are ready. Results default to `/tmp/tern-hover.json`; override with `TERN_PERF_OUTPUT`. Custom site URLs can be passed after `--`, though the catalogue-link selector is tailored to the default test sites.
