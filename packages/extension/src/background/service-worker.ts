import {
  addPin,
  createSession,
  deletePin,
  MAX_PINS,
  normalizeCapture,
  type PinSessionType,
  updateInstruction,
} from "@pinprompt/core";

import {
  MESSAGE_TYPES,
  type AllowedOriginsResponse,
  type BackgroundMessage,
  type PinCaptureResponse,
  type RawCapturePayload,
  type ScreenshotsResponse,
  type SessionResponse,
  type TabStateResponse,
} from "../messaging/protocol.js";
import {
  ensureDefaultAllowedOrigins,
  getAllowedOrigins,
  isOriginAllowlisted,
  readOrigin,
  setAllowedOrigins,
} from "../settings/origins.js";
import { injectContentScripts, syncContentScripts } from "./content-scripts.js";
import { captureViewportCrop } from "./screenshot.js";
import {
  clearScreenshotsForTab,
  clearTab,
  deleteSessionForTab,
  getDraftForTab,
  getScreenshotsForTab,
  getSessionForTab,
  pruneClosedTabs,
  pruneScreenshotsForTab,
  setDraftForTab,
  setScreenshotForTab,
  setSessionForTab,
} from "./state.js";

const ALLOWED_ORIGINS_KEY = "pinprompt.allowedOrigins";

chrome.runtime.onInstalled.addListener(() => {
  void setUp();
});

chrome.runtime.onStartup.addListener(() => {
  void setUp();
});

// The toolbar button and Ctrl/Cmd+Shift+P (the `_execute_action` command) both land here. Either one
// also grants activeTab, which Chrome requires for the screenshot of each pin.
chrome.action.onClicked.addListener((tab) => {
  void handleActionClicked(tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void withTabLock(tabId, () => clearTab(tabId));
});

// The allowlist is the single source for which hosts get content scripts.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && ALLOWED_ORIGINS_KEY in changes) {
    void syncContentScripts();
  }
});

// A host permission revoked from chrome://extensions drops its origins from the allowlist.
chrome.permissions.onRemoved.addListener(() => {
  void getAllowedOrigins().then((origins) => setAllowedOrigins(origins));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void routeMessage(message, sender, sendResponse);

  return true;
});

async function setUp(): Promise<void> {
  await ensureDefaultAllowedOrigins();
  await syncContentScripts();

  const tabs = await chrome.tabs.query({});
  await pruneClosedTabs(new Set(tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]))));
}

/**
 * Serialises every read-modify-write of one tab's session: a capture and a comment save can
 * arrive together, and each reads the session, changes it and writes it back.
 */
const tabLocks = new Map<number, Promise<unknown>>();

function withTabLock<T>(tabId: number, work: () => Promise<T>): Promise<T> {
  const next = (tabLocks.get(tabId) ?? Promise.resolve()).catch(() => undefined).then(work);

  tabLocks.set(tabId, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (tabLocks.get(tabId) === next) {
        tabLocks.delete(tabId);
      }
    });

  return next;
}

async function routeMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): Promise<void> {
  try {
    if (!isBackgroundMessage(message)) {
      sendResponse({ ok: false, error: "Unsupported message payload." });
      return;
    }

    switch (message.type) {
      case MESSAGE_TYPES.getTabState: {
        const tabId = requireTabId(sender);
        sendResponse({
          ok: true,
          allowed: await isOriginAllowlisted(sender.tab?.url ?? ""),
          session: await getSessionForTab(tabId),
          draft: await getDraftForTab(tabId),
        } satisfies { ok: true } & TabStateResponse);
        return;
      }
      case MESSAGE_TYPES.getScreenshots:
        sendResponse({
          ok: true,
          screenshots: await getScreenshotsForTab(requireTabId(sender), message.refs),
        } satisfies { ok: true } & ScreenshotsResponse);
        return;
      case MESSAGE_TYPES.pinCaptured: {
        const tabId = requireTabId(sender);
        const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
        sendResponse({
          ok: true,
          ...(await withTabLock(tabId, () => handlePinCaptured(tabId, windowId, message.payload))),
        } satisfies { ok: true } & PinCaptureResponse);
        return;
      }
      case MESSAGE_TYPES.updateInstruction: {
        const tabId = requireTabId(sender);
        sendResponse({
          ok: true,
          session: await withTabLock(tabId, async () => {
            const session = updateInstruction(
              requireSession(await getSessionForTab(tabId)),
              message.pinId,
              message.instruction,
            );
            await setSessionForTab(tabId, session);
            return session;
          }),
        } satisfies { ok: true } & SessionResponse);
        return;
      }
      case MESSAGE_TYPES.deletePin: {
        const tabId = requireTabId(sender);
        sendResponse({
          ok: true,
          session: await withTabLock(tabId, () => handleDeletePin(tabId, message.pinId)),
        } satisfies { ok: true } & SessionResponse);
        return;
      }
      case MESSAGE_TYPES.clearSession: {
        const tabId = requireTabId(sender);
        await withTabLock(tabId, () => handleClearSession(tabId));
        sendResponse({ ok: true, session: null } satisfies { ok: true } & SessionResponse);
        return;
      }
      case MESSAGE_TYPES.saveDraft:
        await setDraftForTab(requireTabId(sender), message.draft);
        sendResponse({ ok: true });
        return;
      case MESSAGE_TYPES.settingsDone: {
        // From the settings frame inside the page: tell that page to start commenting.
        await chrome.tabs.sendMessage(requireTabId(sender), {
          type: MESSAGE_TYPES.settingsDone,
          start: message.start,
        });
        sendResponse({ ok: true });
        return;
      }
      case MESSAGE_TYPES.openOptions:
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        return;
      case MESSAGE_TYPES.getAllowedOrigins:
        sendResponse({
          ok: true,
          allowedOrigins: await getAllowedOrigins(),
        } satisfies { ok: true } & AllowedOriginsResponse);
        return;
      case MESSAGE_TYPES.setAllowedOrigins:
        sendResponse({
          ok: true,
          ...(await setAllowedOrigins(message.origins)),
        } satisfies { ok: true } & AllowedOriginsResponse);
        return;
    }
  } catch (error) {
    sendResponse({ ok: false, error: toErrorMessage(error) });
  }
}

/**
 * On an allowed origin, toggles comment mode in the page. On any other web page, opens the
 * settings dialog in the page, offering to allow that origin, so first launch never leaves the
 * page. The click's activeTab grant lets the scripts be injected even before the host is allowed;
 * pages where nothing can be injected (the Web Store, chrome://) get the settings tab instead.
 */
async function handleActionClicked(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || !tab.url) {
    return;
  }

  await ensureDefaultAllowedOrigins();

  const origin = readOrigin(tab.url);
  const allowed = await isOriginAllowlisted(tab.url);
  const message = allowed
    ? { type: MESSAGE_TYPES.toggleCommentMode }
    : { type: MESSAGE_TYPES.openSettings, suggest: origin };

  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return;
  } catch {
    // No content script in this tab yet.
  }

  try {
    if (!origin) {
      throw new Error("Not a web page.");
    }

    await injectContentScripts(tab.id);
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    const page = origin ? `options.html?add=${encodeURIComponent(origin)}` : "options.html";
    await chrome.tabs.create({ url: chrome.runtime.getURL(page) });
  }
}

async function handlePinCaptured(
  tabId: number,
  windowId: number,
  payload: RawCapturePayload,
): Promise<PinCaptureResponse> {
  if (!(await isOriginAllowlisted(payload.pageUrl))) {
    throw new Error("This page's origin is not on Pinprompt's allowed origins.");
  }

  // One session per tab, across routes: navigating never discards earlier pins.
  const session =
    (await getSessionForTab(tabId)) ?? createSession(payload.pageUrl, payload.routePath);

  if (session.pins.length >= MAX_PINS) {
    return { resultKind: "limit-reached", pinId: null, session, screenshot: "failed" };
  }

  const screenshot = await captureViewportCrop(windowId, payload.target.bbox, payload.viewport);
  const stored =
    screenshot.crop !== null &&
    screenshot.dataUrl !== null &&
    (await setScreenshotForTab(tabId, {
      ref: screenshot.crop.ref,
      mimeType: screenshot.crop.mimeType,
      dataUrl: screenshot.dataUrl,
      createdAt: new Date().toISOString(),
    }));

  const result = addPin(
    session,
    normalizeCapture({
      selectionMode: payload.selectionMode,
      pageUrl: payload.pageUrl,
      routePath: payload.routePath,
      ...(payload.shadcnHints === undefined ? {} : { shadcnHints: payload.shadcnHints }),
      target: payload.target,
      screenshotCrop: stored ? screenshot.crop : null,
      ...(payload.reactTree === undefined ? {} : { reactTree: payload.reactTree }),
    }),
  );

  await setSessionForTab(tabId, result.session);
  await pruneScreenshotsForTab(tabId, getScreenshotRefs(result.session));

  return {
    resultKind: result.kind,
    pinId: result.kind === "limit-reached" ? null : result.pin.id,
    session: result.session,
    screenshot: stored ? "stored" : screenshot.failure === "permission" ? "permission" : "failed",
  };
}

async function handleDeletePin(tabId: number, pinId: string): Promise<PinSessionType | null> {
  const session = deletePin(requireSession(await getSessionForTab(tabId)), pinId);

  if (session.pins.length === 0) {
    await handleClearSession(tabId);
    return null;
  }

  await setSessionForTab(tabId, session);
  await pruneScreenshotsForTab(tabId, getScreenshotRefs(session));

  return session;
}

async function handleClearSession(tabId: number): Promise<void> {
  await setDraftForTab(tabId, null);
  await deleteSessionForTab(tabId);
  await clearScreenshotsForTab(tabId);
}

function getScreenshotRefs(session: PinSessionType): string[] {
  return session.pins.flatMap((pin) => (pin.screenshotCrop ? [pin.screenshotCrop.ref] : []));
}

function requireSession(session: PinSessionType | null): PinSessionType {
  if (!session) {
    throw new Error("This tab has no pins.");
  }

  return session;
}

function requireTabId(sender: chrome.runtime.MessageSender): number {
  const tabId = sender.tab?.id;

  if (tabId === undefined) {
    throw new Error("This message needs a tab.");
  }

  return tabId;
}

function isBackgroundMessage(message: unknown): message is BackgroundMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const type = (message as { type?: unknown }).type;

  return (Object.values(MESSAGE_TYPES) as unknown[]).includes(type);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown extension error.";
}
