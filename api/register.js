import { upsertPlayer, DbError } from "../lib/db.js";
import { parseRegisterBody } from "../lib/validate.js";
import {
  BodyParseError,
  readJsonBody,
  requireMethod,
  sendError,
  sendJson,
} from "../lib/http.js";

/**
 * POST /api/register — register or return existing player (nickname + email).
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
export default async function handler(req, res) {
  if (!requireMethod(req, "POST")) {
    sendError(res, "Method not allowed", "METHOD_NOT_ALLOWED", 405);
    return;
  }

  try {
    const body = await readJsonBody(req);
    const parsed = parseRegisterBody(body);
    if ("error" in parsed) {
      sendError(res, parsed.error, parsed.code, 400);
      return;
    }

    const { player, created } = await upsertPlayer(parsed.nickname, parsed.email);
    sendJson(res, created ? 201 : 200, {
      id: player.id,
      nickname: player.nickname,
      email: player.email,
      createdAt: player.createdAt,
      updatedAt: player.updatedAt,
    });
  } catch (err) {
    if (err instanceof BodyParseError) {
      sendError(res, err.message, err.code, err.status);
      return;
    }
    if (err instanceof DbError) {
      sendError(res, err.message, err.code, err.status);
      return;
    }
    console.error("register error:", err);
    sendError(res, "Internal server error", "INTERNAL_ERROR", 500);
  }
}
