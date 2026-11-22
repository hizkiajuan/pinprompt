# @pinprompt/kit

Build and release helpers shared by the extension, the site and `scripts/release.ts`:

- `fonts`, `fonts/install`, `fonts/allo.css`: the Allo type system (font stacks, the stylesheet, and `copyFontFiles`, which copies the WOFF2 files into a build at `/fonts/`). Every font under `src/fonts/files/` is SIL Open Font License; each folder carries its `OFL.txt`.
- `build-info`: `readVersion` and `stampVersion` for the site build.
- `release`: `releaseCli` (bump, changelog, tag, GitHub Release) and `versionMismatches`.

These modules started as a copy of the author's private `@hzkjn/kit` (0.30.0), so anyone can install and build Pinprompt without access to it. They are owned here now: change them in this repo. `allo.css` is generated from `fonts/index.ts`, and a test checks the two stay in sync.
