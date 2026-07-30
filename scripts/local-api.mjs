#!/usr/bin/env node
/**
 * Thin local Node runner for api/* handlers (no Vercel login required).
 * Usage: node scripts/local-api.mjs
 * Listens on PORT (default 3000).
 */
import http from "node:http";
import { URL } from "node:url";
import register from "../api/register.js";
import score from "../api/score.js";
import leaderboard from "../api/leaderboard.js";

const PORT = Number(process.env.PORT || 3000);

const routes = {
  "POST /api/register": register,
  "POST /api/score": score,
  "GET /api/leaderboard": leaderboard,
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const key = `${(req.method || "GET").toUpperCase()} ${url.pathname.replace(/\/$/, "") || "/"}`;
  // allow trailing-slash-free match; also try without method for 405 detection
  const handler = routes[key];

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!handler) {
    // method not allowed for known path
    const pathOnly = url.pathname.replace(/\/$/, "") || "/";
    const knownPaths = ["/api/register", "/api/score", "/api/leaderboard"];
    if (knownPaths.includes(pathOnly)) {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }));
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found", code: "NOT_FOUND" }));
    return;
  }

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
});

server.listen(PORT, () => {
  console.log(`Local API listening on http://localhost:${PORT}`);
  console.log(`  POST /api/register`);
  console.log(`  POST /api/score`);
  console.log(`  GET  /api/leaderboard`);
  console.log(`DB: ${process.env.LIBSQL_URL || "file:./data/rtype.db (default)"}`);
});
