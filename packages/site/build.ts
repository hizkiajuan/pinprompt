#!/usr/bin/env bun
/*
 Builds the landing page into dist/ (served by the Worker as static assets, see wrangler.jsonc):

 - src/index.html and src/privacy.html (privacy text from docs/store/privacy-policy.md),
 - the Allo font files at /fonts/, the icon, the screenshots in public/,
 - the extension zip at /download/pinprompt-<version>.zip, packed by `bun run package` at the
   repo root when it isn't there yet (DEV=1 skips that).

 STORE_URL switches the calls to action from the zip to the Chrome Web Store once the listing is
 live. The version is the root package.json's, the one `bun run release` bumps.
*/
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { readVersion, stampVersion } from "@pinprompt/kit/build-info";
import { FONTS_EXTERNAL } from "@pinprompt/kit/fonts";
import { copyFontFiles } from "@pinprompt/kit/fonts/install";
import { marked } from "marked";

const site = import.meta.dir;
const root = join(site, "..", "..");
const out = join(site, "dist");
const version = readVersion(root);
const zipName = `pinprompt-${version}.zip`;
const zipSource = join(root, "dist", zipName);
const storeUrl = process.env.STORE_URL ?? "";
const repoUrl = process.env.REPO_URL ?? "https://github.com/hizkiajuan/pinprompt";
const dev = process.env.DEV === "1";

if (!existsSync(zipSource) && !dev) {
  const packed = Bun.spawnSync(["bun", "run", "package"], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (packed.exitCode !== 0) {
    process.exit(packed.exitCode ?? 1);
  }
}

await rm(out, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [join(site, "src", "index.html"), join(site, "src", "privacy.html")],
  outdir: out,
  root: join(site, "src"),
  minify: !dev,
  publicPath: "/",
  // The kit stylesheet points at /fonts/, copied below; everything else is bundled and hashed.
  external: FONTS_EXTERNAL,
  plugins: [
    {
      // Root files copied below (icons, favicon, manifest) keep their plain, stable URLs.
      name: "root-files",
      setup(build) {
        // Bun hands root-relative links over as paths under this folder.
        build.onResolve(
          { filter: /\/(icons\/[\w.-]+|favicon\.ico|site\.webmanifest)$/ },
          ({ path }) =>
            path.startsWith(`${site}/`)
              ? { path: path.slice(site.length), external: true }
              : undefined,
        );
      },
    },
  ],
  naming: {
    entry: "[name].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    asset: "assets/[name]-[hash].[ext]",
  },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }

  process.exit(1);
}

const privacy = await marked.parse(
  await Bun.file(join(root, "docs", "store", "privacy-policy.md")).text(),
);

// Bun emits a script for every HTML entry; the privacy page's is empty, so drop it.
const emptyScripts: string[] = [];
for (const output of result.outputs.filter((file) => file.path.endsWith(".js"))) {
  if ((await Bun.file(output.path).text()).trim() === "") {
    emptyScripts.push(output.path.slice(output.path.lastIndexOf("/") + 1));
    await rm(output.path);
  }
}

for (const output of result.outputs.filter((file) => file.path.endsWith(".html"))) {
  let html = stampVersion(await Bun.file(output.path).text(), version)
    .replaceAll("__ZIP__", `/download/${zipName}`)
    .replaceAll("__ZIP_NAME__", zipName)
    .replaceAll("__STORE_URL__", storeUrl)
    .replaceAll("__REPO_URL__", repoUrl)
    .replace("<!--privacy-->", privacy);

  for (const name of emptyScripts) {
    html = html.replace(new RegExp(`<script[^>]*src="/assets/${name}"[^>]*></script>`), "");
  }

  // Exactly one of the two calls to action ships: the store once it's live, the zip until then.
  html = html.replace(
    storeUrl
      ? /<!--if-no-store-->[\s\S]*?<!--\/if-no-store-->/g
      : /<!--if-store-->[\s\S]*?<!--\/if-store-->/g,
    "",
  );

  await Bun.write(output.path, html);
}

// Stable URLs for what other sites link to: the link-preview image, the favicons, the manifest.
await cp(join(site, "public", "shots"), join(out, "shots"), { recursive: true });
await cp(join(site, "public", "icons"), join(out, "icons"), { recursive: true });
for (const file of ["favicon.ico", "site.webmanifest"]) {
  await cp(join(site, "public", file), join(out, file));
}

if (existsSync(zipSource)) {
  await mkdir(join(out, "download"), { recursive: true });
  await cp(zipSource, join(out, "download", zipName));
}

const fonts = copyFontFiles("allo", join(out, "fonts"));

console.log(`Built the site (v${version}) into dist/ with ${fonts.length} font files.`);
