/**
 * Small helpers for Vercel-style Node serverless handlers.
 */

/**
 * @param {import("http").ServerResponse & { status?: Function, json?: Function }} res
 * @param {number} status
 * @param {unknown} payload
 */
export function sendJson(res, status, payload) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(status).json(payload);
    return;
  }
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(body);
}

/**
 * @param {import("http").ServerResponse} res
 * @param {string} message
 * @param {string} code
 * @param {number} status
 */
export function sendError(res, message, code, status) {
  sendJson(res, status, { error: message, code });
}

/**
 * Parse JSON body from a Vercel/Node request.
 * @param {import("http").IncomingMessage & { body?: unknown }} req
 * @returns {Promise<unknown>}
 */
export async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== "") {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        throw new BodyParseError("Invalid JSON body");
      }
    }
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new BodyParseError("Request body is required");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new BodyParseError("Invalid JSON body");
  }
}

export class BodyParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "BodyParseError";
    this.code = "VALIDATION_ERROR";
    this.status = 400;
  }
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {string} method
 */
export function requireMethod(req, method) {
  return (req.method || "").toUpperCase() === method.toUpperCase();
}
