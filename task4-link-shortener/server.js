// Task 4: Link Shortener (Node.js + Express + SQLite)
// Features: short link creation (random or custom alias), redirects, click analytics.
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const RESERVED = new Set(["api", "static", "favicon.ico", "index.html"]);
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createApp(dbPath = path.join(__dirname, "links.db")) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT NOT NULL UNIQUE,
      url        TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS clicks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id    INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
      clicked_at TEXT NOT NULL DEFAULT (datetime('now')),
      referrer   TEXT NOT NULL DEFAULT 'direct'
    );
  `);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  const baseUrl = (req) => `${req.protocol}://${req.get("host")}`;

  function randomCode(length = 6) {
    let code = "";
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
    return code;
  }

  function isValidUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  // Create a short link
  app.post("/api/shorten", (req, res) => {
    const url = String(req.body?.url ?? "").trim();
    const alias = String(req.body?.alias ?? "").trim();

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: "Enter a valid URL starting with http:// or https://" });
    }

    let code = alias;
    if (alias) {
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(alias)) {
        return res.status(400).json({ error: "Alias must be 3 to 20 letters, numbers, - or _." });
      }
      if (RESERVED.has(alias.toLowerCase())) {
        return res.status(400).json({ error: "That alias is reserved." });
      }
    } else {
      do {
        code = randomCode();
      } while (db.prepare("SELECT 1 FROM links WHERE code = ?").get(code));
    }

    try {
      db.prepare("INSERT INTO links (code, url) VALUES (?, ?)").run(code, url);
    } catch (err) {
      if (String(err.message).includes("UNIQUE")) {
        return res.status(409).json({ error: "That alias is already in use." });
      }
      throw err;
    }
    res.status(201).json({ code, url, shortUrl: `${baseUrl(req)}/${code}` });
  });

  // List links with click totals
  app.get("/api/links", (req, res) => {
    const rows = db
      .prepare(
        `SELECT l.code, l.url, l.created_at AS createdAt, COUNT(c.id) AS clicks
         FROM links l LEFT JOIN clicks c ON c.link_id = l.id
         GROUP BY l.id ORDER BY l.id DESC`
      )
      .all();
    res.json(rows.map((r) => ({ ...r, shortUrl: `${baseUrl(req)}/${r.code}` })));
  });

  // Analytics for one link
  app.get("/api/links/:code/analytics", (req, res) => {
    const link = db.prepare("SELECT id, code, url, created_at FROM links WHERE code = ?").get(req.params.code);
    if (!link) return res.status(404).json({ error: "Link not found." });

    const total = db.prepare("SELECT COUNT(*) AS n FROM clicks WHERE link_id = ?").get(link.id).n;
    const last = db.prepare("SELECT MAX(clicked_at) AS t FROM clicks WHERE link_id = ?").get(link.id).t;
    const byDayRows = db
      .prepare(
        `SELECT date(clicked_at) AS day, COUNT(*) AS clicks FROM clicks
         WHERE link_id = ? AND date(clicked_at) >= date('now', '-6 days')
         GROUP BY day`
      )
      .all(link.id);
    const referrers = db
      .prepare(
        `SELECT referrer, COUNT(*) AS clicks FROM clicks WHERE link_id = ?
         GROUP BY referrer ORDER BY clicks DESC LIMIT 5`
      )
      .all(link.id);

    // Fill the last 7 days, including days with zero clicks
    const map = new Map(byDayRows.map((r) => [r.day, r.clicks]));
    const lastSevenDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      lastSevenDays.push({ day: d, clicks: map.get(d) ?? 0 });
    }

    res.json({
      code: link.code,
      url: link.url,
      createdAt: link.created_at,
      totalClicks: total,
      lastClickedAt: last,
      lastSevenDays,
      topReferrers: referrers,
    });
  });

  // Delete a link
  app.delete("/api/links/:code", (req, res) => {
    const link = db.prepare("SELECT id FROM links WHERE code = ?").get(req.params.code);
    if (!link) return res.status(404).json({ error: "Link not found." });
    db.prepare("DELETE FROM clicks WHERE link_id = ?").run(link.id);
    db.prepare("DELETE FROM links WHERE id = ?").run(link.id);
    res.json({ ok: true });
  });

  // Redirect and record the click
  app.get("/:code", (req, res) => {
    const link = db.prepare("SELECT id, url FROM links WHERE code = ?").get(req.params.code);
    if (!link) {
      return res.status(404).send("<h1>404</h1><p>Short link not found.</p><a href='/'>Go home</a>");
    }
    let referrer = "direct";
    const ref = req.get("referer");
    if (ref) {
      try {
        referrer = new URL(ref).host || "direct";
      } catch {
        referrer = "direct";
      }
    }
    db.prepare("INSERT INTO clicks (link_id, referrer) VALUES (?, ?)").run(link.id, referrer);
    res.redirect(302, link.url);
  });

  app.close = () => db.close();
  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Link Shortener running at http://localhost:${port}`));
}
