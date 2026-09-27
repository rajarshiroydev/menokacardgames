// Talks to the locally running testbed app (npm run testbed:dev) as one
// persona: signs up or in through the app's own auth route, keeps the session
// cookies, and calls the API the way the browser does.
export const TESTBED_ORIGIN = "http://localhost:3006";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

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

  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(TESTBED_ORIGIN + path, {
      method,
      redirect: "manual",
      headers: {
        Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        Origin: TESTBED_ORIGIN,
        "Sec-Fetch-Site": "same-origin",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.remember(response);
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      const message =
        (data as { error?: string; message?: string } | null)?.error ??
        (data as { message?: string } | null)?.message ??
        response.statusText;
      throw new ApiError(`${method} ${path} → ${response.status}: ${message}`, response.status, data);
    }
    return data as T;
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

  async signIn(password: string) {
    await this.request("/api/auth/sign-in/email", "POST", {
      email: this.email,
      password,
    });
  }
}
