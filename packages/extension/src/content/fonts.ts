import { fontStack } from "@pinprompt/kit/fonts";

// The in-page UI uses the Allo type system (packages/kit). Fonts can't be declared inside a shadow root,
// so the two faces it needs are added to the page's FontFaceSet under private family names,
// which the page's own CSS will never ask for. The files are web-accessible only through
// Chrome's per-session dynamic URLs (manifest `use_dynamic_url`).
const FACES = [
  { family: "Pinprompt Allo", file: "fonts/allo/allo.woff2", weight: "100 900" },
  { family: "Pinprompt Mono", file: "fonts/geist-mono/geist-mono.woff2", weight: "100 900" },
] as const;

let registered = false;

export function registerFonts(): { sans: string; mono: string } {
  if (!registered) {
    registered = true;

    for (const face of FACES) {
      try {
        const font = new FontFace(face.family, `url("${chrome.runtime.getURL(face.file)}")`, {
          weight: face.weight,
          display: "swap",
        });

        document.fonts.add(font);
        void font.load().catch(() => undefined);
      } catch {
        // A page with a strict font-src CSP: the fallback stack takes over.
      }
    }
  }

  return {
    sans: `"Pinprompt Allo", ${fontStack("allo", "sans")}`,
    mono: `"Pinprompt Mono", ${fontStack("allo", "mono")}`,
  };
}
