import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fontSystems, type FontSystemName } from "./index";

/**
 * Copies a system's font files and their licences into `dir` (an app's build output plus `fonts/`,
 * such as `dist/fonts`), keeping the folder layout the stylesheet's `/fonts/` URLs expect. Bun only,
 * for `build.ts` and `dev.ts`. Copy at build time and keep the output folder out of git. Returns the
 * copied paths, relative to `dir`.
 */
export function copyFontFiles(system: FontSystemName, dir: string): string[] {
  const source = join(import.meta.dir, "files");
  const { files, licences } = fontSystems[system];
  const paths = [...files.map((file) => file.file), ...licences];
  for (const path of paths) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    copyFileSync(join(source, path), join(dir, path));
  }
  return paths;
}
