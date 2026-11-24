import { describe, expect, test } from "bun:test";
import { passwordConfirmationError } from "@/modules/tenancy";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe("passwordConfirmationError", () => {
  test("accepts matching passwords", () => {
    expect(
      passwordConfirmationError(
        form({ password: "senha-123456", passwordConfirmation: "senha-123456" }),
      ),
    ).toBeNull();
  });

  test("refuses passwords that differ", () => {
    expect(
      passwordConfirmationError(
        form({ password: "senha-123456", passwordConfirmation: "senha-654321" }),
      ),
    ).toBe("As senhas não conferem.");
  });

  test("skips the check when the form has no confirmation, as for an existing account", () => {
    expect(passwordConfirmationError(form({ password: "senha-123456" }))).toBeNull();
  });
});
