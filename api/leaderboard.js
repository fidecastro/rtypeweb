import { topScores } from "../lib/db.js";
import { requireMethod, sendError, sendJson } from "../lib/http.js";

/**
 * GET /api/leaderboard — top 10 scores (value DESC, earlier createdAt wins ties).
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
export default async function handler(req, res) {
  if (!requireMethod(req, "GET")) {
    sendError(res, "Method not allowed", "METHOD_NOT_ALLOWED", 405);
    return;
  }

  try {
    const scores = await topScores(10);
    sendJson(res, 200, { scores });
  } catch (err) {
    console.error("leaderboard error:", err);
    sendError(res, "Internal server error", "INTERNAL_ERROR", 500);
  }
}
