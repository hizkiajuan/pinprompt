// Builds the extension for production and zips it for the Chrome Web Store:
// dist/pinprompt-<version>.zip, with manifest.json at the zip root. Zipped in JS (fflate) because
// the Workers Builds image has no `zip` command.
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { zipSync, type Zippable } from "fflate";

const root = join(import.meta.dir, "..");
const extension = join(root, "packages", "extension");
const { version } = await Bun.file(join(extension, "manifest.json")).json();
const dist = join(root, "dist");
const zipPath = join(dist, `pinprompt-${version}.zip`);

run(["bun", "run", "build:prod"], extension);

mkdirSync(dist, { recursive: true });
rmSync(zipPath, { force: true });
const files: Zippable = {};
for (const part of ["manifest.json", "options.html", "build", "icons", "fonts"]) {
  const path = join(extension, part);
  const paths = statSync(path).isDirectory()
    ? [...new Bun.Glob("**/*").scanSync({ cwd: path, onlyFiles: true })].map((file) =>
        join(path, file),
      )
    : [path];

  for (const file of paths.sort()) {
    // A fixed date keeps the zip byte-identical for identical builds.
    files[relative(extension, file)] = [readFileSync(file), { mtime: new Date("2026-01-01") }];
  }
}
await Bun.write(zipPath, zipSync(files, { level: 9 }));

console.log(`Packed ${zipPath}`);

function run(cmd: string[], cwd: string): void {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });

  if (result.exitCode !== 0) {
    process.exit(result.exitCode ?? 1);
  }
}
