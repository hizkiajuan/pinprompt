import { ReactPinContext, type ComponentEvidence as ComponentEvidenceType } from "../schemas";
import type {
  ConfidenceLevel as ConfidenceLevelType,
  ReactPinContext as ReactPinContextType,
} from "../schemas";

export type FiberNodeKind = "component" | "host" | "text" | "other";

export type FiberSnapshot = {
  kind: FiberNodeKind;
  name?: string | null;
  displayName?: string | null;
  sourceHint?: string | null;
  child?: FiberSnapshot | null;
  sibling?: FiberSnapshot | null;
  return?: FiberSnapshot | null;
};

export interface FiberReader<TTarget = unknown> {
  read(target: TTarget): FiberSnapshot | null;
}

export function resolveReactTree<TTarget>(
  domTarget: TTarget,
  fiberReader: FiberReader<TTarget>,
): ReactPinContextType | null {
  return buildReactPinContext(fiberReader.read(domTarget));
}

export function buildReactPinContext(snapshot: FiberSnapshot | null): ReactPinContextType | null {
  if (!snapshot) {
    return null;
  }

  const leafSnapshot = findNearestComponentSnapshot(snapshot);

  if (!leafSnapshot) {
    return null;
  }

  const leafComponent = toComponentEvidence(leafSnapshot);

  if (!leafComponent) {
    return null;
  }

  const ancestorChain = collectAncestorComponents(leafSnapshot.return);
  const childComponents = collectChildComponents(leafSnapshot.child);
  const signals = buildSignals(
    snapshot,
    leafSnapshot,
    leafComponent,
    ancestorChain,
    childComponents,
  );

  return ReactPinContext.parse({
    leafComponent,
    ancestorChain,
    childComponents,
    confidence: inferConfidence(leafComponent, ancestorChain, childComponents),
    signals,
  });
}

function findNearestComponentSnapshot(snapshot: FiberSnapshot): FiberSnapshot | null {
  let current: FiberSnapshot | null | undefined = snapshot;

  while (current) {
    if (current.kind === "component" && toComponentEvidence(current)) {
      return current;
    }

    current = current.return;
  }

  return null;
}

function collectAncestorComponents(
  snapshot: FiberSnapshot | null | undefined,
): ComponentEvidenceType[] {
  const ancestors: ComponentEvidenceType[] = [];
  let current = snapshot;

  while (current) {
    const evidence = current.kind === "component" ? toComponentEvidence(current) : null;

    if (evidence) {
      ancestors.push(evidence);
    }

    current = current.return;
  }

  return ancestors;
}

function collectChildComponents(
  snapshot: FiberSnapshot | null | undefined,
): ComponentEvidenceType[] {
  if (!snapshot) {
    return [];
  }

  const seenSnapshots = new Set<FiberSnapshot>();
  const seenKeys = new Set<string>();
  const children: ComponentEvidenceType[] = [];

  scanDirectChildComponents(snapshot, seenSnapshots, seenKeys, children);

  return children;
}

function scanDirectChildComponents(
  snapshot: FiberSnapshot | null | undefined,
  seenSnapshots: Set<FiberSnapshot>,
  seenKeys: Set<string>,
  children: ComponentEvidenceType[],
): void {
  if (!snapshot || seenSnapshots.has(snapshot)) {
    return;
  }

  seenSnapshots.add(snapshot);

  if (snapshot.kind === "component") {
    const evidence = toComponentEvidence(snapshot);

    if (evidence) {
      const key = buildEvidenceKey(evidence);

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        children.push(evidence);
      }
    }

    scanDirectChildComponents(snapshot.sibling, seenSnapshots, seenKeys, children);
    return;
  }

  scanDirectChildComponents(snapshot.child, seenSnapshots, seenKeys, children);
  scanDirectChildComponents(snapshot.sibling, seenSnapshots, seenKeys, children);
}

function toComponentEvidence(snapshot: FiberSnapshot): ComponentEvidenceType | null {
  const displayName = cleanLabel(snapshot.displayName);
  const name = cleanLabel(snapshot.name);
  const sourceHint = cleanLabel(snapshot.sourceHint);
  const resolvedName = displayName ?? name;

  if (!resolvedName) {
    return null;
  }

  return {
    name: resolvedName,
    displayName: displayName ?? null,
    sourceHint: sourceHint ?? null,
  };
}

function buildSignals(
  rootSnapshot: FiberSnapshot,
  leafSnapshot: FiberSnapshot,
  leafComponent: ComponentEvidenceType,
  ancestorChain: ComponentEvidenceType[],
  childComponents: ComponentEvidenceType[],
): string[] {
  const signals = new Set<string>(["fiber-snapshot"]);

  if (leafSnapshot !== rootSnapshot) {
    signals.add("resolved-from-host-fiber");
  }

  if (leafComponent.displayName) {
    signals.add("leaf-displayName");
  } else {
    signals.add("leaf-name");
  }

  if (leafComponent.sourceHint) {
    signals.add("leaf-sourceHint");
  }

  if (ancestorChain.length > 0) {
    signals.add("ancestor-chain");
  }

  if (childComponents.length > 0) {
    signals.add("child-components");
  }

  if (isProbablyMinifiedLabel(leafComponent.name)) {
    signals.add("minified-component-name");
  }

  return [...signals];
}

function inferConfidence(
  leafComponent: ComponentEvidenceType,
  ancestorChain: ComponentEvidenceType[],
  childComponents: ComponentEvidenceType[],
): ConfidenceLevelType {
  const relatedComponents = [leafComponent, ...ancestorChain, ...childComponents];

  if (relatedComponents.some((component) => isProbablyMinifiedLabel(component.name))) {
    return "low";
  }

  if (leafComponent.displayName || leafComponent.sourceHint) {
    return "high";
  }

  if (ancestorChain.length > 0 || childComponents.length > 0) {
    return "medium";
  }

  return "low";
}

function buildEvidenceKey(evidence: ComponentEvidenceType): string {
  return [evidence.name, evidence.displayName ?? "", evidence.sourceHint ?? ""].join("::");
}

function cleanLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function isProbablyMinifiedLabel(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length <= 2) {
    return true;
  }

  return !/^[A-Z]/.test(trimmed);
}
