import { describe, expect, onTestFinished, test } from "bun:test";
import { createUserRepository } from "@/modules/identity";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

describe("user repository", () => {
  test("finds a created user by email", async () => {
    const db = await createTestDatabase();
    onTestFinished(() => closeTestDatabase(db));
    const users = createUserRepository(db);

    const created = await users.create({
      name: "Ana Souza",
      email: "ana@example.com",
    });

    expect(await users.findByEmail("ana@example.com")).toEqual(created);
  });
});
