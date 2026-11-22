import { describe, expect, test } from "bun:test";

import {
  MAX_PINS,
  addPin,
  buildTargetFingerprint,
  clearSession,
  createSession,
  deletePin,
  updateInstruction,
  validateForGenerate,
  type CapturePayloadType,
} from "@pinprompt/core";

function createCapturePayload(overrides: Partial<CapturePayloadType> = {}): CapturePayloadType {
  const targetOverrides = overrides.target;
  const target = {
    selector: "#billing-button",
    bbox: {
      x: 12,
      y: 24,
      width: 180,
      height: 48,
    },
    tagName: "button",
    visibleText: "Billing",
    domSnippet: '<button id="billing-button">Billing</button>',
    classNames: ["btn", "btn-primary"],
    attributes: {
      id: "billing-button",
    },
  };

  const payload: CapturePayloadType = {
    selectionMode: overrides.selectionMode ?? "click",
    pageUrl: overrides.pageUrl ?? "http://localhost:3000/settings",
    routePath: overrides.routePath ?? "/settings",
    target: {
      selector: targetOverrides?.selector ?? target.selector,
      bbox: {
        ...target.bbox,
        ...targetOverrides?.bbox,
      },
      tagName: targetOverrides?.tagName ?? target.tagName,
      visibleText: targetOverrides?.visibleText ?? target.visibleText,
      domSnippet: targetOverrides?.domSnippet ?? target.domSnippet,
      classNames: targetOverrides?.classNames ?? target.classNames,
      role: targetOverrides?.role ?? null,
      attributes: targetOverrides?.attributes ?? target.attributes,
    },
    shadcnHints: overrides.shadcnHints ?? [],
    instruction: overrides.instruction ?? "",
  };

  if (overrides.reactTree !== undefined) {
    payload.reactTree = overrides.reactTree;
  }

  if (overrides.screenshotCrop !== undefined) {
    payload.screenshotCrop = overrides.screenshotCrop;
  }

  return payload;
}

describe("session", () => {
  test("createSession creates an empty session", () => {
    const session = createSession("http://localhost:3000/settings", "/settings", {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-07-01T17:20:00.000Z",
    });

    expect(session).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      pageUrl: "http://localhost:3000/settings",
      routePath: "/settings",
      createdAt: "2026-07-01T17:20:00.000Z",
      pins: [],
    });
  });

  test("addPin returns an added result for a new fingerprint", () => {
    const session = createSession("http://localhost:3000/settings", "/settings", {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-07-01T17:20:00.000Z",
    });
    const result = addPin(session, createCapturePayload(), {
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-07-01T17:21:00.000Z",
    });

    expect(result.kind).toBe("added");

    if (result.kind !== "added") {
      throw new Error("Expected addPin to return an added result.");
    }

    expect(result.pin.index).toBe(1);
    expect(result.pin.instruction).toBe("");
    expect(result.fingerprint).toBe("/settings::#billing-button");
    expect(result.session.pins).toHaveLength(1);
  });

  test("addPin marks duplicate fingerprints without blocking the add", () => {
    const session = createSession("http://localhost:3000/settings", "/settings", {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-07-01T17:20:00.000Z",
    });
    const firstAdd = addPin(session, createCapturePayload(), {
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-07-01T17:21:00.000Z",
    });

    if (firstAdd.kind === "limit-reached") {
      throw new Error("Unexpected pin limit result.");
    }

    const duplicateAdd = addPin(firstAdd.session, createCapturePayload(), {
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: "2026-07-01T17:22:00.000Z",
    });

    expect(duplicateAdd.kind).toBe("duplicate");

    if (duplicateAdd.kind !== "duplicate") {
      throw new Error("Expected addPin to return a duplicate warning.");
    }

    expect(duplicateAdd.duplicateOf.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(duplicateAdd.session.pins).toHaveLength(2);
    expect(duplicateAdd.session.pins.map((pin) => pin.index)).toEqual([1, 2]);
  });

  test("addPin rejects an 11th pin", () => {
    let session = createSession("http://localhost:3000/settings", "/settings", {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-07-01T17:20:00.000Z",
    });

    for (let index = 0; index < MAX_PINS; index += 1) {
      const result = addPin(
        session,
        createCapturePayload({
          target: {
            selector: `#item-${index + 1}`,
            bbox: {
              x: index,
              y: index,
              width: 100,
              height: 40,
            },
            tagName: "div",
            visibleText: `Item ${index + 1}`,
            domSnippet: `<div id="item-${index + 1}">Item ${index + 1}</div>`,
            classNames: ["item"],
            attributes: {
              id: `item-${index + 1}`,
            },
          },
        }),
        {
          id: `00000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, "0")}`,
          createdAt: `2026-07-01T17:${String(index).padStart(2, "0")}:00.000Z`,
        },
      );

      if (result.kind === "limit-reached") {
        throw new Error("Hit the pin limit before the expected cap.");
      }

      session = result.session;
    }

    const limitResult = addPin(session, createCapturePayload(), {
      id: "99999999-9999-4999-8999-999999999999",
      createdAt: "2026-07-01T18:00:00.000Z",
    });

    expect(limitResult).toEqual({
      kind: "limit-reached",
      session,
      maxPins: MAX_PINS,
    });
  });

  test("updateInstruction, deletePin, clearSession, and validateForGenerate preserve session rules", () => {
    const session = createSession("http://localhost:3000/settings", "/settings", {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-07-01T17:20:00.000Z",
    });
    const firstAdd = addPin(session, createCapturePayload(), {
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-07-01T17:21:00.000Z",
    });

    if (firstAdd.kind === "limit-reached") {
      throw new Error("Unexpected pin limit result.");
    }

    const secondAdd = addPin(
      firstAdd.session,
      createCapturePayload({
        target: {
          selector: "#profile-card",
          bbox: {
            x: 30,
            y: 40,
            width: 240,
            height: 120,
          },
          tagName: "section",
          visibleText: "Profile",
          domSnippet: '<section id="profile-card">Profile</section>',
          classNames: ["card"],
          attributes: {
            id: "profile-card",
          },
        },
        instruction: "  ",
      }),
      {
        id: "33333333-3333-4333-8333-333333333333",
        createdAt: "2026-07-01T17:22:00.000Z",
      },
    );

    if (secondAdd.kind === "limit-reached") {
      throw new Error("Unexpected pin limit result.");
    }

    const updatedSession = updateInstruction(
      secondAdd.session,
      "22222222-2222-4222-8222-222222222222",
      "Increase touch target and icon spacing",
    );
    const validation = validateForGenerate(updatedSession);

    expect(validation).toEqual({
      ok: false,
      incompletePinIds: ["33333333-3333-4333-8333-333333333333"],
    });

    const deletedSession = deletePin(updatedSession, "22222222-2222-4222-8222-222222222222");

    expect(deletedSession.pins).toHaveLength(1);
    expect(deletedSession.pins[0]?.id).toBe("33333333-3333-4333-8333-333333333333");
    expect(deletedSession.pins[0]?.index).toBe(1);

    const clearedSession = clearSession(deletedSession, {
      id: "44444444-4444-4444-8444-444444444444",
      createdAt: "2026-07-01T17:23:00.000Z",
    });

    expect(clearedSession).toEqual({
      id: "44444444-4444-4444-8444-444444444444",
      pageUrl: "http://localhost:3000/settings",
      routePath: "/settings",
      createdAt: "2026-07-01T17:23:00.000Z",
      pins: [],
    });
  });

  test("buildTargetFingerprint ignores scroll position for click pins", () => {
    const fingerprint = buildTargetFingerprint(
      createCapturePayload({
        routePath: "/dashboard",
        target: {
          selector: ".balance-card",
          bbox: {
            x: 4,
            y: 8,
            width: 320,
            height: 200,
          },
          tagName: "section",
          visibleText: "Total Balance",
          domSnippet: '<section class="balance-card">Total Balance</section>',
          classNames: ["balance-card"],
          attributes: {},
        },
      }),
    );

    expect(fingerprint).toBe("/dashboard::.balance-card");
  });

  test("buildTargetFingerprint keys drag pins on rounded size, not position", () => {
    const drag = (x: number, y: number, width: number, height: number) =>
      buildTargetFingerprint(
        createCapturePayload({
          selectionMode: "drag",
          routePath: "/dashboard",
          target: {
            selector: "main > section",
            bbox: { x, y, width, height },
            tagName: "section",
            visibleText: "",
            domSnippet: "<section></section>",
            classNames: [],
            attributes: {},
          },
        }),
      );

    expect(drag(4, 8, 321, 199)).toBe(drag(4, 600, 318, 202));
    expect(drag(4, 8, 320, 200)).not.toBe(drag(4, 8, 120, 200));
  });
});
