import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dirname, "..", "data", "rtype.db");

/** @type {import("@libsql/client").Client | null} */
let client = null;
let schemaReady = false;

/**
 * Domain error with HTTP-ish code for handlers.
 */
export class DbError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} status
   */
  constructor(message, code, status) {
    super(message);
    this.name = "DbError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Resolve DB URL: remote Turso/libSQL when LIBSQL_URL is set, else local file.
 * Local file is for development only — Vercel serverless FS is ephemeral.
 */
export function resolveDbUrl() {
  if (process.env.LIBSQL_URL) {
    return process.env.LIBSQL_URL;
  }
  return `file:${DEFAULT_DB_PATH}`;
}

/**
 * @returns {import("@libsql/client").Client}
 */
export function getClient() {
  if (client) return client;

  const url = resolveDbUrl();
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const authToken = process.env.LIBSQL_AUTH_TOKEN;
  client = createClient({
    url,
    ...(authToken ? { authToken } : {}),
  });
  return client;
}

/** Reset client (for tests). */
export function resetClient() {
  if (client) {
    try {
      client.close();
    } catch {
      // ignore
    }
  }
  client = null;
  schemaReady = false;
}

export async function ensureSchema() {
  if (schemaReady) return;
  const db = getClient();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY NOT NULL,
        nickname TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_players_nickname ON players(nickname)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_players_email ON players(email)`,
      `CREATE TABLE IF NOT EXISTS scores (
        id TEXT PRIMARY KEY NOT NULL,
        player_id TEXT NOT NULL,
        value INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (player_id) REFERENCES players(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_scores_leaderboard
        ON scores(value DESC, created_at ASC, id ASC)`,
    ],
    "write",
  );
  schemaReady = true;
}

/**
 * @param {string} id
 */
export async function getPlayerById(id) {
  await ensureSchema();
  const result = await getClient().execute({
    sql: `SELECT id, nickname, email, created_at AS createdAt, updated_at AS updatedAt
          FROM players WHERE id = ?`,
    args: [id],
  });
  return rowToPlayer(result.rows[0] ?? null);
}

/**
 * @param {string} nickname
 * @param {string} email lowercased
 * @returns {Promise<{ player: object, created: boolean }>}
 */
export async function upsertPlayer(nickname, email) {
  await ensureSchema();
  const db = getClient();

  const byNick = await db.execute({
    sql: `SELECT id, nickname, email, created_at AS createdAt, updated_at AS updatedAt
          FROM players WHERE nickname = ?`,
    args: [nickname],
  });
  const byEmail = await db.execute({
    sql: `SELECT id, nickname, email, created_at AS createdAt, updated_at AS updatedAt
          FROM players WHERE email = ?`,
    args: [email],
  });

  const nickRow = rowToPlayer(byNick.rows[0] ?? null);
  const emailRow = rowToPlayer(byEmail.rows[0] ?? null);

  if (nickRow && emailRow) {
    if (nickRow.id === emailRow.id) {
      return { player: nickRow, created: false };
    }
    throw new DbError(
      "Nickname and email belong to different players",
      "IDENTITY_CONFLICT",
      409,
    );
  }

  if (nickRow) {
    if (nickRow.email !== email) {
      throw new DbError(
        "Nickname is already registered with a different email",
        "IDENTITY_CONFLICT",
        409,
      );
    }
    return { player: nickRow, created: false };
  }

  if (emailRow) {
    if (emailRow.nickname !== nickname) {
      throw new DbError(
        "Email is already registered with a different nickname",
        "IDENTITY_CONFLICT",
        409,
      );
    }
    return { player: emailRow, created: false };
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO players (id, nickname, email, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, nickname, email, now, now],
  });

  return {
    player: {
      id,
      nickname,
      email,
      createdAt: now,
      updatedAt: now,
    },
    created: true,
  };
}

/**
 * @param {string} playerId
 * @param {number} value
 */
export async function insertScore(playerId, value) {
  await ensureSchema();
  const player = await getPlayerById(playerId);
  if (!player) {
    throw new DbError("Player not found", "PLAYER_NOT_FOUND", 404);
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await getClient().execute({
    sql: `INSERT INTO scores (id, player_id, value, created_at) VALUES (?, ?, ?, ?)`,
    args: [id, playerId, value, createdAt],
  });

  return {
    id,
    playerId,
    value,
    createdAt,
  };
}

/**
 * Top scores: value DESC, created_at ASC (earlier wins ties), id ASC.
 * @param {number} [limit=10]
 */
export async function topScores(limit = 10) {
  await ensureSchema();
  const result = await getClient().execute({
    sql: `SELECT s.value AS value,
                 s.created_at AS createdAt,
                 s.id AS id,
                 p.nickname AS nickname
          FROM scores s
          INNER JOIN players p ON p.id = s.player_id
          ORDER BY s.value DESC, s.created_at ASC, s.id ASC
          LIMIT ?`,
    args: [limit],
  });

  return result.rows.map((row, index) => ({
    rank: index + 1,
    nickname: String(row.nickname),
    value: Number(row.value),
    createdAt: String(row.createdAt),
  }));
}

/**
 * @param {Record<string, unknown> | null} row
 */
function rowToPlayer(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    nickname: String(row.nickname),
    email: String(row.email),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}
