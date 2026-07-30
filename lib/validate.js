/**
 * Shared request validation for player/score APIs.
 */

/**
 * @param {unknown} body
 * @returns {{ nickname: string, email: string } | { error: string, code: string }}
 */
export function parseRegisterBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object", code: "VALIDATION_ERROR" };
  }

  const { nickname: rawNick, email: rawEmail } = /** @type {Record<string, unknown>} */ (
    body
  );

  if (typeof rawNick !== "string") {
    return { error: "nickname must be a string", code: "VALIDATION_ERROR" };
  }
  if (typeof rawEmail !== "string") {
    return { error: "email must be a string", code: "VALIDATION_ERROR" };
  }

  const nickname = rawNick.trim();
  const email = rawEmail.trim().toLowerCase();

  if (nickname.length < 1 || nickname.length > 32) {
    return {
      error: "nickname must be 1–32 characters after trimming",
      code: "VALIDATION_ERROR",
    };
  }

  if (email.length < 3 || email.length > 254) {
    return { error: "email length is invalid", code: "VALIDATION_ERROR" };
  }

  if (!isPlausibleEmail(email)) {
    return {
      error: "email must look like a valid address (local@domain.tld)",
      code: "VALIDATION_ERROR",
    };
  }

  return { nickname, email };
}

/**
 * Basic plausible email: one @, non-empty local, domain with a dot.
 * @param {string} email already trimmed + lowercased
 */
export function isPlausibleEmail(email) {
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain) return false;
  if (domain.includes("..") || local.includes(" ")) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
}

/**
 * @param {unknown} body
 * @returns {{ playerId: string, value: number } | { error: string, code: string }}
 */
export function parseScoreBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object", code: "VALIDATION_ERROR" };
  }

  const { playerId, value } = /** @type {Record<string, unknown>} */ (body);

  if (typeof playerId !== "string" || playerId.trim().length === 0) {
    return {
      error: "playerId must be a non-empty string",
      code: "VALIDATION_ERROR",
    };
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return {
      error: "value must be an integer greater than or equal to 0",
      code: "VALIDATION_ERROR",
    };
  }

  return { playerId: playerId.trim(), value };
}
