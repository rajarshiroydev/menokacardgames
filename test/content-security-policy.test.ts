import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contentSecurityPolicy,
  createNonce,
  CSP_REPORT_PATH,
} from "../lib/security/content-security-policy.ts";
import {
  MAX_REPORTS_PER_REQUEST,
  readCspReports,
  redactAddress,
} from "../lib/security/csp-report.ts";
import { readJsonBody } from "../lib/security/json-body.ts";
import { redactTokenPath } from "../lib/security/token-paths.ts";

function directives(policy: string) {
  return new Map(
    policy.split("; ").map((directive) => {
      const [name, ...values] = directive.split(" ");
      return [name, values.join(" ")] as const;
    }),
  );
}

describe("content security policy", () => {
  it("makes a different 16-byte base64 nonce each time", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    assert.equal(nonces.size, 50);
    for (const nonce of nonces) {
      assert.match(nonce, /^[A-Za-z0-9+/]{22}==$/);
    }
  });

  it("lets scripts run only with the nonce or from a trusted script", () => {
    const policy = directives(contentSecurityPolicy("abc123=="));
    assert.equal(
      policy.get("script-src"),
      "'self' 'nonce-abc123==' 'strict-dynamic'",
    );
    assert.doesNotMatch(policy.get("script-src")!, /unsafe/);
  });

  it("blocks plugins, base tags and framing, and keeps the rest on the app", () => {
    const policy = directives(contentSecurityPolicy("n"));
    assert.equal(policy.get("default-src"), "'self'");
    assert.equal(policy.get("object-src"), "'none'");
    assert.equal(policy.get("base-uri"), "'none'");
    assert.equal(policy.get("frame-ancestors"), "'none'");
    assert.equal(policy.get("form-action"), "'self'");
    assert.equal(policy.get("connect-src"), "'self'");
    assert.equal(policy.get("img-src"), "'self' blob: data:");
  });

  it("allows eval only in development, for React's error overlay", () => {
    assert.match(
      directives(contentSecurityPolicy("n", { development: true })).get(
        "script-src",
      )!,
      / 'unsafe-eval'$/,
    );
  });

  it("sends reports to the report endpoint with report-uri only", () => {
    const policy = directives(contentSecurityPolicy("n"));
    assert.equal(policy.get("report-uri"), CSP_REPORT_PATH);
    assert.equal(policy.has("report-to"), false);
  });
});

describe("CSP violation reports", () => {
  it("reads the report-uri form", () => {
    assert.deepEqual(
      readCspReports({
        "csp-report": {
          "document-uri": "https://www.pokerize.app/?tab=games#x",
          "violated-directive": "script-src-elem",
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js?token=1",
          "source-file": "https://www.pokerize.app/_next/static/chunks/a.js",
          "line-number": 12,
          "column-number": 3,
          "script-sample": "secret()",
          disposition: "report",
        },
      }),
      [
        {
          page: "https://www.pokerize.app/",
          directive: "script-src-elem",
          blocked: "https://evil.example/x.js",
          source: "https://www.pokerize.app/_next/static/chunks/a.js",
          line: 12,
          column: 3,
          disposition: "report",
        },
      ],
    );
  });

  it("reads a Reporting API batch and skips other report types", () => {
    const violations = readCspReports([
      { type: "deprecation", body: { id: "x" } },
      {
        type: "csp-violation",
        url: "https://www.pokerize.app/privacy",
        body: {
          documentURL: "https://www.pokerize.app/privacy",
          effectiveDirective: "script-src-elem",
          blockedURL: "inline",
          lineNumber: 1,
          disposition: "report",
          sample: "localStorage.getItem()",
        },
      },
    ]);
    assert.deepEqual(violations, [
      {
        page: "https://www.pokerize.app/privacy",
        directive: "script-src-elem",
        blocked: "inline",
        source: null,
        line: 1,
        column: null,
        disposition: "report",
      },
    ]);
  });

  it("never logs a live or invite token", () => {
    const token = "Ab3dEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
    for (const path of ["live", "join", "api/live"]) {
      const redacted = redactAddress(
        `https://www.pokerize.app/${path}/${token}?x=1`,
      );
      assert.equal(redacted, `https://www.pokerize.app/${path}/[token]`);
    }
  });

  it("reduces data and blob addresses to their kind", () => {
    assert.equal(redactAddress("data:image/png;base64,AAAA"), "data");
    assert.equal(
      redactAddress("blob:https://www.pokerize.app/1234-5678"),
      "blob",
    );
    assert.equal(redactAddress("not a url"), "other");
  });

  it("caps a batch and ignores junk", () => {
    const report = {
      type: "csp-violation",
      body: { documentURL: "https://a.example/", effectiveDirective: "img-src" },
    };
    assert.equal(
      readCspReports(Array.from({ length: 100 }, () => report)).length,
      MAX_REPORTS_PER_REQUEST,
    );
    assert.deepEqual(readCspReports(null), []);
    assert.deepEqual(readCspReports("x"), []);
    assert.deepEqual(readCspReports({ "csp-report": "x" }), []);
    const [long] = readCspReports({
      "csp-report": { "effective-directive": "x".repeat(5000), "line-number": -1 },
    });
    assert.equal(long.directive.length, 200);
    assert.equal(long.line, null);
  });
});

describe("token paths (analytics and CSP reports)", () => {
  const token = "Ab3dEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

  it("blanks live and invite tokens", () => {
    assert.equal(redactTokenPath(`/live/${token}`), "/live/[token]");
    assert.equal(redactTokenPath(`/join/${token}`), "/join/[token]");
    assert.equal(redactTokenPath(`/api/live/${token}`), "/api/live/[token]");
    assert.equal(redactTokenPath(`/join/${token}/more`), "/join/[token]/more");
  });

  it("leaves every other path alone", () => {
    for (const path of [
      "/",
      "/privacy",
      "/admin",
      "/live",
      "/join",
      "/api/sessions/s1/card",
      "/joined/x",
      "/x/live/y",
    ]) {
      assert.equal(redactTokenPath(path), path);
    }
  });
});

describe("JSON body content type", () => {
  it("accepts another JSON type only when the caller allows it", async () => {
    const request = () =>
      new Request("https://www.pokerize.app/csp-report", {
        method: "POST",
        headers: { "content-type": "application/csp-report" },
        body: JSON.stringify({ "csp-report": {} }),
      });
    const refused = await readJsonBody(request(), 1024);
    assert.equal(refused.ok, false);
    const accepted = await readJsonBody(
      request(),
      1024,
      /^application\/csp-report\b/i,
    );
    assert.deepEqual(accepted, {
      ok: true,
      body: { "csp-report": {} },
      bytes: JSON.stringify({ "csp-report": {} }).length,
    });
  });
});
