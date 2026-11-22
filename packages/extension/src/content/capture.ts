import {
  buildReactPinContext,
  inferShadcn,
  type BoundingBoxType,
  type RawPinTarget,
  type ReactPinContextType,
} from "@pinprompt/core";

import {
  PROBE_ATTRIBUTE,
  PROBE_REQUEST,
  PROBE_RESPONSE,
  type ProbeResponse,
} from "../messaging/probe.js";
import type { RawCapturePayload } from "../messaging/protocol.js";

const ATTRIBUTE_ALLOWLIST = [
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "data-slot",
  "data-testid",
  "href",
  "name",
  "placeholder",
  "role",
  "title",
  "type",
] as const;

const MAX_CLASS_NAMES = 10;
const MAX_TEXT_LENGTH = 400;
const MAX_SNIPPET_LENGTH = 700;
const MAX_SLOT_ANCESTORS = 6;

export function captureClickPayload(target: Element): RawCapturePayload | null {
  if (!isCapturableElement(target)) {
    return null;
  }

  const bbox = toBoundingBox(target.getBoundingClientRect());

  if (bbox.width <= 0 || bbox.height <= 0) {
    return null;
  }

  return buildCapturePayload("click", bbox, target, [target]);
}

export function captureDragPayload(
  selectionRect: DOMRectReadOnly,
  overlayRoot: HTMLElement | null,
): RawCapturePayload | null {
  const bbox = toBoundingBox(selectionRect);

  if (bbox.width <= 0 || bbox.height <= 0) {
    return null;
  }

  const candidates = collectIntersectingElements(bbox, overlayRoot);
  const primaryTarget = candidates[0] ?? document.body;

  return buildCapturePayload("drag", bbox, primaryTarget, candidates);
}

function buildCapturePayload(
  selectionMode: RawCapturePayload["selectionMode"],
  bbox: BoundingBoxType,
  primaryTarget: Element,
  evidenceElements: Element[],
): RawCapturePayload {
  const target = buildRawTarget(primaryTarget, bbox, evidenceElements);
  const reactTree = readReactTree(primaryTarget);
  // Inference sees every class on the primary target, not the trimmed list kept for the prompt:
  // a shadcn Button alone carries more than MAX_CLASS_NAMES classes.
  const shadcnHints = inferShadcn(Array.from(primaryTarget.classList), readSlots(primaryTarget));

  return {
    selectionMode,
    pageUrl: window.location.href,
    routePath: buildRoutePath(),
    target,
    reactTree,
    shadcnHints,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };
}

function buildRawTarget(
  primaryTarget: Element,
  bbox: BoundingBoxType,
  evidenceElements: Element[],
): RawPinTarget {
  return {
    selector: buildSelector(primaryTarget),
    bbox,
    pageBox: {
      ...bbox,
      x: roundCoordinate(bbox.x + window.scrollX),
      y: roundCoordinate(bbox.y + window.scrollY),
    },
    tagName: primaryTarget.tagName.toLowerCase(),
    visibleText: readVisibleText(evidenceElements),
    domSnippet: readDomSnippet(primaryTarget),
    classNames: readClassNames(evidenceElements),
    role: primaryTarget.getAttribute("role"),
    attributes: readAttributes(primaryTarget),
  };
}

function collectIntersectingElements(
  bbox: BoundingBoxType,
  overlayRoot: HTMLElement | null,
): Element[] {
  const overlapByElement = new Map<Element, number>();

  for (const element of Array.from(document.querySelectorAll("body *"))) {
    if (!isCapturableElement(element) || overlayRoot?.contains(element)) {
      continue;
    }

    const rect = element.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    const overlap = intersectionArea(bbox, toBoundingBox(rect));

    if (overlap > 0) {
      overlapByElement.set(element, overlap);
    }
  }

  return [...overlapByElement.keys()].sort((left, right) => {
    const areaDelta = (overlapByElement.get(right) ?? 0) - (overlapByElement.get(left) ?? 0);

    if (areaDelta !== 0) {
      return areaDelta;
    }

    return getElementDepth(right) - getElementDepth(left);
  });
}

function readVisibleText(elements: Element[]): string {
  // A region's candidates nest (main > section > button); reading only the outermost ones keeps
  // each piece of text once.
  const outermost = elements.filter(
    (element) => !elements.some((other) => other !== element && other.contains(element)),
  );
  const tokens = outermost
    .flatMap((element) =>
      tokenizeText(
        element instanceof HTMLElement ? element.innerText : (element.textContent ?? ""),
      ),
    )
    .filter((value, index, values) => values.indexOf(value) === index);

  return clampString(tokens.join(" "), MAX_TEXT_LENGTH);
}

function readDomSnippet(element: Element): string {
  const snippet = element.outerHTML.replace(/\s+/g, " ").trim();

  return clampString(snippet, MAX_SNIPPET_LENGTH);
}

function readClassNames(elements: Element[]): string[] {
  const names = elements.flatMap((element) => Array.from(element.classList));

  return [...new Set(names)].slice(0, MAX_CLASS_NAMES);
}

function readAttributes(element: Element): Record<string, string> {
  const entries = ATTRIBUTE_ALLOWLIST.flatMap((attributeName) => {
    const value = element.getAttribute(attributeName);

    return value ? [[attributeName, value]] : [];
  });

  return Object.fromEntries(entries);
}

function buildSelector(element: Element): string {
  if (element.id) {
    return `#${escapeCssToken(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.tagName.toLowerCase() !== "html" && parts.length < 5) {
    const tagName = current.tagName.toLowerCase();
    const classSuffix = Array.from(current.classList)
      .slice(0, 2)
      .map((className) => `.${escapeCssToken(className)}`)
      .join("");
    const parent = current.parentElement;
    const sameTagSiblings = parent
      ? Array.from(parent.children).filter((child) => child.tagName === current?.tagName)
      : [];
    const siblingIndex = sameTagSiblings.indexOf(current) + 1;
    const nthSuffix = sameTagSiblings.length > 1 ? `:nth-of-type(${siblingIndex})` : "";

    parts.unshift(`${tagName}${classSuffix}${nthSuffix}`);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

/** `data-slot` values from the target up through its nearest ancestors, nearest first. */
function readSlots(target: Element): string[] {
  const slots: string[] = [];
  let current: Element | null = target;

  for (let depth = 0; current && depth < MAX_SLOT_ANCESTORS; depth += 1) {
    const slot = current.getAttribute("data-slot");

    if (slot) {
      slots.push(slot);
    }

    current = current.parentElement;
  }

  return slots;
}

/**
 * Asks the page-world fiber probe (main-world/fiber-probe.ts) for the target's React context.
 * The probe answers synchronously inside dispatchEvent; with no probe (not a React page, or the
 * page blocked the script) there is no answer and the pin has no React tree.
 */
export function readReactTree(target: Element): ReactPinContextType | null {
  const id = crypto.randomUUID();
  let response: ProbeResponse | null = null;
  const onResponse = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;

    if (typeof detail !== "string") {
      return;
    }

    try {
      const parsed = JSON.parse(detail) as ProbeResponse;

      if (parsed.id === id) {
        response = parsed;
      }
    } catch {
      // Not ours.
    }
  };

  document.addEventListener(PROBE_RESPONSE, onResponse);
  target.setAttribute(PROBE_ATTRIBUTE, id);

  try {
    document.dispatchEvent(new CustomEvent(PROBE_REQUEST, { detail: id }));
  } finally {
    target.removeAttribute(PROBE_ATTRIBUTE);
    document.removeEventListener(PROBE_RESPONSE, onResponse);
  }

  const snapshot = (response as ProbeResponse | null)?.snapshot ?? null;

  try {
    return buildReactPinContext(snapshot);
  } catch {
    return null;
  }
}

function buildRoutePath(): string {
  const routePath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  return routePath || "/";
}

function tokenizeText(value: string): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized ? [normalized] : [];
}

function toBoundingBox(rect: DOMRectReadOnly): BoundingBoxType {
  return {
    x: roundCoordinate(rect.x),
    y: roundCoordinate(rect.y),
    width: roundCoordinate(rect.width),
    height: roundCoordinate(rect.height),
  };
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function intersectionArea(left: BoundingBoxType, right: BoundingBoxType): number {
  const xOverlap = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );

  return xOverlap * yOverlap;
}

function getElementDepth(element: Element): number {
  let depth = 0;
  let current: Element | null = element;

  while (current?.parentElement) {
    depth += 1;
    current = current.parentElement;
  }

  return depth;
}

function clampString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function isCapturableElement(value: Element): boolean {
  return value.tagName.toLowerCase() !== "script" && value.tagName.toLowerCase() !== "style";
}

function escapeCssToken(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
