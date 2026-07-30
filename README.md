# R-Type Web

Vanilla JavaScript shell for an R-Type-style browser game. Static site at the repo root, deployable on Vercel, with a modular side-scrolling engine under `src/engine/` and serverless API routes for player registration and score persistence.

## Requirements

- **Node.js 20+** (see `.nvmrc` and `package.json` `engines`)
- npm (comes with Node)

## Install

```bash
npm install
```

## Local run (static shell)

```bash
npm start
# or: npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Expected result:** canvas boots into **Menu**. Register (optional) via the form under the canvas, then **Space / Enter** to play. The world auto-scrolls right (R-Type rightward advance). **WASD / arrows** move the green ship; **Space** fires cyan projectiles (rate-limited). Health gauge and score are on the HUD. Hazards (red obstacle, purple enemies) deal damage with a short invulnerability window; at 0 HP → **Game Over** with final score. **Space** retries; **Esc / M** returns to menu. Debug keys while playing: **H** = take 1 damage, **G** = +100 score.

### Scroll convention

Player faces / advances **+X (right)**. Camera `x` increases as the playfield streams past; see the table in `src/engine/camera.js`.

### Full local play (game + API)

`npm start` serves static files only (`serve`) and does **not** run `api/` handlers. For register + score submit from the browser, use the local API runner (now also serves static):

```bash
npm run api
# open http://localhost:3000
```

Or `npm run dev:vercel` if you prefer the Vercel CLI.

### Game module smoke

```bash
npm run smoke:game
```

## Player / score API

HTTP JSON API for register → submit score → top-10 leaderboard.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/register` | Register or return existing player (nickname + email) |
| `POST` | `/api/score` | Submit a score for a registered player |
| `GET` | `/api/leaderboard` | Top 10 scores with nicknames |

### Storage

- **Local:** SQLite-compatible file via [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts). Default path: `data/rtype.db` (gitignored). Created on first request.
- **Production (Vercel):** set **`LIBSQL_URL`** (and usually **`LIBSQL_AUTH_TOKEN`**) to a remote [Turso](https://turso.tech/) / libSQL database. The serverless filesystem is ephemeral — a local `file:` DB **does not** persist across instances in production.

Copy `.env.example` and set:

```bash
LIBSQL_URL=libsql://your-db-name-org.turso.io
LIBSQL_AUTH_TOKEN=...
```

### Validation

**Register**

- `nickname`: string, trim, length 1–32
- `email`: string, trim, lowercased, basic plausible pattern (`local@domain.tld`), max 254
- Identity conflict (nickname taken with different email, or vice versa) → **409** `{ "error", "code": "IDENTITY_CONFLICT" }`
- Same nickname + same email → **200** existing player (idempotent)
- New player → **201**

**Score**

- Body: `{ "playerId": "<uuid>", "value": <integer ≥ 0> }`
- Unknown player → **404** `{ "code": "PLAYER_NOT_FOUND" }`
- Non-integer / negative / string value → **400**

**Leaderboard**

- Ordering: `value` DESC, then `createdAt` ASC (earlier submission wins ties), then score `id` ASC
- Empty store → **200** `{ "scores": [] }`
- At most 10 entries; each has `rank`, `nickname`, `value`, `createdAt`

Error shape:

```json
{ "error": "human-readable message", "code": "VALIDATION_ERROR" }
```

### Local API server

Without Vercel login:

```bash
npm run api
# listens on PORT (default 3000)
```

Or with the Vercel CLI (matches production routing more closely):

```bash
npm run dev:vercel
# may prompt for login on first use
```

### Example flow (curl)

```bash
export API_BASE=http://localhost:3000

# register
curl -sS -X POST "$API_BASE/api/register" \
  -H 'content-type: application/json' \
  -d '{"nickname":"Ace","email":"ace@example.com"}'
# → { "id":"…", "nickname":"Ace", "email":"ace@example.com", … }

# submit score (use returned id)
curl -sS -X POST "$API_BASE/api/score" \
  -H 'content-type: application/json' \
  -d '{"playerId":"<id>","value":5000}'

# top 10
curl -sS "$API_BASE/api/leaderboard"
# → { "scores": [ { "rank":1, "nickname":"Ace", "value":5000, "createdAt":"…" } ] }
```

### Smoke tests

With the API listening:

```bash
API_BASE=http://localhost:3000 npm run smoke
```

Covers register, re-register, conflict, scores, leaderboard order, invalid inputs, missing player, and tie-break.

## Project layout

```
.
├── index.html              # Static entry + canvas + register form
├── src/
│   ├── main.js             # Boot: canvas, Input, Game, Loop, runState
│   ├── engine/
│   │   ├── loop.js         # Fixed-timestep rAF loop
│   │   ├── input.js        # Keyboard + simple touch
│   │   ├── camera.js       # World scroll / transforms
│   │   ├── entity.js       # Entity + EntityList
│   │   ├── collision.js    # AABB helpers
│   │   └── game.js         # Scene state machine
│   ├── game/
│   │   ├── player.js       # Ship movement, HP, fire cooldown
│   │   ├── score.js        # Per-run score API
│   │   └── apiClient.js    # register / submitScore + localStorage
│   └── scenes/
│       ├── menu.js         # Start + optional register
│       ├── playing.js      # Play loop: combat, HUD, hazards
│       └── gameover.js     # Final score, submit, menu / retry
├── public/
│   └── assets/
│       ├── sprites/        # Sprite images
│       ├── audio/          # Sound / music
│       └── data/           # Level / config data
├── api/                    # Vercel serverless functions
│   ├── register.js         # POST /api/register
│   ├── score.js            # POST /api/score
│   └── leaderboard.js      # GET /api/leaderboard
├── lib/                    # Shared DB + validation
│   ├── db.js
│   ├── validate.js
│   └── http.js
├── scripts/
│   ├── local-api.mjs       # Local HTTP: api/* + static files
│   ├── smoke-api.mjs       # HTTP smoke verification
│   └── smoke-game.mjs      # Client game-module smoke
├── data/                   # Local SQLite DB (gitignored)
├── vercel.json
├── package.json
├── .env.example
├── .nvmrc                  # Node 20
└── README.md
```

Runtime asset URLs (when serving from repo root) use paths like `/public/assets/sprites/...`.

## Deploy to Vercel

1. Import this Git repository (or `vercel` / `vercel --prod` from the CLI).
2. **Root Directory:** repository root. **Framework Preset:** Other / no framework.
3. Set environment variables: `LIBSQL_URL`, `LIBSQL_AUTH_TOKEN` (Turso/libSQL).
4. Deploy. Static files are served from the root; `api/*.js` become serverless functions.

### Production limitation

Without `LIBSQL_URL`, handlers fall back to a local file path. That is fine for `npm run api` on a developer machine; on Vercel it will **not** give a stable shared leaderboard across invocations. Always configure a remote libSQL database for production.

## Notes

- No bundler or SPA framework is required.
- Game logic lives under `src/` (engine + scenes).
- Public media and data live under `public/assets/`.
- Auth (passwords/OAuth) is out of scope; the menu stores `{ playerId, nickname }` in `localStorage` (`rtypeweb.player`) after register so game over can `POST /api/score`.
- Enemy systems can call `player.takeDamage(n)` and `score.add(points)` without importing scenes.
