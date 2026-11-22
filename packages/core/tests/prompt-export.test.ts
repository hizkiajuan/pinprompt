import { describe, expect, test } from "bun:test";

import {
  buildExportMarkdown,
  buildFilename,
  buildPromptMarkdown,
  addPin,
  createSession,
  type PinSessionType,
} from "@pinprompt/core";

function createSinglePinSession() {
  const session = createSession("http://localhost:3000/settings", "/settings", {
    id: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-07-01T17:20:00.000Z",
  });
  const addResult = addPin(
    session,
    {
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
      instruction: "Increase touch target and icon spacing",
      shadcnHints: [],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-07-01T17:21:00.000Z",
    },
  );

  if (addResult.kind === "limit-reached") {
    throw new Error("Unexpected pin limit result.");
  }

  return addResult.session;
}

function createMultiPinSession() {
  const singleSession = createSinglePinSession();
  const addResult = addPin(
    singleSession,
    {
      selectionMode: "drag",
      pageUrl: "http://localhost:3000/settings",
      routePath: "/settings",
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
        classNames: ["card", "card-elevated"],
        attributes: {
          id: "profile-card",
        },
      },
      instruction: "Make this card feel more premium and compact",
      shadcnHints: [],
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: "2026-07-01T17:22:00.000Z",
    },
  );

  if (addResult.kind === "limit-reached") {
    throw new Error("Unexpected pin limit result.");
  }

  return addResult.session;
}

describe("prompt engine and export", () => {
  test("one pin: page once, then what the element is and the change", () => {
    expect(buildPromptMarkdown(createSinglePinSession())).toBe(
      [
        "# UI changes",
        "",
        "One change to my React app at http://localhost:3000/settings, each pinned to an element. Edit only those elements and the code they need; leave everything else as it is.",
        "",
        "1. <button> element",
        '   Element: `<button id="billing-button">`, "Billing", `#billing-button`',
        "   Change: Increase touch target and icon spacing",
        "",
      ].join("\n"),
    );
  });

  test("React context replaces raw HTML and names the component path", () => {
    const session = withReactTree(createSinglePinSession());
    const markdown = buildPromptMarkdown(session);

    expect(markdown).toContain("1. Button in BillingCard > SettingsPage (BillingCard.tsx)");
    expect(markdown).toContain('Element: `<button>`, "Billing", `#billing-button`\n');
    expect(markdown).not.toContain('id="billing-button">');
  });

  test("only the nearest shadcn hint is named, and not when it repeats the component", () => {
    const base = withReactTree(createSinglePinSession());
    const pin = base.pins[0]!;
    const hints = (labels: string[]) =>
      labels.map((label) => ({ label, confidence: "high" as const, signals: [] }));
    const withHints = (labels: string[], leaf: string) =>
      buildPromptMarkdown({
        ...base,
        pins: [
          {
            ...pin,
            shadcnHints: hints(labels),
            reactTree: {
              ...pin.reactTree!,
              leafComponent: { ...pin.reactTree!.leafComponent, name: leaf },
            },
          },
        ],
      });

    expect(withHints(["Button", "Card"], "Button")).not.toContain("shadcn");
    expect(withHints(["Input", "Card"], "EmailField")).toContain("shadcn Input\n");
  });

  test("minified component names fall back to the HTML tag", () => {
    const base = withReactTree(createSinglePinSession());
    const pin = base.pins[0]!;
    const minified = {
      ...pin.reactTree!,
      confidence: "low" as const,
      leafComponent: { name: "e7", displayName: null, sourceHint: null },
      ancestorChain: [{ name: "OR", displayName: null, sourceHint: null }],
    };
    const markdown = buildPromptMarkdown({ ...base, pins: [{ ...pin, reactTree: minified }] });

    expect(markdown).not.toContain("e7");
    expect(markdown).toContain("1. <button> element");
    expect(markdown).toContain('`<button id="billing-button">`');
  });

  test("several pins stay compact: shared context once, about 300 characters a pin", () => {
    const session = createMultiPinSession();
    const markdown = buildPromptMarkdown(session);

    expect(markdown).toContain("2 changes to my React app at http://localhost:3000/settings");
    expect(markdown).toContain("2. Region around <section>");
    expect(markdown.match(/Edit only/g)).toHaveLength(1);
    expect(markdown.length).toBeLessThan(700);
  });

  test("long text and snippets are clipped, never dumped", () => {
    const session = createSinglePinSession();
    const pin = session.pins[0]!;
    const long = {
      ...session,
      pins: [
        {
          ...pin,
          target: {
            ...pin.target,
            visibleText: "word ".repeat(200),
            domSnippet: `<div class="${"x ".repeat(300)}">${"y".repeat(5000)}</div>`,
          },
        },
      ],
    };
    const markdown = buildPromptMarkdown(long);

    expect(markdown.length).toBeLessThan(600);
    expect(markdown).toContain("...");
  });

  test("multi-line instructions stay inside their pin", () => {
    const session = createSinglePinSession();
    const pin = session.pins[0]!;
    const markdown = buildPromptMarkdown({
      ...session,
      pins: [{ ...pin, instruction: "Make it blue\nand bigger" }],
    });

    expect(markdown).toContain("   Change: Make it blue\n   and bigger");
  });

  test("pins on several routes name their route and the header names the origin", () => {
    const session = createMultiPinSession();
    const [first, second] = session.pins;
    const mixed = { ...session, pins: [first!, { ...second!, routePath: "/billing" }] };
    const markdown = buildPromptMarkdown(mixed);

    expect(markdown).toContain("2 changes to my React app at http://localhost:3000, each");
    expect(markdown).toContain("1. <button> element, on /settings");
    expect(markdown).toContain("2. Region around <section>, on /billing");
    expect(buildFilename(mixed, 2, new Date("2026-07-01T14:30:22.000Z"))).toBe(
      "pinprompt-multi-route-2-pins-20260701-143022.md",
    );
  });

  test("selectors with backticks stay valid inline code", () => {
    const session = createSinglePinSession();
    const pin = session.pins[0]!;
    const markdown = buildPromptMarkdown({
      ...session,
      pins: [{ ...pin, target: { ...pin.target, selector: "div[data-x=`a`]" } }],
    });

    expect(markdown).toContain("``div[data-x=`a`]``");
  });

  test("buildFilename uses the route slug and timestamp convention", () => {
    const session = createMultiPinSession();
    const filename = buildFilename(
      { ...session, routePath: "/settings/billing?tab=cards" },
      session.pins.length,
      new Date("2026-07-01T14:30:22.000Z"),
    );

    expect(filename).toBe("pinprompt-settings-billing-2-pins-20260701-143022.md");
  });

  test("buildExportMarkdown returns char count, pin count, and filename", () => {
    const document = buildExportMarkdown(createSinglePinSession(), {
      generatedAt: new Date("2026-07-01T14:30:22.000Z"),
    });

    expect(document.pinCount).toBe(1);
    expect(document.charCount).toBe(document.body.length);
    expect(document.filename).toBe("pinprompt-settings-1-pin-20260701-143022.md");
  });
});

function withReactTree(session: PinSessionType): PinSessionType {
  const pin = session.pins[0]!;

  return {
    ...session,
    pins: [
      {
        ...pin,
        reactTree: {
          leafComponent: { name: "Button", displayName: null, sourceHint: "BillingCard.tsx" },
          ancestorChain: [
            { name: "BillingCard", displayName: null, sourceHint: null },
            { name: "SettingsPage", displayName: null, sourceHint: null },
          ],
          childComponents: [],
          confidence: "high",
          signals: [],
        },
        shadcnHints: [{ label: "Button", confidence: "high", signals: [] }],
      },
    ],
  };
}
