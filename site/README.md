# Generator site

Overview page with sections of models: browser generators, and ready-made models to download. Served in two places:
on the home server by a self-updating container ([DEPLOY.md](DEPLOY.md)), and on a Cloudflare Worker behind Cloudflare
Access, so that the people on the list can use it from anywhere ([CLOUD.md](CLOUD.md)).

## Layout

| Path | Content |
|---|---|
| `models.json` | Registry of the models on the overview page (see below) |
| `sections.json` | Sections of the overview page, in order: `{id, title {en,de}, lede {en,de}}` (Gridfinity, SKÅDIS models) |
| `portal/` | Overview page (`index.html`, `portal.js`, `strings.js`): a heading and card grid per section, site version, update panel |
| `download/` | The shared page of every download model (`index.html`, `download.js`, `sheet.js`, `strings.js`): gallery, files, ZIP with build sheet, print settings, steps |
| `shared/i18n.js` | Languages (English, German) for every page: choice, translator, EN/DE switch; built to `vendor/i18n.js` |
| `build.mjs` | Builds `dist/`: portal, `models/<id>/`, shared `vendor/` (replicad, gzipped OpenCascade kernel, three, fflate, Clipper, OpenCV.js), `version.json` |
| `test.mjs` | CI checks: geometry smoke builds, model registry and download files, translations, site build, Cloudflare limits, static server, tar reader, updater against a fake GitHub API |
| `server/server.mjs` | Static server + GitHub release updater (Node 22+, no dependencies) |
| `server/Dockerfile`, `docker-compose.yml`, `.env.example` | Container for the home server |
| `wrangler.json` | Cloudflare Worker `cad-site`: static files from `dist/` only, real 404s, no preview URLs ([CLOUD.md](CLOUD.md)) |
| `../.github/workflows/site.yml` | Push to `main` → test → build → release `site-<version>` with `site.tar.gz` → deploy to Cloudflare (when the secret `CLOUDFLARE_API_TOKEN` is set); keeps the newest 10 releases |
| `../.github/workflows/server-image.yml` | Changes in `server/` → test → `ghcr.io/jan1409/cad-site:latest` |

## Commands (from the repository root)

```bash
npm install             # once; workspaces: Gridfinity/web, site
npm test                # all checks (~1 min); node site/test.mjs --skip-geometry for the fast part
npm run build           # site/dist, version <date>-<sha>-dev
npm run serve           # http://localhost:8642 from site/dist (static mode: no updater)
```

## Adding a generator

1. Build the generator like `Gridfinity/web/app/`, or like `Gridfinity/web/bin/` when several models share one page
   (`"variant"` in `models.json` → `model.json` next to the page). It needs an `index.html` with a `<!--site:nav-->` marker where the
   "← All models" bar goes, plus `app.js` and `worker.js`. They reference the shared libraries as `./vendor/…`;
   `build.mjs` rewrites that to `../../vendor/`.
2. Add an entry to `models.json` (`section` must exist in `sections.json`; `kind` defaults to `"generator"`):

   ```json
   {
     "id": "url-slug",
     "section": "gridfinity",
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

## Adding a download model

Ready-made models (designed in Fusion, see `Skadis/fusion/README.md`) need no page of their own: they all use
`download/`. The model's folder is tracked in git (`export/` folders are not), e.g. `Skadis/models/<slug>/`:

| Path | Content |
|---|---|
| `model.json` | Page content, every text `{en, de}` (below) |
| `card.png` | Card image, transparent, ~720 px wide (`tools/card_image.py`) |
| `images/*.png` | Gallery pictures (1000–1200 px; photos only as `.jpg` without EXIF, which can carry GPS positions) |
| `files/*` | Downloads: `.stl`, `.3mf`, `.step`, ASCII names, at most 10 MB each; every file must be listed in `model.json` |

```json
{
  "images": [{ "file": "images/x.png", "alt": { "en": "…", "de": "…" } }],
  "parts": [{ "name": { "en": "Bracket", "de": "Halter" }, "qty": 2, "orient": { "en": "…", "de": "…" },
              "files": ["files/X_Bracket.stl", "files/X_Bracket.step"] }],
  "files": [{ "file": "files/X_Plate.3mf", "label": { "en": "All parts on one plate (3MF)", "de": "…" } }],
  "print": { "material": { "en": "PETG or PLA", "de": "PETG oder PLA" }, "layer": 0.2, "walls": 4, "infill": 25,
             "supports": false, "minutes": 406, "grams": 154, "notes": [{ "en": "…", "de": "…" }] },
  "steps": [{ "en": "Mounting step", "de": "Montageschritt" }]
}
```

Then add the entry to `models.json` with `"kind": "download"` and `"source"` (the folder) instead of
`app`/`modules`/`spec`; its facts are plain texts. `build.mjs` copies the listed files next to the page and writes the
content plus the file sizes to `models/<id>/model.json`. "Download all" fetches the files and zips them with a
`BUILD_SHEET.md` written in the page's language. The `model registry` step of `test.mjs` checks the files, so no smoke
build is needed. `site.yml` already watches `Skadis/models/**`; add other objects' model folders there.

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
