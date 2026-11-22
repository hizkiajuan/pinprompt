/**
 * The Allo type system as data: the font files, the metric-matched fallback and one CSS variable per
 * variant with its full fallback stack. `fontsCss("allo")` renders `allo.css`, the stylesheet the
 * options page and the site import, whose files load from `/fonts/` at the site root;
 * `copyFontFiles` (`./install`) puts them there at build time.
 *
 * Copied from `@hzkjn/kit/fonts` (kit 0.30.0) and trimmed to Allo, so the repo builds without the
 * private kit package. All files under `files/` are SIL OFL; each folder carries its licence.
 */

export const FONT_VARIANTS = [
  "sans",
  "serif",
  "display",
  "rounded",
  "mono",
  "geometric",
  "condensed",
  "hand",
  "script",
  "slab",
] as const;

export type FontVariant = (typeof FONT_VARIANTS)[number];

export const FONT_SYSTEMS = ["allo"] as const;

export type FontSystemName = (typeof FONT_SYSTEMS)[number];

/** One `@font-face`: a WOFF2 under `files/`, Latin only. */
export interface FontFile {
  readonly family: string;
  readonly file: string;
  readonly weight: string;
  readonly style?: "italic";
  readonly stretch?: string;
}

/**
 * A local font resized to a webfont's metrics (size-adjust and overrides), so text keeps its place
 * while the webfont loads. Measured against the Liberation fonts, which share Arial's and Times New
 * Roman's metrics.
 */
export interface FallbackFace {
  readonly family: string;
  readonly local: readonly string[];
  readonly sizeAdjust: string;
  readonly ascentOverride: string;
  readonly descentOverride: string;
  readonly lineGapOverride: string;
}

export interface FontSystem {
  readonly name: FontSystemName;
  readonly title: string;
  readonly files: readonly FontFile[];
  readonly fallbacks: readonly FallbackFace[];
  readonly stacks: Readonly<Record<FontVariant, readonly string[]>>;
  /** Licence files that travel with the font files. */
  readonly licences: readonly string[];
}

const SANS_TAIL = ["system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"];
const MONO_TAIL = [
  "ui-monospace",
  '"SF Mono"',
  "Menlo",
  '"Cascadia Mono"',
  "Consolas",
  "monospace",
];

const allo: FontSystem = {
  name: "allo",
  title: "Allo",
  files: [
    { family: "Allo", file: "allo/allo.woff2", weight: "100 900" },
    { family: "Newsreader", file: "newsreader/newsreader.woff2", weight: "200 800" },
    {
      family: "Newsreader",
      file: "newsreader/newsreader-italic.woff2",
      weight: "200 800",
      style: "italic",
    },
    { family: "Fraunces", file: "fraunces/fraunces.woff2", weight: "100 900" },
    { family: "Geist Mono", file: "geist-mono/geist-mono.woff2", weight: "100 900" },
    { family: "Figtree", file: "figtree/figtree.woff2", weight: "300 900" },
    {
      family: "Instrument Sans",
      file: "instrument-sans/instrument-sans.woff2",
      weight: "400 700",
      stretch: "75% 100%",
    },
    { family: "Caveat", file: "caveat/caveat.woff2", weight: "400 700" },
    { family: "Sacramento", file: "sacramento/sacramento.woff2", weight: "400" },
    { family: "Zilla Slab", file: "zilla-slab/zilla-slab-400.woff2", weight: "400" },
    { family: "Zilla Slab", file: "zilla-slab/zilla-slab-600.woff2", weight: "600" },
  ],
  fallbacks: [
    {
      family: "Allo Fallback",
      local: ["Arial", "ArialMT", "Liberation Sans"],
      sizeAdjust: "105.62%",
      ascentOverride: "91.72%",
      descentOverride: "22.84%",
      lineGapOverride: "0%",
    },
  ],
  stacks: {
    sans: ['"Allo"', '"Allo Fallback"', ...SANS_TAIL],
    rounded: [
      '"Allo"',
      "ui-rounded",
      '"SF Pro Rounded"',
      '"Allo Fallback"',
      "system-ui",
      "sans-serif",
    ],
    serif: ['"Newsreader"', '"Iowan Old Style"', "Charter", "Georgia", "serif"],
    display: ['"Fraunces"', '"Newsreader"', '"Iowan Old Style"', "Georgia", "serif"],
    mono: ['"Geist Mono"', ...MONO_TAIL],
    geometric: [
      '"Figtree"',
      '"Avenir Next"',
      "Avenir",
      '"Century Gothic"',
      '"Allo Fallback"',
      "sans-serif",
    ],
    condensed: ['"Instrument Sans"', '"Arial Narrow"', '"Roboto Condensed"', "sans-serif"],
    hand: ['"Caveat"', '"Bradley Hand"', '"Segoe Print"', "cursive"],
    script: ['"Sacramento"', '"Snell Roundhand"', '"Segoe Script"', "cursive"],
    slab: ['"Zilla Slab"', "Rockwell", '"Roboto Slab"', "Georgia", "serif"],
  },
  licences: [
    "allo/OFL.txt",
    "newsreader/OFL.txt",
    "fraunces/OFL.txt",
    "geist-mono/OFL.txt",
    "figtree/OFL.txt",
    "instrument-sans/OFL.txt",
    "caveat/OFL.txt",
    "sacramento/OFL.txt",
    "zilla-slab/OFL.txt",
  ],
};

export const fontSystems: Readonly<Record<FontSystemName, FontSystem>> = { allo };

/** The CSS variable for a variant: `--font-sans`, `--font-hand`, ... */
export const fontToken = (variant: FontVariant) => `--font-${variant}`;

/** The `font-family` value for a variant of a system. */
export const fontStack = (system: FontSystemName, variant: FontVariant) =>
  fontSystems[system].stacks[variant].join(", ");

/** Where the stylesheets load font files from: the app serves them at its root. */
export const FONTS_BASE = "/fonts/";

/** Pass as `external` to `Bun.build`, so the bundler leaves the font URLs alone instead of inlining them. */
export const FONTS_EXTERNAL = [`${FONTS_BASE}*`];

const fontFace = (file: FontFile, base: string) =>
  [
    "@font-face {",
    `  font-family: "${file.family}";`,
    `  src: url("${base}${file.file}") format("woff2");`,
    `  font-weight: ${file.weight};`,
    ...(file.style ? [`  font-style: ${file.style};`] : []),
    ...(file.stretch ? [`  font-stretch: ${file.stretch};`] : []),
    "  font-display: swap;",
    "}",
  ].join("\n");

const fallbackFace = (face: FallbackFace) =>
  [
    "@font-face {",
    `  font-family: "${face.family}";`,
    `  src: ${face.local.map((name) => `local("${name}")`).join(", ")};`,
    `  size-adjust: ${face.sizeAdjust};`,
    `  ascent-override: ${face.ascentOverride};`,
    `  descent-override: ${face.descentOverride};`,
    `  line-gap-override: ${face.lineGapOverride};`,
    "}",
  ].join("\n");

/**
 * The stylesheet for a system: every `@font-face` (browsers download a file only when text uses
 * it), the fallback faces and `:root` with one variable per variant.
 */
export function fontsCss(name: FontSystemName, base = FONTS_BASE): string {
  const system = fontSystems[name];
  const root = [
    ":root {",
    ...FONT_VARIANTS.map((variant) => `  ${fontToken(variant)}: ${fontStack(name, variant)};`),
    "}",
  ].join("\n");
  return `${[...system.files.map((file) => fontFace(file, base)), ...system.fallbacks.map(fallbackFace), root].join("\n\n")}\n`;
}
