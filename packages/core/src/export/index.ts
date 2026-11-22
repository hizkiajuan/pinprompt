import { EXPORT_FORMAT } from "../constants";
import { buildPromptMarkdown, hasMultipleRoutes } from "../prompt-engine";
import {
  ExportDocument,
  type ExportDocument as ExportDocumentType,
  PinSession,
  type PinSession as PinSessionType,
} from "../schemas";

export type ExportBuildOptions = {
  generatedAt?: Date;
};

export function buildFilename(
  session: PinSessionType,
  pinCount = session.pins.length,
  generatedAt: Date = new Date(),
): string {
  const currentSession = PinSession.parse(session);
  const countLabel = pinCount === 1 ? "1-pin" : `${pinCount}-pins`;
  const timestamp = formatTimestamp(generatedAt);
  const routeSlug = hasMultipleRoutes(currentSession)
    ? "multi-route"
    : slugifyRoute(currentSession.routePath);

  return `pinprompt-${routeSlug}-${countLabel}-${timestamp}.md`;
}

export function buildExportMarkdown(
  session: PinSessionType,
  options: ExportBuildOptions = {},
): ExportDocumentType {
  const currentSession = PinSession.parse(session);
  const generatedAt = options.generatedAt ?? new Date();
  const body = buildPromptMarkdown(currentSession);
  const document = {
    format: EXPORT_FORMAT,
    pinCount: currentSession.pins.length,
    charCount: body.length,
    filename: buildFilename(currentSession, currentSession.pins.length, generatedAt),
    generatedAt: generatedAt.toISOString(),
    body,
  };

  return ExportDocument.parse(document);
}

export function getCharCount(markdown: string): number {
  return markdown.length;
}

export function slugifyRoute(routePath: string): string {
  const cleanedRoute = routePath
    .trim()
    .replace(/^\/+/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+/g, "-")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleanedRoute || "root";
}

export function formatTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}
