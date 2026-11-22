import { PinpromptApp } from "./app.js";
import { isExtensionAlive } from "./runtime.js";

// The script can arrive twice in one page: registered for the host, and injected into a tab that
// was already open when the extension was installed or reloaded. Only one live copy runs; a copy
// orphaned by an extension reload steps aside (its UI removes itself).
const GUARD = "__pinpromptOverlay";
const scope = globalThis as unknown as Record<string, unknown>;
const previous = scope[GUARD];

if (typeof previous !== "function" || !(previous as () => boolean)()) {
  scope[GUARD] = isExtensionAlive;

  void new PinpromptApp().start();
}
