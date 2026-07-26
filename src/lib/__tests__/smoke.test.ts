import { describe, expect, it } from "vitest";
import { envSchema } from "@/env";

describe("env schema", () => {
  it("parses a valid fixture", () => {
    const parsed = envSchema.parse({
      DATABASE_URL: "postgres://stackdash:pw@db.example:5432/stackdash",
      SESSION_SECRET: "s".repeat(32),
    });
    expect(parsed.DATABASE_URL).toContain("stackdash");
    expect(parsed.AGENT_TOKEN).toBeUndefined();
  });

  it("rejects a short session secret", () => {
    expect(() =>
      envSchema.parse({
        DATABASE_URL: "postgres://x",
        SESSION_SECRET: "short",
      }),
    ).toThrow();
  });
});
