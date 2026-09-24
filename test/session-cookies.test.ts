import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  stripSessionCookies,
  withoutSessionCookies,
} from "../lib/auth/session-cookies.ts";

describe("magic link exchange cookies", () => {
  it("drops existing session cookies and keeps the rest", () => {
    assert.equal(
      stripSessionCookies(
        "__Secure-neon-auth.session_token=old; theme=dark; " +
          "__Secure-neon-auth.local.session_data=cached; " +
          "__Secure-neon-auth.session_challenge=challenge",
      ),
      "theme=dark; __Secure-neon-auth.session_challenge=challenge",
    );
  });

  it("handles a missing cookie header", () => {
    assert.equal(stripSessionCookies(null), "");
  });

  it("builds a request without session cookies for the same URL", () => {
    const request = withoutSessionCookies(
      new Request("https://example.test/auth/callback?neon_auth_session_verifier=v", {
        headers: { cookie: "__Secure-neon-auth.session_token=old" },
      }),
    );

    assert.equal(request.url, "https://example.test/auth/callback?neon_auth_session_verifier=v");
    assert.equal(request.headers.get("cookie"), null);
  });
});
