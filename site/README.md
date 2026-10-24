# Generator site

Overview page plus one browser generator per model, served on the home server by a self-updating container.
Deployment and server setup: [DEPLOY.md](DEPLOY.md).

## Layout

| Path | Content |
|---|---|
| `models.json` | Registry of the models on the overview page (see below) |
| `portal/` | Overview page (`index.html`, `portal.js`, `strings.js`): cards, site version, update panel |
| `shared/i18n.js` | Languages (English, German) for every page: choice, translator, EN/DE switch; built to `vendor/i18n.js` |
| `build.mjs` | Builds `dist/`: portal, `models/<id>/`, shared `vendor/` (replicad, gzipped OpenCascade kernel, three, fflate, Clipper, OpenCV.js), `version.json` |
| `test.mjs` | CI checks: geometry smoke builds, site build, static server, tar reader, updater against a fake GitHub API |
| `server/server.mjs` | Static server + GitHub release updater (Node 22+, no dependencies) |
| `server/Dockerfile`, `docker-compose.yml`, `.env.example` | Container for the home server |
| `../.github/workflows/site.yml` | Push to `main` → test → build → release `site-<version>` with `site.tar.gz`; keeps the newest 10 |
| `../.github/workflows/server-image.yml` | Changes in `server/` → test → `ghcr.io/jan1409/cad-site:latest` |

## Commands (from the repository root)

```bash
npm install             # once; workspaces: Gridfinity/web, site
npm test                # all checks (~1 min); node site/test.mjs --skip-geometry for the fast part
npm run build           # site/dist, version <date>-<sha>-dev
npm run serve           # http://localhost:8642 from site/dist (static mode: no updater)
```

## Adding a model

1. Build the generator like `Gridfinity/web/app/`, or like `Gridfinity/web/bin/` when several models share one page
   (`"variant"` in `models.json` → `model.json` next to the page). It needs an `index.html` with a `<!--site:nav-->` marker where the
   "← All models" bar goes, plus `app.js` and `worker.js`. They reference the shared libraries as `./vendor/…`;
   `build.mjs` rewrites that to `../../vendor/`.
2. Add an entry to `models.json`:

   ```json
   {
     "id": "url-slug",
     "title": { "en": "Shown on the card", "de": "Auf der Karte" },
     "summary": { "en": "One or two sentences", "de": "Ein oder zwei Sätze" },
     "app": "../<Object>/web/app", "modules": "../<Object>/web/src", "spec": "../<Object>/spec/<params>.json",
     "image": "../<Object>/web/app/card.png",
     "facts": [{ "en": "{x_count.min}–{x_count.max} cells", "de": "{x_count.min}–{x_count.max} Zellen" }, "…"]
   }
   ```

   `{param.field}` in `facts` is filled from the spec's `parameters`. The card image is a transparent PNG, about
   720 px wide: a Fusion screenshot, cropped and palette-quantised.
3. Languages: every text the page shows is English and German. Put the page's texts in a `strings.js`
   (`{ "key": { en, de } }`, like `Gridfinity/web/src/strings.js`), mark static HTML with `data-i18n` /
   `data-i18n-attr`, and add `<div class="lang" data-lang-switch>` to the header. In the app, use
   `translator`, `applyDom`, `mountLangSwitch` and `num` from `./vendor/i18n.js`, and re-render on the `langchange` event.
   Then add the page's files to the key scan of the `translations` step in `test.mjs`.
4. Add the new folders to the `paths` of `site.yml` and a smoke build to `test.mjs`.
5. `npm test`, then push.

## Server

Environment variables (all optional except `GITHUB_REPO`, plus `GITHUB_TOKEN` for a private repository):

| Variable | Default | Meaning |
|---|---|---|
| `GITHUB_REPO` | – | `owner/name` whose `site-*` releases hold the site |
| `GITHUB_TOKEN` | – | Fine-grained token, Contents: Read-only |
| `UPDATE_INTERVAL_MIN` | 15 | Minutes between checks; 0 = only on request |
| `AUTO_INSTALL` | true | Install new releases automatically |
| `KEEP_VERSIONS` | 3 | Versions kept on disk, including the current one |
| `PIN_VERSION` | – | Stay on / roll back to this version |
| `PORT`, `DATA_DIR` | 8642, /data | |
| `RELEASE_PREFIX`, `RELEASE_ASSET`, `GITHUB_API_URL` | `site-`, `site.tar.gz`, api.github.com | |
| `RETRY_DELAYS_S` | 5,15,30 | Waits before retrying a network failure (not HTTP errors) |

API:

- `GET /api/health` returns `{ok, version}`.
- `GET /api/status` returns the current and latest version, the last check and its error, and the installed versions.
- `POST /api/update` checks now and installs a newer release, even with `AUTO_INSTALL=false`. It answers with the status.

Caching: every file is served with `Cache-Control: no-cache` and a content-hash ETag. Browsers therefore revalidate, and
download the 7 MB kernel again only when it really changed. Text files are gzipped on the fly.
