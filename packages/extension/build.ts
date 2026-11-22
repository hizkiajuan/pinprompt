// Builds the unpacked extension in place: bundles under build/, Allo font files under fonts/.
// Both folders are generated and stay out of git; load packages/extension in Chrome afterwards.
import { rmSync } from "node:fs";
import { join } from "node:path";

import { FONTS_EXTERNAL } from "@pinprompt/kit/fonts";
import { copyFontFiles } from "@pinprompt/kit/fonts/install";

const root = import.meta.dir;
const out = join(root, "build");

type Entry = {
  entry: string;
  outdir: string;
  // Content scripts are classic scripts, so they get an IIFE; the worker and panel are modules.
  format: "esm" | "iife";
};

const entries: Entry[] = [
  { entry: "src/background/service-worker.ts", outdir: "background", format: "esm" },
  { entry: "src/content/content-script.ts", outdir: "content", format: "iife" },
  { entry: "src/main-world/fiber-probe.ts", outdir: "main-world", format: "iife" },
  { entry: "src/options/options.ts", outdir: "options", format: "esm" },
  { entry: "src/options/options.css", outdir: "options", format: "esm" },
];

rmSync(out, { recursive: true, force: true });
rmSync(join(root, "fonts"), { recursive: true, force: true });

for (const { entry, outdir, format } of entries) {
  const result = await Bun.build({
    entrypoints: [join(root, entry)],
    outdir: join(out, outdir),
    target: "browser",
    format,
    minify: process.env.NODE_ENV === "production",
    // The font stylesheet points at /fonts/…, which is the extension root's fonts/ folder.
    external: FONTS_EXTERNAL,
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }

    process.exit(1);
  }
}

const fonts = copyFontFiles("allo", join(root, "fonts"));

console.log(`Built ${entries.length} bundles and copied ${fonts.length} Allo font files.`);
