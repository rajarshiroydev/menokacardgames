// Route checks (pre-launch audit M5): every API route, called the way a
// browser calls it, against the testbed app (npm run testbed:dev locally;
// npm run testbed:start in CI). They check who may do what: signed out, from
// another site, as someone else's account, with bad input and while an
// account is locked. The game rules have their own unit tests.
// Usage: npm run testbed:routes (with the testbed app running)
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { PlayerProfile, PokerSession } from "../lib/poker/types.ts";
import { testbedPersona } from "../lib/testbed/personas.ts";

import { TestbedClient } from "./lib/client.ts";
import { testbedEnv } from "./lib/env.mjs";
import { isMutating, SIGNED_IN_ROUTES, type HttpMethod } from "./lib/routes.ts";

const password = testbedEnv().TESTBED_PERSONA_PASSWORD;
if (!password) throw new Error("TESTBED_PERSONA_PASSWORD missing: rerun npm run testbed:setup");

/** A new sign-in, for when the old session is gone (the lock check). */
async function freshSignIn(key: string) {
  const persona = testbedPersona(key);
  if (!persona) throw new Error(`No testbed persona "${key}"`);
  const client = new TestbedClient(persona.email);
  await client.signIn(password);
  return client;
}

// One sign-in per persona for the whole run: Neon Auth limits sign-ins
// from one address, and the smoke test signs in right after these checks.
const sessions = new Map<string, Promise<TestbedClient>>();
function signedIn(key: string) {
  if (!sessions.has(key)) sessions.set(key, freshSignIn(key));
  return sessions.get(key)!;
}

const CALLS = Object.entries(SIGNED_IN_ROUTES).flatMap(([folder, route]) =>
  route.methods.map((method) => ({ folder, method, path: route.path })),
);

function call(client: TestbedClient, method: HttpMethod, path: string, crossSite = false) {
  return client.send(path, {
    method,
    body: isMutating(method) && method !== "DELETE" ? {} : undefined,
    crossSite,
  });
}

describe("signed out", () => {
  const stranger = new TestbedClient("nobody@menoka.test");

  for (const { folder, method, path } of CALLS) {
    it(`${method} ${folder} answers 401`, async () => {
      const response = await call(stranger, method, path);
      assert.equal(response.status, 401, JSON.stringify(response.body));
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
});

describe("from another site, signed in", () => {
  let asha: TestbedClient;
  before(async () => {
    asha = await signedIn("asha");
  });

  for (const { folder, method, path } of CALLS.filter((entry) => isMutating(entry.method))) {
    it(`${method} ${folder} is refused before it runs (403)`, async () => {
      const response = await call(asha, method, path, true);
      assert.equal(response.status, 403, JSON.stringify(response.body));
    });
  }
});

describe("another host's games and players", () => {
  let big: TestbedClient;
  let asha: TestbedClient;
  let bigSession: PokerSession;
  let bigPlayer: PlayerProfile;

  const sessionsOf = async (client: TestbedClient) =>
    (await client.request<{ sessions: PokerSession[] }>("/api/sessions")).sessions;
  const playersOf = async (client: TestbedClient) =>
    (await client.request<{ players: PlayerProfile[] }>("/api/players")).players;

  before(async () => {
    [big, asha] = await Promise.all([signedIn("big-host"), signedIn("asha")]);
    const sessions = await sessionsOf(big);
    const players = await playersOf(big);
    const session = sessions[0];
    const player = players.find((candidate) => !candidate.linked && !candidate.discardedAt);
    assert.ok(session && player, "the testbed is seeded (npm run testbed:seed)");
    bigSession = session;
    bigPlayer = player;
  });

  it("aren't in the other host's lists", async () => {
    const [sessions, players] = await Promise.all([sessionsOf(asha), playersOf(asha)]);
    assert.ok(sessions.length > 0 && players.length > 0, "Asha has her own games and players");
    assert.equal(sessions.some((session) => session.id === bigSession.id), false);
    assert.equal(players.some((player) => player.id === bigPlayer.id), false);
  });

  it("can't be read: results card and action log answer 404", async () => {
    const id = encodeURIComponent(bigSession.id);
    for (const part of ["card", "log"]) {
      const response = await asha.send(`/api/sessions/${id}/${part}`);
      assert.equal(response.status, 404, part);
    }
  });

  it("can't be discarded, deleted or repriced", async () => {
    const attempts = [
      asha.send("/api/sessions", { method: "PATCH", body: { id: bigSession.id, action: "discard" } }),
      asha.send("/api/sessions", {
        method: "PATCH",
        body: { id: bigSession.id, action: "chip-value", chipValue: { chips: 1, cents: 100 } },
      }),
      asha.send(`/api/sessions?id=${encodeURIComponent(bigSession.id)}`, { method: "DELETE" }),
    ];
    for (const response of await Promise.all(attempts)) {
      assert.equal(response.status, 404, JSON.stringify(response.body));
    }
    const after = (await sessionsOf(big)).find((session) => session.id === bigSession.id);
    assert.ok(after, "the game is still in Bikram's list");
    assert.deepEqual(after, bigSession);
  });

  it("can't be renamed, changed or deleted", async () => {
    const attempts = [
      asha.send("/api/players", {
        method: "PATCH",
        body: { id: bigPlayer.id, action: "rename", name: "Taken Over" },
      }),
      asha.send("/api/players", {
        method: "PATCH",
        body: { id: bigPlayer.id, action: "avatar", avatar: bigPlayer.avatar },
      }),
      asha.send("/api/players", { method: "PATCH", body: { id: bigPlayer.id, action: "restore" } }),
      asha.send(`/api/players?id=${encodeURIComponent(bigPlayer.id)}`, { method: "DELETE" }),
    ];
    for (const response of await Promise.all(attempts)) {
      assert.ok(
        response.status >= 400 && response.status < 500,
        `${response.status} ${JSON.stringify(response.body)}`,
      );
    }
    const after = (await playersOf(big)).find((player) => player.id === bigPlayer.id);
    assert.deepEqual(after, bigPlayer);
  });
});

describe("bad input", () => {
  let asha: TestbedClient;
  before(async () => {
    asha = await signedIn("asha");
  });

  it("refuses a body that isn't JSON (415)", async () => {
    const response = await asha.send("/api/players", {
      method: "POST",
      rawBody: "name=Someone",
      contentType: "application/x-www-form-urlencoded",
    });
    assert.equal(response.status, 415);
  });

  it("refuses broken JSON (400) and an empty body (400)", async () => {
    const broken = await asha.send("/api/players", { method: "POST", rawBody: "{\"name\":" });
    const empty = await asha.send("/api/players", { method: "POST", rawBody: "" });
    assert.equal(broken.status, 400);
    assert.equal(empty.status, 400);
  });

  it("refuses a body over the limit (413)", async () => {
    const response = await asha.send("/api/players", {
      method: "POST",
      body: { name: "x".repeat(20 * 1024) },
    });
    assert.equal(response.status, 413);
  });

  it("refuses IDs that aren't IDs (400)", async () => {
    const card = await asha.send(`/api/sessions/${encodeURIComponent("x' OR '1'='1")}/card`);
    const patch = await asha.send("/api/sessions", {
      method: "PATCH",
      body: { id: "../../etc/passwd", action: "discard" },
    });
    const player = await asha.send(`/api/players?id=${encodeURIComponent("<script>")}`, {
      method: "DELETE",
    });
    assert.deepEqual([card.status, patch.status, player.status], [400, 400, 400]);
  });

  it("refuses unknown actions (400)", async () => {
    const sessions = await asha.send("/api/sessions", {
      method: "PATCH",
      body: { id: "tb-anything", action: "wipe" },
    });
    const players = await asha.send("/api/players", {
      method: "PATCH",
      body: { id: "tb-anything", action: "wipe" },
    });
    assert.deepEqual([sessions.status, players.status], [400, 400]);
  });
});

describe("a locked account (deletion requested)", () => {
  let farhan: TestbedClient;
  let locked = false;

  before(async () => {
    farhan = await signedIn("farhan");
  });

  after(async () => {
    if (!locked) return;
    // Put the account back however the checks ended.
    const again = await freshSignIn("farhan");
    await again.send("/api/account", { method: "POST", body: { action: "recover" } });
  });

  it("can't reach the ledger (423) but can manage the account, then recovers", async () => {
    const request = await farhan.send("/api/account", {
      method: "POST",
      body: { action: "request-deletion" },
    });
    assert.equal(request.status, 200, JSON.stringify(request.body));
    locked = true;

    // Requesting deletion signs out everywhere; sign in again to look.
    const again = await freshSignIn("farhan");
    for (const [method, path] of [
      ["GET", "/api/players"],
      ["GET", "/api/sessions"],
      ["POST", "/api/players"],
    ] as const) {
      const response = await again.send(path, {
        method,
        body: method === "POST" ? { name: "Locked Out" } : undefined,
      });
      assert.equal(response.status, 423, `${method} ${path}`);
    }
    const account = await again.send("/api/account");
    assert.equal(account.status, 200);

    const recovered = await again.send("/api/account", { method: "POST", body: { action: "recover" } });
    assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
    locked = false;
    assert.equal((await again.send("/api/players")).status, 200);
  });
});

describe("public routes", () => {
  const stranger = new TestbedClient("nobody@menoka.test");

  it("a live link that doesn't exist answers 404", async () => {
    for (const token of ["A".repeat(43), "not-a-token", "%27%3B--"]) {
      const response = await stranger.send(`/api/live/${token}`);
      assert.equal(response.status, 404, token);
    }
  });

  it("the purge job refuses a request without its secret (401)", async () => {
    const none = await stranger.send("/api/cron/purge-accounts");
    const empty = await stranger.send("/api/cron/purge-accounts", {
      headers: { Authorization: "Bearer " },
    });
    assert.deepEqual([none.status, empty.status], [401, 401]);
  });

  it("the health check says only whether the app is up", async () => {
    const response = await stranger.send("/api/health");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true });
  });
});
