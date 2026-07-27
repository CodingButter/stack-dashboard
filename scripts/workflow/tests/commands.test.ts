import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { validatePageId } from "../utilities/page-id";

/**
 * Minimal YAML-frontmatter parser for the flat key/value + simple list shapes
 * these skill/agent/command files use (name, description, goal, tools, and a
 * `skills:` list of `- item`). Avoids adding a `yaml` dependency to the repo.
 */
function parseFrontmatter(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = src.split("\n");
  let listKey: string | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") continue;
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && listKey) {
      (out[listKey] as string[]).push(listItem[1].trim());
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rest] = kv;
    if (rest.trim() === "") {
      listKey = key;
      out[key] = [];
      continue;
    }
    listKey = null;
    let val: unknown = rest.trim();
    if (val === "true") val = true;
    else if (val === "false") val = false;
    out[key] = val;
  }
  return out;
}

const ROOT = path.resolve(__dirname, "../../..");
const SKILLS_DIR = path.join(ROOT, ".mastracode/skills");
const AGENTS_DIR = path.join(ROOT, ".mastracode/agents");
const COMMANDS_DIR = path.join(ROOT, ".mastracode/commands");

interface Parsed {
  frontmatter: Record<string, unknown>;
  body: string;
}

async function parseMarkdownWithFrontmatter(file: string): Promise<Parsed> {
  const content = await fs.readFile(file, "utf-8");
  expect(content.trim().startsWith("---"), `${file} must start with YAML frontmatter`).toBe(true);
  const parts = content.split("---");
  expect(parts.length, `${file} must have a closed frontmatter block`).toBeGreaterThanOrEqual(3);
  const frontmatter = parseFrontmatter(parts[1].trim());
  const body = parts.slice(2).join("---").trim();
  return { frontmatter, body };
}

const EXPECTED_SKILLS = [
  "stackdash-design-inventory",
  "stackdash-current-page-audit",
  "stackdash-field-extraction",
  "stackdash-data-source-classification",
  "stackdash-data-gap-analysis",
  "stackdash-contract-generation",
  "stackdash-traceability",
  "stackdash-reuse-audit",
  "stackdash-implementation-planning",
  "stackdash-runtime-verification",
  "stackdash-adversarial-review",
  "stackdash-workflow-regression",
];

const EXPECTED_AGENTS = [
  "stackdash-page-intent-analyst",
  "stackdash-current-system-auditor",
  "stackdash-data-contract-analyst",
  "stackdash-benchmark-analyst",
];

const EXPECTED_COMMANDS: { file: string; name: string; goal: boolean }[] = [
  { file: "stackdash-migrate.md", name: "stackdash-migrate", goal: true },
  { file: "stackdash-migrate/resume.md", name: "stackdash-migrate:resume", goal: true },
  { file: "stackdash-migrate/restart.md", name: "stackdash-migrate:restart", goal: true },
  { file: "stackdash-migrate/dry-run.md", name: "stackdash-migrate:dry-run", goal: false },
];

describe("skills — all 12 exist and are well-formed", () => {
  it.each(EXPECTED_SKILLS)("%s has valid SKILL.md frontmatter", async (slug) => {
    const file = path.join(SKILLS_DIR, slug, "SKILL.md");
    const { frontmatter, body } = await parseMarkdownWithFrontmatter(file);
    expect(frontmatter.name).toBe(slug);
    expect(typeof frontmatter.description).toBe("string");
    expect((frontmatter.description as string).length).toBeGreaterThan(20);
    expect(body.length).toBeGreaterThan(0);
  });

  it("no unexpected stackdash skills exist", async () => {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const found = entries
      .filter((e) => e.isDirectory() && e.name.startsWith("stackdash-"))
      .map((e) => e.name)
      .sort();
    expect(found).toEqual([...EXPECTED_SKILLS].sort());
  });
});

describe("analyst subagents — all 4 exist, well-formed, read-only", () => {
  it.each(EXPECTED_AGENTS)("%s has valid AGENT.md frontmatter", async (slug) => {
    const file = path.join(AGENTS_DIR, slug, "AGENT.md");
    const { frontmatter, body } = await parseMarkdownWithFrontmatter(file);
    expect(frontmatter.name).toBe(slug);
    expect(typeof frontmatter.description).toBe("string");
    // read-only mandate is explicit
    expect(frontmatter.tools).toBe("read-only");
    expect(body.toLowerCase()).toContain("read-only");
  });

  it("every skill an agent references actually exists", async () => {
    for (const slug of EXPECTED_AGENTS) {
      const file = path.join(AGENTS_DIR, slug, "AGENT.md");
      const { frontmatter } = await parseMarkdownWithFrontmatter(file);
      const skills = (frontmatter.skills as string[] | undefined) ?? [];
      expect(Array.isArray(skills)).toBe(true);
      for (const s of skills) {
        expect(EXPECTED_SKILLS, `agent ${slug} references unknown skill ${s}`).toContain(s);
      }
    }
  });
});

describe("namespaced slash commands — all 4 exist and resolve", () => {
  it.each(EXPECTED_COMMANDS)("$name is well-formed", async ({ file, name, goal }) => {
    const full = path.join(COMMANDS_DIR, file);
    const { frontmatter, body } = await parseMarkdownWithFrontmatter(full);
    expect(frontmatter.name).toBe(name);
    expect(typeof frontmatter.description).toBe("string");
    // page id comes from $ARGUMENTS, never a hard-coded default
    expect(body).toContain("$ARGUMENTS");
    expect(body).toMatch(/\[a-z0-9-\]\+/); // the safe-slug rule is stated
    expect(body.toLowerCase()).toContain("never");
    if (goal) {
      expect(frontmatter.goal).toBe(true);
    }
  });

  it("commands reference the shared apparatus, not duplicated logic", async () => {
    const { body } = await parseMarkdownWithFrontmatter(
      path.join(COMMANDS_DIR, "stackdash-migrate.md"),
    );
    expect(body).toContain("scripts/workflow/schemas");
    expect(body).toContain("scripts/workflow/validators");
    expect(body).toContain("CONSTITUTION.md");
  });

  it("dry-run is read-only (no page modification / contract mutation)", async () => {
    const { body } = await parseMarkdownWithFrontmatter(
      path.join(COMMANDS_DIR, "stackdash-migrate/dry-run.md"),
    );
    const low = body.toLowerCase();
    expect(low).toContain("no page modification");
    expect(low).toContain("no contract mutation");
  });
});

describe("page-id validation — $ARGUMENTS single-safe-slug guard", () => {
  it("accepts a single safe slug", () => {
    expect(validatePageId("tdarr")).toEqual({ ok: true, pageId: "tdarr" });
    expect(validatePageId("  downloads  ")).toEqual({ ok: true, pageId: "downloads" });
    expect(validatePageId("plex-recent").ok).toBe(true);
  });

  it("rejects empty / missing", () => {
    expect(validatePageId("").ok).toBe(false);
    expect(validatePageId("   ").ok).toBe(false);
    expect(validatePageId(undefined).ok).toBe(false);
    expect(validatePageId(null).ok).toBe(false);
  });

  it("rejects multiple identifiers", () => {
    expect(validatePageId("tdarr downloads").ok).toBe(false);
    expect(validatePageId("tdarr extra args").ok).toBe(false);
  });

  it("rejects malformed identifiers", () => {
    expect(validatePageId("Tdarr").ok).toBe(false); // uppercase
    expect(validatePageId("../etc/passwd").ok).toBe(false);
    expect(validatePageId("tdarr;rm -rf").ok).toBe(false);
    expect(validatePageId("page_underscore").ok).toBe(false);
    expect(validatePageId("$PAGE").ok).toBe(false);
  });

  it("never silently defaults to a page", () => {
    // A failing result carries no pageId — callers cannot fall through to tdarr.
    const r = validatePageId("");
    expect(r.pageId).toBeUndefined();
    expect(r.error).toBeTruthy();
  });
});
