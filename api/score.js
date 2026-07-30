import { insertScore, DbError } from "../lib/db.js";
import { parseScoreBody } from "../lib/validate.js";
import {
  BodyParseError,
  readJsonBody,
  requireMethod,
  sendError,
  sendJson,
} from "../lib/http.js";

/**
 * POST /api/score — submit a score for a registered player.
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
    const parsed = parseScoreBody(body);
    if ("error" in parsed) {
      sendError(res, parsed.error, parsed.code, 400);
      return;
    }

    const score = await insertScore(parsed.playerId, parsed.value);
    sendJson(res, 201, score);
  } catch (err) {
    if (err instanceof BodyParseError) {
      sendError(res, err.message, err.code, err.status);
      return;
    }
    if (err instanceof DbError) {
      sendError(res, err.message, err.code, err.status);
      return;
    }
    console.error("score error:", err);
    sendError(res, "Internal server error", "INTERNAL_ERROR", 500);
  }
}
