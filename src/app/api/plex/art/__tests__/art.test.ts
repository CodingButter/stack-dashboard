import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAllowedPath, buildUpstreamUrl } from "../route";

// Mock the two boundary imports so the route can be exercised without a DB or a
// real session. @/poller/settings is what pulls in @/db (env parsing at import).
const getSession = vi.fn();
const loadServiceConfig = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSession(),
}));
vi.mock("@/poller/settings", () => ({
  loadServiceConfig: (service: string) => loadServiceConfig(service),
}));

// Import the handler AFTER the mocks are registered.
const { GET } = await import("../route");

function req(path?: string): Request {
  const url = new URL("http://localhost/api/plex/art");
  if (path !== undefined) url.searchParams.set("path", path);
  return new Request(url);
}

describe("plex art proxy — pure helpers", () => {
  it("allows only Plex-internal art paths (SSRF allowlist)", () => {
    expect(isAllowedPath("/library/metadata/1/thumb/2")).toBe(true);
    expect(isAllowedPath("/photo/:/transcode")).toBe(true);
    expect(isAllowedPath("http://evil.example/x")).toBe(false);
    expect(isAllowedPath("//evil.example/x")).toBe(false);
    expect(isAllowedPath("/etc/passwd")).toBe(false);
    expect(isAllowedPath("")).toBe(false);
  });

  it("injects the token into the upstream URL and strips a trailing slash", () => {
    const url = buildUpstreamUrl(
      "http://nas:32400/",
      "secret token/&",
      "/library/metadata/1/thumb/2",
    );
    expect(url).toBe(
      "http://nas:32400/library/metadata/1/thumb/2?X-Plex-Token=secret%20token%2F%26",
    );
  });
});

describe("plex art proxy — GET handler", () => {
  beforeEach(() => {
    getSession.mockReset();
    loadServiceConfig.mockReset();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("401s without a session", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(req("/library/metadata/1/thumb/2"));
    expect(res.status).toBe(401);
  });

  it("400s a path outside the allowlist", async () => {
    getSession.mockResolvedValue({ userId: "u1" });
    const res = await GET(req("http://evil/x"));
    expect(res.status).toBe(400);
  });

  it("400s a missing path", async () => {
    getSession.mockResolvedValue({ userId: "u1" });
    const res = await GET(req());
    expect(res.status).toBe(400);
  });

  it("502s when plex is not configured", async () => {
    getSession.mockResolvedValue({ userId: "u1" });
    loadServiceConfig.mockResolvedValue({});
    const res = await GET(req("/library/metadata/1/thumb/2"));
    expect(res.status).toBe(502);
  });

  it("streams upstream bytes with the token injected server-side only", async () => {
    getSession.mockResolvedValue({ userId: "u1" });
    loadServiceConfig.mockResolvedValue({
      url: "http://nas:32400",
      apiKey: "SECRET_TOKEN",
    });
    const fetchSpy = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await GET(req("/library/metadata/1/thumb/2"));

    // Upstream request carries the token + correct base/path.
    const calledUrl = (fetchSpy.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toBe(
      "http://nas:32400/library/metadata/1/thumb/2?X-Plex-Token=SECRET_TOKEN",
    );

    // Response is the image, and the token is nowhere the browser can see it.
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(JSON.stringify([...res.headers.entries()])).not.toContain(
      "SECRET_TOKEN",
    );
    const body = await res.text();
    expect(body).not.toContain("SECRET_TOKEN");
  });

  it("502s (no token leak) when the upstream fetch throws", async () => {
    getSession.mockResolvedValue({ userId: "u1" });
    loadServiceConfig.mockResolvedValue({
      url: "http://nas:32400",
      apiKey: "SECRET_TOKEN",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED http://nas:32400/...?X-Plex-Token=SECRET_TOKEN");
      }),
    );
    const res = await GET(req("/library/metadata/1/thumb/2"));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain("SECRET_TOKEN");
  });
});
