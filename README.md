# R-Type Web

Vanilla JavaScript shell for an R-Type-style browser game. Static site at the repo root, deployable on Vercel, with room for public assets and optional serverless API routes.

## Requirements

- **Node.js 20+** (see `.nvmrc` and `package.json` `engines`)
- npm (comes with Node)

## Install

```bash
npm install
```

## Local run

```bash
npm start
# or: npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Expected result:** page title **R-Type Web**, heading **R-Type Web — shell**, status **Shell ready.** No console errors from the shell.

## Project layout

```
.
├── index.html              # Static entry
├── src/
│   └── main.js             # ES module entry (game code goes here later)
├── public/
│   └── assets/
│       ├── sprites/        # Sprite images
│       ├── audio/          # Sound / music
│       └── data/           # Level / config data
├── api/                    # Optional Vercel serverless functions (empty for now)
├── vercel.json             # Vercel static + clean URLs
├── package.json
├── .nvmrc                  # Node 20
└── README.md
```

Runtime asset URLs (when serving from repo root) use paths like `/public/assets/sprites/...`.

## Deploy to Vercel

Mechanical readiness: root `vercel.json`, no framework build step. Static files at the repo root are served; files under `api/` become serverless functions by Vercel convention when you add them later.

### CLI

```bash
# optional global install, or use npx
npm i -g vercel
# or: npx vercel

# from repo root
vercel          # preview
vercel --prod   # production
```

### Dashboard

1. Import this Git repository in the Vercel dashboard.
2. **Root Directory:** repository root (default).
3. **Framework Preset:** Other / no framework.
4. Deploy.

## Notes

- No bundler or SPA framework is required.
- Game logic lives under `src/`.
- Public media and data live under `public/assets/`.
- Future score or other backends can use `api/*.js` (or TypeScript) as Vercel serverless functions.
