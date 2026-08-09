# HaulIntel

**Free carrier research for CDL truck drivers** — know the company before you sign on.

HaulIntel (also referred to as CarrierCheck AI) is a mobile-first, dark-theme static website. Drivers search a trucking company name and get an AI-style briefing on pay accuracy, home time, equipment, dispatch, safety/FMCSA notes, and driver sentiment. A chat panel supports plain-language follow-up questions.

> **This repo is a production-ready demo.** Briefings and chat use high-quality **sample data** only. Live Grok-powered research is designed as a later upgrade (see below).

---

## Features

- Landing page with strong driver-focused headline and big company search
- Research section with 5 realistic mock carriers (good, average, bad, lease-purchase trap, solid reefer)
- Structured briefing cards: vibe, recommendation, pay, equipment, dispatch, safety, sentiment
- Chat UI with suggested questions and veteran-driver tone answers
- About / how it works
- Sticky header, mobile drawer nav, footer
- Demo banner (dismissible for the session)
- Pure static: HTML + CSS (Tailwind CDN) + vanilla JS — **no build step**
- Works on GitHub Pages as-is

---

## File structure

```
HaulIntel/
├── index.html    # Full single-page site (all sections)
├── app.js        # Search, mock briefings, chat logic
└── README.md     # This file
```

---

## Run locally

No install, no bundler.

### Option A — double-click

Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari).

### Option B — simple local server (recommended)

From this folder:

```bash
# Python 3
python -m http.server 8080

# or Node (if you have npx)
npx --yes serve -p 8080
```

Then visit `http://localhost:8080`.

---

## Deploy to GitHub Pages

### 1. Create a new GitHub repository

1. Sign in at [github.com](https://github.com).
2. Click **+** → **New repository**.
3. Repository name examples:
   - `haulintel` → site at `https://<you>.github.io/haulintel/`
   - `<you>.github.io` → site at `https://<you>.github.io/` (user/org root site)
4. Set visibility to **Public** (required for free GitHub Pages on personal accounts).
5. **Do not** add a README, .gitignore, or license if you will push this folder as the first commit (avoids merge noise).
6. Click **Create repository**.

### 2. Push this site to the repo

On your machine (Git Bash, Terminal, or PowerShell with Git installed):

```bash
cd path/to/HaulIntel

git init
git add index.html app.js README.md
git commit -m "Initial HaulIntel static demo"

# Create the default branch name GitHub expects
git branch -M main

# Replace YOUR_USER and YOUR_REPO with your GitHub username and repo name
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Using SSH instead of HTTPS:

```bash
git remote add origin git@github.com:YOUR_USER/YOUR_REPO.git
git push -u origin main
```

### 3. Enable GitHub Pages

1. Open the repo on GitHub.
2. Go to **Settings** → **Pages** (under “Code and automation”).
3. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
4. Branch: **main**
5. Folder: **/ (root)**
6. Click **Save**.

Wait 1–2 minutes. Your site URL will appear on the same Pages settings screen:

- Project site: `https://YOUR_USER.github.io/YOUR_REPO/`
- User site (`YOUR_USER.github.io` repo): `https://YOUR_USER.github.io/`

### 4. Optional: custom domain

In **Settings → Pages → Custom domain**, add your domain and follow GitHub’s DNS instructions. HTTPS is available once DNS propagates.

### 5. Updating the site later

```bash
# edit files, then:
git add -A
git commit -m "Update HaulIntel content"
git push
```

Pages rebuilds automatically on each push to `main`.

---

## Demo companies (sample data)

| Company | Profile |
|--------|---------|
| **Horizon Freight Lines** | Strong mid-size dry van — honest pay, solid equipment |
| **Iron Route Logistics** | Average mega-adjacent — lottery by terminal |
| **Redline Bulk Transport** | Hard pass — pay/dispatch/safety concerns |
| **Patriot Lease Express** | Lease-purchase trap pattern |
| **Blue Peak Refrigerated** | Good West reefer / regional option |

Search any of those names, use the chips, or try `?q=Horizon%20Freight%20Lines` on the URL.

---

## Upgrading later: live Grok API (Cloudflare Workers)

The browser **must not** hold a real API key. Use a small backend proxy.

### Recommended shape

1. Keep this static frontend on GitHub Pages (or move static assets to Cloudflare Pages).
2. Add a **Cloudflare Worker** (or Pages Function) that:
   - Accepts `POST /api/research` with `{ "company": "..." }`
   - Accepts `POST /api/chat` with `{ "messages": [...] }`
   - Calls the **xAI Grok API** with the key stored as a Worker **secret**
   - Returns JSON the frontend already knows how to render
3. Point `app.js` at the Worker URL (e.g. `const API_BASE = 'https://haulintel-api.your-subdomain.workers.dev'`).
4. Add rate limits, basic abuse protection, and a short cache for popular carriers.

### Why Cloudflare Workers

- Free tier is enough for early traffic
- Secrets stay off GitHub and out of the browser
- Global edge latency works well for phone users at truck stops
- No traditional server to babysit

### Minimal Worker sketch (not included in this repo)

```js
// Pseudo-code only — wire real xAI endpoint + auth when you go live
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const { company } = await request.json();
    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-3', // use current model id from xAI docs
        messages: [
          { role: 'system', content: 'You brief CDL drivers on carriers. Be direct, fair, cite uncertainty.' },
          { role: 'user', content: `Research trucking company: ${company}` },
        ],
      }),
    });
    return new Response(await grokRes.text(), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://YOUR_USER.github.io',
      },
    });
  },
};
```

Set the secret:

```bash
npx wrangler secret put XAI_API_KEY
```

Until that exists, leave the mock paths in `app.js` so the demo keeps working offline.

---

## Tech notes

| Item | Choice |
|------|--------|
| Framework | None |
| CSS | [Tailwind CSS](https://tailwindcss.com) via CDN |
| JS | Vanilla ES5+ IIFE in `app.js` |
| Fonts | Inter (Google Fonts) |
| Hosting | GitHub Pages (static) |
| Theme | Dark, mobile-first |

Tailwind CDN is fine for a marketing/demo site. For heavier production traffic you can later switch to a built Tailwind CSS file without changing page structure.

---

## Disclaimer

HaulIntel demo content is **fictional sample data** for product demonstration. It is not legal, employment, financial, or safety advice. Always verify carrier information with official sources (including FMCSA SAFER/SMS), the actual employment or lease contract, and your own judgment.

---

## License

Use and modify freely for the HaulIntel / CarrierCheck AI project. Not affiliated with any trucking company named in sample data.
