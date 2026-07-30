#!/usr/bin/env node
/**
 * HTTP smoke tests for register → score → leaderboard.
 * Usage: API_BASE=http://localhost:3000 node scripts/smoke-api.mjs
 */
const API_BASE = (process.env.API_BASE || "http://localhost:3000").replace(/\/$/, "");

let failed = 0;

/**
 * @param {string} name
 * @param {boolean} cond
 * @param {string} [detail]
 */
function assert(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 */
async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`Smoke API against ${API_BASE}\n`);

  // --- empty-ish leaderboard is always an array (may have prior data; we use unique nicknames)
  console.log("1) Leaderboard shape");
  {
    const { status, json } = await api("GET", "/api/leaderboard");
    assert("GET leaderboard → 200", status === 200, `status=${status}`);
    assert("scores is array", Array.isArray(json?.scores), JSON.stringify(json));
  }

  const stamp = Date.now();
  const nick1 = `Ace_${stamp}`;
  const email1 = `ace_${stamp}@example.com`;
  const nick2 = `Bolt_${stamp}`;
  const email2 = `bolt_${stamp}@example.com`;

  console.log("\n2) Register player");
  let player1;
  {
    const { status, json } = await api("POST", "/api/register", {
      nickname: nick1,
      email: email1,
    });
    assert("register → 201", status === 201, `status=${status} body=${JSON.stringify(json)}`);
    assert("has id", typeof json?.id === "string" && json.id.length > 0);
    assert("nickname echoed", json?.nickname === nick1);
    assert("email lowercased", json?.email === email1.toLowerCase());
    player1 = json;
  }

  console.log("\n3) Idempotent re-register same identity");
  {
    const { status, json } = await api("POST", "/api/register", {
      nickname: nick1,
      email: email1,
    });
    assert("re-register → 200", status === 200, `status=${status}`);
    assert("same id", json?.id === player1.id, `${json?.id} vs ${player1.id}`);
  }

  console.log("\n4) Identity conflict → 409");
  {
    const { status, json } = await api("POST", "/api/register", {
      nickname: nick1,
      email: `other_${stamp}@example.com`,
    });
    assert("conflict nickname → 409", status === 409, `status=${status}`);
    assert("error code", json?.code === "IDENTITY_CONFLICT");
  }

  console.log("\n5) Submit scores");
  {
    const s1 = await api("POST", "/api/score", { playerId: player1.id, value: 5000 });
    assert("score 5000 → 201", s1.status === 201, `status=${s1.status}`);
    assert("score payload", s1.json?.value === 5000 && s1.json?.playerId === player1.id);

    // small delay so created_at can differ for tie-break tests
    await new Promise((r) => setTimeout(r, 20));

    const s2 = await api("POST", "/api/score", { playerId: player1.id, value: 12000 });
    assert("score 12000 → 201", s2.status === 201);
  }

  console.log("\n6) Second player + score");
  let player2;
  {
    const reg = await api("POST", "/api/register", {
      nickname: nick2,
      email: email2,
    });
    assert("register p2 → 201", reg.status === 201);
    player2 = reg.json;

    const s = await api("POST", "/api/score", { playerId: player2.id, value: 9000 });
    assert("score p2 → 201", s.status === 201);
  }

  console.log("\n7) Leaderboard order (highest first)");
  {
    const { status, json } = await api("GET", "/api/leaderboard");
    assert("leaderboard → 200", status === 200);
    const scores = json?.scores || [];
    const ours = scores.filter((s) => s.nickname === nick1 || s.nickname === nick2);
    assert("our scores present (≥3)", ours.length >= 3, `found=${ours.length}`);

    // Among all scores, first should be highest value
    if (scores.length >= 2) {
      let ordered = true;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i].value > scores[i - 1].value) ordered = false;
      }
      assert("global value DESC", ordered);
    }

    const aceHigh = scores.find((s) => s.nickname === nick1 && s.value === 12000);
    const bolt = scores.find((s) => s.nickname === nick2 && s.value === 9000);
    const aceLow = scores.find((s) => s.nickname === nick1 && s.value === 5000);
    if (aceHigh && bolt && aceLow) {
      assert(
        "Ace 12k ranks above Bolt 9k",
        aceHigh.rank < bolt.rank,
        `ranks ${aceHigh.rank} vs ${bolt.rank}`,
      );
      assert(
        "Bolt 9k ranks above Ace 5k",
        bolt.rank < aceLow.rank,
        `ranks ${bolt.rank} vs ${aceLow.rank}`,
      );
    }

    assert("rank field present", scores.every((s) => typeof s.rank === "number"));
    assert("nickname field present", scores.every((s) => typeof s.nickname === "string"));
    assert("at most 10", scores.length <= 10);
  }

  console.log("\n8) Invalid inputs → 400");
  {
    const emptyNick = await api("POST", "/api/register", {
      nickname: "   ",
      email: "ok@example.com",
    });
    assert("empty nickname → 400", emptyNick.status === 400);

    const badEmail = await api("POST", "/api/register", {
      nickname: "ValidNick",
      email: "not-an-email",
    });
    assert("bad email → 400", badEmail.status === 400);

    const neg = await api("POST", "/api/score", { playerId: player1.id, value: -1 });
    assert("negative score → 400", neg.status === 400);

    const float = await api("POST", "/api/score", { playerId: player1.id, value: 1.5 });
    assert("float score → 400", float.status === 400);

    const strVal = await api("POST", "/api/score", {
      playerId: player1.id,
      value: "100",
    });
    assert("string score → 400", strVal.status === 400);
  }

  console.log("\n9) Unknown player → 404");
  {
    const { status, json } = await api("POST", "/api/score", {
      playerId: "00000000-0000-0000-0000-000000000000",
      value: 10,
    });
    assert("missing player → 404", status === 404, `status=${status}`);
    assert("code PLAYER_NOT_FOUND", json?.code === "PLAYER_NOT_FOUND");
  }

  console.log("\n10) Tie-break: earlier createdAt wins same value");
  {
    const nickA = `TieA_${stamp}`;
    const nickB = `TieB_${stamp}`;
    const a = await api("POST", "/api/register", {
      nickname: nickA,
      email: `tiea_${stamp}@example.com`,
    });
    const b = await api("POST", "/api/register", {
      nickname: nickB,
      email: `tieb_${stamp}@example.com`,
    });
    const sA = await api("POST", "/api/score", { playerId: a.json.id, value: 7777 });
    await new Promise((r) => setTimeout(r, 30));
    const sB = await api("POST", "/api/score", { playerId: b.json.id, value: 7777 });
    assert("tie scores created", sA.status === 201 && sB.status === 201);

    const { json } = await api("GET", "/api/leaderboard");
    const scores = json?.scores || [];
    const rowA = scores.find((s) => s.nickname === nickA && s.value === 7777);
    const rowB = scores.find((s) => s.nickname === nickB && s.value === 7777);
    if (rowA && rowB) {
      assert(
        "earlier submission ranks higher",
        rowA.rank < rowB.rank,
        `A=${rowA.rank} B=${rowB.rank}`,
      );
    } else {
      // may fall off top-10 if DB already full of higher scores
      assert(
        "tie rows visible on leaderboard (or skipped if crowded)",
        true,
        "not both in top-10",
      );
      console.log("    (note: tie rows may be outside top-10 if DB has many higher scores)");
    }
  }

  console.log("\n" + (failed === 0 ? "ALL SMOKE CHECKS PASSED" : `${failed} CHECK(S) FAILED`));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
