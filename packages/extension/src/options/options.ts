import {
  MESSAGE_TYPES,
  type AllowedOriginsResponse,
  type BackgroundResponse,
} from "../messaging/protocol.js";
import { hostPattern, isBuiltInOrigin, sanitizeOrigin } from "../settings/origins.js";

// Settings page: the allowed origins and the shortcuts. Adding a host other than localhost needs
// a permission prompt, which Chrome only shows from an extension page and a click, so it lives
// here rather than in the page overlay. `?add=<origin>` (from the toolbar button on a page that
// isn't allowed yet) offers that origin first.

const embedded = new URLSearchParams(location.search).has("embed");
const mac = /Mac|iPhone|iPad/.test(navigator.platform);

if (embedded) {
  document.body.classList.add("embed");
  // Esc inside the frame closes the dialog around it, as it does everywhere else in Pinprompt.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      void chrome.runtime.sendMessage({ type: MESSAGE_TYPES.settingsDone, start: false });
    }
  });
}

const elements = {
  allowCard: element<HTMLElement>("allow-card"),
  allowOrigin: element<HTMLElement>("allow-origin"),
  allowButton: element<HTMLButtonElement>("allow-button"),
  form: element<HTMLFormElement>("origin-form"),
  input: element<HTMLInputElement>("origin-input"),
  list: element<HTMLUListElement>("origins-list"),
  shortcuts: element<HTMLButtonElement>("shortcuts-button"),
  shortcutKeys: element<HTMLElement>("shortcut-keys"),
  saveKeys: element<HTMLElement>("save-keys"),
  status: element<HTMLElement>("status"),
};

let origins: string[] = [];
const suggested = sanitizeOrigin(new URLSearchParams(location.search).get("add") ?? "");

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  void addOrigin(elements.input.value);
});
elements.allowButton.addEventListener("click", () => {
  if (suggested) {
    void addOrigin(suggested);
  }
});
elements.shortcuts.addEventListener("click", () => {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});
elements.list.addEventListener("click", (event) => {
  const target = event.target;

  if (target instanceof HTMLButtonElement && target.dataset.origin) {
    void save(origins.filter((origin) => origin !== target.dataset.origin));
  }
});

void load();
void showShortcuts();

/** The real binding from Chrome (it can be changed, and Macs show ⇧⌘P), not a hard-coded one. */
async function showShortcuts(): Promise<void> {
  renderKeys(elements.saveKeys, mac ? ["⌘", "↩"] : ["Ctrl", "Enter"]);

  try {
    const commands = await chrome.commands.getAll();
    const shortcut = commands.find((command) => command.name === "_execute_action")?.shortcut;

    if (!shortcut) {
      elements.shortcutKeys.textContent = "Not set";
      return;
    }

    renderKeys(elements.shortcutKeys, shortcut.includes("+") ? shortcut.split("+") : [...shortcut]);
  } catch {
    renderKeys(elements.shortcutKeys, mac ? ["⇧", "⌘", "P"] : ["Ctrl", "Shift", "P"]);
  }
}

function renderKeys(target: HTMLElement, keys: string[]): void {
  target.replaceChildren(
    ...keys.map((key) => {
      const kbd = document.createElement("kbd");
      kbd.textContent = key;
      return kbd;
    }),
  );
}

async function load(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.getAllowedOrigins,
  })) as BackgroundResponse<AllowedOriginsResponse>;

  if (response.ok) {
    origins = response.allowedOrigins;
    render();
  }
}

/** The permission request must come straight from the click, so it is the first thing here. */
async function addOrigin(input: string): Promise<void> {
  const origin = sanitizeOrigin(input);

  if (!origin) {
    setStatus("Enter an origin such as http://localhost:5173 or https://my-pc.tailnet.ts.net.");
    return;
  }

  if (!isBuiltInOrigin(origin)) {
    let granted = false;

    try {
      granted = await chrome.permissions.request({ origins: [hostPattern(origin)] });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return;
    }

    if (!granted) {
      setStatus(`Chrome did not grant access to ${new URL(origin).hostname}, so it was not added.`);
      return;
    }
  }

  if (await save([...new Set([...origins, origin])])) {
    elements.input.value = "";

    if (embedded && origin === suggested) {
      // Inside the page's settings dialog: close it and start commenting right there.
      await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.settingsDone, start: true });
      return;
    }

    setStatus(
      origin === suggested
        ? `Allowed ${origin}. Go back to the tab and press ${mac ? "⇧⌘P" : "Ctrl+Shift+P"} (or the toolbar button) to start commenting.`
        : `Allowed ${origin}.`,
    );
  }
}

async function save(next: string[]): Promise<boolean> {
  const response = (await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.setAllowedOrigins,
    origins: next,
  })) as BackgroundResponse<AllowedOriginsResponse>;

  if (!response.ok) {
    setStatus(response.error);
    return false;
  }

  origins = response.allowedOrigins;
  render();

  const missing = response.missingPermission ?? [];

  if (missing.length > 0) {
    setStatus(`Not added, Chrome has no access to: ${missing.join(", ")}.`);
    return false;
  }

  return true;
}

function render(): void {
  elements.allowCard.hidden = !suggested || origins.includes(suggested);
  elements.allowOrigin.textContent = suggested ?? "";
  elements.allowButton.textContent = `Allow ${suggested ?? ""}`;

  if (origins.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No origins allowed yet.";
    elements.list.replaceChildren(empty);
    return;
  }

  elements.list.replaceChildren(
    ...origins.map((origin) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = origin;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button ghost";
      remove.textContent = "Remove";
      remove.dataset.origin = origin;
      item.append(label, remove);
      return item;
    }),
  );
}

function setStatus(message: string): void {
  elements.status.textContent = message;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);

  if (!found) {
    throw new Error(`Missing options element: ${id}`);
  }

  return found as T;
}
