# Connect live Grok (SpaceXAI / xAI) to HaulIntel

**Never put your API key in `index.html`, `app.js`, GitHub, or chat.**  
The key lives only as a **Cloudflare Worker secret**.

---

## 0) Rotate the key if it was shared

If you pasted your key in chat, email, or Discord:

1. Open https://console.x.ai/team/default/api-keys  
2. **Revoke / delete** the exposed key  
3. **Create a new key**  
4. Use **only** the new key in step 3 below (paste into the terminal when prompted — not into the website)

---

## 1) Get a SpaceXAI / xAI API key

1. Sign in: https://console.x.ai  
2. Add credits if prompted: billing section of the console  
3. Create key: https://console.x.ai/team/default/api-keys  
4. Copy once (looks like `xai-...`)

Env name used by the Worker: **`XAI_API_KEY`**  
API base: **`https://api.x.ai/v1`**  
Model: **`grok-4.5`**

---

## 2) Install tools (Windows)

Install **Node.js LTS** from https://nodejs.org if you don’t have it.  
Then open a **new** PowerShell window:

```powershell
node -v
npm -v
```

---

## 3) Deploy the Cloudflare Worker

```powershell
cd C:\Users\truck\Websites\HaulIntel\worker

# Login (browser opens)
npx wrangler login

# Deploy
npx wrangler deploy

# Store API key as a secret (you will be prompted — paste key, press Enter)
# The key is NOT shown in the website or git
npx wrangler secret put XAI_API_KEY
```

Optional — lock origins (recommended later):

```powershell
npx wrangler secret put ALLOWED_ORIGINS
# When prompted, paste:
# https://truckernflorida-arch.github.io,http://localhost:8080
```

Wrangler prints a URL like:

```text
https://haulintel-api.<your-subdomain>.workers.dev
```

Copy that URL.

---

## 4) Point the website at the Worker

### Option A — bake into the site (best for public Pages)

Edit `app.js`, set:

```js
const DEFAULT_API_BASE = 'https://haulintel-api.YOUR_SUBDOMAIN.workers.dev';
```

Commit and push (this is only the Worker URL — **not** the API key):

```powershell
cd C:\Users\truck\Websites\HaulIntel
git add app.js worker README.md SETUP-LIVE-API.md .gitignore
git commit -m "Add live Grok API proxy wiring"
git push
```

### Option B — one browser only (no redeploy)

On the live site, open the browser console (F12) and run:

```js
localStorage.setItem('haulintel_api', 'https://haulintel-api.YOUR_SUBDOMAIN.workers.dev');
location.reload();
```

Or open:

```text
https://truckernflorida-arch.github.io/haulintel/?api=https://haulintel-api.YOUR_SUBDOMAIN.workers.dev
```

---

## 5) Test

1. Open the site  
2. Search a real company name (e.g. `Schneider` or `Knight-Swift`)  
3. Banner should move to **Live mode** after a successful Grok response  
4. Chat should answer free-form questions  

Health check:

```text
https://haulintel-api.YOUR_SUBDOMAIN.workers.dev/health
```

---

## Architecture

```text
Browser (GitHub Pages)
   → POST /api/research or /api/chat
Cloudflare Worker (secret: XAI_API_KEY)
   → https://api.x.ai/v1/chat/completions  (Grok)
```

If the Worker is down, HaulIntel falls back to the **5 demo sample carriers**.

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Always demo data | `DEFAULT_API_BASE` empty / wrong URL / Worker not deployed |
| 503 XAI_API_KEY | Run `npx wrangler secret put XAI_API_KEY` again |
| 401 / 403 from xAI | Bad key, revoked key, or no credits — fix in console.x.ai |
| CORS error | Ensure Worker is latest code; origin is github.io or localhost |
| Slow first answer | Normal — model generates a full structured briefing |

---

## What we will never do

- Put `xai-...` keys in HTML/JS on GitHub Pages  
- Commit `.dev.vars` or `.env` with secrets  
- Ask you to paste keys into public chat again  
