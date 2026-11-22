#!/usr/bin/env bun
/*
 Local dev launcher for the landing page: builds into dist/ (DEV=1: unminified, no extension zip),
 serves it the way the Worker's static assets do, and rebuilds when src/ or public/ change.

 It listens on 127.0.0.1 only, on PORT when set, else 5180, else the next free port.
*/
import { watch } from "node:fs";
import { join } from "node:path";

const site = import.meta.dir;
const dist = join(site, "dist");

function build(): void {
  const result = Bun.spawnSync(["bun", "build.ts"], {
    cwd: site,
    env: { ...process.env, DEV: "1" },
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    console.error("Build failed; serving the last good build.");
  }
}

build();

let timer: ReturnType<typeof setTimeout> | undefined;
for (const folder of ["src", "public"]) {
  watch(join(site, folder), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(build, 120);
  });
}

async function fetch(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  // Like Workers static assets: /privacy serves privacy.html, / serves index.html.
  const candidates = pathname.endsWith("/")
    ? [`${pathname}index.html`]
    : [pathname, `${pathname}.html`, `${pathname}/index.html`];

  for (const candidate of candidates) {
    const file = Bun.file(join(dist, decodeURIComponent(candidate)));

    if (await file.exists()) {
      return new Response(file);
    }
  }

  return new Response("Not found", { status: 404 });
}

function serve(port: number) {
  return Bun.serve({ hostname: "127.0.0.1", port, fetch });
}

function listen(): ReturnType<typeof serve> {
  if (process.env.PORT) {
    return serve(Number(process.env.PORT));
  }

  for (let port = 5180; port < 5200; port++) {
    try {
      return serve(port);
    } catch {
      // In use: try the next one.
    }
  }

  return serve(0);
}

const server = listen();

console.log(`Pinprompt site on http://127.0.0.1:${server.port}/`);
