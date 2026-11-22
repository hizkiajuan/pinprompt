import type { FiberSnapshot } from "@pinprompt/core";

/**
 * Reads a bounded snapshot of React's fiber tree around a DOM node. Runs in the page's own
 * JavaScript world (see `fiber-probe.ts`), because the `__reactFiber$…` properties are invisible
 * from the isolated content-script world. Type-only imports keep this bundle tiny.
 *
 * The snapshot holds the node's ancestor chain (for the component path) and, under the nearest
 * named component only, a small slice of its children, never the whole tree: a large app has
 * tens of thousands of fibers and the result crosses a world boundary as JSON.
 */
const REACT_FIBER_PREFIXES = ["__reactFiber$", "__reactInternalInstance$"];
const MAX_ANCESTORS = 80;
const MAX_CHILD_NODES = 60;
const MAX_CHILD_DEPTH = 8;

// React work tags (packages/react-reconciler/src/ReactWorkTags.js).
const HOST_COMPONENT = 5;
const HOST_TEXT = 6;
const HOST_HOISTABLE = 26;
const HOST_SINGLETON = 27;

export type FiberLike = {
  child?: FiberLike | null;
  sibling?: FiberLike | null;
  return?: FiberLike | null;
  tag?: number;
  type?: unknown;
  elementType?: unknown;
  _debugSource?: { fileName?: string } | null;
};

export type ElementLike = {
  parentElement?: ElementLike | null;
};

export function readFiberSnapshot(target: ElementLike): FiberSnapshot | null {
  const fiber = findNearestFiber(target);

  return fiber ? buildSnapshot(fiber) : null;
}

export function findNearestFiber(target: ElementLike): FiberLike | null {
  let current: ElementLike | null | undefined = target;

  while (current) {
    const fiber = readFiberFromElement(current);

    if (fiber) {
      return fiber;
    }

    current = current.parentElement;
  }

  return null;
}

export function buildSnapshot(start: FiberLike): FiberSnapshot {
  const chain: FiberLike[] = [];
  let current: FiberLike | null | undefined = start;

  while (current && chain.length < MAX_ANCESTORS) {
    chain.push(current);
    current = current.return;
  }

  const nodes = chain.map(describeFiber);

  nodes.forEach((node, index) => {
    node.return = nodes[index + 1] ?? null;
  });

  const leafIndex = nodes.findIndex(
    (node) => node.kind === "component" && Boolean(node.displayName ?? node.name),
  );
  const leafFiber = chain[leafIndex];
  const leafNode = nodes[leafIndex];

  if (leafFiber && leafNode) {
    leafNode.child = expandChildren(leafFiber.child, 0, { left: MAX_CHILD_NODES });
  }

  return nodes[0] ?? describeFiber(start);
}

function expandChildren(
  fiber: FiberLike | null | undefined,
  depth: number,
  budget: { left: number },
): FiberSnapshot | null {
  if (!fiber || budget.left <= 0 || depth > MAX_CHILD_DEPTH) {
    return null;
  }

  budget.left -= 1;

  const node = describeFiber(fiber);
  node.child = expandChildren(fiber.child, depth + 1, budget);
  node.sibling = expandChildren(fiber.sibling, depth, budget);

  return node;
}

function describeFiber(fiber: FiberLike): FiberSnapshot {
  const meta = readComponentMeta(fiber);

  return {
    kind: inferFiberKind(fiber, meta),
    ...(meta.name ? { name: meta.name } : {}),
    ...(meta.displayName ? { displayName: meta.displayName } : {}),
    ...(meta.sourceHint ? { sourceHint: meta.sourceHint } : {}),
  };
}

function readFiberFromElement(target: ElementLike): FiberLike | null {
  for (const key of Object.keys(target)) {
    if (REACT_FIBER_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      const fiber = (target as Record<string, unknown>)[key];

      if (typeof fiber === "object" && fiber !== null) {
        return fiber as FiberLike;
      }
    }
  }

  return null;
}

type ComponentMeta = {
  name: string | null;
  displayName: string | null;
  sourceHint: string | null;
};

function inferFiberKind(fiber: FiberLike, meta: ComponentMeta): FiberSnapshot["kind"] {
  if (
    fiber.tag === HOST_COMPONENT ||
    fiber.tag === HOST_HOISTABLE ||
    fiber.tag === HOST_SINGLETON ||
    typeof fiber.type === "string"
  ) {
    return "host";
  }

  if (fiber.tag === HOST_TEXT) {
    return "text";
  }

  return meta.name || meta.displayName ? "component" : "other";
}

function readComponentMeta(fiber: FiberLike): ComponentMeta {
  if (typeof fiber.type === "string") {
    return { name: null, displayName: null, sourceHint: null };
  }

  let name: string | null = null;
  let displayName: string | null = null;

  for (const candidate of [fiber.elementType, fiber.type]) {
    const resolved = readFunctionLikeName(candidate, 0);
    displayName ??= resolved.displayName;
    name ??= resolved.name;

    if (displayName || name) {
      break;
    }
  }

  return { name, displayName, sourceHint: readSourceHint(fiber) };
}

function readFunctionLikeName(
  value: unknown,
  depth: number,
): { name: string | null; displayName: string | null } {
  const none = { name: null, displayName: null };

  if (!value || depth > 3) {
    return none;
  }

  if (typeof value === "function") {
    return {
      name: cleanLabel(value.name),
      displayName: cleanLabel((value as { displayName?: unknown }).displayName),
    };
  }

  if (typeof value !== "object") {
    return none;
  }

  // forwardRef ({ render }), memo ({ type }), lazy and context objects.
  const record = value as { displayName?: unknown; render?: unknown; type?: unknown };
  const displayName = cleanLabel(record.displayName);

  if (displayName) {
    return { name: null, displayName };
  }

  if (record.render) {
    const renderName = readFunctionLikeName(record.render, depth + 1);

    if (renderName.displayName || renderName.name) {
      return renderName;
    }
  }

  if (record.type) {
    return readFunctionLikeName(record.type, depth + 1);
  }

  return none;
}

/** React 18 and earlier dev builds only; React 19 dropped `_debugSource`. */
function readSourceHint(fiber: FiberLike): string | null {
  const fileName = fiber._debugSource?.fileName;

  return fileName ? cleanLabel(fileName.split(/[\\/]/).pop()) : null;
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}
