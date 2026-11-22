import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Releases for an app repo: one command bumps the version everywhere it is written, adds a
 * `CHANGELOG.md` section, runs the app's gate, commits, tags `vX.Y.Z`, pushes, and publishes the
 * GitHub Release (marked Latest, so it shows on the repo's home page). Bun only, run from the app's
 * `scripts/release.ts`: `await releaseCli(process.argv.slice(2))`. Needs `git` and an authenticated
 * `gh`.
 *
 * The version lives in `package.json`; other files that carry it (an extension `manifest.json`) are
 * listed under `"release": { "files": [...] }` there, and `versionMismatches` lets a test fail when
 * one drifts.
 */

export type Bump = "major" | "minor" | "patch";

export interface Commit {
  readonly hash: string;
  readonly subject: string;
  readonly body: string;
}

export interface ParsedCommit {
  readonly type: string | null;
  readonly scope: string | null;
  readonly breaking: boolean;
  readonly description: string;
}

const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

export function parseCommit(commit: Pick<Commit, "subject" | "body">): ParsedCommit {
  const match = CONVENTIONAL.exec(commit.subject.trim());
  const breakingBody = /^BREAKING[ -]CHANGE:/m.test(commit.body);
  if (!match) {
    return { type: null, scope: null, breaking: breakingBody, description: commit.subject.trim() };
  }
  const [, type = "", scope, bang, description = ""] = match;
  return {
    type: type.toLowerCase(),
    scope: scope ?? null,
    breaking: bang === "!" || breakingBody,
    description: description.trim(),
  };
}

/**
 * The bump the commits ask for: a breaking change is major (minor below 1.0.0), `feat` is minor,
 * anything else is a patch. Null when there is nothing to release.
 */
export function bumpFor(commits: readonly Commit[], current: string): Bump | null {
  if (commits.length === 0) return null;
  const parsed = commits.map(parseCommit);
  const [major] = parseVersion(current);
  if (parsed.some((commit) => commit.breaking)) return major === 0 ? "minor" : "major";
  if (parsed.some((commit) => commit.type === "feat")) return "minor";
  return "patch";
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Not a plain x.y.z version: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function nextVersion(current: string, bump: Bump | string): string {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  const [major, minor, patch] = parseVersion(current);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump "${bump}": use major, minor, patch or x.y.z`);
}

const SECTIONS: readonly [string, (commit: ParsedCommit) => boolean][] = [
  ["Breaking changes", (commit) => commit.breaking],
  ["Features", (commit) => commit.type === "feat"],
  ["Fixes", (commit) => commit.type === "fix" || commit.type === "perf"],
  ["Dependencies", (commit) => commit.type === "chore" && commit.scope === "deps"],
  ["Other changes", () => true],
];

/** The release notes: commit subjects grouped by kind, each with its short hash. */
export function releaseNotes(commits: readonly Commit[], repoUrl?: string): string {
  const remaining = commits.map((commit) => ({ commit, parsed: parseCommit(commit) }));
  const blocks: string[] = [];
  for (const [title, matches] of SECTIONS) {
    const taken = remaining.filter((entry) => matches(entry.parsed));
    if (taken.length === 0) continue;
    for (const entry of taken) remaining.splice(remaining.indexOf(entry), 1);
    const lines = taken.map(({ commit, parsed }) => {
      const short = commit.hash.slice(0, 7);
      const ref = repoUrl ? `[${short}](${repoUrl}/commit/${commit.hash})` : short;
      const text = parsed.description.charAt(0).toUpperCase() + parsed.description.slice(1);
      return `- ${text} (${ref})`;
    });
    blocks.push(`### ${title}\n\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

/** `CHANGELOG.md` with a new section for `version` on top. */
export function prependChangelog(existing: string, version: string, date: string, notes: string) {
  const header = "# Changelog";
  const section = `## v${version} (${date})\n\n${notes}\n`;
  const rest = existing.trim().startsWith(header)
    ? existing.trim().slice(header.length).trim()
    : existing.trim();
  return `${header}\n\n${section}${rest ? `\n${rest}\n` : ""}`;
}

/** Rewrites the first top-level `"version": "..."` in a JSON file, keeping its formatting. */
export function setJsonVersion(text: string, version: string): string {
  const pattern = /("version"\s*:\s*")[^"]*(")/;
  if (!pattern.test(text)) throw new Error('No "version" field to update');
  return text.replace(pattern, `$1${version}$2`);
}

interface PackageJson {
  version?: string;
  release?: { files?: string[] };
  scripts?: Record<string, string>;
}

function readPackage(dir: string): PackageJson {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageJson;
}

/** Files (other than `package.json`) whose `version` must match it, from `release.files`. */
export function versionFiles(dir = "."): string[] {
  return readPackage(dir).release?.files ?? [];
}

/** Each listed file whose version differs from `package.json`; empty when they agree. */
export function versionMismatches(dir = "."): { file: string; version: string | null }[] {
  const expected = readPackage(dir).version;
  return versionFiles(dir).flatMap((file) => {
    const version = (JSON.parse(readFileSync(join(dir, file), "utf8")) as { version?: string })
      .version;
    return version === expected ? [] : [{ file, version: version ?? null }];
  });
}

export interface ReleaseOptions {
  /** major, minor, patch or an exact x.y.z; worked out from the commits when left out. */
  readonly bump?: string;
  readonly dir?: string;
  readonly branch?: string;
  /** The `package.json` script that must pass first; default `build:ci`, else `ci`. */
  readonly check?: string | false;
  readonly dryRun?: boolean;
  readonly log?: (line: string) => void;
  /** Publishes the GitHub Release; default `gh release create` with the notes, marked Latest. */
  readonly publish?: (tag: string, notes: string, dir: string) => void;
  /** Checked before anything is written; default: `gh` can reach the repository's releases. */
  readonly preflight?: (dir: string) => void;
}

function ghPreflight(dir: string) {
  try {
    sh(["gh", "release", "list", "--limit", "1"], dir);
  } catch (error) {
    const hint =
      process.env.GITHUB_TOKEN || process.env.GH_TOKEN
        ? " GITHUB_TOKEN or GH_TOKEN is set (an app's .env file?) and gh uses it over your login: run with `bun --no-env-file` or unset it."
        : " Run `gh auth login`.";
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`gh can't publish releases here.${hint} (${detail})`);
  }
}

function ghRelease(tag: string, notes: string, dir: string) {
  sh(
    [
      "gh",
      "release",
      "create",
      tag,
      "--verify-tag",
      "--latest",
      "--title",
      tag,
      "--notes-file",
      "-",
    ],
    dir,
    notes,
  );
}

function sh(command: string[], cwd: string, input?: string) {
  const result = Bun.spawnSync(command, {
    cwd,
    stdin: input === undefined ? "inherit" : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (!result.success) {
    const stderr = result.stderr.toString().trim();
    throw new Error(`${command.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
  return result.stdout.toString().trim();
}

function tryGit(args: string[], cwd: string) {
  try {
    return sh(["git", ...args], cwd);
  } catch {
    return null;
  }
}

function commitsSince(tag: string | null, cwd: string): Commit[] {
  const range = tag ? [`${tag}..HEAD`] : ["HEAD"];
  const raw = sh(["git", "log", ...range, "--no-merges", "--format=%H%x1f%s%x1f%b%x1e"], cwd);
  return raw
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = "", subject = "", body = ""] = entry.split("\x1f");
      return { hash, subject, body };
    });
}

function repoUrl(cwd: string): string | undefined {
  const remote = tryGit(["remote", "get-url", "origin"], cwd);
  const match = remote && /github\.com[:/](.+?)(?:\.git)?$/.exec(remote);
  return match ? `https://github.com/${match[1]}` : undefined;
}

export interface ReleasePlan {
  readonly version: string;
  readonly previousTag: string | null;
  readonly commits: readonly Commit[];
  readonly notes: string;
  readonly files: readonly string[];
}

/**
 * Releases the app in `dir`. Refuses unless on `branch` (default `main`) with a clean tree level with
 * `origin`. The first release (no `v*` tag yet) ships the version already in `package.json` unless a
 * bump is given. Nothing is committed when the gate fails.
 */
export async function release(options: ReleaseOptions = {}): Promise<ReleasePlan> {
  const dir = options.dir ?? ".";
  const branch = options.branch ?? "main";
  const log = options.log ?? ((line: string) => console.log(line));

  const current = sh(["git", "branch", "--show-current"], dir);
  if (current !== branch)
    throw new Error(`Release from ${branch}; this is ${current || "a detached HEAD"}`);
  if (sh(["git", "status", "--porcelain"], dir))
    throw new Error("Commit or stash your changes first");
  sh(["git", "fetch", "--tags", "origin", branch], dir);
  const local = sh(["git", "rev-parse", "HEAD"], dir);
  const remote = sh(["git", "rev-parse", `origin/${branch}`], dir);
  if (local !== remote)
    throw new Error(`${branch} isn't level with origin/${branch}: pull or push first`);

  const pkg = readPackage(dir);
  if (!pkg.version) throw new Error('package.json has no "version"');
  const previousTag = tryGit(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"], dir);
  const commits = commitsSince(previousTag, dir);
  if (previousTag && commits.length === 0)
    throw new Error(`Nothing to release since ${previousTag}`);

  const version = options.bump
    ? nextVersion(pkg.version, options.bump)
    : previousTag
      ? nextVersion(pkg.version, bumpFor(commits, pkg.version) ?? "patch")
      : pkg.version;
  const tag = `v${version}`;
  if (tryGit(["rev-parse", "-q", "--verify", `refs/tags/${tag}`], dir))
    throw new Error(`${tag} already exists`);

  const url = repoUrl(dir);
  const notes = previousTag ? releaseNotes(commits, url) : `First release.`;
  const files = ["package.json", ...(pkg.release?.files ?? []), "CHANGELOG.md"];
  const plan: ReleasePlan = { version, previousTag, commits, notes, files };
  if (!options.dryRun) (options.preflight ?? (options.publish ? () => {} : ghPreflight))(dir);

  log(
    `${tag}${previousTag ? ` (${commits.length} commits since ${previousTag})` : " (first release)"}`,
  );
  log(notes);
  if (options.dryRun) {
    log("Dry run: nothing written.");
    return plan;
  }

  const date = new Date().toISOString().slice(0, 10);
  const touched: string[] = [];
  for (const file of ["package.json", ...(pkg.release?.files ?? [])]) {
    const path = join(dir, file);
    writeFileSync(path, setJsonVersion(readFileSync(path, "utf8"), version));
    touched.push(file);
  }
  const changelogPath = join(dir, "CHANGELOG.md");
  const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "";
  writeFileSync(changelogPath, prependChangelog(changelog, version, date, notes));
  touched.push("CHANGELOG.md");

  const check =
    options.check === false
      ? null
      : (options.check ?? (pkg.scripts?.["build:ci"] ? "build:ci" : pkg.scripts?.ci ? "ci" : null));
  if (check) {
    log(`Running bun run ${check}...`);
    const gate = Bun.spawnSync(["bun", "run", check], {
      cwd: dir,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (!gate.success) {
      tryGit(["checkout", "--", ...touched.filter((file) => file !== "CHANGELOG.md")], dir);
      if (changelog) writeFileSync(changelogPath, changelog);
      else tryGit(["clean", "-f", "--", "CHANGELOG.md"], dir);
      throw new Error(`bun run ${check} failed; nothing was released`);
    }
  }

  sh(["git", "add", "--", ...touched], dir);
  sh(["git", "commit", "-m", `Release ${tag}`], dir);
  sh(["git", "tag", "-a", tag, "-m", tag], dir);
  sh(["git", "push", "--atomic", "origin", branch, tag], dir);
  (options.publish ?? ghRelease)(tag, notes, dir);
  log(`Released ${tag}${url ? `: ${url}/releases/tag/${tag}` : ""}`);
  return plan;
}

/** `bun scripts/release.ts [major|minor|patch|x.y.z] [--dry-run] [--no-check]` */
export async function releaseCli(argv: readonly string[]) {
  const bump = argv.find((arg) => !arg.startsWith("--"));
  try {
    await release({
      ...(bump ? { bump } : {}),
      dryRun: argv.includes("--dry-run"),
      ...(argv.includes("--no-check") ? { check: false } : {}),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
