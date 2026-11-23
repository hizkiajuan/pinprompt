import { describe, expect, test } from "bun:test";

import {
  buildReactPinContext,
  inferShadcn,
  normalizeCapture,
  resolveReactTree,
  type FiberReader,
} from "@pinprompt/core";

import { createMinifiedFiberFixture, createNamedFiberFixture } from "./fixtures/fiber-fixtures";

describe("react tree, shadcn inference, and capture normalization", () => {
  test("resolveReactTree builds a named component path from a host fiber snapshot", () => {
    const target = { id: "billing-button" };
    const reader: FiberReader<typeof target> = {
      read(currentTarget) {
        expect(currentTarget).toBe(target);
        return createNamedFiberFixture();
      },
    };

    const reactTree = resolveReactTree(target, reader);

    expect(reactTree).toEqual({
      leafComponent: {
        name: "BalanceCard",
        displayName: "BalanceCard",
        sourceHint: "balance-card.tsx",
      },
      ancestorChain: [
        {
          name: "Card",
          displayName: "Card",
          sourceHint: "card.tsx",
        },
        {
          name: "Page",
          displayName: "Page",
          sourceHint: "page.tsx",
        },
      ],
      childComponents: [
        {
          name: "BalanceStat",
          displayName: "BalanceStat",
          sourceHint: "balance-stat.tsx",
        },
      ],
      confidence: "high",
      signals: [
        "fiber-snapshot",
        "resolved-from-host-fiber",
        "leaf-displayName",
        "leaf-sourceHint",
        "ancestor-chain",
        "child-components",
      ],
    });
  });

  test("buildReactPinContext marks minified names as low confidence", () => {
    const reactTree = buildReactPinContext(createMinifiedFiberFixture());

    expect(reactTree?.leafComponent.name).toBe("t");
    expect(reactTree?.ancestorChain.map((item) => item.name)).toEqual(["e", "n"]);
    expect(reactTree?.confidence).toBe("low");
    expect(reactTree?.signals).toContain("minified-component-name");
  });

  test("resolveReactTree returns null when the reader cannot find a fiber", () => {
    const reader: FiberReader<unknown> = {
      read() {
        return null;
      },
    };

    expect(resolveReactTree({ id: "missing" }, reader)).toBeNull();
  });

  test("inferShadcn returns labeled hints for common Card and Button patterns", () => {
    const hints = inferShadcn([
      "rounded-xl border bg-card text-card-foreground shadow-sm",
      "inline-flex items-center justify-center rounded-md bg-primary",
    ]);

    expect(hints).toEqual([
      {
        label: "Card",
        confidence: "high",
        signals: [
          "class:border",
          "class:bg-card",
          "class:rounded-xl",
          "class:text-card-foreground",
          "class:shadow-sm",
        ],
      },
      {
        label: "Button",
        confidence: "medium",
        signals: [
          "class:inline-flex",
          "class:items-center",
          "class:justify-center",
          "class:rounded-md",
          "class:bg-primary",
        ],
      },
    ]);
  });

  test("inferShadcn recognizes the Tailwind v4 Input recipe", () => {
    const hints = inferShadcn(
      "file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1",
    );

    expect(hints.map((hint) => hint.label)).toEqual(["Input"]);
  });

  test("inferShadcn prefers data-slot evidence over class guesses", () => {
    const hints = inferShadcn("rounded-xl border bg-card shadow-sm", ["card-header", "card"]);

    expect(hints).toEqual([
      { label: "CardHeader", confidence: "high", signals: ["data-slot:card-header"] },
      { label: "Card", confidence: "high", signals: ["data-slot:card"] },
    ]);
  });

  test("normalizeCapture derives reactTree and shadcnHints from raw capture input", () => {
    const target = { id: "balance-card" };
    const reader: FiberReader<typeof target> = {
      read() {
        return createNamedFiberFixture();
      },
    };

    const capture = normalizeCapture({
      selectionMode: "click",
      pageUrl: "http://localhost:3000/dashboard",
      routePath: "/dashboard",
      domTarget: target,
      fiberReader: reader,
      target: {
        selector: "[data-pin='balance-card']",
        bbox: {
          x: 12,
          y: 24,
          width: 240,
          height: 160,
        },
        tagName: "section",
        visibleText: "Total Balance",
        domSnippet: '<section data-pin="balance-card">Total Balance</section>',
        classNames: "rounded-xl border bg-card text-card-foreground shadow-sm",
        role: null,
        attributes: {
          "data-pin": "balance-card",
          "aria-expanded": false,
        },
      },
      instruction: "  Tighten spacing  ",
    });

    expect(capture.reactTree?.leafComponent.name).toBe("BalanceCard");
    expect(capture.reactTree?.confidence).toBe("high");
    expect(capture.shadcnHints).toEqual([
      {
        label: "Card",
        confidence: "high",
        signals: [
          "class:border",
          "class:bg-card",
          "class:rounded-xl",
          "class:text-card-foreground",
          "class:shadow-sm",
        ],
      },
    ]);
    expect(capture.target.classNames).toEqual([
      "rounded-xl",
      "border",
      "bg-card",
      "text-card-foreground",
      "shadow-sm",
    ]);
    expect(capture.target.attributes).toEqual({
      "data-pin": "balance-card",
      "aria-expanded": "false",
    });
    expect(capture.instruction).toBe("Tighten spacing");
  });
});
