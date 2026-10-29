/** Player, account and discard/restore requests carry a few small fields. */
export const SMALL_JSON_BODY_LIMIT = 16 * 1024;
/** Session saves and imports carry up to 250 sessions with blind history. */
export const SESSION_BATCH_BODY_LIMIT = 2 * 1024 * 1024;

export type JsonBodyResult =
  | { ok: true; body: unknown; bytes: number }
  | { ok: false; status: 400 | 413 | 415; error: string };

function tooLarge(limitBytes: number): JsonBodyResult {
  return {
    ok: false,
    status: 413,
    error: `The request is too large (limit ${Math.floor(limitBytes / 1024)} KB)`,
  };
}

const JSON_CONTENT_TYPE = /^application\/json\b/i;

/**
 * Reads a JSON request body, stopping as soon as it exceeds the limit, so an
 * oversized or mislabelled request is never buffered in full. `contentType`
 * lets a caller accept JSON sent under another type, such as browser reports.
 */
export async function readJsonBody(
  request: Request,
  limitBytes: number,
  contentType: RegExp = JSON_CONTENT_TYPE,
): Promise<JsonBodyResult> {
  if (!contentType.test(request.headers.get("content-type") || "")) {
    return { ok: false, status: 415, error: "Send the request as JSON" };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limitBytes) {
    return tooLarge(limitBytes);
  }
  if (!request.body) {
    return { ok: false, status: 400, error: "The request body is empty" };
  }

  // Content-Length can be missing or wrong, so count what actually arrives.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limitBytes) {
      await reader.cancel();
      return tooLarge(limitBytes);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      ok: true,
      body: JSON.parse(new TextDecoder().decode(bytes)),
      bytes: received,
    };
  } catch {
    return { ok: false, status: 400, error: "The request body is not valid JSON" };
  }
}
