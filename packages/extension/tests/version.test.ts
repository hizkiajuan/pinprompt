import { expect, test } from "bun:test";
import { join } from "node:path";

import { versionMismatches } from "@pinprompt/kit/release";

// `bun run release` writes the version to every file in package.json's "release.files"; this
// catches a hand edit that skipped one.
test("manifest and package versions match the root package.json", () => {
  expect(versionMismatches(join(import.meta.dir, "..", "..", ".."))).toEqual([]);
});
