import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// Runs BEFORE any test module (and its imports) execute. Every test process
// gets an isolated throwaway SQLite database so tests never touch dev data.
process.env.ARENA_DB_PATH = path.join(
  os.tmpdir(),
  `arena-test-${process.pid}-${crypto.randomBytes(4).toString("hex")}.db`
);
// deterministic admin credential for the seeded database
process.env.ADMIN_PASSWORD = "TestAdminPW-7f3k2x";
// reset-link dev feature must be OFF by default in tests
delete process.env.ARENA_DEV_RESET_LINKS;
