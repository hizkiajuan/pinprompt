import type { PinSessionType } from "@pinprompt/core";

import type { CommentDraft } from "../messaging/protocol.js";

/**
 * Per-tab state in `chrome.storage.session`, which survives the service worker being stopped
 * but not a browser restart. Every value has its own key (one per tab for the session, one per
 * screenshot), so a write never rewrites another tab's data and a large screenshot is stored
 * once instead of inside a shared map.
 */
const PREFIX = "pinprompt.tab.";

const key = {
  session: (tabId: number) => `${PREFIX}${tabId}.session`,
  draft: (tabId: number) => `${PREFIX}${tabId}.draft`,
  screenshot: (tabId: number, ref: string) => `${PREFIX}${tabId}.shot.${ref}`,
  screenshotPrefix: (tabId: number) => `${PREFIX}${tabId}.shot.`,
  tabPrefix: (tabId: number) => `${PREFIX}${tabId}.`,
};

export type StoredScreenshot = {
  createdAt: string;
  dataUrl: string;
  mimeType: string;
  ref: string;
};

/** Which tab a storage key belongs to, or null for keys outside the per-tab space. */
export function tabIdFromKey(storageKey: string): number | null {
  if (!storageKey.startsWith(PREFIX)) {
    return null;
  }

  const tabId = Number.parseInt(storageKey.slice(PREFIX.length), 10);

  return Number.isFinite(tabId) ? tabId : null;
}

export async function getSessionForTab(tabId: number): Promise<PinSessionType | null> {
  return readValue<PinSessionType>(key.session(tabId));
}

export async function setSessionForTab(tabId: number, session: PinSessionType): Promise<void> {
  await chrome.storage.session.set({ [key.session(tabId)]: session });
}

export async function deleteSessionForTab(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key.session(tabId));
}

export async function getDraftForTab(tabId: number): Promise<CommentDraft | null> {
  return readValue<CommentDraft>(key.draft(tabId));
}

export async function setDraftForTab(tabId: number, draft: CommentDraft | null): Promise<void> {
  if (draft) {
    await chrome.storage.session.set({ [key.draft(tabId)]: draft });
  } else {
    await chrome.storage.session.remove(key.draft(tabId));
  }
}

export async function getScreenshotRefsForTab(tabId: number): Promise<string[]> {
  const prefix = key.screenshotPrefix(tabId);

  return (await listKeys(prefix)).map((storageKey) => storageKey.slice(prefix.length));
}

export async function getScreenshotsForTab(
  tabId: number,
  refs: readonly string[],
): Promise<Record<string, StoredScreenshot>> {
  if (refs.length === 0) {
    return {};
  }

  const keys = refs.map((ref) => key.screenshot(tabId, ref));
  const stored = await chrome.storage.session.get(keys);

  return Object.fromEntries(
    refs.flatMap((ref) => {
      const value = stored[key.screenshot(tabId, ref)];

      return isScreenshot(value) ? [[ref, value]] : [];
    }),
  );
}

/** Returns false when storage is full; the pin is then kept without its screenshot. */
export async function setScreenshotForTab(
  tabId: number,
  screenshot: StoredScreenshot,
): Promise<boolean> {
  try {
    await chrome.storage.session.set({ [key.screenshot(tabId, screenshot.ref)]: screenshot });
    return true;
  } catch (error) {
    console.warn("Pinprompt could not store a screenshot", error);
    return false;
  }
}

export async function pruneScreenshotsForTab(
  tabId: number,
  keepRefs: readonly string[],
): Promise<void> {
  const keep = new Set(keepRefs);
  const stale = (await getScreenshotRefsForTab(tabId)).filter((ref) => !keep.has(ref));

  if (stale.length > 0) {
    await chrome.storage.session.remove(stale.map((ref) => key.screenshot(tabId, ref)));
  }
}

export async function clearScreenshotsForTab(tabId: number): Promise<void> {
  await pruneScreenshotsForTab(tabId, []);
}

/** Drops everything stored for a tab (called when the tab closes). */
export async function clearTab(tabId: number): Promise<void> {
  const keys = await listKeys(key.tabPrefix(tabId));

  if (keys.length > 0) {
    await chrome.storage.session.remove(keys);
  }
}

/** Drops state for tabs that no longer exist (tabs closed while the worker was stopped). */
export async function pruneClosedTabs(openTabIds: ReadonlySet<number>): Promise<void> {
  const all = await chrome.storage.session.getKeys();
  const stale = all.filter((storageKey) => {
    const tabId = tabIdFromKey(storageKey);

    return tabId !== null && !openTabIds.has(tabId);
  });

  if (stale.length > 0) {
    await chrome.storage.session.remove(stale);
  }
}

async function listKeys(prefix: string): Promise<string[]> {
  const all = await chrome.storage.session.getKeys();

  return all.filter((storageKey) => storageKey.startsWith(prefix));
}

async function readValue<T>(storageKey: string): Promise<T | null> {
  const stored = await chrome.storage.session.get(storageKey);
  const value = stored[storageKey];

  return value === undefined || value === null ? null : (value as T);
}

function isScreenshot(value: unknown): value is StoredScreenshot {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoredScreenshot).dataUrl === "string" &&
    typeof (value as StoredScreenshot).ref === "string"
  );
}
