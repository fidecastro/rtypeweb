#!/usr/bin/env node
/**
 * Local Node runner for api/* handlers + static files (no Vercel login).
 * Usage: node scripts/local-api.mjs
 * Listens on PORT (default 3000). Serves only index.html, /src/*, /public/*
 * so the menu UI and API share the same origin for browser walkthroughs.
 * Paths outside that allowlist (e.g. /data/*.db, /api source, node_modules)
 * return 404.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";
import register from "../api/register.js";
import score from "../api/score.js";
import leaderboard from "../api/leaderboard.js";

const PORT = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const routes = {
  "POST /api/register": register,
  "POST /api/score": score,
  "GET /api/leaderboard": leaderboard,
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Whether a path relative to ROOT is allowed as a static asset.
 * Allowlist: index.html at root, anything under src/, anything under public/.
 * @param {string} relFromRoot posix-ish relative path (no leading slash)
 */
function isAllowedStatic(relFromRoot) {
  if (!relFromRoot || relFromRoot === ".") return false;
  // normalize separators for windows-safety; repo is linux in CI
  const rel = relFromRoot.split(path.sep).join("/");
  if (rel === "index.html") return true;
  if (rel.startsWith("src/") && rel !== "src/") return true;
  if (rel.startsWith("public/") && rel !== "public/") return true;
  return false;
}

/**
 * @param {string} urlPath
 * @returns {string | null} absolute file path or null if unsafe / missing / denied
 */
function resolveStatic(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  let rel = decoded.split("?")[0];
  if (rel.includes("\0")) return null;
  // strip leading slashes so path.join keeps ROOT as base (POSIX)
  rel = rel.replace(/^\/+/, "");
  if (!rel) rel = "index.html";

  const abs = path.normalize(path.join(ROOT, rel));
  const relFromRoot = path.relative(ROOT, abs);
  if (relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) return null;

  try {
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      const index = path.join(abs, "index.html");
      if (fs.existsSync(index) && fs.statSync(index).isFile()) {
        const indexRel = path.relative(ROOT, index);
        if (!isAllowedStatic(indexRel)) return null;
        return index;
      }
      return null;
    }
    if (st.isFile()) {
      if (!isAllowedStatic(relFromRoot)) return null;
      return abs;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {import("http").ServerResponse} res
 * @param {string} filePath
 */
function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", type);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/$/, "") || "/";
  const method = (req.method || "GET").toUpperCase();
  const key = `${method} ${pathname}`;
  const handler = routes[key];

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (handler) {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Internal server error", code: "INTERNAL_ERROR" }));
      }
    }
    return;
  }

  // method not allowed for known API paths
  const knownPaths = ["/api/register", "/api/score", "/api/leaderboard"];
  if (knownPaths.includes(pathname)) {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }));
    return;
  }

  // Static files for menu UI (GET/HEAD only) — allowlisted roots only
  if (method === "GET" || method === "HEAD") {
    const filePath = resolveStatic(url.pathname);
    if (filePath) {
      if (method === "HEAD") {
        const ext = path.extname(filePath).toLowerCase();
        res.statusCode = 200;
        res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
        res.end();
        return;
      }
      sendFile(res, filePath);
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "Not found", code: "NOT_FOUND" }));
});

server.listen(PORT, () => {
  console.log(`Local app + API listening on http://localhost:${PORT}`);
  console.log(`  Static (allowlist): index.html, /src/*, /public/*`);
  console.log(`  POST /api/register`);
  console.log(`  POST /api/score`);
  console.log(`  GET  /api/leaderboard`);
  console.log(`DB: ${process.env.LIBSQL_URL || "file:./data/rtype.db (default)"}`);
});
