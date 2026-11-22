import { MAX_PINS } from "../constants";
import {
  CapturePayload,
  type CapturePayload as CapturePayloadType,
  Pin,
  type Pin as PinType,
  PinSession,
  type PinSession as PinSessionType,
} from "../schemas";

type SessionSeed = {
  id?: string;
  createdAt?: string;
};

export type AddPinResult =
  | {
      kind: "added";
      session: PinSessionType;
      pin: PinType;
      fingerprint: string;
    }
  | {
      kind: "duplicate";
      session: PinSessionType;
      pin: PinType;
      fingerprint: string;
      duplicateOf: PinType;
    }
  | {
      kind: "limit-reached";
      session: PinSessionType;
      maxPins: number;
    };

export type GenerateValidationResult = { ok: true } | { ok: false; incompletePinIds: string[] };

export function createSession(
  pageUrl: string,
  routePath: string,
  seed: SessionSeed = {},
): PinSessionType {
  return PinSession.parse({
    id: seed.id ?? crypto.randomUUID(),
    pageUrl,
    routePath,
    createdAt: seed.createdAt ?? new Date().toISOString(),
    pins: [],
  });
}

export function clearSession(session: PinSessionType, seed: SessionSeed = {}): PinSessionType {
  const currentSession = PinSession.parse(session);

  return createSession(currentSession.pageUrl, currentSession.routePath, seed);
}

export function addPin(
  session: PinSessionType,
  payload: CapturePayloadType,
  seed: SessionSeed = {},
): AddPinResult {
  const currentSession = PinSession.parse(session);
  const capturePayload = CapturePayload.parse(payload);

  if (currentSession.pins.length >= MAX_PINS) {
    return {
      kind: "limit-reached",
      session: currentSession,
      maxPins: MAX_PINS,
    };
  }

  const fingerprint = buildTargetFingerprint(capturePayload);
  const duplicateOf = currentSession.pins.find(
    (pin) => buildTargetFingerprint(pin) === fingerprint,
  );

  const nextPin = Pin.parse({
    id: seed.id ?? crypto.randomUUID(),
    index: currentSession.pins.length + 1,
    createdAt: seed.createdAt ?? new Date().toISOString(),
    selectionMode: capturePayload.selectionMode,
    pageUrl: capturePayload.pageUrl,
    routePath: capturePayload.routePath,
    target: capturePayload.target,
    reactTree: capturePayload.reactTree === undefined ? undefined : capturePayload.reactTree,
    shadcnHints: capturePayload.shadcnHints,
    screenshotCrop:
      capturePayload.screenshotCrop === undefined ? undefined : capturePayload.screenshotCrop,
    instruction: capturePayload.instruction,
  });

  const nextSession = PinSession.parse({
    ...currentSession,
    pins: [...currentSession.pins, nextPin],
  });

  if (duplicateOf) {
    return {
      kind: "duplicate",
      session: nextSession,
      pin: nextPin,
      fingerprint,
      duplicateOf,
    };
  }

  return {
    kind: "added",
    session: nextSession,
    pin: nextPin,
    fingerprint,
  };
}

export function updateInstruction(
  session: PinSessionType,
  pinId: string,
  instruction: string,
): PinSessionType {
  const currentSession = PinSession.parse(session);
  const pinIndex = currentSession.pins.findIndex((pin) => pin.id === pinId);

  if (pinIndex === -1) {
    throw new Error(`Pin not found: ${pinId}`);
  }

  const nextPins = currentSession.pins.map((pin) =>
    pin.id === pinId ? { ...pin, instruction } : pin,
  );

  return PinSession.parse({
    ...currentSession,
    pins: nextPins,
  });
}

export function deletePin(session: PinSessionType, pinId: string): PinSessionType {
  const currentSession = PinSession.parse(session);
  const pinExists = currentSession.pins.some((pin) => pin.id === pinId);

  if (!pinExists) {
    throw new Error(`Pin not found: ${pinId}`);
  }

  const nextPins = currentSession.pins
    .filter((pin) => pin.id !== pinId)
    .map((pin, index) => ({
      ...pin,
      index: index + 1,
    }));

  return PinSession.parse({
    ...currentSession,
    pins: nextPins,
  });
}

export function validateForGenerate(session: PinSessionType): GenerateValidationResult {
  const currentSession = PinSession.parse(session);
  const incompletePinIds = currentSession.pins
    .filter((pin) => pin.instruction.trim().length === 0)
    .map((pin) => pin.id);

  if (incompletePinIds.length > 0) {
    return {
      ok: false,
      incompletePinIds,
    };
  }

  return { ok: true };
}

/**
 * Identifies a pin target independently of scroll position: a click pin is its route and
 * selector; a drag pin adds its size (rounded to 8 px), since drags over different regions can
 * share a primary element. The bounding box is viewport-relative, so its x and y are left out.
 */
export function buildTargetFingerprint(
  source:
    | Pick<CapturePayloadType, "routePath" | "target" | "selectionMode">
    | Pick<PinType, "routePath" | "target" | "selectionMode">,
): string {
  const routePath = source.routePath.trim();
  const selector = source.target.selector.trim();
  const base = `${routePath}::${selector}`;

  if (source.selectionMode === "click") {
    return base;
  }

  const { width, height } = source.target.bbox;

  return `${base}::${roundTo(width, 8)}x${roundTo(height, 8)}`;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
