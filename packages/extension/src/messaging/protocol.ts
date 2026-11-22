import type {
  PinSessionType,
  RawPinTarget,
  ReactPinContextType,
  SelectionModeType,
  ShadcnHintType,
} from "@pinprompt/core";

export const MESSAGE_TYPES = {
  // content script -> background
  getTabState: "PINPROMPT/GET_TAB_STATE",
  getScreenshots: "PINPROMPT/GET_SCREENSHOTS",
  pinCaptured: "PINPROMPT/PIN_CAPTURED",
  updateInstruction: "PINPROMPT/UPDATE_INSTRUCTION",
  deletePin: "PINPROMPT/DELETE_PIN",
  clearSession: "PINPROMPT/CLEAR_SESSION",
  saveDraft: "PINPROMPT/SAVE_DRAFT",
  openOptions: "PINPROMPT/OPEN_OPTIONS",
  // options page -> background
  getAllowedOrigins: "PINPROMPT/GET_ALLOWED_ORIGINS",
  setAllowedOrigins: "PINPROMPT/SET_ALLOWED_ORIGINS",
  // settings frame -> background -> content script: an origin was allowed, start commenting
  settingsDone: "PINPROMPT/SETTINGS_DONE",
  // background -> content script (toolbar button or Ctrl/Cmd+Shift+P)
  toggleCommentMode: "PINPROMPT/TOGGLE_COMMENT_MODE",
  openSettings: "PINPROMPT/OPEN_SETTINGS",
} as const;

export type ViewportSnapshot = {
  width: number;
  height: number;
};

export type RawCapturePayload = {
  selectionMode: SelectionModeType;
  pageUrl: string;
  routePath: string;
  shadcnHints?: ShadcnHintType[];
  target: RawPinTarget;
  reactTree?: ReactPinContextType | null;
  viewport: ViewportSnapshot;
};

export type PanelPinScreenshot = {
  createdAt: string;
  dataUrl: string;
  mimeType: string;
  ref: string;
};

/** A comment being typed, kept per tab so a page reload doesn't lose it. */
export type CommentDraft = {
  pinId: string;
  text: string;
};

export type TabStateResponse = {
  /** This page's origin is on the allowlist; the bubble only shows when it is. */
  allowed: boolean;
  session: PinSessionType | null;
  draft: CommentDraft | null;
};

export type SessionResponse = {
  session: PinSessionType | null;
};

export type PinCaptureResponse = {
  resultKind: "added" | "duplicate" | "limit-reached";
  /** The new pin, so the composer can open on it. Null when the limit was reached. */
  pinId: string | null;
  session: PinSessionType;
  /** "permission": Chrome refused the screenshot (needs the toolbar button or shortcut). */
  screenshot: "stored" | "permission" | "failed";
};

export type ScreenshotsResponse = {
  screenshots: Record<string, PanelPinScreenshot>;
};

export type AllowedOriginsResponse = {
  allowedOrigins: string[];
  /** Origins dropped on save because Chrome has not granted their host. */
  missingPermission?: string[];
};

export type BackgroundSuccess<TPayload> = { ok: true } & TPayload;

export type BackgroundFailure = { ok: false; error: string };

export type BackgroundResponse<TPayload> = BackgroundSuccess<TPayload> | BackgroundFailure;

export type BackgroundMessage =
  | { type: typeof MESSAGE_TYPES.getTabState }
  | { type: typeof MESSAGE_TYPES.getScreenshots; refs: string[] }
  | { type: typeof MESSAGE_TYPES.pinCaptured; payload: RawCapturePayload }
  | { type: typeof MESSAGE_TYPES.updateInstruction; pinId: string; instruction: string }
  | { type: typeof MESSAGE_TYPES.deletePin; pinId: string }
  | { type: typeof MESSAGE_TYPES.clearSession }
  | { type: typeof MESSAGE_TYPES.saveDraft; draft: CommentDraft | null }
  | { type: typeof MESSAGE_TYPES.openOptions }
  | { type: typeof MESSAGE_TYPES.settingsDone; start: boolean }
  | { type: typeof MESSAGE_TYPES.getAllowedOrigins }
  | { type: typeof MESSAGE_TYPES.setAllowedOrigins; origins: string[] };

export type ToggleCommentModeMessage = {
  type: typeof MESSAGE_TYPES.toggleCommentMode;
};

export type OpenSettingsMessage = {
  type: typeof MESSAGE_TYPES.openSettings;
  /** An origin to offer allowing (the page the toolbar button was clicked on). */
  suggest: string | null;
};

export function isOpenSettingsMessage(message: unknown): message is OpenSettingsMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === MESSAGE_TYPES.openSettings
  );
}

export type SettingsDoneMessage = {
  type: typeof MESSAGE_TYPES.settingsDone;
  /** True when an origin was just allowed: start commenting. False: just close the dialog. */
  start: boolean;
};

export function isSettingsDoneMessage(message: unknown): message is SettingsDoneMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === MESSAGE_TYPES.settingsDone
  );
}

export function isToggleCommentModeMessage(message: unknown): message is ToggleCommentModeMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === MESSAGE_TYPES.toggleCommentMode
  );
}
