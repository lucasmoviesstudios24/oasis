
import express from "express";
import path from "path";
import fs from "fs";
import serveStatic from "serve-static";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Where saves go on Render. For local dev we fall back to a writable path in the repo.
const SAVE_DIR = process.env.OASIS_SAVE_DIR || "/var/oasis-saves";
const DEV_SAVE_DIR = path.resolve("./.local-saves");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
ensureDir(fs.existsSync(SAVE_DIR) ? SAVE_DIR : DEV_SAVE_DIR);

// Static files
const publicDir = path.resolve("./public");
app.use(serveStatic(publicDir));

// Healthcheck
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Save: POST /api/save { slot: "slot1", data: { ... } }
app.post("/api/save", (req, res) => {
  const slot = (req.body.slot || "slot1").replace(/[^a-zA-Z0-9_-]/g, "");
  const data = req.body.data || {};
  const dir = fs.existsSync(SAVE_DIR) ? SAVE_DIR : DEV_SAVE_DIR;
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, `${slot}.json`), JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

// Load: GET /api/load?slot=slot1
app.get("/api/load", (req, res) => {
  const slot = (req.query.slot || "slot1").toString().replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = fs.existsSync(SAVE_DIR) ? SAVE_DIR : DEV_SAVE_DIR;
  const p = path.join(dir, `${slot}.json`);
  if (!fs.existsSync(p)) return res.json({ ok: true, data: null });
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Fallback to index
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

const port = process.env.PORT || 5173;
app.listen(port, () => console.log(`[Oasis] Server listening on http://localhost:${port}`));
