import {
  buildExportMarkdown,
  MAX_PINS,
  MIN_DRAG_PX,
  type PinSessionType,
  type PinType,
} from "@pinprompt/core";

import {
  isOpenSettingsMessage,
  isSettingsDoneMessage,
  isToggleCommentModeMessage,
  MESSAGE_TYPES,
  type BackgroundResponse,
  type PinCaptureResponse,
  type RawCapturePayload,
  type ScreenshotsResponse,
  type SessionResponse,
  type TabStateResponse,
} from "../messaging/protocol.js";
import { captureClickPayload, captureDragPayload, readReactTree } from "./capture.js";
import { registerFonts } from "./fonts.js";
import { isExtensionAlive } from "./runtime.js";
import { uiStyles } from "./ui-styles.js";

/**
 * Pinprompt's in-page UI, all inside one shadow root:
 *
 * - a small draggable bubble (count and Copy prompt once there are pins),
 * - comment mode (toolbar button, Ctrl/Cmd+Shift+P or C): hover names the React component, a click or
 *   a drag pins it, and a Figma-style comment box opens right there,
 * - numbered markers that stay on their elements, with the comment on hover,
 * - the tray (click the bubble) to review every pin and copy or download the prompt.
 */
type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type Point = { x: number; y: number };
type Editing = { pinId: string; isNew: boolean; screenshotNote: boolean };

const CORNER_KEY = "pinprompt.bubbleCorner";
const EDGE = 20;
const CLICK_SLOP_PX = 3;
const BUBBLE_DRAG_PX = 5;
const TOAST_MS = 4500;
const DRAFT_SAVE_MS = 300;
const MARKER_SIZE = 28;
// Events that never reach the page while comment mode is on. Pointer events matter as much as
// mouse events: Radix (behind shadcn/ui) opens menus and popovers on pointerdown.
const BLOCKED_EVENTS = ["mousedown", "mouseup", "click", "dblclick", "auxclick"] as const;

export class PinpromptApp {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private layer!: HTMLDivElement;
  private hoverBox!: HTMLDivElement;
  private chip!: HTMLDivElement;
  private dragBox!: HTMLDivElement;
  private hint!: HTMLDivElement;
  private bubble!: HTMLDivElement;
  private tray: HTMLDivElement | null = null;
  private composer: HTMLDivElement | null = null;
  private tip: HTMLDivElement | null = null;
  private toast: HTMLDivElement | null = null;
  private settings: HTMLDivElement | null = null;
  private mounted = false;

  private session: PinSessionType | null = null;
  private commenting = false;
  private trayOpen = false;
  private editing: Editing | null = null;
  private capturing = false;
  private corner: Corner = "bottom-right";
  private route = currentRoute();
  private dragOrigin: Point | null = null;
  private pointerId: number | null = null;
  private hovered: Element | null = null;
  private positionFrame = 0;
  private toastTimer = 0;
  private draftTimer = 0;
  private pendingDraft: { pinId: string; text: string } | null = null;
  private readonly screenshots = new Map<string, string>();
  private readonly componentLabels = new WeakMap<Element, string>();

  /** Listens for the toolbar button and mounts the UI when this origin is allowed. */
  async start(): Promise<void> {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (isToggleCommentModeMessage(message)) {
        void this.toggleFromToolbar();
        sendResponse({ ok: true });
      } else if (isOpenSettingsMessage(message)) {
        this.openSettings(message.suggest);
        sendResponse({ ok: true });
      } else if (isSettingsDoneMessage(message)) {
        // From the settings frame: Esc closes it; allowing this page also starts commenting.
        this.closeSettings();

        if (message.start) {
          void this.mountIfAllowed().then((ok) => ok && this.setCommenting(true));
        }

        sendResponse({ ok: true });
      }
    });

    await this.mountIfAllowed();
  }

  private async mountIfAllowed(): Promise<boolean> {
    if (this.mounted) {
      return true;
    }

    const state = await send<TabStateResponse>({ type: MESSAGE_TYPES.getTabState });

    if (!state?.ok || !state.allowed) {
      return false;
    }

    this.session = state.session;
    this.corner = await readCorner();
    this.mount();
    this.render();

    // A comment that was being typed when the page reloaded comes back where it was.
    const draft = state.draft;
    const draftPin = draft ? this.findPin(draft.pinId) : undefined;

    if (draft && draftPin && draftPin.routePath === this.route) {
      this.openComposer(
        { pinId: draftPin.id, isNew: !draftPin.instruction.trim(), screenshotNote: false },
        draft.text,
      );
    }

    return true;
  }

  private async toggleFromToolbar(): Promise<void> {
    if (await this.mountIfAllowed()) {
      this.setCommenting(!this.commenting);
    }
  }

  // ---------------------------------------------------------------- mounting and events

  /** The shadow root on its own: enough for the settings dialog on a page that isn't allowed yet. */
  private ensureRoot(): ShadowRoot {
    if (this.root) {
      return this.root;
    }

    document.getElementById("pinprompt-root")?.remove();

    const host = document.createElement("div");
    host.id = "pinprompt-root";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = uiStyles(registerFonts());
    root.append(style);

    // Keys typed in Pinprompt's fields stay inside it instead of reaching the page's shortcuts.
    for (const type of ["keydown", "keyup", "keypress"] as const) {
      root.addEventListener(type, (event) => event.stopPropagation());
    }

    document.documentElement.append(host);
    this.host = host;
    this.root = root;

    return root;
  }

  private mount(): void {
    const root = this.ensureRoot();

    this.layer = div("layer");
    this.hoverBox = div("box", { hidden: true });
    this.chip = div("chip", { hidden: true });
    this.dragBox = div("box drag", { hidden: true });
    this.hint = div("hint", { hidden: true });
    this.hint.innerHTML = `<span class="dot"></span>Click to comment<span class="sep">·</span>Drag for a region<span class="sep">·</span><kbd>Esc</kbd> to stop`;
    this.bubble = div("bubble");

    root.append(this.layer, this.hoverBox, this.dragBox, this.chip, this.hint, this.bubble);

    // Capture phase on window runs before any listener the page registers.
    window.addEventListener("pointerdown", this.onPointerDown, true);
    window.addEventListener("pointermove", this.onPointerMove, true);
    window.addEventListener("pointerup", this.onPointerUp, true);
    window.addEventListener("pointercancel", this.cancelDrag, true);
    for (const type of BLOCKED_EVENTS) {
      window.addEventListener(type, this.blockEvent, true);
    }
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("scroll", this.schedulePositions, { capture: true, passive: true });
    window.addEventListener("resize", this.schedulePositions, { passive: true });
    window.addEventListener("blur", this.cancelDrag);
    window.addEventListener("pagehide", this.flushDraft);
    // Single-page apps change routes without a load; layout shifts move pinned elements.
    window.setInterval(() => this.tick(), 1000);

    this.mounted = true;
  }

  private tick(): void {
    if (!isExtensionAlive()) {
      // The extension was reloaded: this copy is orphaned and steps aside.
      this.host?.remove();
      this.commenting = false;
      return;
    }

    const route = currentRoute();

    if (route !== this.route) {
      this.route = route;
      this.renderPins();
    }

    this.positionAll();
  }

  private isOurs(event: Event): boolean {
    return this.host !== null && event.composedPath().includes(this.host);
  }

  private readonly blockEvent = (event: Event): void => {
    if (this.commenting && !this.isOurs(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.isOurs(event) || !this.host) {
      return;
    }

    if (event.key === "Escape") {
      if (this.settings) {
        this.closeSettings();
      } else if (this.commenting) {
        this.setCommenting(false);
      } else if (this.trayOpen) {
        this.setTray(false);
      } else {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const plainC =
      (event.key === "c" || event.key === "C") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.repeat;

    if (plainC && !isEditable(event.target) && !this.editing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setCommenting(!this.commenting);
    }
  };

  // ---------------------------------------------------------------- comment mode

  private setCommenting(on: boolean): void {
    if (on && this.editing) {
      void this.closeComposer(false);
    }

    if (on && (this.session?.pins.length ?? 0) >= MAX_PINS) {
      this.showToast(
        `Pinprompt holds up to ${MAX_PINS} pins. Copy or clear them to add more.`,
        true,
      );
      return;
    }

    this.commenting = on;
    this.hint.hidden = !on;
    this.cancelDrag();

    if (!on) {
      this.hovered = null;
      this.hoverBox.hidden = true;
      this.chip.hidden = true;
    } else {
      this.setTray(false);
    }

    this.renderBubble();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.commenting || this.isOurs(event)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.button !== 0 || !event.isPrimary || this.capturing) {
      return;
    }

    this.dragOrigin = { x: event.clientX, y: event.clientY };
    this.pointerId = event.pointerId;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.commenting || this.isOurs(event)) {
      return;
    }

    if (this.dragOrigin && event.pointerId === this.pointerId) {
      const rect = rectBetween(this.dragOrigin, { x: event.clientX, y: event.clientY });

      if (rect.width > CLICK_SLOP_PX || rect.height > CLICK_SLOP_PX) {
        place(this.dragBox, rect);
        this.dragBox.hidden = false;
        this.hoverBox.hidden = true;
        this.chip.hidden = true;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const target = event.target instanceof Element ? event.target : null;

    if (target !== this.hovered) {
      this.hovered = target;
      this.showHover();
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.commenting || this.isOurs(event)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (!this.dragOrigin || event.pointerId !== this.pointerId) {
      return;
    }

    const rect = rectBetween(this.dragOrigin, { x: event.clientX, y: event.clientY });
    const target = this.hovered ?? (event.target instanceof Element ? event.target : null);

    this.cancelDrag();

    if (rect.width >= MIN_DRAG_PX && rect.height >= MIN_DRAG_PX) {
      void this.capture(captureDragPayload(rect, this.host));
    } else if (rect.width <= CLICK_SLOP_PX && rect.height <= CLICK_SLOP_PX && target) {
      void this.capture(captureClickPayload(target));
    } else {
      this.showToast(`Drag at least ${MIN_DRAG_PX} x ${MIN_DRAG_PX} px to pin a region.`, true);
    }
  };

  private readonly cancelDrag = (): void => {
    this.dragOrigin = null;
    this.pointerId = null;

    if (this.dragBox) {
      this.dragBox.hidden = true;
    }
  };

  private showHover(): void {
    const target = this.hovered;

    if (!target || target === document.documentElement || target === document.body) {
      this.hoverBox.hidden = true;
      this.chip.hidden = true;
      return;
    }

    const rect = target.getBoundingClientRect();
    place(this.hoverBox, inflate(rect, 4));
    this.hoverBox.hidden = false;

    this.chip.innerHTML = this.componentLabel(target);
    this.chip.hidden = false;
    const below = rect.bottom + 8 + 24 < window.innerHeight;
    this.chip.style.left = `${clamp(rect.left - 4, 4, window.innerWidth - 240)}px`;
    this.chip.style.top = `${below ? rect.bottom + 8 : Math.max(4, rect.top - 30)}px`;
  }

  /** "<b>Button</b> · PlanCard › BillingPage", or the tag and first class without React. */
  private componentLabel(element: Element): string {
    const cached = this.componentLabels.get(element);

    if (cached) {
      return cached;
    }

    const read = readReactTree(element);
    // Minified production names ("e7") say nothing; show the tag instead.
    const tree = read && read.confidence !== "low" ? read : null;
    const label = tree
      ? `<b>${escapeHtml(tree.leafComponent.name)}</b>${
          tree.ancestorChain.length > 0
            ? ` · ${tree.ancestorChain
                .slice(0, 2)
                .map((item) => escapeHtml(item.name))
                .join(" › ")}`
            : ""
        }`
      : `<b>${escapeHtml(element.tagName.toLowerCase())}</b>${element.classList[0] ? `.${escapeHtml(element.classList[0])}` : ""}`;

    this.componentLabels.set(element, label);

    return label;
  }

  /**
   * Sends a capture to the background, which takes the screenshot. The whole UI is hidden first
   * so no outline, marker or bubble ends up in the crop.
   */
  private async capture(payload: RawCapturePayload | null): Promise<void> {
    if (!payload || !this.host) {
      this.showToast("Pinprompt could not capture that. Try another element.", true);
      return;
    }

    this.capturing = true;
    this.host.style.visibility = "hidden";

    let response: BackgroundResponse<PinCaptureResponse> | null = null;

    try {
      await nextPaint();
      response = await send<PinCaptureResponse>({ type: MESSAGE_TYPES.pinCaptured, payload });
    } finally {
      // Visible again before the composer opens: a hidden textarea cannot take focus.
      this.capturing = false;
      this.host.style.visibility = "visible";
    }

    if (!response?.ok) {
      this.showToast(response?.error ?? "Pinprompt was reloaded. Refresh this page.", true);
      return;
    }

    if (response.resultKind === "limit-reached" || !response.pinId) {
      this.showToast(`Pinprompt holds up to ${MAX_PINS} pins.`, true);
      return;
    }

    this.session = response.session;
    this.setCommenting(false);
    this.render();
    this.openComposer({
      pinId: response.pinId,
      isNew: true,
      screenshotNote: response.screenshot === "permission",
    });

    if (response.resultKind === "duplicate") {
      this.showToast("You already pinned this element. Delete one if that was a mistake.", true);
    }
  }

  // ---------------------------------------------------------------- pins on the page

  private pinsHere(): PinType[] {
    return (this.session?.pins ?? []).filter((pin) => pin.routePath === this.route);
  }

  private renderPins(): void {
    this.layer.replaceChildren();

    for (const pin of this.pinsHere()) {
      const outline = div(`box soft${pin.selectionMode === "drag" ? " region" : ""}`);
      outline.dataset.pinId = pin.id;

      const marker = document.createElement("button");
      marker.className = `marker${pin.instruction.trim() ? "" : " empty"}`;
      marker.dataset.pinId = pin.id;
      marker.textContent = String(pin.index);
      marker.setAttribute("aria-label", `Pin ${pin.index}: ${pin.instruction || "no comment yet"}`);
      marker.addEventListener("mouseenter", () => this.showTip(pin, marker));
      marker.addEventListener("mouseleave", () => this.hideTip());
      marker.addEventListener("focus", () => this.showTip(pin, marker));
      marker.addEventListener("blur", () => this.hideTip());
      marker.addEventListener("click", () => {
        this.hideTip();
        this.openComposer({ pinId: pin.id, isNew: false, screenshotNote: false });
      });

      this.layer.append(outline, marker);
    }

    this.positionAll();
  }

  private readonly schedulePositions = (): void => {
    if (this.positionFrame) {
      return;
    }

    this.positionFrame = requestAnimationFrame(() => {
      this.positionFrame = 0;
      this.positionAll();

      if (this.hovered && this.commenting) {
        this.showHover();
      }
    });
  };

  private positionAll(): void {
    if (!this.root) {
      return;
    }

    // Neighbouring elements would put their markers on top of each other; later ones step left.
    const placed: { x: number; y: number }[] = [];

    for (const pin of this.pinsHere()) {
      const rect = pinRect(pin);
      const outline = this.layer.querySelector<HTMLElement>(`.box[data-pin-id="${pin.id}"]`);
      const marker = this.layer.querySelector<HTMLElement>(`.marker[data-pin-id="${pin.id}"]`);
      const visible = rect !== null && rect.bottom > 0 && rect.top < window.innerHeight;

      if (!outline || !marker) {
        continue;
      }

      outline.hidden = !visible;
      marker.hidden = !visible;

      if (rect && visible) {
        place(outline, inflate(rect, 4));
        let x = clamp(rect.right - 8, 4, window.innerWidth - 32);
        const y = clamp(rect.top - 22, 4, window.innerHeight - 32);

        while (
          placed.some((p) => Math.abs(p.x - x) < MARKER_SIZE && Math.abs(p.y - y) < MARKER_SIZE) &&
          x > 4
        ) {
          x -= MARKER_SIZE + 4;
        }

        placed.push({ x, y });
        marker.style.left = `${Math.max(4, x)}px`;
        marker.style.top = `${y}px`;
      }
    }

    if (this.composer && this.editing) {
      const pin = this.findPin(this.editing.pinId);
      const rect = pin ? pinRect(pin) : null;

      if (rect) {
        this.anchor(this.composer, rect);
      }
    }
  }

  private showTip(pin: PinType, marker: HTMLElement): void {
    if (!this.root || this.editing?.pinId === pin.id) {
      return;
    }

    this.hideTip();

    const tip = div("tip");
    const who = div("who");
    who.innerHTML = `${pin.index} · ${describePin(pin)}`;
    tip.append(who, document.createTextNode(pin.instruction.trim() || "No comment yet."));
    this.root.append(tip);
    this.anchor(tip, marker.getBoundingClientRect(), 8);
    this.tip = tip;
  }

  private hideTip(): void {
    this.tip?.remove();
    this.tip = null;
  }

  // ---------------------------------------------------------------- composer

  private openComposer(editing: Editing, initialText?: string): void {
    const pin = this.findPin(editing.pinId);

    if (!pin || !this.root) {
      return;
    }

    this.composer?.remove();
    this.editing = editing;

    const composer = div("composer");
    const meta = div("meta");
    meta.innerHTML = `<span class="path">${describePin(pin)}</span><span class="route">${escapeHtml(pin.routePath)}</span>`;

    const textarea = document.createElement("textarea");
    textarea.value = initialText ?? pin.instruction;
    textarea.placeholder = "What should change here?";
    textarea.setAttribute("aria-label", `Comment for pin ${pin.index}`);

    const foot = div("foot");
    const hint = document.createElement("span");
    hint.textContent = `${isMac() ? "⌘" : "Ctrl"}+Enter to save`;
    const spacer = div("spacer");
    const save = button(editing.isNew ? "Comment" : "Save", "btn primary");
    const cancel = button("Cancel", "btn ghost");
    foot.append(hint, spacer);

    if (!editing.isNew) {
      const remove = button("Delete", "btn danger");
      remove.addEventListener("click", () => void this.deletePin(pin.id));
      foot.append(remove);
    }

    foot.append(cancel, save);
    composer.append(meta, textarea, foot);

    if (editing.screenshotNote) {
      const note = div("note");
      note.textContent =
        "No screenshot: Chrome allows one after you click the Pinprompt toolbar button (or press its shortcut) on this page load.";
      composer.append(note);
    }

    const autosize = (): void => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
      save.disabled = textarea.value.trim().length === 0;
    };

    textarea.addEventListener("input", () => {
      autosize();
      this.saveDraft({ pinId: pin.id, text: textarea.value });
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void this.saveComment(pin.id, textarea.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        void this.closeComposer(true);
      }
    });
    save.addEventListener("click", () => void this.saveComment(pin.id, textarea.value));
    cancel.addEventListener("click", () => void this.closeComposer(true));

    this.root.append(composer);
    this.composer = composer;
    autosize();

    const rect = pinRect(pin);

    if (rect) {
      this.anchor(composer, rect);
    }

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  /** Keeps what is being typed in the background, so a page reload doesn't lose it. */
  private saveDraft(draft: { pinId: string; text: string } | null): void {
    window.clearTimeout(this.draftTimer);
    this.pendingDraft = draft;

    if (!draft) {
      void send({ type: MESSAGE_TYPES.saveDraft, draft: null });
      return;
    }

    this.draftTimer = window.setTimeout(() => this.flushDraft(), DRAFT_SAVE_MS);
  }

  /** Sends a waiting draft now (also on pagehide, so a reload mid-sentence keeps it). */
  private readonly flushDraft = (): void => {
    window.clearTimeout(this.draftTimer);

    if (this.pendingDraft) {
      void send({ type: MESSAGE_TYPES.saveDraft, draft: this.pendingDraft });
      this.pendingDraft = null;
    }
  };

  /** Closes the composer; cancelling a brand-new pin removes it again. */
  private async closeComposer(canceled: boolean): Promise<void> {
    const editing = this.editing;

    this.saveDraft(null);

    this.composer?.remove();
    this.composer = null;
    this.editing = null;

    if (canceled && editing?.isNew) {
      const pin = this.findPin(editing.pinId);

      if (pin && !pin.instruction.trim()) {
        await this.deletePin(editing.pinId, true);
      }
    }
  }

  private async saveComment(pinId: string, text: string): Promise<void> {
    const instruction = text.trim();

    if (!instruction) {
      return;
    }

    const response = await send<SessionResponse>({
      type: MESSAGE_TYPES.updateInstruction,
      pinId,
      instruction,
    });

    if (!response?.ok) {
      this.showToast(response?.error ?? "Could not save the comment.", true);
      return;
    }

    this.session = response.session;
    await this.closeComposer(false);
    this.render();
  }

  private async deletePin(pinId: string, quiet = false): Promise<void> {
    const response = await send<SessionResponse>({ type: MESSAGE_TYPES.deletePin, pinId });

    if (response?.ok) {
      this.session = response.session;
    }

    if (this.editing?.pinId === pinId) {
      this.saveDraft(null);
      this.composer?.remove();
      this.composer = null;
      this.editing = null;
    }

    this.render();

    if (!quiet) {
      this.showToast("Pin deleted.");
    }
  }

  // ---------------------------------------------------------------- bubble, tray, toast

  private render(): void {
    this.renderPins();
    this.renderBubble();

    if (this.trayOpen) {
      this.renderTray();
    }
  }

  private renderBubble(): void {
    const count = this.session?.pins.length ?? 0;

    this.bubble.replaceChildren();
    // Empty: the bare logo tile (it is already a rounded square). With pins: a pill.
    this.bubble.className = `bubble${count === 0 ? " solo" : ""}${this.commenting || this.trayOpen ? " active" : ""}`;

    const main = document.createElement("button");
    main.className = "bubble-main";
    main.setAttribute(
      "aria-label",
      count > 0 ? `Pinprompt: ${count} pins, open the list` : "Pinprompt: start commenting",
    );
    main.title = count > 0 ? "Show pins" : "Comment (C)";

    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("icons/icon.svg");
    logo.alt = "";
    logo.draggable = false;
    main.append(logo);

    if (count > 0) {
      const badge = document.createElement("span");
      badge.className = "count";
      badge.textContent = String(count);
      main.append(badge);
    }

    this.bubble.append(main);

    if (count > 0 && !this.trayOpen) {
      const copy = button("Copy prompt", "copy");
      copy.addEventListener("click", () => void this.copyPrompt());
      this.bubble.append(copy);
    }

    this.makeDraggable(main, () => {
      if (count > 0) {
        this.setTray(!this.trayOpen);
      } else {
        this.setCommenting(!this.commenting);
      }
    });

    this.placeCorner(this.bubble);
  }

  /** A click runs `onClick`; a drag moves the bubble and snaps it to the nearest corner. */
  private makeDraggable(handle: HTMLElement, onClick: () => void): void {
    let start: Point | null = null;
    let dragging = false;

    handle.addEventListener("pointerdown", (event) => {
      start = { x: event.clientX, y: event.clientY };
      dragging = false;
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!start) {
        return;
      }

      if (
        !dragging &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > BUBBLE_DRAG_PX
      ) {
        dragging = true;
        this.setTray(false);
      }

      if (dragging) {
        const box = this.bubble.getBoundingClientRect();
        this.bubble.style.left = `${clamp(event.clientX - box.width / 2, 0, window.innerWidth - box.width)}px`;
        this.bubble.style.top = `${clamp(event.clientY - box.height / 2, 0, window.innerHeight - box.height)}px`;
        this.bubble.style.right = "auto";
        this.bubble.style.bottom = "auto";
      }
    });
    handle.addEventListener("pointerup", (event) => {
      if (!start) {
        return;
      }

      start = null;

      if (dragging) {
        const right = event.clientX > window.innerWidth / 2;
        const bottom = event.clientY > window.innerHeight / 2;
        this.corner = `${bottom ? "bottom" : "top"}-${right ? "right" : "left"}`;
        void chrome.storage.local.set({ [CORNER_KEY]: this.corner }).catch(() => undefined);
        this.renderBubble();
        return;
      }

      onClick();
    });
  }

  private placeCorner(element: HTMLElement, offset = 0): void {
    const [vertical, horizontal] = this.corner.split("-") as ["top" | "bottom", "left" | "right"];

    element.style.left = element.style.right = element.style.top = element.style.bottom = "auto";
    element.style[horizontal] = `${EDGE}px`;
    element.style[vertical] = `${EDGE + offset}px`;
  }

  private setTray(open: boolean): void {
    this.trayOpen = open;

    if (!open) {
      this.tray?.remove();
      this.tray = null;
    } else {
      this.renderTray();
      void this.loadThumbnails();
    }

    this.renderBubble();
  }

  private renderTray(): void {
    if (!this.root) {
      return;
    }

    const pins = this.session?.pins ?? [];
    const tray = div("tray");
    const top = div("top");
    const title = document.createElement("b");
    title.textContent = pins.length === 1 ? "1 pin" : `${pins.length} pins`;
    const sub = document.createElement("span");
    sub.className = "sub";
    const routes = [...new Set(pins.map((pin) => pin.routePath))];
    sub.textContent = routes.length > 1 ? `${routes.length} routes` : (routes[0] ?? this.route);
    const icons = div("icons");
    const clearAll = iconButton("Clear all pins", TRASH_ICON);
    clearAll.classList.add("danger");
    clearAll.disabled = pins.length === 0;
    clearAll.addEventListener("click", () => void this.clearPins());
    const settings = iconButton("Settings", SLIDERS_ICON);
    settings.addEventListener("click", () => this.openSettings(null));
    const close = iconButton("Close", CLOSE_ICON);
    close.addEventListener("click", () => this.setTray(false));
    icons.append(clearAll, settings, close);
    top.append(title, sub, icons);

    const list = div("list");

    if (pins.length === 0) {
      const empty = div("empty-state");
      empty.textContent = "No pins yet. Press C, then click an element or drag over a region.";
      list.append(empty);
    }

    for (const pin of pins) {
      const row = document.createElement("button");
      row.className = "row";
      const num = div(`num${pin.instruction.trim() ? "" : " empty"}`);
      num.textContent = String(pin.index);
      const text = div("text");
      const who = div("who");
      who.innerHTML = `${describePin(pin)}${pin.routePath !== this.route ? ` · ${escapeHtml(pin.routePath)}` : ""}`;
      const comment = document.createElement("p");
      comment.textContent = pin.instruction.trim() || "No comment yet";
      comment.classList.toggle("missing", !pin.instruction.trim());
      text.append(who, comment);
      row.append(num, text);

      const shot = pin.screenshotCrop ? this.screenshots.get(pin.screenshotCrop.ref) : undefined;

      if (shot) {
        const thumb = document.createElement("img");
        thumb.className = "thumb";
        thumb.src = shot;
        thumb.alt = "";
        row.append(thumb);
      }

      row.addEventListener("click", () => this.goToPin(pin));
      list.append(row);
    }

    const bottom = div("bottom");
    const copy = button("Copy prompt", "btn primary");
    copy.disabled = pins.length === 0;
    copy.addEventListener("click", () => void this.copyPrompt());
    const download = button("Download .md", "btn ghost");
    download.disabled = pins.length === 0;
    download.addEventListener("click", () => this.downloadPrompt());
    const size = document.createElement("small");
    size.textContent =
      this.session && pins.length > 0
        ? `${formatCount(buildExportMarkdown(this.session).charCount)} chars`
        : "";
    bottom.append(copy, download, size);

    tray.append(top, list, bottom);
    this.tray?.remove();
    this.root.append(tray);
    this.tray = tray;
    this.placeCorner(tray, 56);
  }

  private async loadThumbnails(): Promise<void> {
    const refs = (this.session?.pins ?? []).flatMap((pin) =>
      pin.screenshotCrop && !this.screenshots.has(pin.screenshotCrop.ref)
        ? [pin.screenshotCrop.ref]
        : [],
    );

    if (refs.length === 0) {
      return;
    }

    const response = await send<ScreenshotsResponse>({ type: MESSAGE_TYPES.getScreenshots, refs });

    if (response?.ok) {
      for (const [ref, screenshot] of Object.entries(response.screenshots)) {
        this.screenshots.set(ref, screenshot.dataUrl);
      }

      if (this.trayOpen) {
        this.renderTray();
      }
    }
  }

  private goToPin(pin: PinType): void {
    if (pin.routePath !== this.route) {
      this.showToast(`Pin ${pin.index} is on ${pin.routePath}. Open that page to edit it.`, true);
      return;
    }

    const element = pin.selectionMode === "click" ? safeQuery(pin.target.selector) : null;

    if (element) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
    } else if (pin.target.pageBox) {
      window.scrollTo({ top: pin.target.pageBox.y - window.innerHeight / 3, behavior: "smooth" });
    }

    this.setTray(false);
    window.setTimeout(
      () => this.openComposer({ pinId: pin.id, isNew: false, screenshotNote: false }),
      350,
    );
  }

  private async copyPrompt(): Promise<void> {
    const session = this.session;

    if (!session || session.pins.length === 0) {
      return;
    }

    const missing = session.pins.find((pin) => !pin.instruction.trim());

    if (missing) {
      this.showToast(`Pin ${missing.index} has no comment yet.`, true);
      this.goToPin(missing);
      return;
    }

    const document_ = buildExportMarkdown(session);
    const copied = await copyText(document_.body, this.root);

    if (!copied) {
      this.showToast("The clipboard is blocked here. Use Download .md instead.", true);
      return;
    }

    const count = session.pins.length;
    this.showToast(
      `Copied ${count === 1 ? "1 pin" : `${count} pins`} as one prompt (${formatCount(document_.charCount)} chars)`,
      false,
      { label: "Clear pins", run: () => void this.clearPins() },
    );
  }

  private downloadPrompt(): void {
    if (!this.session || !this.root) {
      return;
    }

    const document_ = buildExportMarkdown(this.session);
    const url = URL.createObjectURL(
      new Blob([document_.body], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = document_.filename;
    this.root.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async clearPins(): Promise<void> {
    const response = await send<SessionResponse>({ type: MESSAGE_TYPES.clearSession });

    if (response?.ok) {
      this.session = null;
      this.screenshots.clear();
      this.hideToast();
      this.setTray(false);
      this.render();
    }
  }

  private showToast(
    message: string,
    warn = false,
    action?: { label: string; run: () => void },
  ): void {
    if (!this.root) {
      return;
    }

    this.hideToast();

    const toast = div("toast");
    const icon = div(`ok${warn ? " warn" : ""}`);
    icon.textContent = warn ? "!" : "✓";
    const text = document.createElement("span");
    text.textContent = message;
    toast.append(icon, text);

    if (action) {
      const actionButton = button(action.label, "btn ghost");
      actionButton.addEventListener("click", action.run);
      toast.append(actionButton);
    }

    toast.setAttribute("role", "status");
    this.root.append(toast);
    this.toast = toast;
    this.placeCorner(toast, this.tray ? this.tray.getBoundingClientRect().height + 64 : 56);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.hideToast(), TOAST_MS);
  }

  private hideToast(): void {
    this.toast?.remove();
    this.toast = null;
  }

  // ---------------------------------------------------------------- settings dialog

  /**
   * The settings page in a dialog over the page, so nobody loses their place. It is the
   * extension's own page in a frame: only an extension page may ask Chrome for a host permission.
   */
  private openSettings(suggest: string | null): void {
    const root = this.ensureRoot();

    this.closeSettings();

    if (this.mounted) {
      this.setTray(false);
    }

    const scrim = div("scrim");
    const dialog = div("dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Pinprompt settings");

    const top = div("top");
    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("icons/icon.svg");
    logo.alt = "";
    const title = document.createElement("b");
    title.textContent = suggest ? "Allow Pinprompt on this page?" : "Pinprompt settings";
    const close = iconButton("Close", CLOSE_ICON);
    close.addEventListener("click", () => this.closeSettings());
    top.append(logo, title, close);

    const frame = document.createElement("iframe");
    const query = new URLSearchParams({ embed: "1", ...(suggest ? { add: suggest } : {}) });
    frame.src = chrome.runtime.getURL(`options.html?${query.toString()}`);
    frame.title = "Pinprompt settings";

    dialog.append(top, frame);
    scrim.append(dialog);
    scrim.addEventListener("click", (event) => {
      if (event.target === scrim) {
        this.closeSettings();
      }
    });
    scrim.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeSettings();
      }
    });
    root.append(scrim);
    this.settings = scrim;
    close.focus();
  }

  private closeSettings(): void {
    this.settings?.remove();
    this.settings = null;
  }

  // ---------------------------------------------------------------- helpers

  private findPin(pinId: string): PinType | undefined {
    return this.session?.pins.find((pin) => pin.id === pinId);
  }

  /** Places a floating element under `rect`, or above it when there is no room below. */
  private anchor(element: HTMLElement, rect: DOMRect, gap = 12): void {
    const box = element.getBoundingClientRect();
    const below = rect.bottom + gap + box.height <= window.innerHeight - 8;
    const top = below ? rect.bottom + gap : Math.max(8, rect.top - gap - box.height);

    element.style.left = `${clamp(rect.left, 8, window.innerWidth - box.width - 8)}px`;
    element.style.top = `${top}px`;
  }
}

const CLOSE_ICON = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>`;
const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.8v4M9.2 6.8v4"/></svg>`;
const SLIDERS_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4h7M12 4h2M2 12h2M7 12h7"/><circle cx="10.5" cy="4" r="1.5"/><circle cx="5.5" cy="12" r="1.5"/></svg>`;

/** Where a pin's element is now: the live element for a click pin, else its page position. */
function pinRect(pin: PinType): DOMRect | null {
  if (pin.selectionMode === "click") {
    const element = safeQuery(pin.target.selector);

    if (element) {
      const rect = element.getBoundingClientRect();

      if (rect.width > 0 || rect.height > 0) {
        return rect;
      }
    }
  }

  const box = pin.target.pageBox;

  return box
    ? new DOMRect(box.x - window.scrollX, box.y - window.scrollY, box.width, box.height)
    : null;
}

function describePin(pin: PinType): string {
  const tree = pin.reactTree && pin.reactTree.confidence !== "low" ? pin.reactTree : null;
  const region = pin.selectionMode === "drag" ? "region · " : "";

  if (!tree) {
    return `${region}<b>${escapeHtml(pin.target.tagName)}</b>`;
  }

  const parent = tree.ancestorChain[0]?.name;

  return `${region}<b>${escapeHtml(tree.leafComponent.name)}</b>${parent ? ` · ${escapeHtml(parent)}` : ""}`;
}

function currentRoute(): string {
  return `${location.pathname}${location.search}${location.hash}` || "/";
}

async function readCorner(): Promise<Corner> {
  try {
    const stored = await chrome.storage.local.get(CORNER_KEY);
    const value = stored[CORNER_KEY];

    return value === "bottom-left" || value === "top-right" || value === "top-left"
      ? value
      : "bottom-right";
  } catch {
    return "bottom-right";
  }
}

async function send<T>(message: unknown): Promise<BackgroundResponse<T> | null> {
  try {
    return (await chrome.runtime.sendMessage(message)) as BackgroundResponse<T>;
  } catch {
    return null;
  }
}

/**
 * Copies with the async clipboard API where the page is a secure context (localhost is), and
 * with a selected textarea and execCommand elsewhere (a plain-http LAN host is not).
 */
async function copyText(text: string, root: ShadowRoot | null): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea route.
  }

  if (!root) {
    return false;
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  root.append(area);
  area.select();

  try {
    return document.execCommand("copy");
  } finally {
    area.remove();
  }
}

function safeQuery(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function div(className: string, options: { hidden?: boolean } = {}): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  element.hidden = options.hidden ?? false;

  return element;
}

function button(label: string, className: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;

  return element;
}

function iconButton(label: string, content: string): HTMLButtonElement {
  const element = button("", "icon-btn");
  element.innerHTML = content;
  element.title = label;
  element.setAttribute("aria-label", label);

  return element;
}

function place(
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
): void {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${Math.max(0, rect.width)}px`;
  element.style.height = `${Math.max(0, rect.height)}px`;
}

function inflate(rect: DOMRect, by: number): DOMRect {
  return new DOMRect(rect.left - by, rect.top - by, rect.width + by * 2, rect.height + by * 2);
}

function rectBetween(start: Point, end: Point): DOMRect {
  return new DOMRect(
    Math.min(start.x, end.x),
    Math.min(start.y, end.y),
    Math.abs(end.x - start.x),
    Math.abs(end.y - start.y),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
