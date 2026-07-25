import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  LOG_QUERY_LIMIT_MAX,
  buildLogSelect,
  logQuerySchema,
} from "../query";

const dialect = new PgDialect();

/** Compile a builder's SQL object to its parameterized string + bound params. */
function compile(query: ReturnType<typeof buildLogSelect>) {
  return dialect.sqlToQuery(query);
}

/** Parse raw searchParams the way the route will, then build the select. */
function selectFor(raw: Record<string, string>) {
  const f = logQuerySchema.parse(raw);
  return compile(buildLogSelect(f));
}

describe("logQuerySchema", () => {
  it("applies defaults and coerces numeric strings", () => {
    const f = logQuerySchema.parse({});
    expect(f.limit).toBe(100);
    expect(f.regex).toBe(false);
  });

  it("caps limit at the hard max", () => {
    expect(() => logQuerySchema.parse({ limit: "9999" })).toThrow();
  });

  it("rejects an unknown source", () => {
    expect(() => logQuerySchema.parse({ source: "syslog" })).toThrow();
  });

  it("rejects an out-of-range severity", () => {
    expect(() => logQuerySchema.parse({ maxSeverity: "9" })).toThrow();
  });
});

describe("buildLogSelect — filter mapping", () => {
  it("binds every scalar filter as a parameter", () => {
    const { sql, params } = selectFor({
      box: "nas",
      source: "journal",
      unit: "tdarr-gate",
      maxSeverity: "4",
    });
    expect(sql).toContain("box = $");
    expect(sql).toContain("source = $");
    expect(sql).toContain("unit = $");
    expect(sql).toContain("severity <= $");
    expect(params).toEqual(
      expect.arrayContaining(["nas", "journal", "tdarr-gate", 4]),
    );
  });

  it("uses ilike for plain text and ~* for regex — both parameterized", () => {
    const plain = selectFor({ q: "error" });
    expect(plain.sql).toContain("ilike $");
    expect(plain.params).toContain("%error%");

    const re = selectFor({ q: "err(or|no)", regex: "1" });
    expect(re.sql).toContain("~* $");
    expect(re.params).toContain("err(or|no)");
  });

  it("does not interpolate a SQL-injection payload into the query string", () => {
    const payload = "'; drop table log_lines; --";
    const { sql, params } = selectFor({ q: payload });
    expect(sql).not.toContain("drop table");
    expect(params).toContain("%" + payload + "%");
  });
});

describe("buildLogSelect — keyset pagination", () => {
  it("pages older with a descending (ts,id) tuple comparison", () => {
    const { sql, params } = selectFor({
      beforeTs: "2026-07-24T12:00:00.000Z",
      beforeId: "500",
    });
    expect(sql).toContain("(ts, id) < (");
    expect(sql).toMatch(/order by ts desc, id desc/i);
    expect(params).toEqual(
      expect.arrayContaining(["2026-07-24T12:00:00.000Z", 500]),
    );
  });

  it("live-tail (after) pages ascending with a > tuple comparison", () => {
    const { sql } = selectFor({
      afterTs: "2026-07-24T12:00:00.000Z",
      afterId: "500",
    });
    expect(sql).toContain("(ts, id) > (");
    expect(sql).toMatch(/order by ts asc, id asc/i);
  });

  it("defaults to newest-first when no cursor is given", () => {
    const { sql } = selectFor({});
    expect(sql).toMatch(/order by ts desc, id desc/i);
  });
});

describe("buildLogSelect — result cap", () => {
  it("always applies a bound limit not exceeding the hard max", () => {
    const { sql, params } = selectFor({ limit: String(LOG_QUERY_LIMIT_MAX) });
    expect(sql).toContain("limit $");
    expect(params).toContain(LOG_QUERY_LIMIT_MAX);
  });
});
