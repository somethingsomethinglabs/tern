# Page loading in Tern

Measured on 26 September 2026 with Electron 44.4.3, Chromium 152.0.7977.130 and a normal network connection. The goal is to make the selected page usable while its remaining assets load.

## Changes

Task restoration now starts the selected document first. Background documents start one at a time after the preceding document reaches DOM readiness. Images and other assets can keep loading. Selecting a waiting tab opens it immediately, and a five-second fallback prevents a stalled document from blocking restoration indefinitely. Closing a waiting reference removes it from the queue. Existing live pages retain their state, and waiting pages count toward the 100-page limit.

F12 and Ctrl+Shift+I open the selected website's DevTools in a separate window. Performance recordings and Network inspection are available there. The shortcuts work from the shell or the website and do nothing when the website is hidden.

Normal single-page navigation already displayed the page without waiting for the full load event. That behavior remains. These changes primarily reduce competition when reopening several saved tabs. Tern does not rewrite third-party scripts, force their images to lazy-load, or change their server rendering.

## Live-site observations

Each measurement opens a temporary profile and restores a task containing the three requested sites, with the measured site selected. A repeat visit navigates to the same URL using that profile's normal HTTP cache and cookies. There is no CPU or network throttling. The probe waits for the search control, clicks it, enters text, verifies the value, and waits for an animation frame. It then clears the text without submitting and checks scrolling with a wheel event.

The numbers below are elapsed time from initiating the browser action until that search-input check completes. They include automation overhead and are not a standard time-to-interactive metric. Search results, checkout, account access and downloads were not tested.

| Site | Before, first visit | After, first visit | After, repeat visit | Interaction checks after change |
| --- | ---: | ---: | ---: | --- |
| 4WD Supacentre | 3.07 s | 3.16 s | 2.25 s | Search input and scrolling passed |
| Supercheap Auto | 7.34 s | 6.08 s | 4.98 s | Search input and scrolling passed |
| MakerWorld | No valid search measurement | 4.75 s | Verification page | First-visit search input and scrolling passed |

The two retail sites still had an unfinished full-page load when the successful interaction was measured. MakerWorld completed its full load in about 4.04 seconds on the successful first visit. Its repeat visit returned a human-verification page, which is recorded as a challenge rather than a successful fast load. The initial MakerWorld probe missed its search input because the input has no placeholder or accessible label; the final probe uses the visible text input observed on that page.

One before/after sample cannot establish a reliable speedup. The order of tests, network conditions, server responses, resource caching and scripts vary between runs. Supercheap Auto improved in this sample; 4WD Supacentre's first visit was essentially unchanged. The controlled regression test establishes the selected document's priority independently of those live-site variations.

The JSON evidence records navigation timing, first contentful paint, the latest observed largest contentful paint and long-task totals. LCP is sampled during the probe, not a final field measurement. Blocking time is the accumulated portion of observed tasks over 50 ms; it is not Lighthouse's TBT window. No INP score is claimed from this small interaction sample. Raw evidence is in [loading-before.json](performance/loading-before.json) and [loading-after.json](performance/loading-after.json).

## Repeat the checks

From the repository root:

```bash
npm run build:desktop
npm test --workspace=@tern/desktop -- e2e/loading.spec.ts
TERN_PERF_RESTORE=1 TERN_PERF_OUTPUT=/tmp/tern-loading.json npm run measure:loading --workspace=@tern/desktop
```

Omit `TERN_PERF_RESTORE` to measure ordinary single-page navigation. Custom URLs can be passed after `--`; the default search selectors work only for sites with recognizable search controls. A missing control is reported as unavailable, not as a browser performance failure. Cold means a fresh browser profile, not a cleared operating-system DNS cache or CDN cache. All temporary profiles are removed after the run.

The loading regression suite holds the selected HTML response open to verify that background requests have not started. Releasing the document while holding an image request open verifies that the page responds to a click before full load and background restoration proceeds. It also covers selecting a waiting tab without duplicate navigation or lost input, the stalled-document fallback, closing a queued reference, and DevTools targeting the guest page instead of the privileged shell.

Validation passed: desktop typecheck and production build, all 43 desktop UI tests, both unit-test files, and `git diff --check`. The selected-document priority test failed against the original implementation because both background requests had already started; it passes with the restoration queue.

Implementation uses Electron's [DOM readiness and DevTools APIs](https://www.electronjs.org/docs/latest/api/web-contents). Website-level techniques such as server rendering, code splitting and native lazy loading remain the website author's responsibility.
