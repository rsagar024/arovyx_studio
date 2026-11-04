/**
 * Vercel's runtime rejects `require()` of an ES module, though plain Node 24
 * allows it. firebase-admin stays an external package (next.config.mjs), so
 * its whole dependency tree is loaded with `require()`: one ESM-only package
 * in it fails every Quiz Master route with ERR_REQUIRE_ESM, before the route's
 * own error handling runs. This loads the SDK the way production does.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ENTRY_POINTS = ["app", "auth", "firestore", "messaging", "remote-config"];

describe("firebase-admin", () => {
  it.each(ENTRY_POINTS)("firebase-admin/%s loads without require(esm)", (entry) => {
    const result = spawnSync(
      process.execPath,
      ["--no-experimental-require-module", "-e", `require("firebase-admin/${entry}")`],
      { encoding: "utf8" }
    );
    expect(result.stderr).not.toContain("ERR_REQUIRE_ESM");
    expect(result.status).toBe(0);
  });
});
