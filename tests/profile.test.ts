import { describe, it, expect } from "vitest";
import { get } from "@/server/db/client";
import { registerUser, updateProfile } from "@/server/services/players";
import { profilePatchSchema } from "@/server/lib/validation";

function freshUser(name: string) {
  const n = `${name}_${Math.random().toString(36).slice(2, 8)}`;
  const { userId } = registerUser({
    username: n, displayName: n, email: `${n}@t.local`, password: "passw0rd1",
  });
  return { userId: userId, username: n };
}

describe("profile updates", () => {
  it("updates display_name on the users table (was the audit bug)", () => {
    const u = freshUser("displayname");
    updateProfile(u.userId, { displayName: "New Name" });
    const user = get<{ display_name: string }>(`SELECT display_name FROM users WHERE id = ?`, u.userId);
    expect(user!.display_name).toBe("New Name");
  });

  it("updates avatar and bio on the profiles table", () => {
    const u = freshUser("avatarbio");
    updateProfile(u.userId, { avatar: "🦊", bio: "hello world" });
    const p = get<{ avatar: string; bio: string }>(
      `SELECT avatar, bio FROM profiles WHERE user_id = ?`, u.userId
    );
    expect(p).toMatchObject({ avatar: "🦊", bio: "hello world" });
  });

  it("the API schema strips attempts to set balance / xp / role", () => {
    const parsed = profilePatchSchema.parse({
      displayName: " legit ",
      balance: 999999,
      xp: 999999,
      role: "ADMIN",
      status: "SUSPENDED",
      lifetime_earned: 999999,
    });
    // only the whitelisted field survives (trimmed by the schema)
    expect(parsed).toEqual({ displayName: "legit" });
    expect("balance" in parsed).toBe(false);
    expect("role" in parsed).toBe(false);
  });

  it("updateProfile never touches balance/xp/role columns", () => {
    const u = freshUser("immutable");
    const before = get(
      `SELECT p.balance, p.xp, u.role, u.status FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`,
      u.userId
    );
    updateProfile(u.userId, { displayName: "X", avatar: "😈", bio: "b" });
    const after = get(
      `SELECT p.balance, p.xp, u.role, u.status FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`,
      u.userId
    );
    expect(after).toEqual(before);
  });

  it("updating your own profile does not leak into another account", () => {
    const a = freshUser("isol_a");
    const b = freshUser("isol_b");
    updateProfile(a.userId, { displayName: "A Only" });
    const other = get<{ display_name: string }>(`SELECT display_name FROM users WHERE id = ?`, b.userId);
    expect(other!.display_name).toBe(b.username);
  });
});
