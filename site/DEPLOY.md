# Deploy the generator site on the home server

The site runs as one Docker container on the Ubuntu server and is reachable in the local network at
`http://<server-ip>:8642`. It updates itself from GitHub:

```text
git push (main) ──► GitHub Actions "site": tests, build ──► release site-<version> with site.tar.gz
                                                                  │
container cad-site (port 8642) ◄── checks every 15 min, or "Check for updates" on the overview page
   └─ volume cad-site-data: versions/<version>/ (current + 2 previous), current.json
```

- The image (`ghcr.io/jan1409/cad-site`) contains only the small server program `server.mjs`.
- The site itself is downloaded from the GitHub releases of the private repository `jan1409/cad-projects`. That download needs a read-only token.
- A download is checked against the release's SHA-256 and unpacked next to the running version, then switched over in one step.
- A broken download never replaces the running site.

## 1. One-time setup on GitHub

### 1a. Token for the server

1. Open <https://github.com/settings/personal-access-tokens/new> (Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token).
2. Fill in the form:
   - **Token name:** `cad-site server`
   - **Expiration:** 1 year, then set a calendar reminder to renew it.
   - **Resource owner:** `jan1409`
   - **Repository access:** *Only select repositories* → `cad-projects`
   - **Permissions → Repository permissions → Contents:** *Read-only*. *Metadata: Read-only* is added automatically.
3. Click **Generate token** and copy it (it starts with `github_pat_`). GitHub shows it only once.

### 1b. Make the container image public

The first push creates the package `cad-site` as **private**, and a private package can only be pulled after `docker login`.
Making it public is safe: the image holds only `server.mjs`. The CAD site stays private and is fetched with the token from 1a.

1. Open <https://github.com/jan1409?tab=packages> → **cad-site** → **Package settings**.
2. Under **Danger Zone**, click **Change visibility** → **Public**, then confirm with the package name.

Alternative if you'd rather keep the image private: create a *classic* token with only the `read:packages` scope. Then run
`docker login ghcr.io -u jan1409` once on the server and paste that token as the password.

## 2. Install on the Ubuntu server

These steps assume Docker with the Compose plugin, which you already use for other containers. Check with:

```bash
docker --version && docker compose version
```

1. Create a folder for the deployment:

   ```bash
   sudo mkdir -p /opt/cad-site && sudo chown "$USER": /opt/cad-site && cd /opt/cad-site
   ```

2. Fetch `docker-compose.yml` and `.env.example` from the private repository. `read -rs` keeps the token out of the shell history; paste it and press Enter:

   ```bash
   read -rsp "GitHub token: " TOKEN; echo
   for f in docker-compose.yml .env.example; do
     curl -fsSL -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github.raw" \
       -o "$f" "https://api.github.com/repos/jan1409/cad-projects/contents/site/server/$f"
   done
   ls -la
   ```

3. Create `.env` with the token:

   ```bash
   cp .env.example .env
   sed -i "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=$TOKEN|" .env
   chmod 600 .env
   unset TOKEN
   cat .env | grep -v TOKEN
   ```

   The other settings (check every 15 min, install automatically, keep 3 versions) can stay as they are.

4. Start the container:

   ```bash
   docker compose pull
   docker compose up -d
   docker compose logs -f
   ```

   Within a few seconds the log shows `listening on port 8642`, then `installing <version>` and `now serving <version>`. Press Ctrl+C to leave the log; the container keeps running.

5. Open the site from any device in the network. `hostname -I` prints the server's IP address. For example, `http://192.168.1.20:8642`.

   - The overview page lists the models. Its footer shows the site version, the last update check, and the **Check for updates** button.
   - Each generator page has an "← All models" link back to the overview.

The port is not forwarded by your router, so the site is only reachable inside the local network. Keep it that way: the
update button has no login.

## 3. Day to day

| What | How |
|---|---|
| Publish a change | Push to `main`. The *site* workflow (Actions tab) runs the tests and creates a release, then the server installs it within 15 minutes. |
| Install it right away | Press **Check for updates** on the overview page. It reloads once the new version is installed. |
| See what's running | Overview page footer, or `curl -s http://localhost:8642/api/status` on the server. |
| Roll back | Put `PIN_VERSION=<version>` (a release tag without `site-`) in `.env`, then `docker compose up -d`. Remove the line to follow new releases again. |
| Pause automatic updates | `AUTO_INSTALL=false` in `.env`, then `docker compose up -d`. The page still shows new releases, and the button installs them. |
| Update the server program | Only needed when `site/server/` changes, which triggers the *server-image* workflow: `docker compose pull && docker compose up -d`. |
| Start from scratch | `docker compose down -v && docker compose up -d`. This deletes the stored versions and reinstalls the newest release. |

## 4. Troubleshooting

| Symptom (overview footer or `docker compose logs`) | Fix |
|---|---|
| `GitHub answered 401: GITHUB_TOKEN was rejected` | The token expired or was revoked. Create a new one (1a), replace it in `.env`, then run `docker compose up -d`. |
| `GitHub answered 404: … not found` | `GITHUB_REPO` is misspelt, or the token was not given access to `cad-projects`. |
| `no site-* release in jan1409/cad-projects yet` | The first *site* workflow has not finished. Check the Actions tab on GitHub. |
| `docker compose pull` says *denied* or *unauthorized* | The package is still private. Do 1b, or `docker login ghcr.io`. |
| `download: fetch failed (ECONNRESET: … before secure TLS connection was established)` | A network hiccup. The server already retried for about 50 s, and the next check (within 15 min) tries again. You can also press the button again later. |
| "The site is being installed" page stays up | The server can't reach GitHub. It needs outbound HTTPS to `api.github.com` and GitHub's download hosts (`*.githubusercontent.com`). |
| Port 8642 already in use | Change the left number in `ports: - "8642:8642"` in `docker-compose.yml`. |

Fonts load from Google Fonts. Without internet access on the viewing device, the pages fall back to system fonts and
still work.
