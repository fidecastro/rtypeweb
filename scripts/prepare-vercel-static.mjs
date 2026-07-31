#!/usr/bin/env node
/**
 * Assemble static files for Vercel (index.html + /src + /public).
 *
 * Zero-config detection treats a root `public/` folder as the only static
 * output, which drops the menu shell and ES modules. This script copies the
 * full client surface into `dist/` so `outputDirectory` can ship a playable app
 * alongside `api/*` serverless functions.
 *
 * Run: node scripts/prepare-vercel-static.mjs
 * Invoked by: npm run build (Vercel buildCommand)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

/**
 * @param {string} dir
 */
function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === "node_modules" || name === ".git") continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  rmrf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  const indexSrc = path.join(ROOT, "index.html");
  if (!fs.existsSync(indexSrc)) {
    console.error("prepare-vercel-static: missing index.html");
    process.exit(1);
  }
  fs.copyFileSync(indexSrc, path.join(DIST, "index.html"));

  const srcDir = path.join(ROOT, "src");
  if (!fs.existsSync(srcDir)) {
    console.error("prepare-vercel-static: missing src/");
    process.exit(1);
  }
  copyRecursive(srcDir, path.join(DIST, "src"));

  const publicDir = path.join(ROOT, "public");
  if (fs.existsSync(publicDir)) {
    // Keep URL paths /public/assets/... that local-api and the game use.
    copyRecursive(publicDir, path.join(DIST, "public"));
  }

  // Lightweight sanity check so a broken copy fails the Vercel build.
  const required = [
    "index.html",
    "src/main.js",
    "src/styles.css",
    "public/assets/data/stages.json",
  ];
  for (const rel of required) {
    const p = path.join(DIST, rel);
    if (!fs.existsSync(p)) {
      console.error(`prepare-vercel-static: missing required ${rel}`);
      process.exit(1);
    }
  }

  console.log(`prepare-vercel-static: wrote ${DIST}`);
  for (const rel of required) {
    console.log(`  ok  ${rel}`);
  }
}

main();
