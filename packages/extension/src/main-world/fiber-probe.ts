import {
  PROBE_ATTRIBUTE,
  PROBE_REQUEST,
  PROBE_RESPONSE,
  type ProbeResponse,
} from "../messaging/probe.js";
import { readFiberSnapshot } from "./fiber-reader.js";

// Runs in the page's JavaScript world. Answers probe requests from the isolated content script.
const GUARD = "__pinpromptFiberProbe";
const scope = window as unknown as Record<string, unknown>;

if (!scope[GUARD]) {
  scope[GUARD] = true;

  document.addEventListener(PROBE_REQUEST, (event) => {
    const id = (event as CustomEvent<unknown>).detail;

    if (typeof id !== "string") {
      return;
    }

    const target = document.querySelector(`[${PROBE_ATTRIBUTE}="${CSS.escape(id)}"]`);
    let response: ProbeResponse = { id, snapshot: null };

    try {
      response = { id, snapshot: target ? readFiberSnapshot(target) : null };
    } catch {
      // A page that froze or proxied its DOM nodes: report no React context.
    }

    document.dispatchEvent(new CustomEvent(PROBE_RESPONSE, { detail: JSON.stringify(response) }));
  });
}
