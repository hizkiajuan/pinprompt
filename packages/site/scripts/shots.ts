#!/usr/bin/env bun
/*
 Screenshots of the real extension on the Tallybook demo app (demo/): the landing page's hero
 (public/shots/) and the Chrome Web Store set (docs/store/screenshots/, 1280 x 800).

   bun run --cwd packages/extension build && bun run shots

 Needs Chromium (CHROMIUM_PATH, default /usr/bin/chromium; Chrome stable ignores --load-extension)
 and ImageMagick (`magick`). Pages are laid out at 1024 x 640 and captured at 2x, so the UI reads
 larger in the store; the store set is then resized to 1280 x 800 with Lanczos, which keeps text
 sharp (a 1x capture looks soft).
 Automation can't click the toolbar button, which is what grants a real user the screenshot
 permission, so the run loads a copy of the extension that also has <all_urls>.
*/
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Page } from "playwright-core";

import demo from "../demo/index.html";

const root = join(import.meta.dir, "..", "..", "..");
const extension = join(root, "packages", "extension");
const heroDir = join(import.meta.dir, "..", "public", "shots");
const storeDir = join(root, "docs", "store", "screenshots");

const work = mkdtempSync(join(tmpdir(), "pinprompt-shots-"));
const unpacked = join(work, "extension");
for (const part of ["manifest.json", "options.html", "build", "fonts", "icons"]) {
  cpSync(join(extension, part), join(unpacked, part), { recursive: true });
}
const manifest = await Bun.file(join(unpacked, "manifest.json")).json();
manifest.host_permissions.push("<all_urls>");
await Bun.write(join(unpacked, "manifest.json"), JSON.stringify(manifest, null, 2));

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  routes: { "/*": demo },
  development: true,
});
const origin = `http://127.0.0.1:${server.port}`;

const context = await chromium.launchPersistentContext(join(work, "profile"), {
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${unpacked}`,
    `--load-extension=${unpacked}`,
    "--headless=new",
  ],
  viewport: { width: 1024, height: 640 },
  deviceScaleFactor: 2,
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await Bun.sleep(500);
  await worker.evaluate(
    async (allowed) => chrome.storage.local.set({ "pinprompt.allowedOrigins": [allowed] }),
    origin,
  );
  await Bun.sleep(800);

  const page = await context.newPage();
  await page.goto(`${origin}/settings/billing`);
  await page.waitForSelector(".bubble-main");
  mkdirSync(heroDir, { recursive: true });
  mkdirSync(storeDir, { recursive: true });

  // 1. Comment mode: hover names the component.
  await page.keyboard.press("c");
  await page.hover("#upgrade");
  await Bun.sleep(300);
  await shot(page, join(storeDir, "1-comment-mode.png"));

  // 2. Pin and comment on the button.
  await page.click("#upgrade");
  await comment(
    page,
    'Make this the primary action: filled, full width on mobile, and label it "Upgrade to Pro"',
  );

  // 3. A region over the usage chart.
  const chart = (await page.locator(".usage .chart").boundingBox())!;
  await page.keyboard.press("c");
  await page.mouse.move(chart.x - 8, chart.y - 8);
  await page.mouse.down();
  await page.mouse.move(chart.x + chart.width + 8, chart.y + chart.height + 8, { steps: 8 });
  await page.mouse.up();
  await comment(
    page,
    "Show the month as a percentage of the 2,000 limit, and turn the bar amber above 80%.",
  );

  // 4. An invoice row.
  await page.keyboard.press("c");
  await page.click("tbody tr:nth-of-type(2) td:nth-of-type(1)");
  await comment(page, "Clicking a paid invoice should open its PDF in a new tab.");

  // Hero: pin 1 open for editing, the others on the page.
  await page.mouse.move(512, 620);
  await page.click(".marker >> text=1");
  await page.waitForSelector(".composer textarea");
  await Bun.sleep(300);
  await shot(page, join(heroDir, "hero.png"), 2);
  await shot(page, join(storeDir, "2-comment.png"));
  await page.keyboard.press("Escape");

  // The tray.
  await page.click(".bubble-main");
  await page.waitForSelector(".tray .thumb");
  await Bun.sleep(300);
  await shot(page, join(storeDir, "3-pins-and-tray.png"));

  console.log(`Saved ${heroDir}/hero.png and the store set in ${storeDir}`);
} finally {
  await context.close();
  server.stop(true);
  rmSync(work, { recursive: true, force: true });
}

async function comment(page: Page, text: string): Promise<void> {
  await page.waitForSelector(".composer textarea");
  await page.keyboard.type(text);
  await page.keyboard.press("Control+Enter");
  await page.waitForSelector(".composer", { state: "detached" });
}

/**
 * Always a 2x capture (2048 x 1280). The hero keeps it; the store wants exactly 1280 x 800 as a
 * 24-bit PNG without alpha, resized with Lanczos so text stays crisp.
 */
async function shot(page: Page, path: string, scale: 1 | 2 = 1): Promise<void> {
  const buffer = await page.screenshot({ scale: "device" });
  if (scale === 2) {
    await Bun.write(path, buffer);
    return;
  }
  const raw = join(work, "raw.png");
  await Bun.write(raw, buffer);
  const resized = Bun.spawnSync([
    "magick",
    raw,
    "-filter",
    "Lanczos",
    "-resize",
    "1280x800!",
    "-unsharp",
    "0x0.6+0.4+0",
    "-strip",
    "-alpha",
    "off",
    `PNG24:${path}`,
  ]);
  if (resized.exitCode !== 0) throw new Error(resized.stderr.toString());
}
