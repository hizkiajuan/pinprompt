import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { fontSystems, fontsCss } from "./index";

test("allo.css matches fontsCss('allo')", () => {
  const css = readFileSync(join(import.meta.dir, "allo.css"), "utf8");
  expect(css).toBe(fontsCss("allo"));
});

test("every Allo font file and license is in the repo", () => {
  const { files, licenses } = fontSystems.allo;
  for (const path of [...files.map((file) => file.file), ...licenses]) {
    expect(existsSync(join(import.meta.dir, "files", path))).toBe(true);
  }
});
