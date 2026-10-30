// Talks to the locally running testbed app (npm run testbed:dev) as one
// persona: signs up or in through the app's own auth route, keeps the session
// cookies, and calls the API the way the browser does.
/** Set TESTBED_PORT when the testbed app runs on another port. */
export const TESTBED_ORIGIN = `http://localhost:${process.env.TESTBED_PORT || 3006}`;

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type SendOptions = {
  method?: string;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
  crossSite?: boolean;
  headers?: Record<string, string>;
};

export type SentResponse = { status: number; headers: Headers; body: unknown };

export class TestbedClient {
  readonly email: string;
  private cookies = new Map<string, string>();

  constructor(email: string) {
    this.email = email;
  }

  private remember(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      if (value === "" || /max-age=0/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /**
   * Any request, answered whatever its status. `body` is sent as JSON;
   * `rawBody` as it is, with `contentType`. `crossSite` sends the headers a
   * browser sends from another site.
   */
  async send(path: string, options: SendOptions = {}): Promise<SentResponse> {
    const { method = "GET", body, rawBody, contentType, crossSite, headers = {} } = options;
    const response = await fetch(TESTBED_ORIGIN + path, {
      method,
      redirect: "manual",
      headers: {
        Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        Origin: crossSite ? "https://evil.example" : TESTBED_ORIGIN,
        "Sec-Fetch-Site": crossSite ? "cross-site" : "same-origin",
        ...(body === undefined && rawBody === undefined
          ? {}
          : { "Content-Type": contentType ?? "application/json" }),
        ...headers,
      },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    this.remember(response);
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: response.status, headers: response.headers, body: data };
  }

  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await this.send(path, { method, body });
    if (response.status >= 400) {
      const data = response.body;
      const message =
        (data as { error?: string; message?: string } | null)?.error ??
        (data as { message?: string } | null)?.message ??
        String(response.status);
      throw new ApiError(`${method} ${path} → ${response.status}: ${message}`, response.status, data);
    }
    return response.body as T;
  }

  /** Creates the sign-in identity; returns false when it already exists. */
  async signUp(password: string, name: string) {
    try {
      await this.request("/api/auth/sign-up/email", "POST", {
        email: this.email,
        password,
        name,
      });
      return true;
    } catch (error) {
      if (error instanceof ApiError && [400, 409, 422].includes(error.status)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Signs in. Neon Auth allows only a few sign-ins a minute from one address
   * and answers 429 after that (CI found it, 2026-10-30), so this waits a
   * little longer each time and tries again, up to about a minute.
   */
  async signIn(password: string) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.request("/api/auth/sign-in/email", "POST", {
          email: this.email,
          password,
        });
        return;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 429 || attempt >= 5) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 5_000 * attempt));
      }
    }
  }
}
