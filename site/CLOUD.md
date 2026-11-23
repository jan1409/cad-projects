# Cloud deploy: Cloudflare Worker behind Cloudflare Access

The same build that the home server installs (see [DEPLOY.md](DEPLOY.md)) also runs on Cloudflare. It is reachable from
anywhere at `https://cad-site.<subdomain>.workers.dev`, but only for the e-mail addresses on the Access list.

```text
git push (main) ──► GitHub Actions "site": tests, build ──► release site-<version>  ──► home server (DEPLOY.md)
                                                        └─► wrangler deploy         ──► Worker cad-site (workers.dev)
                                                                                            ▲
visitor ──► Cloudflare Access: e-mail ──► one-time code by mail ──► signed in for the session duration
```

- **Hosting:** The Worker holds static files only (`site/wrangler.json`, no Worker script). There is no `api/status`, so
  the overview page hides its update panel by itself.
- **Access:** Every path is behind Access, including `vendor/`, `models.json` and the download files. A visitor enters an
  e-mail address and gets a one-time code by mail if that address is on the list.
- **Cost:** none. Requests for static files are free on Workers, and Access is free up to 50 users.
- **Limits:** at most 25 MiB per file and 20,000 files. The `cloud` step of `npm test` checks both, together with the
  settings in `wrangler.json`.
- **Privacy:** The generators run in the browser, so photos for the tool insert never leave the device.

## 1. One-time setup

### 1a. Cloudflare account and workers.dev subdomain

1. Sign up at <https://dash.cloudflare.com/sign-up>, then turn on two-factor authentication (My Profile → Authentication).
2. Open **Workers & Pages** and choose the account's workers.dev subdomain. It is part of the public URL, so pick a neutral name.

### 1b. Zero Trust organisation

1. Open **Zero Trust** in the dashboard.
2. Choose a team name and the **Free** plan. The team name appears on the sign-in page as `<team>.cloudflareaccess.com`.
   Cloudflare may ask for a payment method; the Free plan is not charged.
3. Under Settings → Authentication, **One-time PIN** is on by default, and that is all the site needs.
   Google or GitHub sign-in can be added later.

### 1c. Placeholder first, then Access

The real site must never be online without Access. So deploy a placeholder first, protect it, and only then deploy the
site. In Git Bash:

```bash
npx --yes wrangler@4.166.0 login     # once; opens the browser
mkdir -p /tmp/cad-placeholder && printf '<!doctype html><title>cad-site</title><p>Coming soon.\n' > /tmp/cad-placeholder/index.html
npx --yes wrangler@4.166.0 deploy --name cad-site --assets /tmp/cad-placeholder --compatibility-date 2026-11-23
```

Wrangler prints the URL. Then:

1. Open Workers & Pages → **cad-site** → Settings → Domains & Routes. At workers.dev, click **Enable Cloudflare Access**.
2. Under **Manage Cloudflare Access**, open the policy *cad-site - Production*. Make its Include rule list exactly the
   allowed e-mail addresses (Selector *Emails*).
3. In the Access application's settings, set the **session duration** to 1 month. Otherwise visitors need a new code every day.
4. Check that the URL now answers with a redirect to the sign-in page:

   ```bash
   curl -sI https://cad-site.<subdomain>.workers.dev/ | grep -iE '^(HTTP|location)'
   # HTTP/2 302
   # location: https://<team>.cloudflareaccess.com/...
   ```

### 1d. API token and GitHub secrets

1. Create the token: My Profile → API Tokens → **Create Token** → template **Edit Cloudflare Workers**.
   - Account Resources: your account only.
   - Zone Resources: all zones of that account.
   - TTL: 1 year. Set a calendar reminder to renew it.
2. Find the **Account ID** in the Workers & Pages overview, or with `npx wrangler@4.166.0 whoami`.
3. Add both values as secrets: GitHub repository `cad-projects` → Settings → Secrets and variables → Actions → New repository secret.
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Start the first deploy: Actions → **site** → Run workflow, or `gh workflow run site.yml`. Its step *Deploy to Cloudflare*
   replaces the placeholder with the site.

## 2. People

| What | How |
|---|---|
| Let someone in | Add the address to the Include rule of *cad-site - Production* (Zero Trust → Access → Policies). Send them the URL; they sign in with a code that goes to that address. |
| Remove someone | Delete the address from the policy. Then revoke the session they still have: Zero Trust → Users → the user → Revoke session. |
| Who signed in | Zero Trust → Logs → Access. |

## 3. Day to day

| What | How |
|---|---|
| Publish a change | Push to `main`. The *site* workflow releases for the home server, then deploys to Cloudflare. |
| Deploy again now | Actions → *site* → Run workflow. |
| See what's running | The site version in the overview page's footer. On Cloudflare: Workers & Pages → cad-site → Deployments, where each deployment's message is `site <version>`. |
| Roll back | Workers & Pages → cad-site → Deployments → **Rollback** on an older version, or `npx wrangler@4.166.0 rollback --name cad-site`. The next push deploys the newest version again. |
| Stop deploying to Cloudflare | Delete the secret `CLOUDFLARE_API_TOKEN`. The step is then skipped, and the home server keeps updating. |
| Take the site offline | Workers & Pages → cad-site → Settings → Domains & Routes → disable workers.dev, or delete the Worker. |
| Update wrangler | Change the pinned version (`wrangler@4.166.0`) in `.github/workflows/site.yml` and in this file. |

## 4. Troubleshooting

| Symptom | Fix |
|---|---|
| Step *Deploy to Cloudflare* is skipped | The secret `CLOUDFLARE_API_TOKEN` is missing (1d). |
| `Authentication error [code: 10000]` | The token expired, was revoked, or lacks Workers permissions, or `CLOUDFLARE_ACCOUNT_ID` is wrong. Create a new token (1d) and replace the secret. |
| `npm test` fails at `cloud: … files over 25 MiB` | A file outgrew the Worker's limit. Gzip it in `build.mjs` the way the kernel is gzipped (`vendor/opencascade-gz.wasm`), or split it. |
| No code arrives | Access sends codes only to addresses on the list, and shows the same page for every address. Check the policy, then the spam folder. |
| A page that was open for a long time stops loading files | The Access session expired. Reload the page and sign in again. |
