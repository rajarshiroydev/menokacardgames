/**
 * Turns off Zod's compiled ("JIT") parsers in the browser, before any Zod
 * code runs (imported first by instrumentation-client.ts).
 *
 * To decide whether it may compile, Zod tries `new Function("")` once and
 * catches the failure. Under our Content Security Policy that attempt is
 * blocked and reported as a violation, although nothing breaks: it was the
 * one `script-src: eval` report on production (Sentry POKERIZE-6). Both Zod
 * copies in the app (ours and the Neon Auth SDK's) read the same setting on
 * `globalThis.__zod_globalConfig`, and with `jitless` they skip the attempt.
 * Parsing stays correct; it is only marginally slower for small objects.
 */
const scope = globalThis as typeof globalThis & {
  __zod_globalConfig?: Record<string, unknown>;
};

scope.__zod_globalConfig = { ...scope.__zod_globalConfig, jitless: true };

export {};
