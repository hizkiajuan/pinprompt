import type {
  ConfidenceLevel as ConfidenceLevelType,
  ShadcnHint as ShadcnHintType,
} from "../schemas";

type ClassNameInput = readonly string[] | string | null | undefined;

type ShadcnPattern = {
  label: string;
  confidence: ConfidenceLevelType;
  required: string[];
  anyOf?: string[];
};

// Class recipes from shadcn/ui, covering both the Tailwind v3 registry (h-10, bg-background,
// ring-offset-background) and the Tailwind v4 one (h-9, bg-transparent, ring-ring/50).
const SHADCN_PATTERNS: ShadcnPattern[] = [
  {
    label: "Card",
    confidence: "high",
    required: ["border", "bg-card"],
    anyOf: ["rounded-lg", "rounded-xl", "text-card-foreground", "shadow-sm"],
  },
  {
    label: "Button",
    confidence: "medium",
    required: ["inline-flex", "items-center", "justify-center", "rounded-md"],
    anyOf: [
      "bg-primary",
      "bg-secondary",
      "bg-destructive",
      "hover:bg-accent",
      "whitespace-nowrap",
      "ring-offset-background",
      "focus-visible:ring-ring",
      "focus-visible:ring-ring/50",
    ],
  },
  {
    label: "Input",
    confidence: "high",
    required: ["w-full", "rounded-md", "border", "border-input"],
    anyOf: ["h-9", "h-10", "px-3", "bg-background", "bg-transparent"],
  },
  {
    label: "Dialog",
    confidence: "medium",
    required: ["fixed"],
    anyOf: ["left-[50%]", "top-[50%]", "translate-x-[-50%]", "translate-y-[-50%]", "sm:rounded-lg"],
  },
];

/**
 * Infers likely shadcn/ui components. `slots` are `data-slot` values from the target and its
 * nearest ancestors (current shadcn/ui puts one on every component part); they are the strongest
 * signal, so a slot match wins over a class match with the same label.
 */
export function inferShadcn(
  classNames: ClassNameInput,
  slots: readonly string[] = [],
): ShadcnHintType[] {
  const slotHints = inferShadcnFromSlots(slots);
  const slotLabels = new Set(slotHints.map((hint) => hint.label));
  const classHints = inferShadcnFromClasses(classNames).filter(
    (hint) => !slotLabels.has(hint.label),
  );

  return [...slotHints, ...classHints];
}

export function inferShadcnFromSlots(slots: readonly string[]): ShadcnHintType[] {
  const seen = new Set<string>();

  return slots.flatMap((slot) => {
    const label = slotToLabel(slot);

    if (!label || seen.has(label)) {
      return [];
    }

    seen.add(label);

    return [
      {
        label,
        confidence: "high" as const,
        signals: [`data-slot:${slot.trim()}`],
      },
    ];
  });
}

function inferShadcnFromClasses(classNames: ClassNameInput): ShadcnHintType[] {
  const tokens = normalizeClassNames(classNames);

  if (tokens.length === 0) {
    return [];
  }

  const tokenSet = new Set(tokens);

  return SHADCN_PATTERNS.flatMap((pattern) => {
    const matchesRequired = pattern.required.every((token) => tokenSet.has(token));
    const matchesAny = !pattern.anyOf || pattern.anyOf.some((token) => tokenSet.has(token));

    if (!matchesRequired || !matchesAny) {
      return [];
    }

    const matchedSignals = [
      ...pattern.required.filter((token) => tokenSet.has(token)),
      ...(pattern.anyOf ?? []).filter((token) => tokenSet.has(token)),
    ].map((token) => `class:${token}`);

    return [
      {
        label: pattern.label,
        confidence: pattern.confidence,
        signals: matchedSignals,
      },
    ];
  });
}

function slotToLabel(slot: string): string | null {
  const parts = slot
    .trim()
    .split(/[-_\s]+/)
    .filter((part) => /^[a-z0-9]+$/i.test(part));

  if (parts.length === 0) {
    return null;
  }

  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function normalizeClassNames(classNames: ClassNameInput): string[] {
  if (!classNames) {
    return [];
  }

  const rawValues = Array.isArray(classNames) ? classNames : [classNames];
  const tokens = rawValues
    .flatMap((value) => value.split(/\s+/))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return [...new Set(tokens)];
}
