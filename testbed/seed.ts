// Fills the empty testbed with the personas in lib/testbed/personas.ts,
// entirely through the app's own API, so the data is exactly what the app
// would create. Deterministic: the same seed gives the same names and games.
// Needs `npm run testbed:dev` running. Usage: npm run testbed:seed
import type { AccountProfile } from "../lib/accounts/identity-code.ts";
import type { FriendOverview } from "../lib/friends/requests.ts";
import type { PlayerProfile } from "../lib/poker/types.ts";
import { TESTBED_PERSONAS, type TestbedPersona } from "../lib/testbed/personas.ts";

import { TestbedClient } from "./lib/client.ts";
import { generator, makeGame, playerNames } from "./lib/games.ts";
import { testbedEnv } from "./lib/env.mjs";

const SEED = 20260927;
const DAY = 24 * 60 * 60 * 1000;
const SESSIONS_PER_REQUEST = 250;

type Plan = { players: number; games: number; requiredPlayers: string[] };
const PLANS: Record<string, Plan> = {
  "big-host": { players: 60, games: 300, requiredPlayers: ["Asha"] },
  asha: { players: 12, games: 25, requiredPlayers: ["Bikram"] },
  meera: { players: 5, games: 8, requiredPlayers: ["Bikram"] },
  farhan: { players: 3, games: 0, requiredPlayers: [] },
};

const password = testbedEnv().TESTBED_PERSONA_PASSWORD;
if (!password) throw new Error("TESTBED_PERSONA_PASSWORD missing: rerun npm run testbed:setup");
const random = generator(SEED);
const clients = new Map<string, TestbedClient>();
const playersOf = new Map<string, PlayerProfile[]>();
const codeOf = new Map<string, string>();

async function preparePersona(persona: TestbedPersona) {
  const client = new TestbedClient(persona.email);
  const created = await client.signUp(password, persona.displayName ?? "New person");
  await client.signIn(password);
  clients.set(persona.key, client);
  if (!persona.displayName) {
    console.log(`${persona.key}: ${created ? "signed up" : "exists"} (no name)`);
    return;
  }

  const { players: existing } = await client.request<{ players: PlayerProfile[] }>("/api/players");
  if (existing.length) {
    throw new Error(`${persona.key} already has players. Run npm run testbed:reset first`);
  }
  const { profile } = await client.request<{ profile: AccountProfile }>("/api/account", "POST", {
    action: "update-profile",
    displayName: persona.displayName,
  });
  codeOf.set(persona.key, profile.userCode);

  const plan = PLANS[persona.key];
  const players: PlayerProfile[] = [];
  if (plan) {
    for (const name of playerNames(random, plan.players, plan.requiredPlayers)) {
      const { player } = await client.request<{ player: PlayerProfile }>("/api/players", "POST", { name });
      players.push(player);
    }
    const start = Date.now() - 730 * DAY;
    const games = Array.from({ length: plan.games }, (_, index) =>
      makeGame(
        random,
        `tb-${persona.key}-${index + 1}`,
        players,
        start + Math.floor(((index + random.next()) * 725 * DAY) / Math.max(plan.games, 1)),
      ),
    );
    for (let at = 0; at < games.length; at += SESSIONS_PER_REQUEST) {
      await client.request("/api/sessions", "POST", {
        sessions: games.slice(at, at + SESSIONS_PER_REQUEST),
      });
    }
  }
  playersOf.set(persona.key, players);
  console.log(`${persona.key}: ${players.length} players, ${plan?.games ?? 0} games`);
}

function playerNamed(key: string, name: string) {
  const player = playersOf.get(key)?.find((candidate) => candidate.name === name);
  if (!player) throw new Error(`${key} has no player named ${name}`);
  return player.id;
}

async function send(from: string, to: string, myPlayerId: string | null) {
  await clients.get(from)!.request("/api/friends", "POST", {
    action: "send",
    code: codeOf.get(to),
    myPlayerId,
  });
}

async function received(key: string, fromName: string) {
  const { overview } = await clients.get(key)!.request<{ overview: FriendOverview }>("/api/friends");
  const request = overview.received.find((candidate) => candidate.displayName === fromName);
  if (!request) throw new Error(`${key} has no request from ${fromName}`);
  return request.requestId;
}

const started = performance.now();
for (const persona of TESTBED_PERSONAS) await preparePersona(persona);

// Bikram and Asha: friends, each linked to the other's player, so each sees
// the other's group on the Ranks screen.
await send("big-host", "asha", playerNamed("big-host", "Asha"));
await clients.get("asha")!.request("/api/friends", "POST", {
  action: "accept",
  requestId: await received("asha", "Bikram Big Host"),
  myPlayerId: playerNamed("asha", "Bikram"),
});
await send("asha", "ravi", null);
await send("meera", "big-host", playerNamed("meera", "Bikram"));
await send("meera", "karan", null);
await clients.get("karan")!.request("/api/friends", "POST", {
  action: "decline",
  requestId: await received("karan", "Meera"),
});
console.log("Friend requests: 1 accepted, 2 pending, 1 declined");
console.log(`Seeded in ${Math.round((performance.now() - started) / 1000)}s`);
