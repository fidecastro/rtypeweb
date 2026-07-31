# R-Type Web

Vanilla JavaScript shell for an R-Type-style browser game. Static site at the repo root, deployable on Vercel, with serverless API routes for player registration and score persistence.

## Requirements

- **Node.js 20+** (see `.nvmrc` and `package.json` `engines`)
- npm (comes with Node)

## Install

```bash
npm install
```

## Local run (menu UI + API)

Recommended same-origin setup (static menu + API on one port):

```bash
npm run api
```

Open [http://localhost:3000](http://localhost:3000).

**Expected result:** title screen with **Top Scores** (empty state or rows), main menu (**Title / Play / Register / High Scores**). Register saves a player to `localStorage` key `rtypeweb.player` (`id`, `nickname`, `email`). Play boots the canvas engine into `#game` (side-scrolling demo).

### Static only

```bash
npm start
# or: npm run dev
```

Serves files only (`serve`) — **no** `api/` handlers. Leaderboard/register will show an error state; the menu shell and Play engine still work.

### Split ports (loopback only)

If the API runs on another **localhost** origin, set once:

```js
localStorage.setItem('rtypeweb.apiBase', 'http://localhost:3000')
```

or open `http://localhost:PORT/?apiBase=http://localhost:3000`.

Only loopback hosts (`localhost`, `127.0.0.1`, `::1`) are accepted; remote `?apiBase=` values are ignored and not stored.

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

Without Vercel login, `npm run api` runs `scripts/local-api.mjs`: **API routes plus static files** on `PORT` (default 3000), so the menu UI can call relative `/api/*`.

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
├── index.html              # Title screen / main menu shell + canvas
├── src/
│   ├── main.js             # Views: home, register, scores, play (engine)
│   ├── api.js              # fetch helpers (relative /api, loopback apiBase)
│   ├── player.js           # localStorage player identity
│   ├── styles.css          # Retro menu styling
│   ├── engine/             # Fixed-timestep loop, input, camera, entities
│   └── scenes/             # menu / playing / gameover stubs
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
│   ├── local-api.mjs       # Local static (allowlisted) + api/* server
│   └── smoke-api.mjs       # HTTP smoke verification
├── data/                   # Local SQLite DB (gitignored; not served statically)
├── vercel.json
├── package.json
├── .env.example
├── .nvmrc                  # Node 20
└── README.md
```

Runtime asset URLs (when serving from repo root) use paths like `/public/assets/sprites/...`.

## Menu UI notes

| View | Route hash | Behavior |
|------|------------|----------|
| Title / home | `#/` | Loads `GET /api/leaderboard`; empty or top 10; menu stays usable on error |
| Register | `#/register` | `POST /api/register` → `localStorage` `rtypeweb.player` |
| High scores | `#/scores` | Full leaderboard + refresh |
| Play | `#/play` | Boots canvas engine into `#game` (side-scrolling demo) |

### Scroll convention

Player faces / advances **+X (right)**. Camera `x` increases as the playfield streams past; see `src/engine/camera.js`.

Auth (passwords/OAuth) and full combat/HUD polish are out of scope for this slice.

## Deploy to Vercel

1. Import this Git repository (or `vercel` / `vercel --prod` from the CLI).
2. **Root Directory:** repository root. **Framework Preset:** Other / no framework.
3. Set environment variables: `LIBSQL_URL`, `LIBSQL_AUTH_TOKEN` (Turso/libSQL).
4. Deploy. Static files are served from the root; `api/*.js` become serverless functions.

### Production limitation

Without `LIBSQL_URL`, handlers fall back to a local file path. That is fine for `npm run api` on a developer machine; on Vercel it will **not** give a stable shared leaderboard across invocations. Always configure a remote libSQL database for production.

## Notes

- No bundler or SPA framework is required.
- Game logic lives under `src/`.
- Public media and data live under `public/assets/`.
- Later missions submit scores with the stored `playerId` (`rtypeweb.player.id`).
