import { z } from "zod";

import { EXPORT_FORMAT } from "../constants";

export const SelectionMode = z.enum(["click", "drag"]);

export const ConfidenceLevel = z.enum(["high", "medium", "low"]);

export const BoundingBox = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const ComponentEvidence = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1).nullable().optional(),
  sourceHint: z.string().min(1).nullable().optional(),
});

export const ReactPinContext = z.object({
  leafComponent: ComponentEvidence,
  ancestorChain: z.array(ComponentEvidence),
  childComponents: z.array(ComponentEvidence),
  confidence: ConfidenceLevel,
  signals: z.array(z.string().min(1)).default([]),
});

export const ShadcnHint = z.object({
  label: z.string().min(1),
  confidence: ConfidenceLevel,
  signals: z.array(z.string().min(1)).default([]),
});

export const ScreenshotCrop = z.object({
  ref: z.string().min(1),
  mimeType: z.string().min(1).default("image/png"),
});

export const PinTarget = z.object({
  selector: z.string().min(1),
  bbox: BoundingBox,
  /** The target in page coordinates (bbox plus scroll), to place its marker again later. */
  pageBox: BoundingBox.optional(),
  tagName: z.string().min(1),
  visibleText: z.string().default(""),
  domSnippet: z.string().default(""),
  classNames: z.array(z.string().min(1)).default([]),
  role: z.string().min(1).nullable().optional(),
  attributes: z.record(z.string(), z.string()).default({}),
});

export const CapturePayload = z.object({
  selectionMode: SelectionMode,
  pageUrl: z.string().url(),
  routePath: z.string().min(1),
  target: PinTarget,
  reactTree: ReactPinContext.nullable().optional(),
  shadcnHints: z.array(ShadcnHint).default([]),
  screenshotCrop: ScreenshotCrop.nullable().optional(),
  instruction: z.string().default(""),
});

export const Pin = z.object({
  id: z.string().uuid(),
  index: z.number().int().positive(),
  createdAt: z.string().datetime(),
  selectionMode: SelectionMode,
  pageUrl: z.string().url(),
  routePath: z.string().min(1),
  target: PinTarget,
  reactTree: ReactPinContext.nullable().optional(),
  shadcnHints: z.array(ShadcnHint).default([]),
  screenshotCrop: ScreenshotCrop.nullable().optional(),
  instruction: z.string(),
});

export const PinSession = z.object({
  id: z.string().uuid(),
  pageUrl: z.string().url(),
  routePath: z.string().min(1),
  createdAt: z.string().datetime(),
  pins: z.array(Pin).max(10),
});

export const ExportDocument = z.object({
  format: z.literal(EXPORT_FORMAT),
  pinCount: z.number().int().nonnegative(),
  charCount: z.number().int().nonnegative(),
  filename: z.string().min(1),
  generatedAt: z.string().datetime(),
  body: z.string(),
});

export type BoundingBox = z.infer<typeof BoundingBox>;
export type CapturePayload = z.infer<typeof CapturePayload>;
export type ComponentEvidence = z.infer<typeof ComponentEvidence>;
export type ConfidenceLevel = z.infer<typeof ConfidenceLevel>;
export type ExportDocument = z.infer<typeof ExportDocument>;
export type Pin = z.infer<typeof Pin>;
export type PinSession = z.infer<typeof PinSession>;
export type PinTarget = z.infer<typeof PinTarget>;
export type ReactPinContext = z.infer<typeof ReactPinContext>;
export type ScreenshotCrop = z.infer<typeof ScreenshotCrop>;
export type SelectionMode = z.infer<typeof SelectionMode>;
export type ShadcnHint = z.infer<typeof ShadcnHint>;
