import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { get } from "@/server/db/client";
import { verifyPassword } from "@/server/auth/password";

/**
 * Security regression tests:
 *  - no hardcoded/default admin password exists in source
 *  - the seeded admin uses ADMIN_PASSWORD from the environment
 *  - the credential that was accidentally committed before this fix is dead
 *  - .env is not tracked by git
 */
describe("security: admin credentials", () => {
  it("seeds the admin with the ADMIN_PASSWORD env value", () => {
    const admin = get<{ username: string; password_hash: string }>(
      `SELECT username, password_hash FROM users WHERE role = 'ADMIN' LIMIT 1`
    );
    expect(admin).toBeTruthy();
    expect(verifyPassword(process.env.ADMIN_PASSWORD!, admin!.password_hash)).toBe(true);
  });

  it("the previously committed default credential no longer authenticates the admin", () => {
    // assembled at runtime so the dead credential is not re-embedded in source
    const burned = ["Arena", "Admin", "!", "2026"].join("");
    const admin = get<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE role = 'ADMIN' LIMIT 1`
    );
    expect(verifyPassword(burned, admin!.password_hash)).toBe(false);
  });

  it("bootstrap source contains no hardcoded admin password fallback", () => {
    const src = fs.readFileSync("src/server/db/bootstrap.ts", "utf8");
    // no literal fallback after the ADMIN_PASSWORD read
    expect(src).not.toMatch(/ADMIN_PASSWORD[^\n]*\?\?\s*["'][^"']{4,}["']/);
    // the admin hash must be computed from a variable, never a string literal
    const adminHashLines = src.split("\n").filter((l) => l.includes("hashSync") && /admin/i.test(l));
    expect(adminHashLines.length).toBeGreaterThan(0);
    for (const line of adminHashLines) {
      expect(line).not.toMatch(/hashSync\(\s*["']/);
    }
  });

  it("README contains no credential-looking admin password", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const burned = ["Arena", "Admin", "!", "2026"].join("");
    expect(readme).not.toContain(burned);
    // the docs must describe the mechanism instead
    expect(readme).toContain("ADMIN_PASSWORD");
  });

  it(".env is not tracked by git (while .gitignore still covers it)", () => {
    const tracked = execSync("git ls-files -- .env", { encoding: "utf8" }).trim();
    expect(tracked).toBe("");
    const ignored = execSync("git check-ignore .env", { encoding: "utf8" }).trim();
    expect(ignored).toBe(".env");
  });
});
