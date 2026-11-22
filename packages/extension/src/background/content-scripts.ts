import { getAllowedOrigins, hasHostAccess, hostPatterns } from "../settings/origins.js";

/**
 * Content scripts are registered at runtime for the allowlisted hosts only, instead of being
 * declared in the manifest, so an origin added later (a LAN or tailnet dev host, granted through
 * an optional permission) gets them too. Two scripts per page:
 *
 * - `fiber-probe` runs in the page's own JavaScript world. Only there can it see the
 *   `__reactFiber$…` properties React puts on DOM nodes; the isolated content-script world gets
 *   a separate view of each node without them.
 * - `content-script` runs in the isolated world and owns the overlay and capture.
 */
export const CONTENT_SCRIPT_FILES = {
  main: "build/main-world/fiber-probe.js",
  isolated: "build/content/content-script.js",
} as const;

const SCRIPT_IDS = ["pinprompt-fiber-probe", "pinprompt-overlay"] as const;

/**
 * Several triggers can fire together (install runs a sync while writing the default allowlist,
 * which fires the storage listener's sync), and two overlapping syncs would both see nothing
 * registered and both register: "Duplicate script ID". Syncs therefore run one after another.
 */
let syncQueue: Promise<void> = Promise.resolve();

export function syncContentScripts(): Promise<void> {
  const next = syncQueue.catch(() => undefined).then(syncNow);
  syncQueue = next;

  return next;
}

async function syncNow(): Promise<void> {
  const origins = await getAllowedOrigins();
  const accessible: string[] = [];

  for (const origin of origins) {
    if (await hasHostAccess(origin)) {
      accessible.push(origin);
    }
  }

  const matches = hostPatterns(accessible);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [...SCRIPT_IDS] });

  if (registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: registered.map((script) => script.id) });
  }

  if (matches.length === 0) {
    return;
  }

  await chrome.scripting.registerContentScripts([
    {
      id: SCRIPT_IDS[0],
      matches,
      js: [CONTENT_SCRIPT_FILES.main],
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: true,
    },
    {
      id: SCRIPT_IDS[1],
      matches,
      js: [CONTENT_SCRIPT_FILES.isolated],
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
  ]);
}

/**
 * Injects both scripts into a tab that was already open when the extension was installed,
 * updated or allowed a new host (registered scripts only reach pages loaded afterwards). Each
 * script guards against running twice.
 */
export async function injectContentScripts(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILES.main],
    world: "MAIN",
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILES.isolated],
  });
}
