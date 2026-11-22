import { CapturePayload } from "../schemas";
import type {
  CapturePayload as CapturePayloadType,
  PinTarget as PinTargetType,
  ReactPinContext as ReactPinContextType,
  ScreenshotCrop as ScreenshotCropType,
  SelectionMode as SelectionModeType,
  ShadcnHint as ShadcnHintType,
} from "../schemas";
import { resolveReactTree, type FiberReader } from "../react-tree";
import { inferShadcn } from "../shadcn-infer";

type RawClassNameInput = readonly string[] | string | null | undefined;

type RawAttributes = Record<string, string | number | boolean | null | undefined>;

export type RawPinTarget = Omit<PinTargetType, "classNames" | "attributes"> & {
  classNames?: RawClassNameInput;
  attributes?: RawAttributes;
};

export type NormalizeCaptureInput<TTarget = unknown> = {
  selectionMode: SelectionModeType;
  pageUrl: string;
  routePath: string;
  target: RawPinTarget;
  instruction?: string | null;
  screenshotCrop?: ScreenshotCropType | null;
  domTarget?: TTarget | null;
  fiberReader?: FiberReader<TTarget>;
  reactTree?: ReactPinContextType | null;
  shadcnHints?: ShadcnHintType[] | null;
};

export function normalizeCapture<TTarget>(raw: NormalizeCaptureInput<TTarget>): CapturePayloadType {
  const classNames = normalizeClassNames(raw.target.classNames);
  const shadcnHints = raw.shadcnHints ?? inferShadcn(classNames);
  const reactTree = resolveReactTreeFromInput(raw);

  return CapturePayload.parse({
    selectionMode: raw.selectionMode,
    pageUrl: raw.pageUrl,
    routePath: raw.routePath,
    target: {
      selector: raw.target.selector,
      bbox: raw.target.bbox,
      ...(raw.target.pageBox ? { pageBox: raw.target.pageBox } : {}),
      tagName: raw.target.tagName,
      visibleText: raw.target.visibleText,
      domSnippet: raw.target.domSnippet,
      classNames,
      role: raw.target.role ?? null,
      attributes: normalizeAttributes(raw.target.attributes),
    },
    reactTree,
    shadcnHints,
    screenshotCrop: raw.screenshotCrop ?? null,
    instruction: raw.instruction?.trim() ?? "",
  });
}

function resolveReactTreeFromInput<TTarget>(
  raw: NormalizeCaptureInput<TTarget>,
): ReactPinContextType | null | undefined {
  if (raw.reactTree !== undefined) {
    return raw.reactTree;
  }

  if (raw.domTarget === undefined || raw.domTarget === null || !raw.fiberReader) {
    return undefined;
  }

  return resolveReactTree(raw.domTarget, raw.fiberReader);
}

function normalizeAttributes(attributes: RawAttributes | undefined): Record<string, string> {
  if (!attributes) {
    return {};
  }

  const normalizedEntries = Object.entries(attributes).flatMap(([key, value]) => {
    if (value === null || value === undefined) {
      return [];
    }

    return [[key, String(value)]];
  });

  return Object.fromEntries(normalizedEntries);
}

function normalizeClassNames(classNames: RawClassNameInput): string[] {
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
