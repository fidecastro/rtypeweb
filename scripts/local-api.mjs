#!/usr/bin/env node
/**
 * Thin local Node runner for api/* handlers (no Vercel login required).
 * Also serves static files from the repo root so the game client can hit
 * same-origin /api/* during local play (register + score submit).
 * Usage: node scripts/local-api.mjs
 * Listens on PORT (default 3000).
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
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

/**
 * @param {string} urlPath
 * @returns {string | null} absolute file path or null if unsafe / missing
 */
function resolveStatic(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  // Prevent path traversal
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) return null;
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return null;
  return abs;
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
  const pathOnly = url.pathname.replace(/\/$/, "") || "/";
  const key = `${(req.method || "GET").toUpperCase()} ${pathOnly === "/" ? "/" : pathOnly}`;
  // Normalize: routes use no trailing slash; pathOnly already stripped
  const routeKey = `${(req.method || "GET").toUpperCase()} ${pathOnly}`;
  const handler = routes[routeKey] || routes[key];

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

  // Known API paths with wrong method
  const knownPaths = ["/api/register", "/api/score", "/api/leaderboard"];
  if (knownPaths.includes(pathOnly)) {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }));
    return;
  }

  // Static files (GET/HEAD only)
  if (req.method === "GET" || req.method === "HEAD") {
    const filePath = resolveStatic(url.pathname);
    if (filePath) {
      if (req.method === "HEAD") {
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
  console.log(`Local server listening on http://localhost:${PORT}`);
  console.log(`  Static: index.html, src/, public/`);
  console.log(`  POST /api/register`);
  console.log(`  POST /api/score`);
  console.log(`  GET  /api/leaderboard`);
  console.log(`DB: ${process.env.LIBSQL_URL || "file:./data/rtype.db (default)"}`);
});
