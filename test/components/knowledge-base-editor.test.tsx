import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import type { KnowledgeEntrySummary } from "@/modules/knowledge-base";
import type { KnowledgeBaseActions } from "@/modules/knowledge-base/hooks";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterAll(async () => {
  await GlobalRegistrator.unregister();
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
});

// Initialize React's event system after the browser globals exist.
const { createRoot } = await import("react-dom/client");
const { KnowledgeBaseManager } = await import("@/components/knowledge-base/knowledge-base-manager");
const { KnowledgeEntrySection } =
  await import("@/components/knowledge-base/knowledge-entry-section");
const { ConfirmProvider } = await import("@/providers/confirm-provider");

type Result = Awaited<ReturnType<KnowledgeBaseActions["save"]>>;
const success: Result = { status: "success", message: "Salvo." };
const deferred = () => Promise.withResolvers<Result>();
const entry = (overrides: Partial<KnowledgeEntrySummary> = {}): KnowledgeEntrySummary => ({
  id: "faq-1",
  kind: "faq",
  title: "Preço?",
  body: "R$ 80",
  size: 11,
  updatedAt: new Date("2026-10-01T12:00:00Z"),
  updatedBy: "Ana",
  ...overrides,
});

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let entries: KnowledgeEntrySummary[];
let actions: KnowledgeBaseActions;
let cap: number;

const render = () =>
  root.render(
    <ConfirmProvider>
      <KnowledgeBaseManager entries={entries} cap={cap} titleMaxLength={200} {...actions} />
    </ConfirmProvider>,
  );
const button = (text: string, scope: ParentNode = document) => {
  const result = [...scope.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  );
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
};
const click = async (text: string, scope: ParentNode = document) => {
  await act(async () => {
    button(text, scope).click();
  });
};
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const field = (name: string) =>
  document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
const fill = async (name: string, value: string) => {
  const input = field(name);
  const prototype =
    input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
const choose = async (file: File) => {
  const input = fileInput();
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const submit = async () => {
  await act(async () => {
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  entries = [];
  cap = 30_000;
  actions = {
    save: async () => success,
    remove: async () => success,
    importFile: async () => success,
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

test("creation keeps the dialog open and locked until success, then displays the saved entry and usage", async () => {
  const request = deferred();
  const calls: FormData[] = [];
  actions.save = async (_previous, data) => {
    calls.push(data);
    return request.promise;
  };
  await act(async () => render());
  await click("Adicionar pergunta");
  await fill("title", "Preço?");
  await fill("body", "R$ 80");
  await act(async () => {
    const form = document.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  expect(dialog()).not.toBeNull();
  expect(host.querySelectorAll("article")).toHaveLength(0);
  expect(host.textContent).toContain("0 / 30.000");
  expect(dialog()!.textContent).toContain("Salvando…");
  expect(button("Adicionar seção").disabled).toBe(true);
  expect(field("title").disabled).toBe(true);
  expect(field("body").disabled).toBe(true);
  expect(button("Fechar").disabled).toBe(true);
  expect(button("Fechar formulário").disabled).toBe(true);
  expect(button("Descartar alterações").disabled).toBe(true);
  await click("Fechar formulário");
  await act(async () => {
    dialog()!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  expect(dialog()).not.toBeNull();
  expect(calls).toHaveLength(1);
  expect(calls[0].get("kind")).toBe("faq");

  // Next refresh() commits the canonical RSC props with the action response.
  await act(async () => {
    entries = [entry()];
    render();
    request.resolve(success);
  });
  expect(dialog()).toBeNull();
  expect(host.querySelectorAll("article")).toHaveLength(1);
  expect(host.textContent).not.toContain("Salvando…");
  expect(host.textContent).toContain("Ana");
  expect(button("Editar").disabled).toBe(false);
  await click("Adicionar pergunta");
  expect(field("title").value).toBe("");
});

test("a refused update leaves saved data unchanged and keeps the form open with its error and values for retry", async () => {
  entries = [entry()];
  const request = deferred();
  actions.save = async () => request.promise;
  await act(async () => render());
  await click("Editar");
  expect(field("title").value).toBe("Preço?");
  await fill("body", "R$ 100");
  await submit();
  expect(host.textContent).toContain("R$ 80");
  expect(host.textContent).toContain("11 / 30.000");
  expect(dialog()).not.toBeNull();

  await act(async () =>
    request.resolve({ status: "error", message: "Limite atingido em outra aba." }),
  );
  expect(dialog()).not.toBeNull();
  expect(host.textContent).toContain("R$ 80");
  expect(host.textContent).toContain("11 / 30.000");
  expect(dialog()!.textContent).toContain("Limite atingido em outra aba.");
  expect(button("Salvar alterações").disabled).toBe(false);
  expect(field("body").value).toBe("R$ 100");
  expect(field("title").value).toBe("Preço?");
});

test("deletion keeps the entry and usage unchanged until completion and reports a refusal", async () => {
  entries = [entry()];
  const request = deferred();
  let calls = 0;
  actions.remove = async () => {
    calls++;
    return request.promise;
  };
  await act(async () => render());
  await click("Excluir");
  expect(calls).toBe(0);
  await click("Cancelar");
  expect(calls).toBe(0);
  expect(host.querySelectorAll("article")).toHaveLength(1);
  await click("Excluir");
  await click("Confirmar");

  expect(calls).toBe(1);
  expect(host.querySelectorAll("article")).toHaveLength(1);
  expect(host.textContent).toContain("11 / 30.000");
  expect(dialog()).not.toBeNull();
  expect(button("Cancelar").disabled).toBe(true);
  await act(async () =>
    request.resolve({ status: "error", message: "Você não pode excluir este item." }),
  );
  expect(dialog()).toBeNull();
  expect(host.querySelectorAll("article")).toHaveLength(1);
  expect(host.textContent).toContain("11 / 30.000");
  expect(host.textContent).toContain("Você não pode excluir este item.");
});

test("successful edits preserve order and canonical metadata, and successful deletion releases the allowance", async () => {
  const second = entry({ id: "faq-2", title: "Onde?", body: "Aqui", size: 9 });
  entries = [entry(), second];
  const saveRequest = deferred();
  const deleteRequest = deferred();
  actions.save = async (_previous, data) => {
    expect(data.get("entryId")).toBe("faq-1");
    return saveRequest.promise;
  };
  actions.remove = async (entryId) => {
    expect(entryId).toBe("faq-1");
    return deleteRequest.promise;
  };
  await act(async () => render());
  await click("Editar");
  await fill("body", "R$ 100");
  await submit();
  expect(host.querySelectorAll("article")[0].textContent).toContain("R$ 80");
  expect(host.textContent).toContain("20 / 30.000");
  expect(dialog()).not.toBeNull();
  await act(async () => {
    entries = [entry({ body: "R$ 100", size: 12, updatedBy: "Beatriz" }), second];
    render();
    saveRequest.resolve(success);
  });
  expect(dialog()).toBeNull();
  expect(host.querySelectorAll("article")[0].textContent).toContain("Beatriz");
  expect(host.querySelectorAll("article")[1].textContent).toContain("Onde?");
  await click("Excluir");
  await click("Confirmar");
  expect(host.textContent).toContain("21 / 30.000");
  expect(host.querySelectorAll("article")).toHaveLength(2);
  expect(dialog()).not.toBeNull();
  await act(async () => {
    entries = [second];
    render();
    deleteRequest.resolve(success);
  });
  expect(dialog()).toBeNull();
  expect(host.querySelectorAll("article")).toHaveLength(1);
  expect(host.textContent).not.toContain("Preço?");
  expect(host.textContent).toContain("9 / 30.000");
});

test("unfinished forms survive dismissal independently for each kind and discard requires confirmation", async () => {
  await act(async () => render());
  await click("Adicionar pergunta");
  await fill("title", "Minha pergunta");
  await click("Fechar formulário");
  await click("Adicionar seção");
  expect(field("title").value).toBe("");
  await fill("title", "Meu texto");
  await click("Fechar");
  await click("Adicionar pergunta");
  expect(field("title").value).toBe("Minha pergunta");
  await click("Descartar alterações");
  await click("Cancelar");
  expect(field("title").value).toBe("Minha pergunta");
  await click("Descartar alterações");
  await click("Confirmar");
  expect(dialog()).toBeNull();
  await click("Adicionar pergunta");
  expect(field("title").value).toBe("");
  await click("Fechar");
  await click("Adicionar seção");
  expect(field("title").value).toBe("Meu texto");
});

test("validation keeps invalid forms open and counts normalized Unicode text like the server", async () => {
  let calls = 0;
  const request = deferred();
  actions.save = async () => {
    calls++;
    return request.promise;
  };
  cap = 205;
  await act(async () => render());
  await click("Adicionar seção");
  await fill("title", "   ");
  await fill("body", "Resposta");
  await submit();
  expect(dialog()).not.toBeNull();
  expect(document.querySelector('[name="title"][aria-invalid="true"]')).not.toBeNull();
  expect(calls).toBe(0);
  await fill("title", "😀".repeat(201));
  await submit();
  expect(calls).toBe(0);
  expect(dialog()!.textContent).toContain("Use até 200 caracteres.");
  await fill("title", "Título");
  await fill("body", "x".repeat(205));
  await submit();
  expect(calls).toBe(0);
  expect(document.activeElement).toBe(field("body"));
  expect(dialog()!.textContent).toContain("Encurte o texto para ficar dentro do limite.");
  await fill("title", ` ${"😀".repeat(200)} `);
  await fill("body", " a\nb ");
  await submit();
  expect(calls).toBe(1);
  expect(dialog()!.textContent).toContain("203 / 205");
  expect(host.textContent).toContain("0 / 205");
  await act(async () => request.resolve({ status: "error", message: "Falhou." }));
});

test("unexpected failures keep creation open with its values without exposing exception details", async () => {
  const request = deferred();
  actions.save = async () => request.promise;
  await act(async () => render());
  await click("Adicionar seção");
  await fill("title", "Serviços");
  await fill("body", "Corte e barba");
  await submit();
  await act(async () => request.reject(new Error("private database detail")));
  expect(host.querySelectorAll("article")).toHaveLength(0);
  expect(dialog()).not.toBeNull();
  expect(dialog()!.textContent).toContain("Verifique sua conexão");
  expect(dialog()!.textContent).not.toContain("private database detail");
  expect(field("title").value).toBe("Serviços");
  expect(field("body").value).toBe("Corte e barba");
});

test("Members see entries without mutation controls", async () => {
  await act(async () => root.render(<KnowledgeEntrySection kind="faq" entries={[entry()]} />));
  expect(host.textContent).toContain("Preço?");
  expect(host.querySelectorAll("button")).toHaveLength(0);
});

describe("importing a file", () => {
  test("the owner picks a PDF, DOCX or TXT; controls lock while it uploads and the result is announced", async () => {
    const request = deferred();
    const calls: FormData[] = [];
    actions.importFile = async (_previous, data) => {
      calls.push(data);
      return request.promise;
    };
    await act(async () => render());
    expect(fileInput().accept).toBe(".pdf,.docx,.txt");
    expect(host.textContent).toContain("PDF, DOCX ou TXT de até 4 MB");

    const file = new File(["Horário"], "horario.txt", { type: "text/plain" });
    await choose(file);

    expect(calls).toHaveLength(1);
    expect(calls[0].get("file")).toBe(file);
    expect(button("Importando…").disabled).toBe(true);
    expect(button("Adicionar seção").disabled).toBe(true);
    expect(fileInput().disabled).toBe(true);

    await act(async () => {
      entries = [entry({ id: "section-1", kind: "section", title: "horario", body: "Horário" })];
      render();
      request.resolve({ status: "success", message: "Arquivo importado como a seção “horario”." });
    });
    expect(host.querySelector('[role="status"]')!.textContent).toContain(
      "Arquivo importado como a seção “horario”.",
    );
    expect(host.querySelectorAll("article")).toHaveLength(1);
    expect(button("Importar arquivo").disabled).toBe(false);
    // Choosing the same file again starts a new import.
    expect(fileInput().value).toBe("");
  });

  test("a refusal is shown in place of the previous result, keeping the Knowledge base as it was", async () => {
    let result: Awaited<ReturnType<KnowledgeBaseActions["importFile"]>> = success;
    actions.importFile = async () => result;
    await act(async () => render());
    await choose(new File(["a"], "a.txt"));
    result = { status: "error", message: "Não encontramos texto neste arquivo." };
    await choose(new File(["%PDF"], "digitalizado.pdf"));

    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.textContent).toContain("Não encontramos texto neste arquivo.");
    expect(host.textContent).not.toContain("Revisar e tentar novamente");
  });

  test("a file over 4 MB is refused before uploading", async () => {
    let calls = 0;
    actions.importFile = async () => {
      calls++;
      return success;
    };
    await act(async () => render());
    await choose(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "manual.pdf"));

    expect(calls).toBe(0);
    expect(host.textContent).toContain(
      "O arquivo tem mais de 4 MB, o tamanho máximo para importar.",
    );
  });
});
