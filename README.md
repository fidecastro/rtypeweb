# R-Type Web

Vanilla JavaScript shell for an R-Type-style browser game. Static site at the repo root, deployable on Vercel, with serverless API routes for player registration and score persistence.

## Requirements

- **Node.js 24.x** (see `.nvmrc` and `package.json` `engines`; required for Vercel builds)
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

**Expected result:** title screen with **Top Scores** (empty state or rows), main menu (**Title / Play / Register / High Scores**). Register saves a player to `localStorage` key `rtypeweb.player` (`id`, `nickname`, `email`). Play boots the canvas engine into `#game` with combat: 16-bit-style ship/enemy/boss sprites, layered parallax background, combat VFX (muzzle flash, hit sparks, explosions, light screen shake), clamped ship, primary fire, health gauge, score HUD, multi-phase enemy waves / hazards (from `public/assets/data/stages.json`), phase label on the HUD, and game-over score submit when registered.

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

### Play controls

- **WASD / arrows** — move (clamped to the camera view band)
- **Space / Enter** — fire (rate-limited) / confirm on game over
- **Esc / M** — from game over, return to title menu (waits for in-flight score submit so home top 10 can refresh with the new score)
- **H** — debug: take 1 damage · **G** — debug: +100 score · **B** — debug: skip to current phase boss
- **1 / 2 / 3 / 4** — debug: force-spawn Tri-beam / Overdrive / Aegis / Surge pickups near the ship
- Touch: left half steer, right half fire

Health bar, power-up status, score, and **phase label** are drawn on the play HUD. A run advances through multiple phases (Approach → Intercept → Assault) with rising scroll speed and denser spawns. Each phase ends in a **multi-phase boss** (Harvester → Interceptor → Overmind): telegraphed attacks, multi-hit HP, substantial score on defeat, then phase clear / next phase. Beating the final boss **stages clears** the run; boss contact and hazard shots can kill the player (normal invuln window). Enemy kinds include straight flyers, sine movers, and aimers (contact + hazard shots). Terrain hazards (blocks, spikes, zones) deal damage; at 0 HP → game over. Trash units tagged `enemy` award score on one-shot kills and may drop power-ups; bosses require multiple hits.

### Registered vs unregistered play

| State | Play | Game over score |
|-------|------|-----------------|
| **Registered** (`localStorage` `rtypeweb.player` with `id`) | Full combat | `POST /api/score` with `{ playerId, value }`; status shows *Score saved as …* or *Submit failed: …* (API / network) |
| **Portal handoff** (verified `portalToken` on load) | Same as registered — profile saved without the Register form | Same as registered (shared Turso `players` row) |
| **Unregistered** (no profile) | Allowed — no gate | Score is **not** submitted; status *Not registered — score not submitted* |

Home and High Scores always **re-fetch** `GET /api/leaderboard` when those views are shown (including Esc/M back to title after a run).

### Portal auth handoff (shared Turso)

When a player opens this game from the [web games portal](https://github.com/fidecastro/webgamesportal) **Play** link, the portal adds handoff query params:

| Param | Meaning |
|-------|---------|
| `portalToken` | Short-lived HMAC handoff token (required to inherit identity) |
| `portalPlayerId` | Shared `players.id` (informational — **not** trusted alone) |
| `portalNickname` | Shared nickname (informational) |
| `portalEmail` | Shared email (informational) |

On boot, `src/portalHandoff.js` verifies the token against the portal:

```
GET {portalBase}/api/auth/verify?token=<portalToken>
```

On success, the live player from the verify response is stored under `localStorage` key `rtypeweb.player` (`{ id, nickname, email }`) — the same shape as Register. The badge shows *Playing as …* and game-over score submit works without the in-game form.

**Portal origin (`portalBase`):**

1. Query override: `?portalBase=https://…` (http/https only; non-loopback HTTPS allowed — unlike `apiBase`)
2. Else `localStorage` key `rtypeweb.portalBase` if a valid override was stored
3. Else production default: `https://webgamesportal.vercel.app`

Handoff query params (including `portalToken` and `portalBase`) are stripped from the address bar after consume via `history.replaceState`, preserving hash routes and unrelated params such as `apiBase`.

If verify fails (network, expired/invalid token), the game does **not** adopt raw query identity; any existing local profile is left alone, Register remains available, and a non-blocking status message is shown.

**Standalone visits** (no `portalToken`) keep today’s flow: optional Register, unregistered play allowed.

#### Shared database (ops)

Production `LIBSQL_URL` / `LIBSQL_AUTH_TOKEN` must match the portal’s so portal-created `players` rows are visible to `POST /api/score`. Divergent databases yield verify success but score **404 PLAYER_NOT_FOUND**. See `.env.example`.

#### Local dual-server check

1. Portal on `:3000` and this game on another port (or same machine with shared `LIBSQL_*` / copied player row).
2. Sign in on the portal, click **Play** (or copy the launch URL), rewrite the game host to your local origin and add `portalBase=http://localhost:3000` if needed.
3. Expect: badge *Playing as …*; `localStorage.rtypeweb.player` matches verify; Play → game over → score submit **200** when the game DB contains that player.

### API down / static-only

With `npm start` (no API) or a stopped server: title/scores show an error state (*Could not load leaderboard* / network message); register shows a network/API error; **Play still boots** and combat works. Game over for a registered player shows *Submit failed: …* when the score POST cannot reach the API.

Stage / wave data: **`/public/assets/data/stages.json`** (timeline events + per-phase `boss` id). The engine falls back to an in-code default script if the file cannot be loaded.

### Audio

Procedural 16-bit-style SFX and looping menu/stage music via the Web Audio API (`src/audio.js`). Audio unlocks on the first click/keypress (browser autoplay policy). Use **Sound: On/Off** in the header to mute; preference is stored in `localStorage` key `rtypeweb.audio.muted` (`"1"` / `"0"`). Missing or failed audio never blocks gameplay.

### Power-ups

Original combat upgrades (not copyrighted R-Type assets). Pickups drop from defeated enemies (~30%) and one scripted Tri-beam appears early in each run. Colors differ per type; collecting shows a brief **GOT [NAME]** toast.

| Key | Id | Name | Effect |
|-----|-----|------|--------|
| `1` | `spread` | **Tri-beam** | Primary fire launches 3 projectiles (center + ±12°) |
| `2` | `rapid` | **Overdrive** | Fire cooldown ×0.45 (faster single stream) |
| `3` | `aegis` | **Aegis shell** | +1 absorb charge (next hazard hit negated + brief invuln so one contact = one charge); orbiting squares show charges |
| `4` | `surge` | **Surge thrusters** | Move speed ×1.45 for 12s |

**Stacking / replacement rules** (also documented in `src/game/powerups.js`):

1. **Weapon modes** (`spread` / `rapid`) are mutually exclusive — collecting one **replaces** the other. Default is base single-shot / normal cooldown. Not timed.
2. **Aegis** is independent of weapon mode. Each pickup adds **+1** charge, **max 2**. At cap, further pickups do not increase charges. Charges last until consumed or death. Absorb grants the same short invulnerability window as a normal hit so continuous overlap spends **one charge per contact**, not per frame.
3. **Surge** is independent of weapon and aegis. Re-collect **refreshes** the 12s timer; multipliers do not stack.
4. **Death / new run** clears all power-up state with the player entity.
5. **Controls** stay the same; only fire pattern/rate, absorb, and move speed change.

### Smoke tests

```bash
# Game modules (score, damage, power-ups, enemies, bosses, stage director, game-over submit seams) — no server
npm run smoke:game

# API (with server listening)
API_BASE=http://localhost:3000 npm run smoke
```

### End-to-end checklist (manual)

With `npm run api` and the browser at [http://localhost:3000](http://localhost:3000):

1. **Home top 10** — open app → title shows Top Scores (empty state or rows), not a hard crash.
2. **Register** — Register → nickname + email → badge *Playing as …*; profile in `localStorage` key `rtypeweb.player`.
3. **Play content** — Play → collect **≥1 power-up** and face **≥1 boss** (normal play, or debug: keys `1–4` for pickups, `B` skip to boss).
4. **Score stored** — die or stage-clear → *Score saved as …* when registered.
5. **Top 10 reflects run** — Esc/M → title leaderboard includes the new score when it ranks in top 10 (or re-load High Scores).
6. **Unregistered** — `localStorage.removeItem('rtypeweb.player')` → Play → game over shows *Not registered — score not submitted*, no crash.
7. **API down** — stop the API / use `npm start` only → leaderboard/register error states; Play still works; registered game over shows *Submit failed: …*.
8. **Portal handoff** — open with a valid `?portalToken=…` (from a running portal session) and `?portalBase=…` if not production → badge *Playing as …* without Register; address bar no longer contains `portalToken`; game-over score submit succeeds when DB is shared. Garbage token → no crash, profile not forged from query params, Register still works.
9. **Direct visit** — no handoff params → existing profile or Register flow unchanged.

Scripted coverage for the same loop seams: `npm run smoke:game` (game-over submit/unregistered/network + portal handoff helpers) and `API_BASE=… npm run smoke` (register → score → leaderboard).

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

Without Vercel login, `npm run api` runs `scripts/local-api.mjs`: **API routes plus allowlisted static files** (`index.html`, `/src/*`, `/public/*`) on `PORT` (default 3000). Paths outside that allowlist (e.g. `data/*.db`, `api/` sources, `node_modules`) return **404**.

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

### Smoke tests (API)

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
│   ├── main.js             # Views: home, register, scores, play (engine + runState)
│   ├── audio.js            # Web Audio SFX/music, mute, gesture unlock
│   ├── api.js              # register / leaderboard / submitScore + loopback apiBase
│   ├── player.js           # localStorage identity { id, nickname, email }
│   ├── portalHandoff.js    # Portal token verify → rtypeweb.player
│   ├── styles.css          # Retro menu styling
│   ├── engine/             # Fixed-timestep loop, input, camera, entities
│   ├── game/
│   │   ├── player.js       # Ship movement, HP, fire cooldown
│   │   ├── score.js        # Per-run score API
│   │   ├── enemies.js      # Straight / sine / aimer factories
│   │   ├── hazards.js      # Block / spike / zone factories
│   │   ├── powerups.js     # Tri-beam / Overdrive / Aegis / Surge
│   │   ├── bosses.js       # Phase-end multi-phase bosses
│   │   ├── stageDirector.js # JSON timeline multi-phase director + boss gate
│   │   └── visuals/        # 16-bit palette, sprites, parallax, VFX
│   └── scenes/
│       ├── menu.js         # In-engine menu stub
│       ├── playing.js      # Combat, waves, bosses, power-ups, HUD
│       └── gameover.js     # Final score / stage clear, submit, retry / title
├── public/
│   └── assets/
│       ├── sprites/        # Optional image sprites (game uses procedural art)
│       ├── audio/          # Optional external clips (procedural audio by default)
│       └── data/
│           └── stages.json # Phase durations + spawn events
├── api/                    # Vercel serverless functions
│   ├── register.js         # POST /api/register
│   ├── score.js            # POST /api/score
│   └── leaderboard.js      # GET /api/leaderboard
├── lib/                    # Shared DB + validation
│   ├── db.js
│   ├── validate.js
│   └── http.js
├── scripts/
│   ├── local-api.mjs              # Local static (allowlisted) + api/* server
│   ├── prepare-vercel-static.mjs  # npm run build → dist/ for Vercel
│   ├── smoke-api.mjs              # HTTP smoke verification
│   └── smoke-game.mjs             # Client game-module smoke
├── data/                   # Local SQLite DB (gitignored; not served statically)
├── dist/                   # Vercel static output (gitignored; from npm run build)
├── vercel.json
├── package.json
├── .env.example
├── .nvmrc                  # Node 24
└── README.md
```

Runtime asset URLs (when serving from repo root) use paths like `/public/assets/sprites/...`.

## Menu UI notes

| View | Route hash | Behavior |
|------|------------|----------|
| Title / home | `#/` | Loads `GET /api/leaderboard`; empty or top 10; menu stays usable on error |
| Register | `#/register` | `POST /api/register` → `localStorage` `rtypeweb.player` (`id`, `nickname`, …) |
| High scores | `#/scores` | Full leaderboard + refresh |
| Play | `#/play` | Boots combat engine into `#game`; death or stage clear → result screen (+ optional score submit) |

### Scroll convention

Player faces / advances **+X (right)**. Camera `x` increases as the playfield streams past; see `src/engine/camera.js`.

### Scoring / damage APIs for other systems

- `player.takeDamage(n)` / `player.heal(n)` on the ship controller (`src/game/player.js`)
- `createRunScore()` → `add(points)`, `get()`, `reset()` (`src/game/score.js`)
- `spawnEnemy(kind, opts)` / `spawnHazard(kind, opts)` (`src/game/enemies.js`, `src/game/hazards.js`)
- `applyPowerup(player, type)` / `createPowerupPickup({ type, x, y })` (`src/game/powerups.js`)
- `createStageDirector(stages, hooks)` / `loadStages()` (`src/game/stageDirector.js`)
- Identity: `loadPlayer()` → use `player.id` as API `playerId` when submitting

In-game passwords/OAuth are out of scope; portal identity is inherited via the handoff contract above when launched from the web games portal. Sprites/backgrounds/VFX are procedural pixel-art under `src/game/visuals/` (no external atlas required). Audio is procedural via `src/audio.js`.

## Deploy to Vercel

1. Import this Git repository (or `vercel` / `vercel --prod` from the CLI).
2. **Root Directory:** repository root (this package). **Framework Preset:** Other / no framework.
3. Set environment variables: `LIBSQL_URL`, `LIBSQL_AUTH_TOKEN` (Turso/libSQL) — **same database as the web games portal** if you want portal handoff + score submit to work together.
4. Deploy. Static files are served from the root; `api/*.js` become serverless functions. Portal verify is called client-side at the portal origin (default `https://webgamesportal.vercel.app`); no extra game-side server env for handoff.

### Build packaging (static shell + API)

Vercel zero-config would otherwise treat root `public/` as the only static output and **drop** `index.html` + `/src/*`. This repo uses:

```bash
npm run build   # → scripts/prepare-vercel-static.mjs → dist/
```

`vercel.json` sets `buildCommand` + `outputDirectory: dist` so production ships:

- `dist/index.html`, `dist/src/**` (menu + engine modules)
- `dist/public/**` (keeps runtime URLs like `/public/assets/data/stages.json`)
- `api/*.js` as serverless functions (unchanged)

### Deploy dry-run (no production token required)

Prove packaging locally with the Vercel CLI (devDependency):

```bash
npm run build
npx vercel build
# optional interactive dev that matches production routing more closely:
# npm run dev:vercel
```

If the project is not linked, create a local stub once (gitignored under `.vercel/`) or run `vercel link` / set `VERCEL_TOKEN`. Successful `vercel build` writes `.vercel/output` with static files under `static/` and functions under `functions/api/*`. A full `vercel --prod` deploy needs CLI login and a remote Turso DB (`LIBSQL_*`).

### Production limitation

Without `LIBSQL_URL`, handlers fall back to a local file path. That is fine for `npm run api` on a developer machine; on Vercel it will **not** give a stable shared leaderboard across invocations. Always configure a remote libSQL database for production.

### Where scores are stored

| Environment | Player identity | Scores / leaderboard |
|-------------|-----------------|----------------------|
| Browser | `localStorage` key `rtypeweb.player` (`id`, `nickname`, `email`) | N/A (client only holds identity) |
| Local API | — | libSQL file DB default `data/rtype.db` (gitignored; created on first request) |
| Vercel production | same client key | Remote Turso/libSQL via `LIBSQL_URL` (+ `LIBSQL_AUTH_TOKEN`) |

## Notes

- No bundler or SPA framework is required.
- Game logic lives under `src/`.
- Public media and data live under `public/assets/`.
- Registration stores `{ id, nickname, email }` in `localStorage` (`rtypeweb.player`); game over submits with `playerId: player.id`.
