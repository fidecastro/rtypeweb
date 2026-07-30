# R-Type Web

Vanilla JavaScript shell for an R-Type-style browser game. Static site at the repo root, deployable on Vercel, with a modular side-scrolling engine under `src/engine/`.

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

**Expected result:** canvas game view boots into **Playing**. The world auto-scrolls right (content moves left on screen — R-Type rightward advance). **WASD / arrows** move the green player rect; colliding with the red obstacle transitions to **game over** (Space retries). Purple enemy rects stream from the right and despawn off-screen. No console errors.

### Scroll convention

Player faces / advances **+X (right)**. Camera `x` increases as the playfield streams past; see the table in `src/engine/camera.js`.

## Project layout

```
.
├── index.html              # Static entry + canvas
├── src/
│   ├── main.js             # Boot: canvas, Input, Game, Loop
│   ├── engine/
│   │   ├── loop.js         # Fixed-timestep rAF loop
│   │   ├── input.js        # Keyboard + simple touch
│   │   ├── camera.js       # World scroll / transforms
│   │   ├── entity.js       # Entity + EntityList
│   │   ├── collision.js    # AABB helpers
│   │   └── game.js         # Scene state machine
│   └── scenes/
│       ├── menu.js
│       ├── playing.js      # Demo: player, obstacle, scroll
│       └── gameover.js
├── public/
│   └── assets/
│       ├── sprites/
│       ├── audio/
│       └── data/
├── api/                    # Optional Vercel serverless functions
├── vercel.json
├── package.json
├── .nvmrc
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
- Game logic lives under `src/` (engine + scenes).
- Public media and data live under `public/assets/`.
- Future score or other backends can use `api/*.js` (or TypeScript) as Vercel serverless functions.
