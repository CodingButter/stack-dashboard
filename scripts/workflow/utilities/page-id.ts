/**
 * Safe page-identifier validation shared by every `/stackdash-migrate*` command
 * (plan §3b). A command supplies `$ARGUMENTS`; exactly one token matching the
 * allowed slug shape is required. Empty, missing, multiple, or malformed input
 * is rejected — the workflow NEVER silently defaults to a page (e.g. `tdarr`).
 */

export interface PageIdResult {
  ok: boolean;
  pageId?: string;
  error?: string;
}

const SLUG = /^[a-z0-9-]+$/;

/**
 * Validate the raw `$ARGUMENTS` string a command received.
 * @param rawArgs the untrimmed `$ARGUMENTS` value (may be undefined).
 */
export function validatePageId(rawArgs: string | undefined | null): PageIdResult {
  if (rawArgs == null) {
    return { ok: false, error: "no page identifier supplied" };
  }
  const trimmed = rawArgs.trim();
  if (trimmed === "") {
    return { ok: false, error: "no page identifier supplied" };
  }
  const tokens = trimmed.split(/\s+/);
  if (tokens.length > 1) {
    return {
      ok: false,
      error: `expected exactly one page identifier, got ${tokens.length}: "${trimmed}"`,
    };
  }
  const [token] = tokens;
  if (!SLUG.test(token)) {
    return {
      ok: false,
      error: `page identifier "${token}" must match [a-z0-9-]+`,
    };
  }
  return { ok: true, pageId: token };
}
