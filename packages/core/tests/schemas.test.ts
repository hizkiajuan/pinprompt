import { describe, expect, test } from "bun:test";

import {
  CapturePayload,
  ExportDocument,
  Pin,
  PinSession,
  ReactPinContext,
  ShadcnHint,
} from "@pinprompt/core";

describe("schemas", () => {
  test("parse valid core schema payloads", () => {
    const reactTree = ReactPinContext.parse({
      leafComponent: {
        name: "BillingButton",
        displayName: "BillingButton",
        sourceHint: "BillingButton.tsx",
      },
      ancestorChain: [
        {
          name: "SettingsPage",
          displayName: "SettingsPage",
        },
      ],
      childComponents: [],
      confidence: "high",
      signals: ["fiber-dev", "displayName"],
    });

    const shadcnHint = ShadcnHint.parse({
      label: "Button",
      confidence: "medium",
      signals: ["class-pattern"],
    });

    const capturePayload = CapturePayload.parse({
      selectionMode: "click",
      pageUrl: "http://localhost:3000/settings",
      routePath: "/settings",
      target: {
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
      },
      reactTree,
      shadcnHints: [shadcnHint],
      screenshotCrop: {
        ref: "memory://crop-1",
      },
      instruction: "Increase touch target and icon spacing",
    });

    const pin = Pin.parse({
      id: "22222222-2222-4222-8222-222222222222",
      index: 1,
      createdAt: "2026-07-01T17:21:00.000Z",
      ...capturePayload,
    });

    const session = PinSession.parse({
      id: "11111111-1111-4111-8111-111111111111",
      pageUrl: "http://localhost:3000/settings",
      routePath: "/settings",
      createdAt: "2026-07-01T17:20:00.000Z",
      pins: [pin],
    });

    const exportDocument = ExportDocument.parse({
      format: "pinprompt-export-v1",
      pinCount: 1,
      charCount: 24,
      filename: "pinprompt-settings-1-pin-20260701-172100.md",
      generatedAt: "2026-07-01T17:21:00.000Z",
      body: "# Pinprompt Export\n\nBody",
    });

    expect(session.pins[0]?.reactTree?.leafComponent.name).toBe("BillingButton");
    expect(session.pins[0]?.shadcnHints[0]?.label).toBe("Button");
    expect(exportDocument.format).toBe("pinprompt-export-v1");
  });

  test("reject invalid schema values", () => {
    const invalidPinResult = Pin.safeParse({
      id: "not-a-uuid",
      index: 0,
      createdAt: "not-a-date",
      selectionMode: "hover",
      pageUrl: "settings",
      routePath: "",
      target: {
        selector: "",
        bbox: {
          x: 12,
          y: 24,
          width: -1,
          height: 48,
        },
        tagName: "",
      },
      instruction: "",
    });

    const invalidExportResult = ExportDocument.safeParse({
      format: "wrong-format",
      pinCount: -1,
      charCount: -1,
      filename: "",
      generatedAt: "not-a-date",
      body: "",
    });

    expect(invalidPinResult.success).toBe(false);
    expect(invalidExportResult.success).toBe(false);
  });
});
