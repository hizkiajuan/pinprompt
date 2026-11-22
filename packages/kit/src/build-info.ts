import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What a build is: the app's version (`package.json`, the only place it is written) and the commit it
 * was built from. Bun only, at build time (`build.ts`, `dev.ts`): never import it from a Worker or the
 * browser. The browser gets the values through `stampBuildInfo()`, as `PUBLIC_VERSION` and
 * `PUBLIC_COMMIT`, which the bundler inlines like any other `PUBLIC_*` variable.
 */

export interface BuildInfo {
  readonly version: string;
  readonly commit: string;
}

/** `version` from `package.json` in `dir` (default: the working directory). */
export function readVersion(dir = "."): string {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version?: unknown };
  if (typeof pkg.version !== "string")
    throw new Error(`No "version" in ${join(dir, "package.json")}`);
  return pkg.version;
}

/**
 * The short commit: Workers Builds (`WORKERS_CI_COMMIT_SHA`), GitHub Actions (`GITHUB_SHA`), Pages
 * (`CF_PAGES_COMMIT_SHA`), then local git; "" when none of them knows.
 */
export function commitSha(
  env: Record<string, string | undefined> = process.env,
  cwd = ".",
): string {
  const fromCi = env.WORKERS_CI_COMMIT_SHA ?? env.GITHUB_SHA ?? env.CF_PAGES_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    const git = Bun.spawnSync(["git", "rev-parse", "--short=7", "HEAD"], { cwd, stderr: "ignore" });
    return git.success ? git.stdout.toString().trim() : "";
  } catch {
    return "";
  }
}

export function buildInfo(dir = "."): BuildInfo {
  return { version: readVersion(dir), commit: commitSha(process.env, dir) };
}

/** Sets `PUBLIC_VERSION` and `PUBLIC_COMMIT` for the bundler, and returns them. */
export function stampBuildInfo(dir = "."): BuildInfo {
  const info = buildInfo(dir);
  process.env.PUBLIC_VERSION = info.version;
  process.env.PUBLIC_COMMIT = info.commit;
  return info;
}

/**
 * Static HTML marks the version as `<span data-version>dev</span>` (any element with the attribute,
 * holding the text `dev`); this writes `v1.2.3` in its place, for `build.ts` and the dev server.
 */
export function stampVersion(html: string, version: string): string {
  return html.replace(/(<[^>]*\bdata-version\b[^>]*>)dev</g, `$1v${version}<`);
}
