import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auditLog, sessions, users } from "@/db/schema";

describe("schema shape", () => {
  it("users has the expected columns", () => {
    expect(getTableName(users)).toBe("users");
    const cols = getTableColumns(users);
    expect(Object.keys(cols).sort()).toEqual(
      ["createdAt", "disabledAt", "id", "passwordHash", "role", "username"].sort(),
    );
    expect(cols.username.isUnique).toBe(true);
    expect(cols.role.default).toBe("viewer");
  });

  it("sessions has the expected columns", () => {
    expect(getTableName(sessions)).toBe("sessions");
    const cols = getTableColumns(sessions);
    expect(Object.keys(cols).sort()).toEqual(
      ["createdAt", "expiresAt", "id", "userId"].sort(),
    );
    expect(cols.userId.notNull).toBe(true);
  });

  it("audit_log has the expected columns", () => {
    expect(getTableName(auditLog)).toBe("audit_log");
    const cols = getTableColumns(auditLog);
    expect(Object.keys(cols).sort()).toEqual(
      ["action", "createdAt", "detail", "id", "result", "target", "userId"].sort(),
    );
  });
});
