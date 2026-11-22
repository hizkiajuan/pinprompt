import { type Pin as PinType, PinSession, type PinSession as PinSessionType } from "../schemas";

/**
 * The prompt is meant to be pasted into an AI coding tool, so every line has to earn its tokens.
 * Shared context (page, scope rule) is stated once; each pin gets one line saying what the
 * element is, in the terms that find it in code (component path, source file, visible text,
 * selector), and one line with the requested change. Raw HTML only appears for a pin with no
 * React component, and then just the opening tag.
 */
const MAX_TEXT = 60;
const MAX_TAG = 160;
const MAX_ANCESTORS = 3;
const MAX_SELECTOR = 80;

export function buildPromptMarkdown(session: PinSessionType): string {
  const currentSession = PinSession.parse(session);

  if (currentSession.pins.length === 0) {
    throw new Error("Cannot build a prompt for an empty session.");
  }

  const routes = listRoutes(currentSession);
  const origin = readOrigin(currentSession.pageUrl);
  const single = routes.length === 1;
  const where = single ? `${origin}${routes[0]}` : origin;
  const count = currentSession.pins.length;

  const header = [
    "# UI changes",
    "",
    `${count === 1 ? "One change" : `${count} changes`} to my React app at ${where}, each pinned to an element. Edit only those elements and the code they need; leave everything else as it is.`,
  ];

  return [
    ...header,
    "",
    currentSession.pins.map((pin) => renderPin(pin, !single)).join("\n\n"),
    "",
  ].join("\n");
}

/** Distinct routes in pin order. */
export function listRoutes(session: PinSessionType): string[] {
  return [...new Set(session.pins.map((pin) => pin.routePath))];
}

export function hasMultipleRoutes(session: PinSessionType): boolean {
  return listRoutes(session).length > 1;
}

function renderPin(pin: PinType, showRoute: boolean): string {
  const lines = [
    `${pin.index}. ${describeTarget(pin)}${showRoute ? `, on ${pin.routePath}` : ""}`,
    `   Element: ${describeElement(pin)}`,
  ];

  const instruction = pin.instruction.trim() || "(no instruction)";
  const [first = "", ...rest] = instruction.split("\n");

  lines.push(`   Change: ${first}`);
  for (const line of rest) {
    lines.push(`   ${line}`);
  }

  return lines.join("\n");
}

/** "Button in PlanCard > BillingPage (PlanCard.tsx)" or "Region over UsageCard". */
function describeTarget(pin: PinType): string {
  const tree = usableTree(pin);
  const region = pin.selectionMode === "drag";

  if (!tree) {
    return region ? `Region around <${pin.target.tagName}>` : `<${pin.target.tagName}> element`;
  }

  const leaf = tree.leafComponent.name;
  const ancestors = tree.ancestorChain.slice(0, MAX_ANCESTORS).map((item) => item.name);
  const path = ancestors.length > 0 ? ` in ${ancestors.join(" > ")}` : "";
  const source = tree.leafComponent.sourceHint ? ` (${tree.leafComponent.sourceHint})` : "";
  return `${region ? "Region over " : ""}${leaf}${path}${source}`;
}

/**
 * The React context when its names mean something. A production build minifies component names
 * ("e7", "OR"): those would send the AI tool searching for nothing, so the pin is described by
 * its HTML instead.
 */
function usableTree(pin: PinType): PinType["reactTree"] {
  return pin.reactTree && pin.reactTree.confidence !== "low" ? pin.reactTree : null;
}

/** `<button>` "Upgrade plan", `#pay`, shadcn Button. */
function describeElement(pin: PinType): string {
  const parts: string[] = [];
  const text = clip(pin.target.visibleText.replace(/\s+/g, " ").trim(), MAX_TEXT);

  if (usableTree(pin)) {
    parts.push(inlineCode(`<${pin.target.tagName}>`));
  } else {
    // No component names to search for: the opening tag is the best handle on the code.
    parts.push(inlineCode(clip(openingTag(pin.target.domSnippet, pin.target.tagName), MAX_TAG)));
  }

  if (text) {
    parts.push(`"${text}"`);
  }

  if (pin.target.selector) {
    parts.push(inlineCode(clip(pin.target.selector, MAX_SELECTOR)));
  }

  // Only the nearest hint describes the element itself (later ones are its containers), and it
  // adds nothing when it just repeats the component name.
  const nearest = pin.shadcnHints[0]?.label;

  if (nearest && nearest !== usableTree(pin)?.leafComponent.name) {
    parts.push(`shadcn ${nearest}`);
  }

  return parts.join(", ");
}

function openingTag(snippet: string, tagName: string): string {
  const match = /^\s*<[^>]*>/.exec(snippet);

  return match ? match[0].trim() : `<${tagName}>`;
}

function inlineCode(content: string): string {
  const ticks = "`".repeat(longestBacktickRun(content) + 1);
  const padding = content.startsWith("`") || content.endsWith("`") ? " " : "";

  return `${ticks}${padding}${content}${padding}${ticks}`;
}

function longestBacktickRun(content: string): number {
  return Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3).trimEnd()}...`;
}

function readOrigin(pageUrl: string): string {
  try {
    return new URL(pageUrl).origin;
  } catch {
    return pageUrl;
  }
}
