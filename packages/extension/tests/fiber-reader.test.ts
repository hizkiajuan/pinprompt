import { describe, expect, test } from "bun:test";

import { buildReactPinContext } from "@pinprompt/core";

import {
  buildSnapshot,
  findNearestFiber,
  readFiberSnapshot,
  type FiberLike,
} from "../src/main-world/fiber-reader";

function link(parent: FiberLike, children: FiberLike[]): void {
  parent.child = children[0] ?? null;
  children.forEach((child, index) => {
    child.return = parent;
    child.sibling = children[index + 1] ?? null;
  });
}

function BillingCard() {}
function SettingsPage() {}
function Badge() {}

// <SettingsPage><BillingCard><section><button/></section><Badge/></BillingCard></SettingsPage>
function buildTree() {
  const page: FiberLike = { tag: 0, type: SettingsPage, elementType: SettingsPage };
  const card: FiberLike = { tag: 0, type: BillingCard, elementType: BillingCard };
  const section: FiberLike = { tag: 5, type: "section" };
  const button: FiberLike = { tag: 5, type: "button" };
  const badge: FiberLike = { tag: 0, type: Badge, elementType: Badge };

  link(page, [card]);
  link(card, [section, badge]);
  link(section, [button]);

  return { page, card, section, button, badge };
}

describe("page-world fiber reader", () => {
  test("finds the fiber on the nearest element that has one", () => {
    const { section } = buildTree();
    const parent = { __reactFiber$abc123: section, parentElement: null };
    const child = { parentElement: parent };

    expect(findNearestFiber(child)).toBe(section);
    expect(findNearestFiber({ parentElement: null })).toBeNull();
  });

  test("snapshot resolves the component path and children like the core expects", () => {
    const { section } = buildTree();
    const context = buildReactPinContext(buildSnapshot(section));

    expect(context?.leafComponent.name).toBe("BillingCard");
    expect(context?.ancestorChain.map((item) => item.name)).toEqual(["SettingsPage"]);
    expect(context?.childComponents.map((item) => item.name)).toEqual(["Badge"]);
  });

  test("snapshot is JSON-safe (it crosses the world boundary as a string)", () => {
    const { button } = buildTree();
    const element = { __reactFiber$x: button, parentElement: null };

    expect(() => JSON.stringify(readFiberSnapshot(element))).not.toThrow();
  });

  test("snapshot stays bounded on a huge sibling list", () => {
    const list: FiberLike = { tag: 0, type: BillingCard, elementType: BillingCard };
    const rows = Array.from({ length: 5000 }, (): FiberLike => ({ tag: 0, type: Badge }));
    link(list, rows);
    const target: FiberLike = { tag: 5, type: "li", return: list };

    const json = JSON.stringify(buildSnapshot(target));

    expect(json.length).toBeLessThan(10_000);
  });

  test("reads names through memo and forwardRef wrappers", () => {
    const inner: FiberLike = {
      tag: 11,
      type: { render: function InnerButton() {} },
      elementType: { type: { render: function InnerButton() {} } },
    };
    const host: FiberLike = { tag: 5, type: "button", return: inner };

    expect(buildReactPinContext(buildSnapshot(host))?.leafComponent.name).toBe("InnerButton");
  });
});
