import { describe, expect, test } from "bun:test";
import { createUserRepository } from "@/modules/identity";
import { createTestDatabase } from "@/test/support/database";

describe("user repository", () => {
  test("finds a created user by email", async () => {
    const users = createUserRepository(await createTestDatabase());

    const created = await users.create({
      name: "Ana Souza",
      email: "ana@example.com",
    });

    expect(await users.findByEmail("ana@example.com")).toEqual(created);
  });
});
