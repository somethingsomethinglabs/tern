# Tern website

![Tern](public/brand/tern-wordmark.svg)

The Tern product landing page, built with Vite and plain HTML, CSS and JavaScript. Includes a responsive browser illustration, an editable pause/resume demo, product explanation, alpha availability and accessible FAQ disclosures.

From the repository root:

```bash
npm ci
npm run dev:website
npm run build:website
```

The demo is fictional and holds its note only for the current page session. It does not browse websites or preserve data after a refresh. The page describes the current Linux alpha without offering an unavailable public download.

Fonts are self-hosted, with the Inter license in `public/`. There are no analytics, external font requests or signup submissions. The illustration uses HTML and CSS.

The build emits static assets in `dist/client`, a Cloudflare-compatible Worker in `dist/server/index.js`, and Sites metadata in `dist/.openai/hosting.json`. The Sites project binding belongs to this workspace. Publish only this website's source and output, not the desktop browser or prototype.
