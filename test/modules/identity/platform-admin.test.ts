import { describe, expect, onTestFinished, test } from "bun:test";
import {
  createPlatformAdmin,
  createUserRepository,
  isPlatformAdmin,
} from "@/modules/identity";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

describe("platform administrator check", () => {
  test("only a user with the admin role passes, whatever the caller claims", async () => {
    const db = await createTestDatabase();
    onTestFinished(() => closeTestDatabase(db));
    const admin = await createPlatformAdmin(db, {
      name: "Daniel Admin",
      email: "admin@clickstudio.example",
      password: "admin-password-123",
    });
    const member = await createUserRepository(db).create({
      name: "Ana Souza",
      email: "ana@example.com",
    });

    expect(await isPlatformAdmin(db, admin.id)).toBe(true);
    expect(await isPlatformAdmin(db, member.id)).toBe(false);
    expect(await isPlatformAdmin(db, "unknown-user-id")).toBe(false);
  });
});
