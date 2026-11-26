import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { organization } from "@/db/schema";
import { createBilling, type Billing } from "@/modules/billing";
import { createPlatformAdmin } from "@/modules/identity";
import { createExtendTrialAction } from "@/server/billing-administration";
import { idleFormState } from "@/server/actions/form-state";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

let db: Database;
let billing: Billing;
let adminId: string;

beforeEach(async () => {
  db = await createTestDatabase();
  billing = createBilling({
    db,
    clock: createTestClock(new Date("2026-12-01T12:00:00Z")),
    enabled: true,
  });
  adminId = (
    await createPlatformAdmin(db, {
      name: "Admin",
      email: "admin@clickstudio.example",
      password: "admin-password-123",
    })
  ).id;
  await db.insert(organization).values({ id: "tenant", name: "Clínica Sorriso", slug: "tenant" });
});

afterEach(() => closeTestDatabase(db));

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

const actionAs = (userId: string) =>
  createExtendTrialAction({ billing, requireAdmin: async () => ({ user: { id: userId } }) });

test("the action authenticates before parsing input", async () => {
  const action = createExtendTrialAction({
    billing,
    requireAdmin: async () => {
      throw new Error("Unauthorized");
    },
  });
  await expect(action(idleFormState, new FormData())).rejects.toThrow("Unauthorized");
});

test("the chosen day is the Trial's last: it ends at the following midnight in Brasília", async () => {
  expect(
    await actionAs(adminId)(idleFormState, form({ tenantId: "tenant", trialEndsOn: "2027-01-20" })),
  ).toEqual({ status: "success", message: "O teste de Clínica Sorriso vai até 20/01/2027." });
  expect(await billing.trials(adminId)).toMatchObject({
    tenants: [{ trialEndsAt: new Date("2027-01-21T03:00:00Z") }],
  });
});

test("the action answers each refusal in pt-BR", async () => {
  const cases: [string, Record<string, string>, string][] = [
    [adminId, { tenantId: "tenant", trialEndsOn: "20/01/2027" }, "Informe uma data válida."],
    [adminId, { tenantId: "", trialEndsOn: "2027-01-20" }, "Informe uma data válida."],
    [
      adminId,
      { tenantId: "tenant", trialEndsOn: "2026-11-30" },
      "Escolha uma data a partir de hoje.",
    ],
    [adminId, { tenantId: "missing", trialEndsOn: "2027-01-20" }, "Negócio não encontrado."],
    [
      "someone",
      { tenantId: "tenant", trialEndsOn: "2027-01-20" },
      "Você não tem permissão para estender períodos de teste.",
    ],
  ];
  for (const [userId, fields, message] of cases)
    expect(await actionAs(userId)(idleFormState, form(fields))).toEqual({
      status: "error",
      message,
    });
});
