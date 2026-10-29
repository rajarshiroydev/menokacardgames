import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, mock } from "node:test";

import { CONTACT_EMAIL } from "../lib/info/legal.ts";
import {
  scrubAddress,
  scrubEvent,
  scrubText,
  sentryIngestOrigin,
} from "../lib/monitoring/scrub.ts";
import { DATA_COLLECTION, sentryOptions } from "../lib/monitoring/sentry-options.ts";
import { contentSecurityPolicy } from "../lib/security/content-security-policy.ts";
import { logSecurityEvent } from "../lib/security/security-log.ts";

const TOKEN = "Ab3dEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

describe("error reports leave without personal data", () => {
  it("strips query strings, fragments and link tokens from addresses", () => {
    assert.equal(
      scrubAddress(`https://www.pokerize.app/live/${TOKEN}?x=1#y`),
      "https://www.pokerize.app/live/[token]",
    );
    assert.equal(scrubAddress(`/join/${TOKEN}?invite=1`), "/join/[token]");
    assert.equal(scrubAddress("/api/sessions?tz=Asia/Kolkata"), "/api/sessions");
  });

  it("strips emails, links and tokens inside any text", () => {
    assert.equal(
      scrubText(
        `Failed for big.host@menoka.test at https://www.pokerize.app/auth/sign-in?invite=${TOKEN} via /api/live/${TOKEN}`,
      ),
      "Failed for [email] at https://www.pokerize.app/auth/sign-in via /api/live/[token]",
    );
    assert.equal(scrubText("GET /api/live/[token] 404"), "GET /api/live/[token] 404");
  });

  it("keeps only the request's address, method and browser, and drops the user", () => {
    const event = scrubEvent({
      message: "save failed for rajarshi@example.com",
      request: {
        url: `https://www.pokerize.app/join/${TOKEN}?a=b`,
        method: "POST",
        headers: { "User-Agent": "Phone", Cookie: "session=secret" },
        cookies: { session: "secret" },
        data: '{"name":"Rajarshi"}',
        query_string: "a=b",
      },
      user: { email: "rajarshi@example.com", ip_address: "1.2.3.4" },
      breadcrumbs: [
        { category: "navigation", data: { from: `/live/${TOKEN}`, to: "/?tab=games" } },
      ],
    });
    assert.deepEqual(event.request, {
      url: "https://www.pokerize.app/join/[token]",
      method: "POST",
      headers: { "User-Agent": "Phone" },
    });
    assert.equal(event.user, undefined);
    assert.equal(event.message, "save failed for [email]");
    assert.deepEqual(event.breadcrumbs[0].data, { from: "/live/[token]", to: "/?tab=games" });
  });

  it("allows Sentry's ingest address in the CSP only when reporting is set up", () => {
    const dsn = "https://publickey@o123.ingest.us.sentry.io/456";
    assert.equal(sentryIngestOrigin(dsn), "https://o123.ingest.us.sentry.io");
    assert.equal(sentryIngestOrigin(undefined), null);
    assert.equal(sentryIngestOrigin("not a dsn"), null);
    assert.equal(sentryIngestOrigin("http://insecure.example/1"), null);
    assert.match(
      contentSecurityPolicy("n", { connectOrigins: ["https://o123.ingest.us.sentry.io"] }),
      /connect-src 'self' https:\/\/o123\.ingest\.us\.sentry\.io;/,
    );
    assert.match(contentSecurityPolicy("n"), /connect-src 'self';/);
  });
});

describe("Sentry collects nothing about people", () => {
  it("turns off every kind of data the SDK can collect", () => {
    // The SDK's own list of kinds, so a new one in a later version fails here.
    const sdkTypes = readFileSync(
      new URL("../node_modules/@sentry/core/build/types/types/datacollection.d.ts", import.meta.url),
      "utf8",
    );
    const body = /export interface DataCollection \{([\s\S]*?)\n\}/.exec(sdkTypes)?.[1] ?? "";
    const kinds = [...body.matchAll(/^\s{4}(\w+)\?:/gm)].map((match) => match[1]);
    assert.ok(kinds.length >= 10, "read the SDK's data collection kinds");
    for (const kind of kinds.filter((name) => name !== "frameContextLines")) {
      assert.ok(kind in DATA_COLLECTION, `DATA_COLLECTION covers ${kind}`);
    }
    assert.deepEqual(DATA_COLLECTION, {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
  });

  it("passes those settings to Sentry, and reports only with a DSN", () => {
    const options = sentryOptions();
    assert.deepEqual(options.dataCollection, DATA_COLLECTION);
    assert.equal(options.tracesSampleRate, 0);
    assert.equal(options.enabled, Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN));
  });

  it("drops stack-frame variables from a report", () => {
    const event = scrubEvent({
      user: { id: "someone" },
      exception: {
        values: [{ stacktrace: { frames: [{ function: "save", vars: { name: "Rajarshi" } }] } }],
      },
    });
    assert.deepEqual(event.exception.values[0].stacktrace.frames[0], { function: "save" });
    assert.equal(event.user, undefined);
  });
});

describe("security events", () => {
  it("logs one [security] JSON line as a warning", () => {
    const warn = mock.method(console, "warn", () => {});
    try {
      logSecurityEvent("rate-limited", { bucket: "writes" });
      assert.deepEqual(warn.mock.calls[0].arguments, [
        "[security]",
        '{"event":"rate-limited","bucket":"writes"}',
      ]);
    } finally {
      warn.mock.restore();
    }
  });
});

describe("security.txt", () => {
  const file = readFileSync(
    new URL("../public/.well-known/security.txt", import.meta.url),
    "utf8",
  );
  const field = (name: string) =>
    new RegExp(`^${name}: (.+)$`, "m").exec(file)?.[1];

  it("names the app's contact address and its own address", () => {
    assert.equal(field("Contact"), `mailto:${CONTACT_EMAIL}`);
    assert.equal(field("Canonical"), "https://www.pokerize.app/.well-known/security.txt");
  });

  it("hasn't expired, and is renewed a month before it does", () => {
    const expires = Date.parse(field("Expires") ?? "");
    const day = 24 * 60 * 60 * 1000;
    assert.ok(expires - Date.now() > 30 * day, "renew Expires in public/.well-known/security.txt");
    assert.ok(expires - Date.now() < 366 * day, "RFC 9116: Expires within a year");
  });
});
