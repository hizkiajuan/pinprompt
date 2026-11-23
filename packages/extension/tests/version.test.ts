import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The release writes the root package.json version to every file in its "release.files"; this
// catches a hand edit that skipped one.
test("manifest and package versions match the root package.json", () => {
  const root = join(import.meta.dir, "..", "..", "..");
  const read = (file: string) =>
    (JSON.parse(readFileSync(join(root, file), "utf8")) as { version?: string }).version;
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    version: string;
    release: { files: string[] };
  };
  for (const file of pkg.release.files) expect([file, read(file)]).toEqual([file, pkg.version]);
});
