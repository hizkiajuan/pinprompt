import { describe, expect, test } from "bun:test";

import { tabIdFromKey } from "../src/background/state";
import {
  hostPattern,
  hostPatterns,
  isBuiltInOrigin,
  normalizeAllowedOrigins,
  readOrigin,
  sanitizeOrigin,
} from "../src/settings/origins";

describe("allowed origins", () => {
  test("sanitizeOrigin keeps scheme, host and port only", () => {
    expect(sanitizeOrigin(" http://localhost:5173/dashboard?x=1 ")).toBe("http://localhost:5173");
    expect(sanitizeOrigin("https://my-pc.tail1234.ts.net:8443/")).toBe(
      "https://my-pc.tail1234.ts.net:8443",
    );
    expect(sanitizeOrigin("localhost:3000")).toBe("http://localhost:3000");
  });

  test("sanitizeOrigin rejects non-web schemes and junk", () => {
    expect(sanitizeOrigin("file:///tmp/index.html")).toBeNull();
    expect(sanitizeOrigin("chrome://extensions")).toBeNull();
    expect(sanitizeOrigin("")).toBeNull();
    expect(sanitizeOrigin("http://")).toBeNull();
  });

  test("only localhost and 127.0.0.1 are built in", () => {
    expect(isBuiltInOrigin("http://localhost:3000")).toBe(true);
    expect(isBuiltInOrigin("https://127.0.0.1:8443")).toBe(true);
    expect(isBuiltInOrigin("http://192.168.1.20:3000")).toBe(false);
    expect(isBuiltInOrigin("https://my-pc.tail1234.ts.net")).toBe(false);
  });

  test("host patterns drop the port, since match patterns cannot name one", () => {
    expect(hostPattern("http://localhost:5173")).toBe("http://localhost/*");
    expect(
      hostPatterns(["http://localhost:3000", "http://localhost:5173", "https://dev.example.test"]),
    ).toEqual(["http://localhost/*", "https://dev.example.test/*"]);
  });

  test("normalizeAllowedOrigins dedupes and drops invalid entries", () => {
    expect(
      normalizeAllowedOrigins(["http://localhost:3000/", "http://localhost:3000", 42, "nope://x"]),
    ).toEqual(["http://localhost:3000"]);
    expect(normalizeAllowedOrigins("http://localhost:3000")).toEqual([]);
  });

  test("readOrigin ignores non-web pages", () => {
    expect(readOrigin("http://localhost:3000/a/b")).toBe("http://localhost:3000");
    expect(readOrigin("chrome://newtab/")).toBeNull();
  });
});

describe("per-tab storage keys", () => {
  test("tabIdFromKey reads the tab from Pinprompt keys only", () => {
    expect(tabIdFromKey("pinprompt.tab.42.session")).toBe(42);
    expect(tabIdFromKey("pinprompt.tab.7.shot.pinprompt-crop:abc")).toBe(7);
    expect(tabIdFromKey("pinprompt.allowedOrigins")).toBeNull();
  });
});
