const ALLOWED_ORIGINS_KEY = "pinprompt.allowedOrigins";

export const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3000"];

/** Hosts the manifest grants up front (`host_permissions`); every other host is optional. */
const BUILT_IN_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export async function ensureDefaultAllowedOrigins(): Promise<string[]> {
  const stored = await chrome.storage.local.get(ALLOWED_ORIGINS_KEY);

  if (stored[ALLOWED_ORIGINS_KEY] !== undefined) {
    return normalizeAllowedOrigins(stored[ALLOWED_ORIGINS_KEY]);
  }

  await chrome.storage.local.set({
    [ALLOWED_ORIGINS_KEY]: DEFAULT_ALLOWED_ORIGINS,
  });

  return [...DEFAULT_ALLOWED_ORIGINS];
}

export async function getAllowedOrigins(): Promise<string[]> {
  const stored = await chrome.storage.local.get(ALLOWED_ORIGINS_KEY);

  return normalizeAllowedOrigins(stored[ALLOWED_ORIGINS_KEY]);
}

/**
 * Saves the allowlist. Origins on hosts the extension may not access yet are dropped and
 * reported, so the list never claims an origin the content scripts cannot reach. The options page
 * asks Chrome for those hosts (a permission prompt needs a click) before calling this.
 */
export async function setAllowedOrigins(
  origins: string[],
): Promise<{ allowedOrigins: string[]; missingPermission: string[] }> {
  const normalized = normalizeAllowedOrigins(origins);
  const allowedOrigins: string[] = [];
  const missingPermission: string[] = [];

  for (const origin of normalized) {
    if (await hasHostAccess(origin)) {
      allowedOrigins.push(origin);
    } else {
      missingPermission.push(origin);
    }
  }

  await chrome.storage.local.set({
    [ALLOWED_ORIGINS_KEY]: allowedOrigins,
  });
  await releaseUnusedHostPermissions(allowedOrigins);

  return { allowedOrigins, missingPermission };
}

export async function isOriginAllowlisted(url: string): Promise<boolean> {
  const origin = readOrigin(url);

  if (!origin) {
    return false;
  }

  return (await getAllowedOrigins()).includes(origin);
}

export function normalizeAllowedOrigins(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalizedOrigins = input.flatMap((value) => {
    if (typeof value !== "string") {
      return [];
    }

    const normalizedOrigin = sanitizeOrigin(value);

    return normalizedOrigin ? [normalizedOrigin] : [];
  });

  return [...new Set(normalizedOrigins)];
}

/** Accepts `http(s)://host[:port]`; a bare `host:port` is read as http. */
export function sanitizeOrigin(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let parsed: URL;

  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (!parsed.hostname) {
    return null;
  }

  return parsed.origin;
}

export function isBuiltInOrigin(origin: string): boolean {
  try {
    return BUILT_IN_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * The match pattern Chrome permissions and content scripts use for an origin's host. Match
 * patterns cannot name a port, so this covers every port on that scheme and host; the allowlist
 * (checked on every activation) is what limits Pinprompt to the exact origin.
 */
export function hostPattern(origin: string): string {
  const url = new URL(origin);

  return `${url.protocol}//${url.hostname}/*`;
}

export function hostPatterns(origins: readonly string[]): string[] {
  return [...new Set(origins.map(hostPattern))];
}

export async function hasHostAccess(origin: string): Promise<boolean> {
  if (isBuiltInOrigin(origin)) {
    return true;
  }

  return chrome.permissions.contains({ origins: [hostPattern(origin)] });
}

export function readOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);

    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

async function releaseUnusedHostPermissions(allowedOrigins: readonly string[]): Promise<void> {
  const granted = (await chrome.permissions.getAll()).origins ?? [];
  const needed = new Set(hostPatterns(allowedOrigins.filter((origin) => !isBuiltInOrigin(origin))));
  const unused = granted.filter(
    (pattern) => !needed.has(pattern) && !isBuiltInPattern(pattern) && pattern !== "<all_urls>",
  );

  if (unused.length > 0) {
    await chrome.permissions.remove({ origins: unused });
  }
}

function isBuiltInPattern(pattern: string): boolean {
  const match = /^https?:\/\/([^/]+)\/\*$/.exec(pattern);

  return Boolean(match?.[1] && BUILT_IN_HOSTNAMES.has(match[1]));
}
