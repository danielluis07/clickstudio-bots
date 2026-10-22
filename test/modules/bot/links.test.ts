import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import { createLinkSettingsEditor, readLinks, type LinkSettings } from "@/modules/bot";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

let db: Database;
let ownerA: TenantScope;
let attendantA: TenantScope;
let ownerB: TenantScope;
const clock = createTestClock(new Date("2026-10-22T15:00:00Z"));
let editor: ReturnType<typeof createLinkSettingsEditor>;
const booking: LinkSettings = {
  enabled: true,
  links: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      label: "Agendamento",
      url: "https://booking.example/agendar?origem=bot",
    },
  ],
};

beforeEach(async () => {
  db = await createTestDatabase();
  editor = createLinkSettingsEditor({ db, clock });
  for (const [tenantId, members] of [
    [
      "tenant-a",
      [
        ["owner-a", "owner"],
        ["attendant-a", "member"],
      ],
    ],
    ["tenant-b", [["owner-b", "owner"]]],
  ] as const) {
    await db.insert(organization).values({ id: tenantId, name: tenantId, slug: tenantId });
    for (const [id, role] of members) {
      await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
      await db.insert(member).values({ organizationId: tenantId, userId: id, role });
    }
  }
  ownerA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  attendantA = (await resolveTenantScope(db, { userId: "attendant-a" }))!;
  ownerB = (await resolveTenantScope(db, { userId: "owner-b" }))!;
});
afterEach(() => closeTestDatabase(db));

test("a malformed URL is refused without throwing or replacing the saved list", async () => {
  await editor.saveLinks(ownerA, booking);
  expect(
    await editor.saveLinks(ownerA, {
      ...booking,
      links: [{ ...booking.links[0], url: "not a URL" }],
    }),
  ).toEqual({ ok: false, error: "invalid" });
  expect(await readLinks(db, ownerA)).toEqual(booking);
});

test("links start disabled; only the owner changes their Tenant's labelled list", async () => {
  expect(await readLinks(db, ownerA)).toEqual({ enabled: false, links: [] });
  expect(await editor.saveLinks(attendantA, booking)).toEqual({ ok: false, error: "forbidden" });
  expect(await editor.saveLinks(ownerA, booking)).toEqual({ ok: true });
  expect(await editor.getLinks(attendantA)).toEqual({
    settings: booking,
    updatedAt: clock.now(),
    updatedBy: "owner-a",
  });
  expect(await readLinks(db, ownerB)).toEqual({ enabled: false, links: [] });
  const other = {
    ...booking,
    links: [{ ...booking.links[0], label: "Catálogo", url: "https://other.example/catalogo" }],
  };
  await editor.saveLinks(ownerB, other);
  expect(await readLinks(db, ownerA)).toEqual(booking);
  expect(await readLinks(db, ownerB)).toEqual(other);
});

test("the owner edits, removes and disables links while retaining the list and stable IDs", async () => {
  await editor.saveLinks(ownerA, {
    ...booking,
    links: [
      ...booking.links,
      { id: crypto.randomUUID(), label: "Instagram", url: "https://instagram.example/loja" },
    ],
  });
  const edited = {
    ...booking,
    links: [
      {
        ...booking.links[0],
        label: "  Reservas  ",
        url: "  https://booking.example/novo?origem=bot  ",
      },
    ],
  };
  expect(await editor.saveLinks(ownerA, edited)).toEqual({ ok: true });
  const saved = {
    ...booking,
    links: [
      { ...booking.links[0], label: "Reservas", url: "https://booking.example/novo?origem=bot" },
    ],
  };
  expect(await readLinks(db, ownerA)).toEqual(saved);
  await editor.saveLinks(ownerA, { ...saved, enabled: false });
  expect(await readLinks(db, ownerA)).toEqual({ ...saved, enabled: false });
  await editor.saveLinks(ownerA, { enabled: false, links: [] });
  expect(await readLinks(db, ownerA)).toEqual({ enabled: false, links: [] });
});

test.each([
  ["a script URL", { ...booking, links: [{ ...booking.links[0], url: "javascript:alert(1)" }] }],
  ["a data URL", { ...booking, links: [{ ...booking.links[0], url: "data:text/html,hello" }] }],
  [
    "credentials",
    { ...booking, links: [{ ...booking.links[0], url: "https://name:secret@example.com" }] },
  ],
  [
    "a URL with whitespace",
    { ...booking, links: [{ ...booking.links[0], url: "https://example.com/a b" }] },
  ],
  ["a blank label", { ...booking, links: [{ ...booking.links[0], label: "  " }] }],
  [
    "a multiline label",
    { ...booking, links: [{ ...booking.links[0], label: "Reservas\nconfirmadas" }] },
  ],
  ["an oversized label", { ...booking, links: [{ ...booking.links[0], label: "a".repeat(101) }] }],
  [
    "an oversized URL",
    {
      ...booking,
      links: [{ ...booking.links[0], url: "https://example.com/" + "a".repeat(2048) }],
    },
  ],
  ["duplicate IDs", { ...booking, links: [booking.links[0], booking.links[0]] }],
  ["an invalid ID", { ...booking, links: [{ ...booking.links[0], id: "arbitrary" }] }],
  ["an empty enabled list", { enabled: true, links: [] }],
  [
    "more than 20 links",
    {
      enabled: true,
      links: Array.from({ length: 21 }, () => ({ ...booking.links[0], id: crypto.randomUUID() })),
    },
  ],
  ["a browser-supplied Tenant", { ...booking, tenantId: "tenant-b" }],
])("refuses %s without changing saved settings", async (_case, input) => {
  expect(await editor.saveLinks(ownerA, input as LinkSettings)).toEqual({
    ok: false,
    error: "invalid",
  });
  expect(await readLinks(db, ownerA)).toEqual({ enabled: false, links: [] });
});

test("the full documented list and text bounds accept valid HTTP(S) links", async () => {
  const links = Array.from({ length: 20 }, (_, index) => ({
    id: crypto.randomUUID(),
    label: "á".repeat(100),
    url: `${index ? "https" : "http"}://example.com/${"a".repeat(index ? 2028 : 2029)}`,
  }));
  const input = { enabled: true, links };
  expect(await editor.saveLinks(ownerA, input)).toEqual({ ok: true });
  expect(await readLinks(db, ownerA)).toEqual(input);
});
