import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request timing: how long the sign-in check, the account lookup and the
 * database queries took. Each API response carries it as a Server-Timing
 * header (browser devtools → Network → Timing) and each request logs one
 * `[timing]` line, so a slow request in the Vercel logs shows where the time
 * went.
 */
type Timings = Map<string, { ms: number; count: number }>;

const store = new AsyncLocalStorage<Timings>();

/** Times `work` under `name` when a request is being timed; otherwise just runs it. */
export async function timed<T>(name: string, work: () => Promise<T>) {
  const timings = store.getStore();
  if (!timings) return work();

  const start = performance.now();
  try {
    return await work();
  } finally {
    const entry = timings.get(name) ?? { ms: 0, count: 0 };
    entry.ms += performance.now() - start;
    entry.count += 1;
    timings.set(name, entry);
  }
}

function describe(timings: Timings, totalMs: number) {
  const parts = [...timings].map(([name, { ms, count }]) => ({
    name,
    ms: Math.round(ms),
    count,
  }));
  parts.push({ name: "total", ms: Math.round(totalMs), count: 1 });
  return {
    header: parts.map(({ name, ms }) => `${name};dur=${ms}`).join(", "),
    log: parts
      .map(({ name, ms, count }) =>
        count > 1 ? `${name}=${ms}ms(x${count})` : `${name}=${ms}ms`,
      )
      .join(" "),
  };
}

/** Wraps a route handler so its response reports where the time went. */
export function withServerTiming<Args extends unknown[]>(
  label: string,
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args) => {
    const timings: Timings = new Map();
    const start = performance.now();
    const response = await store.run(timings, () => handler(...args));
    const { header, log } = describe(timings, performance.now() - start);
    console.log(`[timing] ${label} ${response.status} ${log}`);

    const headers = new Headers(response.headers);
    headers.append("Server-Timing", header);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/** Times a server-rendered page; pages cannot set headers, so this only logs. */
export async function logServerTiming<T>(label: string, render: () => Promise<T>) {
  const timings: Timings = new Map();
  const start = performance.now();
  try {
    return await store.run(timings, render);
  } finally {
    console.log(
      `[timing] ${label} ${describe(timings, performance.now() - start).log}`,
    );
  }
}
