const express = require("express");
const path = require("path");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}

app.use(session({
  name: "latitude_admin",
  secret: process.env.SESSION_SECRET || "local-development-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  setHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );
  }
}));

const allowedStatuses = new Set(["online", "updating", "offline"]);

let liveStatus = {
  status: allowedStatuses.has(String(process.env.SITE_STATUS || "online").toLowerCase())
    ? String(process.env.SITE_STATUS || "online").toLowerCase() : "online",
  message: String(process.env.STATUS_MESSAGE || "").slice(0, 160),
  updated: process.env.STATUS_UPDATED || null
};

function currentStatus() {
  return { ...liveStatus };
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// Simple per-IP login throttling to slow password guessing.
const loginAttempts = new Map();
app.post("/api/admin/login", (req, res) => {
  res.set("Cache-Control", "no-store");
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredPassword) return res.status(503).json({ error: "Admin password is not configured on the server" });
  const ip = req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  if (entry.blockedUntil > now) return res.status(429).json({ error: "Too many attempts. Try again later." });
  if (typeof req.body.password !== "string" || req.body.password !== configuredPassword) {
    entry.count += 1;
    if (entry.count >= 5) { entry.count = 0; entry.blockedUntil = now + 10 * 60 * 1000; }
    loginAttempts.set(ip, entry);
    return res.status(401).json({ error: "Incorrect password" });
  }
  loginAttempts.delete(ip);
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start admin session" });
    req.session.isAdmin = true;
    res.json({ ok: true });
  });
});

app.get("/api/admin/session", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ authenticated: req.session?.isAdmin === true });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.put("/api/admin/status", requireAdmin, (req, res) => {
  res.set("Cache-Control", "no-store");
  const status = typeof req.body.status === "string" ? req.body.status.toLowerCase() : "";
  const message = typeof req.body.message === "string" ? req.body.message.trim().slice(0, 160) : "";
  if (!allowedStatuses.has(status)) return res.status(400).json({ error: "Choose a valid status" });
  liveStatus = { status, message, updated: new Date().toISOString() };
  res.json({ ok: true, ...liveStatus });
});

app.get("/api/config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ discord: process.env.DISCORD_INVITE || "" });
});

app.get("/api/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(currentStatus());
});

let discordCache = { value: null, expiresAt: 0 };
app.get("/api/discord", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  const invite = process.env.DISCORD_INVITE || "";
  const match = /^https:\/\/(?:discord\.gg|discord\.com\/invite)\/([A-Za-z0-9-]+)\/?$/.exec(invite);

  if (!match) return res.json({ online: null, members: null });
  if (discordCache.value && Date.now() < discordCache.expiresAt) {
    return res.json(discordCache.value);
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/invites/${encodeURIComponent(match[1])}?with_counts=true`,
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) throw new Error(`Discord returned ${response.status}`);

    const data = await response.json();
    const value = {
      online: Number.isFinite(data.approximate_presence_count) ? data.approximate_presence_count : null,
      members: Number.isFinite(data.approximate_member_count) ? data.approximate_member_count : null
    };
    discordCache = { value, expiresAt: Date.now() + 60_000 };
    res.json(value);
  } catch {
    res.status(502).json({ error: "Discord stats temporarily unavailable" });
  }
});

app.get("/health", (_req, res) => res.status(200).send("ok"));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(__dirname, "public", "index.html"), err => {
    if (err) next(err);
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Latitude server listening on port ${PORT}`);
});
