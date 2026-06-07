/**
 * INSTEP-WFU Study Abroad Advisor — Backend Proxy
 *
 * Purpose: keep your LLM API key OFF the public webpage by proxying chat
 * requests through your own server. The browser widget calls THIS server;
 * THIS server calls Perplexity / OpenAI / Anthropic with your secret key.
 *
 * Stack: Node.js + Express (zero exotic dependencies).
 *
 * Quick start:
 *   1. npm init -y
 *   2. npm install express cors node-fetch dotenv
 *   3. Create a .env file (see .env.example)
 *   4. node server-proxy.js
 *   5. Server runs on http://localhost:8787
 *
 * Provider switch: set LLM_PROVIDER in .env to one of:
 *   - "perplexity"  (recommended — use Sonar models with built-in web grounding)
 *   - "openai"
 *   - "anthropic"
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// node-fetch v3 is ESM; use dynamic import for compatibility.
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 8787;
const PROVIDER = (process.env.LLM_PROVIDER || "perplexity").toLowerCase();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());

// Load system prompt from sibling file so you can edit prompt without
// redeploying server code.
const SYSTEM_PROMPT_PATH = path.join(__dirname, "system-prompt.md");
const SYSTEM_PROMPT = fs.existsSync(SYSTEM_PROMPT_PATH)
  ? fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8")
  : "You are the INSTEP-WFU Study Abroad Advisor.";

// Allowed source domains the model should ground its answers in (Perplexity Sonar)
const SEARCH_DOMAINS = [
  "instep-programs.org",
  "studyabroad.wfu.edu",
  "wfu.edu",
  "travel.state.gov",
  "gov.uk",
  "geo-blue.com",
];

// ---------------------------------------------------------------------------
// APP
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(
  cors({
    origin: ALLOWED_ORIGINS.includes("*") ? true : ALLOWED_ORIGINS,
    methods: ["POST", "GET", "OPTIONS"],
  })
);

// Simple in-memory rate limit (per IP). For production, use redis or a proper
// limiter; this just prevents accidental hammering during testing.
const HITS = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60_000;
  const max = 30;
  const arr = (HITS.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  HITS.set(ip, arr);
  if (arr.length > max) return res.status(429).json({ error: "Too many requests, slow down." });
  next();
}

// ---------------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: PROVIDER });
});

// ---------------------------------------------------------------------------
// CHAT ENDPOINT
// ---------------------------------------------------------------------------
app.post("/api/chat", rateLimit, async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' (string)." });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-24)
      : [];

    let reply;
    switch (PROVIDER) {
      case "perplexity":
        reply = await callPerplexity(message, safeHistory);
        break;
      case "openai":
        reply = await callOpenAI(message, safeHistory);
        break;
      case "anthropic":
        reply = await callAnthropic(message, safeHistory);
        break;
      default:
        return res.status(500).json({ error: `Unknown LLM_PROVIDER: ${PROVIDER}` });
    }

    res.json({ reply });
  } catch (err) {
    console.error("[/api/chat] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// PROVIDER: PERPLEXITY (Sonar — has built-in web search, ideal for grounding)
// ---------------------------------------------------------------------------
async function callPerplexity(message, history) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");

  const body = {
    model: "sonar",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message },
    ],
    // Restrict web search to authorized sources only
    search_domain_filter: SEARCH_DOMAINS,
    temperature: 0.3,
    max_tokens: 800,
  };

  const r = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Perplexity API ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content || "(no response)";
}

// ---------------------------------------------------------------------------
// PROVIDER: OPENAI
// ---------------------------------------------------------------------------
async function callOpenAI(message, history) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const body = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message },
    ],
    temperature: 0.3,
    max_tokens: 800,
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OpenAI API ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content || "(no response)";
}

// ---------------------------------------------------------------------------
// PROVIDER: ANTHROPIC (Claude)
// ---------------------------------------------------------------------------
async function callAnthropic(message, history) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const body = {
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
    system: SYSTEM_PROMPT,
    messages: [...history, { role: "user", content: message }],
    max_tokens: 800,
    temperature: 0.3,
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Anthropic API ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.content?.[0]?.text || "(no response)";
}

// ---------------------------------------------------------------------------
// START
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`INSTEP advisor proxy running on http://localhost:${PORT}`);
  console.log(`Provider: ${PROVIDER}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
