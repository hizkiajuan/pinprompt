/**
 * The bridge between the isolated content script and the page-world fiber probe. The content
 * script marks the target with PROBE_ATTRIBUTE and dispatches PROBE_REQUEST; the probe answers
 * with PROBE_RESPONSE before `dispatchEvent` returns (DOM events run their listeners
 * synchronously across worlds), so a capture never waits. Event details are JSON strings, since
 * only primitives cross the world boundary intact.
 */
export const PROBE_ATTRIBUTE = "data-pinprompt-probe";
export const PROBE_REQUEST = "pinprompt:probe-request";
export const PROBE_RESPONSE = "pinprompt:probe-response";

export type ProbeResponse = {
  id: string;
  snapshot: import("@pinprompt/core").FiberSnapshot | null;
};
