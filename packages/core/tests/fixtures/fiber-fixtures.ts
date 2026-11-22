import type { FiberSnapshot } from "@pinprompt/core";

export function createNamedFiberFixture(): FiberSnapshot {
  const page: FiberSnapshot = {
    kind: "component",
    name: "DashboardPage",
    displayName: "Page",
    sourceHint: "page.tsx",
  };
  const card: FiberSnapshot = {
    kind: "component",
    name: "Card",
    displayName: "Card",
    sourceHint: "card.tsx",
    return: page,
  };
  const balanceCard: FiberSnapshot = {
    kind: "component",
    name: "BalanceCard",
    displayName: "BalanceCard",
    sourceHint: "balance-card.tsx",
    return: card,
  };
  const hostSection: FiberSnapshot = {
    kind: "host",
    name: "section",
    return: balanceCard,
  };
  const balanceStat: FiberSnapshot = {
    kind: "component",
    name: "BalanceStat",
    displayName: "BalanceStat",
    sourceHint: "balance-stat.tsx",
    return: hostSection,
  };
  const pinnedButton: FiberSnapshot = {
    kind: "host",
    name: "button",
    return: hostSection,
  };

  hostSection.child = balanceStat;
  balanceStat.sibling = pinnedButton;
  balanceCard.child = hostSection;

  return pinnedButton;
}

export function createMinifiedFiberFixture(): FiberSnapshot {
  const page: FiberSnapshot = {
    kind: "component",
    name: "n",
    return: null,
  };
  const card: FiberSnapshot = {
    kind: "component",
    name: "e",
    return: page,
  };
  const balanceCard: FiberSnapshot = {
    kind: "component",
    name: "t",
    return: card,
  };
  const pinnedNode: FiberSnapshot = {
    kind: "host",
    name: "div",
    return: balanceCard,
  };

  return pinnedNode;
}
