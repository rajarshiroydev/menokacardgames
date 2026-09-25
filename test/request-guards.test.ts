import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readJsonBody } from "../lib/security/json-body.ts";
import {
  apiErrorMessage,
  TOO_MANY_REQUESTS_MESSAGE,
} from "../lib/security/rate-limit-message.ts";
import {
  isMutatingMethod,
  isSameOriginRequest,
} from "../lib/security/request-origin.ts";

describe("same-origin check", () => {
  it("treats only GET, HEAD and OPTIONS as safe", () => {
    assert.equal(isMutatingMethod("GET"), false);
    assert.equal(isMutatingMethod("head"), false);
    assert.equal(isMutatingMethod("OPTIONS"), false);
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      assert.equal(isMutatingMethod(method), true);
    }
  });

  it("trusts Sec-Fetch-Site when the browser sends it", () => {
    const check = (site: string) =>
      isSameOriginRequest(
        new Headers({
          "sec-fetch-site": site,
          origin: "https://poker.example",
          host: "poker.example",
        }),
      );
    assert.equal(check("same-origin"), true);
    assert.equal(check("same-site"), false);
    assert.equal(check("cross-site"), false);
    assert.equal(check("none"), false);
  });

  it("falls back to comparing Origin with the public host", () => {
    assert.equal(
      isSameOriginRequest(
        new Headers({ origin: "http://localhost:3005", host: "localhost:3005" }),
      ),
      true,
    );
    assert.equal(
      isSameOriginRequest(
        new Headers({
          origin: "https://poker.example",
          host: "internal:3000",
          "x-forwarded-host": "poker.example, proxy.internal",
        }),
      ),
      true,
    );
    assert.equal(
      isSameOriginRequest(
        new Headers({ origin: "https://evil.example", host: "poker.example" }),
      ),
      false,
    );
  });

  it("rejects requests without provenance headers", () => {
    assert.equal(isSameOriginRequest(new Headers({ host: "poker.example" })), false);
    assert.equal(
      isSameOriginRequest(new Headers({ origin: "null", host: "poker.example" })),
      false,
    );
    assert.equal(
      isSameOriginRequest(new Headers({ origin: "not a url", host: "poker.example" })),
      false,
    );
  });
});

function jsonRequest(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function streamedRequest(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

describe("bounded JSON body", () => {
  it("parses a JSON body within the limit", async () => {
    assert.deepEqual(await readJsonBody(jsonRequest('{"a":1}'), 100), {
      ok: true,
      body: { a: 1 },
    });
    assert.deepEqual(
      await readJsonBody(
        jsonRequest("[]", { "content-type": "application/json; charset=utf-8" }),
        100,
      ),
      { ok: true, body: [] },
    );
  });

  it("requires a JSON content type", async () => {
    const result = await readJsonBody(
      jsonRequest('{"a":1}', { "content-type": "text/plain" }),
      100,
    );
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.status, 415);
  });

  it("rejects a declared or actual size over the limit", async () => {
    const declared = await readJsonBody(
      jsonRequest('{"a":1}', { "content-length": "5000" }),
      100,
    );
    assert.equal(!declared.ok && declared.status, 413);

    const streamed = await readJsonBody(
      streamedRequest(['{"a":"', "x".repeat(80), "x".repeat(80), '"}']),
      100,
    );
    assert.equal(!streamed.ok && streamed.status, 413);
  });

  it("rejects empty and malformed bodies", async () => {
    const empty = await readJsonBody(
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      100,
    );
    assert.equal(!empty.ok && empty.status, 400);

    const malformed = await readJsonBody(jsonRequest("{nope"), 100);
    assert.equal(!malformed.ok && malformed.status, 400);
  });
});

describe("rate-limited response message", () => {
  it("explains a 429 instead of showing the fallback", () => {
    assert.equal(
      apiErrorMessage(429, undefined, "Could not reach the ledger"),
      TOO_MANY_REQUESTS_MESSAGE,
    );
    assert.equal(
      apiErrorMessage(400, "Invalid player id", "Could not reach the ledger"),
      "Invalid player id",
    );
    assert.equal(
      apiErrorMessage(500, undefined, "Could not reach the ledger"),
      "Could not reach the ledger",
    );
  });
});
