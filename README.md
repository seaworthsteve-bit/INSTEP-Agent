# INSTEP-WFU Study Abroad Advisor

An embeddable AI chat widget that acts as a virtual study abroad advisor for the INSTEP-WFU London and Cambridge semester programs. It answers prospective and admitted students' questions about programs, courses, housing, visas, costs, and applying — grounded only in authorized INSTEP and WFU sources, and referring to human advisors when appropriate.

## What's in this package

| File | Purpose |
|---|---|
| `system-prompt.md` | The agent's instructions, scope, guardrails, and key facts. Edit this to change what the advisor knows or how it behaves. |
| `instep-advisor.html` | The self-contained chat widget (HTML/CSS/JS). Deploy this to your web host. |
| `server-proxy.js` | Node.js backend that holds your API key and proxies chat requests. Required so your key is never exposed in the browser. |
| `package.json` | Node dependencies for the backend. |
| `.env.example` | Template for environment variables (API keys, allowed origins). Copy to `.env` and fill in. |
| `embed-snippet.html` | Two ready-to-paste snippets (iframe or floating bubble) for embedding the widget on `instep-programs.org`. |
| `README.md` | This file. |

## Architecture

```
┌─────────────────────┐    ┌──────────────────────┐    ┌────────────────────┐
│  instep-advisor.html│───►│  server-proxy.js     │───►│  LLM API           │
│  (in user's browser)│    │  (your server)        │    │  (Perplexity /      │
│                     │◄───│  holds API key       │◄───│   OpenAI / Claude)  │
└─────────────────────┘    └──────────────────────┘    └────────────────────┘
        embedded on                  hosted at e.g.
        instep-programs.org         api.instep-programs.org
```

The proxy is essential: it keeps your secret API key on the server side and lets you restrict which domains can call it. Never put an API key in front-end HTML.

## Quick start (local test in ~5 minutes)

### 1. Install Node.js
You need Node 18 or newer: <https://nodejs.org/>

### 2. Install dependencies
Open a terminal in this folder and run:
```bash
npm install
```

### 3. Get an API key
Choose one provider:
- **Perplexity (recommended)** — best for grounded answers from the real INSTEP/WFU sites. Get a key at <https://www.perplexity.ai/settings/api>.
- **OpenAI** — <https://platform.openai.com/api-keys>
- **Anthropic (Claude)** — <https://console.anthropic.com/>

### 4. Configure environment
```bash
cp .env.example .env
```
Open `.env` and paste your API key into the matching field. Set `LLM_PROVIDER` to `perplexity`, `openai`, or `anthropic`.

### 5. Start the proxy
```bash
npm start
```
You should see: `INSTEP advisor proxy running on http://localhost:8787`

### 6. Open the widget
Open `instep-advisor.html` directly in your browser (double-click). Try a question like *"What's housing like in Cambridge?"*

If the widget says it can't reach the advisor service, the proxy isn't running or `apiEndpoint` in the HTML points somewhere else.

## Deploying to production

You have two pieces to deploy: the static widget HTML and the Node proxy.

### Deploy the widget HTML
Drop `instep-advisor.html` on any static host:
- Your existing `instep-programs.org` web host
- Netlify, Vercel, Cloudflare Pages (free tiers fine)
- AWS S3 + CloudFront

Before deploying, **either**:
- Edit the default `apiEndpoint` inside `instep-advisor.html` to your real proxy URL, OR
- Use the floating-bubble snippet in `embed-snippet.html`, which sets `window.INSTEP_API_ENDPOINT` on the host page (more flexible).

### Deploy the backend proxy
Any Node-friendly host works:
- **Render** (free tier) — push a git repo, set env vars in dashboard
- **Railway** — `railway up`
- **Fly.io** — `fly launch`
- **AWS Lambda + API Gateway** — wrap the Express app with `serverless-http`
- **Your own VPS** — `node server-proxy.js` behind nginx + a process manager like pm2

Make sure on the production proxy you set:
```
ALLOWED_ORIGINS=https://www.instep-programs.org,https://instep-programs.org
```
This blocks other sites from calling your proxy and burning your API credits.

### Embed on the INSTEP website
Open `embed-snippet.html`, copy **Option A** (inline iframe) or **Option B** (floating chat bubble), replace the placeholder URLs, and paste into the relevant INSTEP page templates (the program landing page, FAQ, application pages, etc.).

## Editing the agent

### Change what it says or knows
Edit `system-prompt.md`. The proxy reads this file on startup, so restart the proxy after edits. No code changes needed.

Useful tweaks:
- Add or remove key facts in the **KEY FACTS** section
- Tighten or loosen the **OUT OF SCOPE** policy
- Update **TYPICAL DEADLINES** each application cycle
- Update **CONTACTS** when staff change

### Change the look
Edit the `<style>` block at the top of `instep-advisor.html`. The CSS variables at the top (`--instep-primary`, `--instep-font`, etc.) make recolouring easy.

### Change the model
- Perplexity: change `model: "sonar"` to `sonar-pro` for deeper answers (higher cost).
- OpenAI: set `OPENAI_MODEL` in `.env` (e.g. `gpt-4o`, `gpt-4o-mini`).
- Anthropic: set `ANTHROPIC_MODEL` in `.env`.

### Add knowledge files
If you outgrow the system prompt, the next step is a small Retrieval-Augmented Generation (RAG) setup: chunk INSTEP handbooks / PDFs, embed them, and inject the most relevant chunks into each request. Happy to add that when you're ready.

## Cost expectations

For a back-of-the-envelope estimate:
- **Perplexity Sonar:** roughly $1 per 1,000 chat turns at typical lengths
- **OpenAI gpt-4o-mini:** roughly $0.50 per 1,000 chat turns
- **Anthropic Claude 3.5 Sonnet:** roughly $5 per 1,000 chat turns

Real-world advisor chat volume is small enough that even a busy program rarely sees more than a few dollars per month. Set a monthly cap with your provider as a safety net.

## Privacy notes

- The widget does not log or persist anything on its own. Conversation history exists only in the user's browser tab for the duration of their session.
- The backend proxy does not write logs by default. If you add logging later, do **not** log personally identifiable information.
- The system prompt instructs the advisor not to collect sensitive personal data and to redirect students to the secure WFU application portal.

## Support / next steps

When you want to make changes, you have three options:

1. **Edit `system-prompt.md` yourself** — most updates (deadlines, contacts, course notes) need nothing more than this.
2. **Edit the HTML/CSS directly** — for layout, color, or copy tweaks.
3. **Reopen the original Computer thread** where this was built — full context is preserved and small revisions are cheap.

For larger features (handbook RAG, multilingual support, analytics, sentiment monitoring, lead capture handoff to your CRM), open a new request and we can add them incrementally.
